#!/usr/bin/env python3
"""Mint loopback-only receiver for *server-side Script API* Alice position evidence.

Staged: never enables BDS experiments, alters a world, sends Minecraft commands,
or starts a second Alice client. Only trusted Script API posts produce a witness.
"""
import argparse
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import math
import os
from pathlib import Path
import re
import secrets
import sys
import time

from bds_position_witness import publish, ROOT

CONFIG = ROOT / "bds-script-witness-config.json"
TOKEN = ROOT / "bds-script-witness-token"
NAME = re.compile(r"[A-Za-z0-9_ ]{3,16}\Z")
ID = re.compile(r"[A-Za-z0-9-]{8,72}\Z")
BOOT = re.compile(r"[A-Za-z0-9-]{12,64}\Z")
MAX_BODY = 512


def read_private(path, limit=2048):
    if path.is_symlink() or not path.is_file():
        raise ValueError("unsafe_private_file")
    st = path.stat()
    if st.st_uid != os.getuid() or st.st_mode & 0o077 or st.st_size > limit:
        raise ValueError("unsafe_private_permissions")
    return path.read_text(encoding="utf-8")


def config():
    if ROOT.is_symlink() or not ROOT.is_dir() or ROOT.stat().st_mode & 0o077:
        raise ValueError("unsafe_witness_root")
    cfg = json.loads(read_private(CONFIG))
    if not isinstance(cfg, dict) or set(cfg) != {"gamertag", "port"}:
        raise ValueError("invalid_witness_config")
    if not isinstance(cfg["gamertag"], str) or not NAME.fullmatch(cfg["gamertag"]):
        raise ValueError("invalid_gamertag")
    if type(cfg["port"]) is not int or not 1024 <= cfg["port"] <= 65535:
        raise ValueError("invalid_loopback_port")
    token = read_private(TOKEN, 256).strip()
    if not 32 <= len(token) <= 128 or not re.fullmatch(r"[A-Za-z0-9_-]+", token):
        raise ValueError("invalid_private_token")
    return cfg, token


class Receiver:
    """Single publisher. Monotonic sequence and identity pinned to one pack boot."""

    def __init__(self, gamertag, token, output=None, clock=time.time_ns):
        self.gamertag = gamertag
        self.token = token
        self.output = output
        self.clock = clock
        self.boot = None
        self.player = None
        self.sequence = -1
        self.last_serial = 0
        self.last_observed_at = -1

    def accept(self, header, content):
        if not isinstance(header, str) or not header.isascii() or not hmac.compare_digest(header, self.token):
            raise ValueError("unauthorized")
        try:
            entry = json.loads(content)
        except (UnicodeDecodeError, ValueError) as exc:
            raise ValueError("malformed_payload") from exc
        if not isinstance(entry, dict) or set(entry) != {
                "version", "gamertag", "playerId", "boot", "sequence",
                "dimension", "feet", "observedAtUnixMs"}:
            raise ValueError("invalid_payload_shape")
        feet = entry["feet"]
        if entry["version"] != 1 or entry["gamertag"] != self.gamertag or (
            not isinstance(entry["playerId"], str) or not ID.fullmatch(entry["playerId"])
        ) or (not isinstance(entry["boot"], str) or not BOOT.fullmatch(entry["boot"])
        ) or type(entry["sequence"]) is not int or not 0 <= entry["sequence"] <= 1_000_000_000 or (
            entry["dimension"] != "minecraft:overworld"
        ) or not isinstance(feet, dict) or set(feet) != {"x", "y", "z"} or any(
            type(feet[k]) not in (int, float) or not math.isfinite(feet[k]) or abs(feet[k]) >= 30_000_000
            for k in ("x", "y", "z")
        ):
            raise ValueError("untrusted_server_observation")
        observed_at = entry["observedAtUnixMs"]
        receive_ns = self.clock()
        receive_ms = receive_ns // 1_000_000
        # Same-host BDS source time must be fresh, monotonic and not future.
        if (type(observed_at) is not int or observed_at <= 0
                or observed_at > receive_ms or receive_ms - observed_at > 4000
                or observed_at <= self.last_observed_at):
            raise ValueError("observation_stale_or_future")
        if self.boot is not None and (entry["boot"] != self.boot or entry["playerId"] != self.player):
            raise ValueError("session_identity_changed")
        if entry["sequence"] <= self.sequence:
            raise ValueError("stale_sequence")
        serial = max(receive_ns, self.last_serial + 1)
        if not 10**15 <= serial < 10**20:
            raise ValueError("invalid_receive_clock")
        sample = {
            "version": 1, "source": "bds_script_api",
            "gamertag": self.gamertag,
            "serial": str(serial),
            "uniqueId": entry["playerId"],
            "observedAt": observed_at,
            "feet": {k: feet[k] for k in ("x", "y", "z")}
        }
        # Only commit sequence after securely writing the validated observation.
        publish(sample, path=self.output or (ROOT / "bds-position-witness.json"))
        self.boot = entry["boot"]
        self.player = entry["playerId"]
        self.sequence = entry["sequence"]
        self.last_serial = serial
        self.last_observed_at = observed_at
        return sample


