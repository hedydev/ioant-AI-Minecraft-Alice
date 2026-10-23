#!/usr/bin/env python3
"""Localhost-only read-only Alice capabilities and Mint log API."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import base64
import hashlib
import io
import zipfile
import json
import os
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
SSH_TARGET = os.environ.get("ALICE_SSH_TARGET", "tedz@192.168.0.104")
INSTANCE = os.environ.get("ALICE_MINDCRAFT_NAME", "mindcraft-alice")
INSTANCE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*\Z")
TARGET_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*\Z")
LOG_RE = re.compile(r"run-\d{8}T\d{6}Z\.log\Z")
MAX_OUTPUT = 16 * 1024 * 1024 + 65536


def remote_read(action, name=None, runner=subprocess.run):
    if not TARGET_RE.fullmatch(SSH_TARGET):
        raise ValueError("Invalid SSH target")
    if not INSTANCE_RE.fullmatch(INSTANCE):
        raise ValueError("Invalid Alice instance name")
    if action not in ("list", "tail", "download") or (action != "list" and (not name or not LOG_RE.fullmatch(name))):
        raise ValueError("Invalid read-only log operation")
    args = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=4", SSH_TARGET, "python3 - " + action + (" " + name if name else "") + " --instance " + INSTANCE]
    try:
        result = runner(args, input=(ROOT / "remote_logs.py").read_bytes(),
                        capture_output=True, check=False, timeout=20 if action == "download" else 12)
    except subprocess.TimeoutExpired as err:
        raise ConnectionError("Mint SSH timeout") from err
    except OSError as err:
        raise ConnectionError("Mint SSH unavailable: " + str(err)) from err
    if result.returncode:
        reason = result.stderr.decode("utf-8", "replace").strip()[-300:]
        raise ConnectionError("Mint read error: " + (reason or "unknown error"))
    if len(result.stdout) > MAX_OUTPUT:
        raise ValueError("Remote response too large")
    return result.stdout



def remote_acceptance(hours, runner=subprocess.run):
    """Export existing allowlisted Bedrock journal, not raw operator/Xbox output."""
    if hours not in (1, 3, 6, 12, 24):
        raise ValueError("Invalid export time window")
    if not TARGET_RE.fullmatch(SSH_TARGET):
        raise ValueError("Invalid SSH target")
    script = ROOT.parent / "scripts" / "export-alice-acceptance.py"
    args = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=4", SSH_TARGET, "python3 - --hours " + str(hours)]
    try:
        result = runner(args, input=script.read_bytes(), capture_output=True,
                        check=False, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as err:
        raise ConnectionError("Bedrock export unavailable") from err
    if result.returncode or not 0 < len(result.stdout) <= 6 * 1024 * 1024:
        raise ConnectionError("Bedrock export failed or too large")
    try:
        with zipfile.ZipFile(io.BytesIO(result.stdout)) as archive:
            names=set(archive.namelist())
            if not {"manifest.json", "events.jsonl"}.issubset(names):
                raise ValueError("Incomplete Bedrock acceptance ZIP")
            if any(not re.fullmatch(r"[a-z][a-z0-9.-]{0,63}", n) for n in names):
                raise ValueError("Unexpected acceptance ZIP member")
            manifest=json.loads(archive.read("manifest.json"))
            if manifest.get("requestedHours") != hours:
                raise ValueError("Mismatched acceptance ZIP window")
    except (zipfile.BadZipFile, json.JSONDecodeError) as err:
        raise ValueError("Invalid Bedrock acceptance ZIP") from err
    return result.stdout


def remote_world(runner=subprocess.run):
    """Read only the bounded, privacy-filtered Alice voxel feed over Mint SSH."""
    if not TARGET_RE.fullmatch(SSH_TARGET):
        raise ValueError('Invalid SSH target')
    args = ['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'ConnectTimeout=4', SSH_TARGET, 'python3 -']
    try:
        result = runner(args, input=(ROOT / 'remote_world.py').read_bytes(),
                        capture_output=True, check=False, timeout=12)
    except subprocess.TimeoutExpired as err:
        raise ConnectionError('Mint 3D snapshot SSH timeout') from err
    except OSError as err:
        raise ConnectionError('Mint 3D snapshot SSH unavailable') from err
    if result.returncode:
        raise ConnectionError('Mint 3D snapshot read failed: ' +
                              result.stderr.decode('utf-8', 'replace')[-200:])
    if len(result.stdout) > 512 * 1024:
        raise ValueError('Alice 3D snapshot too large')
    return result.stdout


def validate_control_settings(settings):
    """Reject unsafe or malformed changes before ANY SSH side effect."""
    allowed = {'followDistance', 'occludedDistance', 'autonomyEnabled', 'agentMode'}
    if type(settings) is not dict or not settings or set(settings) - allowed:
        raise ValueError('Only approved Alice settings are editable')
    for key, value in settings.items():
        if key == 'agentMode':
            if type(value) is not str or value not in ('companion', 'autonomous'):
                raise ValueError('Invalid agentMode')
        elif key == 'autonomyEnabled':
            if type(value) is not bool:
                raise ValueError('Invalid autonomyEnabled')
        elif type(value) is not int or not 2 <= value <= 12:
            raise ValueError('Invalid ' + key + ' (integer 2..12 required)')
    return settings


def remote_control(action, settings=None, runner=subprocess.run):
    if not TARGET_RE.fullmatch(SSH_TARGET):
        raise ValueError('Invalid SSH target')
    if action not in ('status', 'history', 'set', 'command') or (action in ('status', 'history') and settings is not None):
        raise ValueError('Invalid control action')
    encoded = ''
    if action in ('set','command'):
        if action == 'set':
            validate_control_settings(settings)
        elif (type(settings) is not dict or set(settings) != {'text'} or
              type(settings.get('text')) is not str or
              not 1 <= len(settings['text'].strip()) <= 80):
            raise ValueError('Invalid console command')
        raw = json.dumps(settings, ensure_ascii=False, separators=(',', ':')).encode()
        if len(raw) > (512 if action == 'set' else 256):
            raise ValueError('Control input too large')
        encoded = base64.urlsafe_b64encode(raw).decode().rstrip('=')
    command = 'python3 - ' + action + (' ' + encoded if encoded else '')
    args = ['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'ConnectTimeout=4', SSH_TARGET, command]
    try:
        result = runner(args, input=(ROOT / 'remote_control.py').read_bytes(),
                        capture_output=True, check=False, timeout=12)
    except subprocess.TimeoutExpired as err:
        raise ConnectionError('Mint control SSH timeout') from err
    except OSError as err:
        raise ConnectionError('Mint control SSH unavailable') from err
    if result.returncode:
        raise ConnectionError('Mint control failed: ' + result.stderr.decode('utf-8', 'replace')[-200:])
    if len(result.stdout) > 8192:
        raise ValueError('Remote control response too large')
    return result.stdout


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_bytes(self, code, payload, mime="application/json; charset=utf-8", headers=None):
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(payload)

    def send_json(self, code, obj):
        self.send_bytes(code, json.dumps(obj, ensure_ascii=False).encode())

    def do_GET(self):
        port = str(self.server.server_port)
        if self.headers.get("Host") not in ("localhost", "127.0.0.1", "localhost:" + port, "127.0.0.1:" + port):
            return self.send_json(403, {"error": "Localhost only"})
        parsed = urlsplit(self.path)
        if parsed.query or parsed.fragment:
            return self.send_json(400, {"error": "Query parameters disabled"})
        parts = [unquote(p) for p in parsed.path.split("/") if p]
        try:
            if parts == ["api", "health"]:
                return self.send_json(200, {"ok": True, "localOnly": True})
            if parts == ["api", "catalog"]:
                return self.send_bytes(200, (ROOT / "catalog.json").read_bytes())
            if parts == ['api', 'control', 'status']:
                return self.send_bytes(200, remote_control('status'))
            if parts == ['api', 'control', 'history']:
                return self.send_bytes(200, remote_control('history'))
            if parts == ['api', 'world']:
                return self.send_bytes(200, remote_world())
            if len(parts) == 3 and parts[:2] == ['api', 'acceptance']:
                if parts[2] not in ('1','3','6','12','24'):
                    return self.send_json(400, {'error':'Invalid export window'})
                hours=int(parts[2])
                payload=remote_acceptance(hours)
                return self.send_bytes(200,payload,'application/zip',{
                    'Content-Disposition':'attachment; filename="AliceAI-Acceptance-'+str(hours)+'h.zip"',
                    'X-Content-SHA256':hashlib.sha256(payload).hexdigest()})
            if parts == ["api", "logs"]:
                return self.send_bytes(200, remote_read("list"))
            if len(parts) == 4 and parts[:2] == ["api", "logs"] and parts[3] in ("tail", "download"):
                name, action = parts[2:]
                if not LOG_RE.fullmatch(name):
                    return self.send_json(400, {"error": "Invalid filename"})
                body = remote_read(action, name)
                if action == "tail":
                    return self.send_bytes(200, body)
                return self.send_bytes(200, body, "application/octet-stream", {
                    "Content-Disposition": 'attachment; filename="' + name + '"',
                    "X-Content-SHA256": hashlib.sha256(body).hexdigest()})
            return self.send_json(404, {"error": "Unknown endpoint"})
        except (ValueError, ConnectionError) as err:
            return self.send_json(502, {"error": str(err)})
        except OSError:
            return self.send_json(500, {"error": "Local dashboard catalog unavailable"})

    def do_POST(self):
        # Nginx additionally denies non-loopback clients for this exact path.
        # Require same-origin JSON, so another website cannot silently change
        # the user's Alice via localhost CSRF.
        port = str(self.server.server_port)
        if self.headers.get('Host') not in ('localhost', '127.0.0.1', 'localhost:' + port, '127.0.0.1:' + port):
            return self.send_json(403, {'error': 'Localhost only'})
        parsed = urlsplit(self.path)
        if parsed.path not in ('/api/control/settings','/api/control/command') or parsed.query or parsed.fragment:
            return self.send_json(405, {'error': 'Only approved Alice controls can be changed'})
        webport = os.environ.get('ALICE_DASHBOARD_PORT', '8788')
        if self.headers.get('Origin') not in ('http://127.0.0.1:' + webport, 'http://localhost:' + webport):
            return self.send_json(403, {'error': 'Use the Mac local control center to edit settings'})
        if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
            return self.send_json(415, {'error': 'JSON required'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 1 <= size <= 512:
                return self.send_json(413, {'error': 'Invalid settings request size'})
            settings = json.loads(self.rfile.read(size))
            if parsed.path == '/api/control/settings':
                validate_control_settings(settings)
                return self.send_bytes(200, remote_control('set', settings))
            if type(settings) is not dict or set(settings) != {'text'} or type(settings.get('text')) is not str:
                raise ValueError('Only console text commands supported')
            return self.send_bytes(200, remote_control('command', settings))
        except (ValueError, json.JSONDecodeError) as err:
            return self.send_json(400, {'error': str(err)})
        except ConnectionError as err:
            return self.send_json(502, {'error': str(err)})


def main():
    if not TARGET_RE.fullmatch(SSH_TARGET):
        raise SystemExit("Invalid ALICE_SSH_TARGET")
    if not INSTANCE_RE.fullmatch(INSTANCE):
        raise SystemExit("Invalid ALICE_MINDCRAFT_NAME")
    port = int(os.environ.get("ALICE_DASHBOARD_API_PORT", "18788"))
    if port < 1024 or port > 65535:
        raise SystemExit("Invalid API port")
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Alice Dashboard API: http://127.0.0.1:" + str(port), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()