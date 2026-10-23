#!/usr/bin/env python3
"""Narrow live Bedrock Alice settings/status bridge, executed over Mint SSH stdin.

Only bounded behavioral settings can be changed; legacy three-field files remain valid. No arbitrary command,
world access, Xbox credentials, server process control or path arguments.
"""
import base64
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import re
import uuid

ROOT = Path.home() / ".alice-bedrock-control"
DEFAULTS = {"followDistance": 3, "occludedDistance": 4, "autonomyEnabled": True, "agentMode": "companion"}
ALLOWED = frozenset(DEFAULTS)
MAX_BYTES = 4096


def validated(patch, partial=False):
    if not isinstance(patch, dict) or not patch or set(patch) - ALLOWED:
        raise ValueError("Only approved Alice settings are accepted")
    required = ALLOWED - {'agentMode'}
    if not partial and not required.issubset(patch):
        raise ValueError("Incomplete Alice settings")
    for key, val in patch.items():
        if key == 'agentMode':
            if type(val) is not str or val not in ('companion', 'autonomous'):
                raise ValueError('agentMode must be companion or autonomous')
        elif key == "autonomyEnabled":
            if type(val) is not bool:
                raise ValueError("autonomyEnabled must be boolean")
        elif type(val) is not int or not 2 <= val <= 12:
            raise ValueError(key + " must be an integer from 2 to 12")
    return patch


def safe_json(path):
    if path.is_symlink():
        raise ValueError("Unsafe Alice control file")
    if not path.is_file():
        return None
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("Alice control file too large")
    return json.loads(path.read_text(encoding="utf-8"))


def config(root=ROOT):
    data = safe_json(root / "settings.json")
    if data is None:
        return {"revision": 0, "settings": DEFAULTS.copy()}
    if not isinstance(data, dict) or type(data.get("revision")) is not int or data["revision"] < 0:
        raise ValueError("Invalid Alice settings revision")
    validated(data.get("settings"))
    return {"revision": data["revision"], "settings": {**DEFAULTS, **data["settings"]}}


