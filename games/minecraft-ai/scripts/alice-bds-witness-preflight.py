#!/usr/bin/env python3
"""Read-only, privacy-filtered BDS 17879/Bedrock level witness deployment audit.

No BDS commands, Script API activation, world editing, service changes, process
signals, or private credentials are used. Never infer Beta APIs from pack files.
"""
import json
import os
from pathlib import Path
import stat
import sys
import time
from alice_bds_level_metadata import beta_api_experiment

PACK_UUID = "e39b740e-fb97-47e5-b1e7-f61f5a8b87de"
MODULE_UUID = "49abe19c-5c2e-4cd4-b826-d8e935ed9932"
PORT = 17879
WORLD = "Bedrock level"
MAX_JSON = 32768


def regular(path, max_bytes=None):
    try:
        if path.is_symlink() or not path.is_file():
            return False
        st = path.stat()
        return stat.S_ISREG(st.st_mode) and (max_bytes is None or st.st_size <= max_bytes)
    except (OSError, ValueError):
        return False


def directory(path):
    try:
        return not path.is_symlink() and path.is_dir()
    except (OSError, ValueError):
        return False


def json_file(path):
    if not regular(path, MAX_JSON):
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError, OSError):
        return None


def properties(path):
    if not regular(path, 65536):
        return {}
    result = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() in ("server-port", "level-name", "online-mode"):
                result[key.strip()] = value.strip()
    except (OSError, UnicodeError):
        return {}
    return result


def bounded_processes(root):
    """Look for BDS with verified executable and cwd, never infer no BDS globally."""
    found = []
    try:
        proc = Path("/proc")
        for entry in proc.iterdir():
            if not entry.name.isdecimal():
                continue
            try:
                exe = (entry / "exe").resolve(strict=True)
                cwd = (entry / "cwd").resolve(strict=True)
                if exe.name != "bedrock_server" or cwd != root.resolve(strict=True):
                    continue
                found.append(int(entry.name))
            except (OSError, ValueError, PermissionError):
                pass
    except (OSError, ValueError):
        return {"state": "unknown", "count": None}
    return {"state": "found_running" if found else "not_found_not_offline_proof",
            "count": len(found)}


def isolated_lab_readiness(home, production_root):
    """Observe only the existing Alice disposable lab, never create or edit it."""
    lab = home / "minecraft-bedrock-alice-lab"
    if not directory(lab):
        return "absent"
    # Match the canonical Bedrock experiment gate, including expected ports,
    # exact source and marker; a folder with a similar name is not a lab.
    marker = json_file(lab / ".alice-sandbox.json")
    props = properties(lab / "server.properties")
    if not isinstance(marker, dict):
        return "unverified"
    try:
        valid = (marker.get("version") == 1
                 and marker.get("kind") == "alice-disposable-bedrock-lab"
                 and marker.get("source") == str(production_root.resolve(strict=True))
                 and marker.get("port") == 17880
                 and marker.get("world") == WORLD
                 and props.get("server-port") == "17880"
                 and props.get("online-mode") == "true"
                 and props.get("level-name") == WORLD
                 and directory(lab / "worlds" / WORLD)
                 and regular(lab / "worlds" / WORLD / "level.dat"))
        # The lab's secondary port must also be distinct from production.
        second = properties_portv6(lab / "server.properties")
        return "isolated_metadata_verified" if valid and second == "17881" else "unverified"
    except (OSError, ValueError):
        return "unverified"


def properties_portv6(path):
    if not regular(path, 65536):
        return None
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("server-portv6="):
                return line.partition("=")[2].strip()
    except (OSError, UnicodeError):
        return None
    return None


def operator_backup_manifest_state(home, production_root):
    """Private configuration presence and intended source only, no archive claims."""
    private = home / ".alice-bedrock-control"
    config = private / "operator-env.json"
    try:
        if not directory(private) or not regular(config, 16384):
            return "not_verified"
        st = config.stat()
        if st.st_uid != os.getuid() or st.st_mode & 0o077:
            return "not_verified"
        raw = json_file(config)
        if not isinstance(raw, dict) or raw.get("version") != 1:
            return "not_verified"
        settings = raw.get("settings")
        if not isinstance(settings, dict):
            return "not_verified"
        candidate = settings.get("ALICE_BEDROCK_BACKUP_MANIFEST")
        if not isinstance(candidate, str) or not candidate.startswith("/"):
            return "not_verified"
        manifest = Path(candidate)
        if not regular(manifest, MAX_JSON):
            return "not_verified"
        metadata = json_file(manifest)
        if not isinstance(metadata, dict):
            return "not_verified"
        expected_source = str(production_root.resolve(strict=True))
        if (metadata.get("kind") != "bedrock"
                or metadata.get("source") != expected_source
                or "worlds/" + WORLD not in metadata.get("worlds", [])):
            return "not_verified"
        # The manifest may describe an old or inconsistent backup. No checksum
        # or isolated restore has been performed here, and we never call it safe.
        return "configured_manifest_present_not_restore_verified"
    except (OSError, ValueError, TypeError):
        return "not_verified"


