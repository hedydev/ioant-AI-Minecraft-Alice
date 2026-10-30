#!/usr/bin/env python3
"""Opt-in BDS querytarget witness through a LOOPBACK-ONLY MCSManager API.
No Alice command/model controls this tool. It never starts/stops BDS or writes
world files. A fixed querytarget selector is the only console command.
"""
import argparse
import json
import math
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path.home() / ".alice-bedrock-control"
CONFIG = ROOT / "bds-witness-config.json"
OUTPUT = ROOT / "bds-position-witness.json"
NAME = re.compile(r"[A-Za-z0-9_ ]{3,16}\Z")
IDENT = re.compile(r"[A-Za-z0-9-]{8,72}\Z")
MAX_CONFIG = 2048
# MCSManager's own Daemon writes each instance stdout to this fixed file.
# This is an optional, read-only Mint-local alternative to the HTTP outputlog
# endpoint, NOT a second command channel. Always pin a pre-command file offset.
DAEMON_LOG_DIR = Path("/opt/mcsmanager/daemon/data/InstanceLog")
MAX_LOG_DELTA = 32768

# Do not emit arbitrary urllib/JSON exception strings. HTTPError may
# include the API key in the full request URL.
SAFE_REASONS = frozenset({
    "mcsm_http_unavailable", "mcsm_operation_rejected",
    "outputlog_mcsm_operation_rejected", "command_mcsm_operation_rejected",
    "invalid_mcsm_output", "oversized_mcsm_output",
    "rotated_or_ambiguous_output", "malformed_querytarget_result",
    "querytarget_did_not_select_one", "unexpected_querytarget_dimension",
    "untrusted_querytarget_identity_or_xyz", "missing_or_ambiguous_querytarget",
    "querytarget_command_rejected", "querytarget_response_not_observed",
    "querytarget_outputlog_unchanged", "querytarget_log_advanced_without_target_data",
    "querytarget_no_matching_player_reported", "querytarget_command_unrecognized",
    "local_log_rotated_or_replaced", "oversized_local_log_delta",
    "querytarget_response_too_late",
})


def is_confirmed_command_ack(value, instance_id):
    # Modern MCSManager Daemon sends {instanceUuid} after dispatch.
    # Never treat arbitrary JSON objects (or error objects) as confirmation.
    return value is True or (
        isinstance(value, dict) and
        type(instance_id) is str and
        set(value) == {"instanceUuid"} and
        value["instanceUuid"] == instance_id
    )


def ack_kind(value):
    # Never stringify the remote response: it may contain private data.
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    if isinstance(value, str):
        return "string"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    if isinstance(value, (int, float)):
        return "number"
    return "other"


def safe_failure(exc):
    if isinstance(exc, urllib.error.HTTPError):
        return "mcsm_http_status_" + str(exc.code)
    if isinstance(exc, ValueError):
        label = str(exc)
        if label in SAFE_REASONS or (
            label.startswith("querytarget_command_rejected_") and
            label[len("querytarget_command_rejected_"):] in
            {"false", "null", "string", "object", "array", "number", "other"}
        ):
            return label
    if isinstance(exc, urllib.error.URLError):
        return "mcsm_transport_unavailable"
    return type(exc).__name__



def secure_read(file, limit):
    if file.is_symlink() or not file.is_file():
        raise ValueError("unsafe_private_file")
    st = file.stat()
    if st.st_uid != os.getuid() or st.st_mode & 0o077 or st.st_size > limit:
        raise ValueError("unsafe_private_permissions")
    return file.read_text(encoding="utf-8")


def validated_config(file=CONFIG):
    if ROOT.is_symlink() or (ROOT.exists() and ROOT.stat().st_mode & 0o077):
        raise ValueError("unsafe_witness_root")
    cfg = json.loads(secure_read(file, MAX_CONFIG))
    if not isinstance(cfg, dict) or set(cfg) != {
        "baseUrl", "daemonId", "instanceId", "gamertag", "apikeyFile"
    }:
        raise ValueError("invalid_witness_config")
    base = urllib.parse.urlsplit(cfg["baseUrl"])
    if base.scheme != "http" or base.hostname not in ("127.0.0.1", "localhost") or (
        base.username or base.password or base.path not in ("", "/") or
        base.query or base.fragment or base.port is None
    ):
        raise ValueError("mcsmanager_must_be_loopback_http")
    for k in ("daemonId", "instanceId"):
        if not isinstance(cfg[k], str) or not re.fullmatch(r"[A-Za-z0-9-]{8,72}", cfg[k]):
            raise ValueError("invalid_mcsmanager_instance")
    if not isinstance(cfg["gamertag"], str) or not NAME.fullmatch(cfg["gamertag"]):
        raise ValueError("invalid_bedrock_name")
    keypath = Path(cfg["apikeyFile"])
    if not keypath.is_absolute() or keypath.parent != ROOT:
        raise ValueError("apikey_must_be_private")
    key = secure_read(keypath, 256).strip()
    if not re.fullmatch(r"[A-Za-z0-9]{16,128}", key):
        raise ValueError("invalid_mcsmanager_key")
    return cfg, key


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api(cfg, key, endpoint, extra=None):
    params = {"apikey": key, "uuid": cfg["instanceId"], "daemonId": cfg["daemonId"]}
    params.update(extra or {})
    url = cfg["baseUrl"].rstrip("/") + "/api/protected_instance/" + endpoint + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json; charset=utf-8"
    })
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=4) as resp:
        if resp.status != 200:
            raise ValueError("mcsm_http_unavailable")
        raw = resp.read(70_000)
    payload = json.loads(raw)
    if payload.get("status") != 200:
        raise ValueError("mcsm_operation_rejected")
    return payload.get("data")