def handler(receiver):
    class Handle(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never emit player coordinates, URLs, auth or tokens.

        def respond(self, code):
            self.send_response(code)
            self.send_header("Content-Length", "0")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_GET(self):
            self.respond(204 if self.path == "/healthz" else 404)

        def do_POST(self):
            if self.path != "/v1/position":
                return self.respond(404)
            length = self.headers.get("Content-Length", "")
            if not length.isdecimal() or not 1 <= int(length) <= MAX_BODY or (
                    self.headers.get("Transfer-Encoding") is not None):
                return self.respond(413)
            if self.headers.get_content_type() != "application/json":
                return self.respond(415)
            body = self.rfile.read(int(length))
            try:
                receiver.accept(self.headers.get("X-Alice-Witness-Token"), body)
            except ValueError as exc:
                return self.respond(401 if str(exc) == "unauthorized" else 422)
            except (OSError, TypeError):
                return self.respond(503)
            self.respond(204)
    return Handle


def initialize(name, port):
    if not NAME.fullmatch(name or "") or not 1024 <= port <= 65535:
        raise ValueError("invalid_init_arguments")
    if ROOT.is_symlink():
        raise ValueError("unsafe_witness_root")
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    if ROOT.stat().st_mode & 0o077:
        raise ValueError("unsafe_witness_root")
    # Never overwrite previously generated private token or existing settings.
    if TOKEN.exists() or TOKEN.is_symlink() or CONFIG.exists() or CONFIG.is_symlink():
        raise ValueError("private_config_already_exists")
    fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        with os.fdopen(fd, "w", encoding="ascii") as f:
            f.write(secrets.token_urlsafe(32) + "\n")
    except BaseException:
        TOKEN.unlink(missing_ok=True)
        raise
    fd = os.open(CONFIG, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"gamertag": name, "port": port}, f)
    print("Initialized private loopback witness config. Token NOT printed.")
    print("BDS scripting pack still requires separate approval and setup.")


def main():
    parser = argparse.ArgumentParser(description="Non-console BDS Script API witness")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--init", action="store_true")
    group.add_argument("--check", action="store_true")
    group.add_argument("--serve", action="store_true")
    parser.add_argument("--gamertag")
    parser.add_argument("--port", type=int, default=18781)
    args = parser.parse_args()
    try:
        if args.init:
            initialize(args.gamertag, args.port)
            return 0
        cfg, token = config()
        if args.check:
            print("BDS Script API receiver config valid (no requests sent).")
            return 0
        r = Receiver(cfg["gamertag"], token)
        server = HTTPServer(("127.0.0.1", cfg["port"]), handler(r))
        server.daemon_threads = True
        print("BDS Script API witness listening on loopback only; no console commands.", flush=True)
        server.serve_forever(poll_interval=0.5)
    except (ValueError, OSError, TypeError, KeyError) as exc:
        # Do not print private content or arbitrary URL/exception.
        print("BDS script witness unavailable: " + type(exc).__name__, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