def inspect(home):
    root = home / "minecraft-bedrock"
    world = root / "worlds" / WORLD
    script_pack = home / "minecraft-ai" / "bds-witness-pack"
    owner_conf = root / "config" / MODULE_UUID
    active_packs = json_file(world / "world_behavior_packs.json")
    props = properties(root / "server.properties")
    pack = json_file(script_pack / "manifest.json")
    permissions = json_file(script_pack / "config" / "permissions.json")
    module = next((v for v in pack.get("modules", [])
                   if isinstance(v, dict) and v.get("type") == "script"), None) if isinstance(pack, dict) else None
    deps = {r.get("module_name"): r.get("version") for r in pack.get("dependencies", [])
            if isinstance(r, dict)} if isinstance(pack, dict) else {}
    policy = (permissions.get("module_permissions", {}).get("@minecraft/server-net")
              if isinstance(permissions, dict) else None)
    source_ok = (isinstance(pack, dict) and pack.get("header", {}).get("uuid") == PACK_UUID
                 and module is not None and module.get("uuid") == MODULE_UUID
                 and deps.get("@minecraft/server") == "2.10.0"
                 and deps.get("@minecraft/server-net") == "1.0.0-beta"
                 and deps.get("@minecraft/server-admin") == "1.0.0-beta"
                 and isinstance(policy, dict)
                 and policy.get("allowed_uris") == ["http://127.0.0.1:18781/v1/position"]
                 and policy.get("force_https") is False
                 and policy.get("max_body_bytes") == 512
                 and policy.get("max_concurrent_requests") == 1)
    packs = active_packs if isinstance(active_packs, list) else []
    already_attached = any(isinstance(x, dict) and x.get("pack_id") == PACK_UUID
                           for x in packs)
    priv = home / ".alice-bedrock-control"
    cfg = priv / "bds-script-witness-config.json"
    token = priv / "bds-script-witness-token"
    def private_regular(file):
        try:
            info = file.stat()
            return (regular(file, 2048) and info.st_uid == os.getuid()
                    and info.st_mode & 0o077 == 0)
        except (OSError, ValueError):
            return False
    correct_root = directory(root)
    correct_world = (correct_root and directory(root / "worlds") and directory(world)
                     and directory(world / "db") and regular(world / "level.dat"))
    receiver_config = private_regular(cfg)
    receiver_token = private_regular(token)
    receiver_port_ok = False
    if receiver_config:
        parsed = json_file(cfg)
        receiver_port_ok = (isinstance(parsed, dict) and parsed.get("port") == 18781
                            and isinstance(parsed.get("gamertag"), str)
                            and 3 <= len(parsed["gamertag"]) <= 16)
    result = {
        "audit": "ALICE_BDS_SILENT_WITNESS_READ_ONLY",
        "schemaVersion": 2,
        "observedAtUnix": int(time.time()),
        "readOnly": True,
        "bdsRootMatchesExpected": correct_root,
        "propertiesMatchProduction17879BedrockLevel": (
            props.get("server-port") == str(PORT) and props.get("level-name") == WORLD
            and props.get("online-mode") == "true"),
        "targetWorldStructurallyPresent": correct_world,
        "targetWorldPackListState": ("valid" if isinstance(active_packs, list)
                                     else "missing" if not (world / "world_behavior_packs.json").exists()
                                     else "unreadable_or_unexpected"),
        "alreadyAttached": already_attached,
        "packSourceAndRestrictedHttpPolicyValid": bool(source_ok),
        "modulePermissionsAlreadyPresent": regular(owner_conf / "permissions.json"),
        "targetPackDirectoryExists": directory(root / "behavior_packs" / "alice-silent-bds-witness"),
        "receiverPrivateConfigExists": receiver_config,
        "receiverPrivateTokenExists": receiver_token,
        "receiverLoopbackPortConfigured": receiver_port_ok,
        # Read only bounded metadata from this precise world; never edit NBT
        # and never infer that the experimental modules themselves loaded.
        "betaApisExperiment": (
            beta_api_experiment(world / "level.dat")
            if correct_world else "unverified"
        ),
        "betaModulesLoaded": "not_verified_without_bds_log_or_runtime_witness",
        "verifiedOfflineWorldBackup": "not_verified_requires_backup_and_restore_test",
        "operatorBackupManifest": operator_backup_manifest_state(home, root)
            if correct_root else "not_verified",
        "isolated17880Lab": isolated_lab_readiness(home, root)
            if correct_root else "absent",
        "processes": bounded_processes(root) if correct_root else {"state": "unknown", "count": None},
        "safeToApplyWorldChanges": False,
        "note": "Read-only metadata only; no BDS pause/restart, experiment, token, world DB or MCSManager operation.",
    }
    return result


def main():
    if sys.platform != "linux":
        raise SystemExit("Mint only")
    try:
        result = inspect(Path.home())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, TypeError):
        print(json.dumps({"audit": "ALICE_BDS_SILENT_WITNESS_READ_ONLY",
                          "schemaVersion": 2,
                          "readOnly": True, "state": "cannot_complete_safely",
                          "safeToApplyWorldChanges": False}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