def capture_local_log(instance_id, directory=DAEMON_LOG_DIR):
    """Optional reader of this exact instance's bytes appended AFTER a command.
    Reading is bound to dev/inode and pre-command EOF; rotations never become
    apparently new output. If inaccessible, retain the HTTP-only fallback.
    """
    if not isinstance(instance_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{8,72}", instance_id):
        return None
    logfile = directory / (instance_id + ".log")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(logfile, flags)
    except (OSError, ValueError):
        return None
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            return None
        inode = (before.st_dev, before.st_ino)
        offset = before.st_size
    finally:
        os.close(fd)

    def appended():
        fd = os.open(logfile, flags)
        try:
            now = os.fstat(fd)
            if not stat.S_ISREG(now.st_mode) or (now.st_dev, now.st_ino) != inode or now.st_size < offset:
                raise ValueError("local_log_rotated_or_replaced")
            count = now.st_size - offset
            if count > MAX_LOG_DELTA:
                raise ValueError("oversized_local_log_delta")
            return os.pread(fd, count, offset).decode("utf-8", errors="replace")
        finally:
            os.close(fd)

    return appended


def parse_append(before, after):
    if not isinstance(before, str) or not isinstance(after, str):
        raise ValueError("invalid_mcsm_output")
    if len(before) > 32768 or len(after) > 32768:
        raise ValueError("oversized_mcsm_output")
    marker = before[-256:]
    if marker:
        end = after.rfind(marker)
        if end < 0:
            raise ValueError("rotated_or_ambiguous_output")
        after = after[end + len(marker):]
    return after


def parse_target_append(appended):
    positions = []
    decoder = json.JSONDecoder()
    for match in re.finditer(r"Target data:\s*", appended):
        try:
            data, end = decoder.raw_decode(appended[match.end():].lstrip())
        except (ValueError, TypeError) as e:
            raise ValueError("malformed_querytarget_result") from e
        if not isinstance(data, list) or len(data) != 1:
            raise ValueError("querytarget_did_not_select_one")
        item = data[0]
        if not isinstance(item, dict) or item.get("dimension") != 0:
            raise ValueError("unexpected_querytarget_dimension")
        p = item.get("position")
        uid = item.get("uniqueId")
        if not isinstance(p, dict) or any(
            type(p.get(k)) not in (float, int) or
            not math.isfinite(p[k]) or abs(p[k]) > 30_000_000
            for k in ("x", "y", "z")
        ) or not isinstance(uid, str) or not IDENT.fullmatch(uid):
            raise ValueError("untrusted_querytarget_identity_or_xyz")
        positions.append((uid, p))
    if len(positions) != 1:
        raise ValueError("missing_or_ambiguous_querytarget")
    return positions[0]


def publish(sample, path=OUTPUT):
    if ROOT.is_symlink():
        raise ValueError("unsafe_witness_root")
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    if ROOT.stat().st_mode & 0o077:
        raise ValueError("unsafe_witness_permissions")
    if path.is_symlink():
        raise ValueError("unsafe_witness_destination")
    raw = json.dumps(sample, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    if len(raw) > 1024:
        raise ValueError("oversized_witness")
    fd, tmp = tempfile.mkstemp(prefix=".bds-witness-", dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.lexists(tmp):
            os.unlink(tmp)


def probe_once(cfg, key, api_call=api, sleep=time.sleep, local_log_factory=None,
               clock=time.monotonic):
    def call(endpoint, extra=None):
        try:
            return api_call(cfg, key, endpoint, extra)
        except ValueError as err:
            if str(err) == "mcsm_operation_rejected" and endpoint in ("command", "outputlog"):
                raise ValueError(endpoint + "_mcsm_operation_rejected") from None
            raise
    before = call("outputlog", {"size": "32KB"})
    # Cursor is acquired before sending the command: old BDS output can never
    # be treated as fresh. Tests default to HTTP-only; main opts into Mint file.
    local_appended = local_log_factory(cfg["instanceId"]) if local_log_factory else None
    # The only fixed console query permitted by this script.
    command = 'querytarget @a[name="' + cfg["gamertag"] + '"]'
    # A delayed console result must not be stamped with its later poll time.
    issued_at_ms = int(time.time() * 1000)
    issued_at_clock = clock()
    accepted = call("command", {"command": command})
    if not is_confirmed_command_ack(accepted, cfg.get("instanceId")):
        raise ValueError("querytarget_command_rejected_" + ack_kind(accepted))
    # MCSManager's own integration tests allow up to ~8 s for terminal
    # output, because a valid command acknowledgement is asynchronous and
    # does not guarantee its output has flushed to the instance log.
    # The bounded 12-second wait allows delayed daemon file persistence;
    # it NEVER re-sends the query during a single probe.
    changed = False
    incomplete_target = False
    reported_no_player = False
    reported_unknown_command = False
    for attempt in range(24):
        sleep(0.5)
        # Read the local daemon's post-command bytes FIRST; if the MCSManager
        # HTTP outputlog snapshot is stale, file contents still prove what
        # BDS actually wrote. The HTTP path remains the fallback elsewhere.
        sources = []
        if local_appended is not None:
            sources.append(local_appended())
        after = call("outputlog", {"size": "32KB"})
        sources.append(parse_append(before, after))
        for appended in sources:
            changed = changed or bool(appended)
            # BDS may format this diagnostic with multiple JSON lines; never
            # publish coordinates from incomplete or pre-command log entries.
            if "Target data:" not in appended:
                if re.search(r"no targets matched selector|no targets? matched", appended, re.I):
                    reported_no_player = True
                if re.search(r"unknown command|unrecognized command", appended, re.I):
                    reported_unknown_command = True
                continue
            try:
                uid, p = parse_target_append(appended)
            except ValueError as exc:
                if str(exc) == "malformed_querytarget_result" and attempt < 23:
                    incomplete_target = True
                    continue
                raise
            # No stale command response may become fresh BDS position proof.
            elapsed = clock() - issued_at_clock
            if not 0 <= elapsed <= 4.0:
                raise ValueError("querytarget_response_too_late")
            # Bedrock querytarget Y denotes eye height; Alice runtime works in feet.
            return {
                "version": 1, "source": "mcsm_querytarget",
                "gamertag": cfg["gamertag"], "serial": str(time.time_ns()),
                "uniqueId": uid, "observedAt": issued_at_ms,
                "feet": {"x": p["x"], "y": p["y"] - 1.62, "z": p["z"]}
            }
    if incomplete_target:
        raise ValueError("malformed_querytarget_result")
    if not changed:
        raise ValueError("querytarget_outputlog_unchanged")
    if reported_no_player:
        raise ValueError("querytarget_no_matching_player_reported")
    if reported_unknown_command:
        raise ValueError("querytarget_command_unrecognized")
    raise ValueError("querytarget_log_advanced_without_target_data")


def main():
    parser = argparse.ArgumentParser(description="Opt-in read-only BDS position witness")
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--check", action="store_true")
    choice.add_argument("--diagnose", action="store_true",
                        help="read-only MCSManager outputlog availability; no BDS commands")
    choice.add_argument("--once", action="store_true")
    choice.add_argument("--loop", action="store_true")
    args = parser.parse_args()
    try:
        cfg, key = validated_config()
        if args.check:
            print("BDS witness configuration valid; no BDS request sent")
            return 0
        if args.diagnose:
            try:
                data = api(cfg, key, "outputlog", {"size": "8KB"})
                if not isinstance(data, str):
                    raise ValueError("invalid_mcsm_output")
                print("MCSManager outputlog: readable, text length=" + str(len(data)) +
                      "; no BDS command sent")
                return 0
            except (OSError, ValueError, urllib.error.URLError) as exc:
                print("MCSManager outputlog: " + safe_failure(exc) +
                      "; no BDS command sent", file=sys.stderr)
                return 1
        while True:
            try:
                publish(probe_once(cfg, key, local_log_factory=capture_local_log))
                print("BDS querytarget witness: accepted new independent sample", flush=True)
            except (OSError, ValueError, urllib.error.URLError) as exc:
                # Never log URLs (apikey), raw console output, identifiers or credentials.
                print("BDS querytarget witness: unavailable (" + safe_failure(exc) + ")", file=sys.stderr, flush=True)
                if args.once:
                    return 1
            if not args.loop:
                return 0
            time.sleep(2)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print("BDS witness configuration rejected: " + type(exc).__name__, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