def atomic_json(path, data):
    data_bytes = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(data_bytes) > MAX_BYTES:
        raise ValueError("Alice control payload too large")
    descriptor, name = tempfile.mkstemp(prefix=".alice-", dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            output.write(data_bytes)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def status(root=ROOT):
    saved = config(root)
    reported = safe_json(root / "status.json")
    age = None
    if isinstance(reported, dict) and type(reported.get("updatedAt")) in (int, float):
        age = int(time.time() * 1000 - reported["updatedAt"])
    online = age is not None and 0 <= age <= 10000 and reported.get("connected") is True
    return {
        "configured": saved,
        "online": online,
        "lastSeenMs": age,
        "appliedRevision": reported.get("revision") if online and type(reported.get("revision")) is int else None,
        "runtime": reported if online else None,
        "canEdit": True,
        "commandResult": command_result(root) if online else None,
        "canCommand": online
    }


def patch_settings(patch, root=ROOT):
    validated(patch, partial=True)
    if root.is_symlink():
        raise ValueError("Unsafe Alice control root")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    lockfile = root / ".settings.lock"
    if lockfile.is_symlink():
        raise ValueError("Unsafe Alice control lock")
    with open(lockfile, "a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        old = config(root)
        merged = dict(old["settings"])
        merged.update(patch)
        validated(merged)
        if merged == old["settings"]:
            return old
        new = {"revision": old["revision"] + 1, "settings": merged}
        atomic_json(root / "settings.json", new)
        return new


# Console is not a game player. Only explicit, closed-vocabulary directives
# can pass this bridge. Never execute a shell command or send arbitrary chat.
PLAYER_RE = re.compile(r"[A-Za-z0-9_]{3,16}\Z")
def parse_command(payload):
    if type(payload) is not dict or set(payload) != {'text'}:
        raise ValueError('Only command text is allowed')
    text = payload['text']
    if type(text) is not str or not 1 <= len(text.strip()) <= 80 or any(ord(ch) < 32 for ch in text):
        raise ValueError('Invalid console command text')
    value = re.sub(r'\s+', ' ', text.strip())
    if value in ('跟着我', '跟随我', '保护我', '跟紧我'):
        return {'status':'rejected','reason':'missing_target',
                'message':'控制台没有游戏角色；请明确指定在线玩家，例如：跟随 MolarParsley191'}
    fixed = {'停止':'stop','停止任务':'stop','收集木头':'gather_wood',
             '制作木剑':'craft_sword','吃东西':'eat','查看状态':'status'}
    if value in fixed:
        return {'action':fixed[value]}
    gather = re.fullmatch(r'收集\s*([1-9]|[12][0-9]|3[0-2])\s*个?(?:木头|原木)',value)
    if gather:
        return {'action':'gather_wood','count':int(gather.group(1))}
    match = re.fullmatch(r'(跟随|保护)\s+([A-Za-z0-9_]{3,16})',value)
    if match:
        return {'action':'follow' if match.group(1)=='跟随' else 'guard',
                'target':match.group(2)}
    return {'status':'rejected','reason':'unsupported_command',
            'message':'不支持这条控制台指令；可使用停止、跟随 玩家名、保护 玩家名、收集N个木头、制作木剑、吃东西'}

def command_result(root=ROOT):
    report = safe_json(root / 'command-result.json')
    if not isinstance(report,dict):
        return None
    if (type(report.get('id')) is not str or
        not re.fullmatch(r'[a-f0-9]{32}',report['id']) or
        report.get('status') not in ('received','started','completed','failed','rejected')):
        return None
    return {key: report.get(key) for key in ('id','status','reason','message','action','updatedAt')
            if key in report}

def queue_command(payload,root=ROOT):
    parsed = parse_command(payload)
    if 'action' not in parsed:
        return parsed
    if root.is_symlink():
        raise ValueError('Unsafe Alice control directory')
    heartbeat = safe_json(root / 'status.json')
    age = time.time()*1000-heartbeat.get('updatedAt',0) if isinstance(heartbeat,dict) else -1
    if not (isinstance(heartbeat,dict) and heartbeat.get('connected') is True
            and 0 <= age <= 10000):
        return {'status':'rejected','reason':'alice_offline',
                'message':'Alice 未在线或状态过期，指令没有发送'}
    root.mkdir(parents=True,mode=0o700,exist_ok=True)
    lock = root / '.command.lock'
    if lock.is_symlink():
        raise ValueError('Unsafe Alice command lock')
    with open(lock,'a+b') as handle:
        fcntl.flock(handle,fcntl.LOCK_EX)
        previous = safe_json(root / 'command.json')
        receipt = command_result(root)
        if (isinstance(previous,dict) and
            previous.get('id') != (receipt or {}).get('id') and
            type(previous.get('createdAt')) is int and
            time.time()*1000-previous['createdAt'] < 15000 and
            parsed['action'] != 'stop'):
            return {'status':'rejected','reason':'command_pending',
                    'message':'上一条指令仍在等待 Alice 接收，请稍后重试'}
        command = {'id':uuid.uuid4().hex,'createdAt':int(time.time()*1000),**parsed}
        atomic_json(root / 'command.json',command)
        return {'status':'queued','reason':'waiting_for_alice','id':command['id'],
                'action':command['action'],
                'message':'已写入待处理指令；尚不能表示 Alice 已接受或执行'}


def connection_history(root=ROOT):
    """Expose a small, whitelisted and credential-free run summary to UI."""
    file = root / "connection-audit.json"
    if root.is_symlink() or file.is_symlink():
        raise ValueError("Unsafe connection history")
    if not file.is_file():
        return {"runs": [], "latestChange": [], "hasSuccessfulBaseline": False}
    if file.stat().st_size > 65536:
        raise ValueError("Connection audit too large")
    rows = json.loads(file.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Invalid connection audit")
    # Never serve arbitrary persisted keys, identifiers or unverified server text.
    login_fields = (
        "gameVersion", "protocolVersion", "deviceOS", "certificateCount",
        "certificateDecodable", "certificateNameMatches", "certificateExpiry",
        "certificatePublicKeyMatches", "userChainHeaderKeyMatches",
        "hasMultiplayerToken", "userChainDecodable", "userChainNameMatches",
        "userChainServerMatches", "userChainGameVersionMatches",
        "userChainDeviceOSMatches", "hasDeviceId", "hasSelfSignedId",
        "transport", "authMode", "authTitleKind", "hasAuthenticatedProfile",
    )
    allowed_states = {"spawned", "server_id_conflict", "closed_before_spawn", "in_progress"}
    selected = []
    for raw in rows[-6:]:
        if not isinstance(raw, dict):
            continue
        login = raw.get("login")
        clean_login = {}
        bool_fields = {
            "certificateDecodable", "certificateNameMatches",
            "certificatePublicKeyMatches", "userChainHeaderKeyMatches",
            "hasMultiplayerToken", "userChainDecodable", "userChainNameMatches",
            "userChainServerMatches", "userChainGameVersionMatches",
            "userChainDeviceOSMatches", "hasDeviceId", "hasSelfSignedId",
            "hasAuthenticatedProfile",
        }
        enum_fields = {
            "transport": {"raknet", "nethernet"},
            "authMode": {"offline", "xbox_online"},
            "authTitleKind": {"default", "explicit"},
        }
        if isinstance(login, dict):
            for field in login_fields:
                val = login.get(field)
                if field in bool_fields and (type(val) is bool or val is None):
                    clean_login[field] = val
                elif field in enum_fields and isinstance(val, str) and val in enum_fields[field]:
                    clean_login[field] = val
                elif field == "gameVersion" and isinstance(val, str) and val in ("1.26.51",):
                    clean_login[field] = val
                elif field == "protocolVersion" and (type(val) is int and 0 <= val <= 99999 or val is None):
                    clean_login[field] = val
                elif field == "deviceOS" and (type(val) is int and 0 <= val <= 40 or val is None):
                    clean_login[field] = val
                elif field == "certificateCount" and type(val) is int and 0 <= val <= 8:
                    clean_login[field] = val
                elif field == "certificateExpiry" and isinstance(val, list) and len(val) <= 8 and all(
                    x in ("expired", "expires_within_5m", "valid_over_5m", "unknown") for x in val
                ):
                    clean_login[field] = val
        state = raw.get("result")
        if state not in allowed_states:
            state = "closed_before_spawn"
        entry = {
            "startedAt": raw.get("startedAt") if type(raw.get("startedAt")) is int else None,
            "mode": raw.get("mode") if raw.get("mode") in ("legacy-native-injected", "legacy-chat-only", "mineflayer") else "unknown",
            "phase": raw.get("phase") if raw.get("phase") in ("created", "session_authenticated", "login_sent", "encryption_handshake_accepted", "start_game_received", "spawn_confirmed") else "unknown",
            "result": state,
            "reason": "server_id_conflict" if raw.get("reason") == "server_id_conflict" else None,
            "login": clean_login,
        }
        selected.append(entry)
    baseline = next((r for r in reversed(selected) if r["result"] == "spawned" and r["login"]), None)
    latest = selected[-1] if selected else None
    changes = [
        field for field in login_fields
        if baseline and latest and latest["result"] == "server_id_conflict"
        and latest["login"].get(field) != baseline["login"].get(field)
    ]
    return {"runs": selected, "latestChange": changes, "hasSuccessfulBaseline": baseline is not None}


def handle(action, encoded=None, root=ROOT):
    if action == "status" and encoded is None:
        return json.dumps(status(root), ensure_ascii=False).encode()
    if action == "command" and isinstance(encoded,str) and 0 < len(encoded) <= 1024:
        if any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in encoded):
            raise ValueError("Invalid command encoding")
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded)%4))
        if len(raw) > 256:
            raise ValueError("Command too long")
        return json.dumps(queue_command(json.loads(raw),root),ensure_ascii=False).encode()
    if action == "history" and encoded is None:
        return json.dumps(connection_history(root), ensure_ascii=False).encode()
    if action == "set" and isinstance(encoded, str) and len(encoded) <= 2048:
        if not encoded or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in encoded):
            raise ValueError("Invalid control payload")
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        if len(raw) > 512:
            raise ValueError("Settings payload too large")
        patch = json.loads(raw)
        return json.dumps({"saved": patch_settings(patch, root)}, ensure_ascii=False).encode()
    raise ValueError("Unsupported Alice control operation")


if __name__ == "__main__":
    try:
        if len(sys.argv) not in (2, 3):
            raise ValueError("Usage: remote_control.py status | set <base64url-json> | command <base64url-json>")
        sys.stdout.buffer.write(handle(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None))
    except (ValueError, OSError, TypeError, KeyError, json.JSONDecodeError) as err:
        print("ALICE_CONTROL_ERROR: " + str(err), file=sys.stderr)
        sys.exit(2)
