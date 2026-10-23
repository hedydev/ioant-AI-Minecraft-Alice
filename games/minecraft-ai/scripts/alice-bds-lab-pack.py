#!/usr/bin/env python3
"""Stage Alice Script API compatibility pack ONLY into the disposable 17880 lab.

No Beta NBT changes; no BDS launch/restart; no secrets, receiver activation or
production witness write. This cannot verify actual module loading by itself.
"""
import json
from pathlib import Path
import sys
import time

from alice_bds_level_metadata import beta_api_experiment

HOME = Path.home()
LAB = HOME / "minecraft-bedrock-alice-lab"
PRODUCTION = HOME / "minecraft-bedrock"
SOURCE = HOME / "minecraft-ai" / "bds-witness-pack"
WORLD = "Bedrock level"
PACK_ID = "e39b740e-fb97-47e5-b1e7-f61f5a8b87de"
MODULE_ID = "49abe19c-5c2e-4cd4-b826-d8e935ed9932"
PACK_NAME = "alice-silent-bds-witness"
LAB_URL = "http://127.0.0.1:18782/v1/position"


def regular(path, limit=None):
    try:
        return (not path.is_symlink() and path.is_file() and
                (limit is None or path.stat().st_size <= limit))
    except OSError:
        return False


def directory(path):
    try:
        return path.is_dir() and not path.is_symlink()
    except OSError:
        return False


def read_json(path, limit=16384):
    if not regular(path, limit):
        raise ValueError("invalid_json_file")
    return json.loads(path.read_text(encoding="utf-8"))


def require_lab_stopped():
    # /proc identifies any lab BDS independently of MCSManager ownership.
    # Do not modify a live lab world or conclude it is offline if a matching
    # process exists or its working directory cannot be inspected.
    proc = Path("/proc")
    if not proc.is_dir():
        raise ValueError("proc_unavailable")
    try:
        for item in proc.iterdir():
            if not item.name.isdecimal():
                continue
            try:
                name = (item / "comm").read_text(encoding="utf-8").strip()
            except (OSError, UnicodeError):
                continue
            if name != "bedrock_server":
                continue
            try:
                cwd = (item / "cwd").resolve(strict=True)
            except (OSError, ValueError):
                raise ValueError("bds_cwd_unverified")
            if cwd == LAB.resolve(strict=True):
                raise ValueError("lab_bds_is_running")
    except OSError:
        raise ValueError("proc_unavailable")


def require_eligible():
    # Exact owner of the disposable lab; never accept arbitrary lab directories.
    require_lab_stopped()
    if not directory(LAB) or not directory(PRODUCTION):
        raise ValueError("lab_or_production_directory_missing")
    if not directory(LAB / "worlds" / WORLD) or not directory(LAB / "worlds" / WORLD / "db"):
        raise ValueError("lab_world_missing")
    marker = read_json(LAB / ".alice-sandbox.json")
    if (not isinstance(marker, dict) or
        marker.get("version") != 1 or marker.get("kind") != "alice-disposable-bedrock-lab"
        or marker.get("source") != str(PRODUCTION.resolve(strict=True))
        or marker.get("port") != 17880 or marker.get("world") != WORLD
        or not isinstance(marker.get("backupSha256"), str)
        or len(marker["backupSha256"]) != 64
        or not all(ch in "0123456789abcdef" for ch in marker["backupSha256"])):
        raise ValueError("lab_marker_mismatch")
    p = {}
    if not regular(LAB / "server.properties", 65536):
        raise ValueError("lab_properties_missing")
    for line in (LAB / "server.properties").read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() in ("server-port", "server-portv6", "online-mode", "level-name"):
            p[k.strip()] = v.strip()
    if p != {"server-port": "17880", "server-portv6": "17881",
             "online-mode": "true", "level-name": WORLD}:
        raise ValueError("lab_server_properties_mismatch")
    if not regular(LAB / "worlds" / WORLD / "level.dat", 8 * 1024 * 1024):
        raise ValueError("lab_level_missing")
    # Never change the original production files; the actual source pack
    # must match exact reviewed UUIDs and a server-net-only loopback policy.
    source_manifest = read_json(SOURCE / "manifest.json")
    source_permissions = read_json(SOURCE / "config" / "permissions.json")
    if (source_manifest.get("header", {}).get("uuid") != PACK_ID
        or not any(x.get("uuid") == MODULE_ID and x.get("type") == "script"
                   for x in source_manifest.get("modules", []) if isinstance(x, dict))
        or not regular(SOURCE / "scripts" / "main.js", 8192)
        or "runCommand" in (SOURCE / "scripts" / "main.js").read_text(encoding="utf-8")
        or set(source_permissions.get("module_permissions", {})) != {"@minecraft/server-net"}):
        raise ValueError("unreviewed_source_pack")
    for folder in (LAB / "behavior_packs", LAB / "config", LAB / "worlds" / WORLD):
        if not directory(folder):
            raise ValueError("lab_directory_missing_or_symlink")
    return source_manifest, source_permissions


def inspect():
    require_eligible()
    target_pack = LAB / "behavior_packs" / PACK_NAME
    module_folder = LAB / "config" / MODULE_ID
    registration = LAB / "worlds" / WORLD / "world_behavior_packs.json"
    # Enforce a *new-only* transactional stage, no overwrite, no adjustment
    # of preexisting pack associations or server-wide config/default permissions.
    if (target_pack.exists() or target_pack.is_symlink() or
        module_folder.exists() or module_folder.is_symlink() or
        registration.exists() or registration.is_symlink()):
        return "blocked_existing_pack_or_world_registration"
    return "ready_for_new_lab_only_pack"


def stage():
    state = inspect()
    if state != "ready_for_new_lab_only_pack":
        return state
    manifest, permissions = require_eligible()
    pack = LAB / "behavior_packs" / PACK_NAME
    module = LAB / "config" / MODULE_ID
    registration = LAB / "worlds" / WORLD / "world_behavior_packs.json"
    # Destination paths are exclusive. Failed operations never touch the
    # production tree; preserve partial states instead of deleting unknown files.
    pack.mkdir(mode=0o700)
    (pack / "scripts").mkdir(mode=0o700)
    with (pack / "manifest.json").open("x", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    with (pack / "scripts" / "main.js").open("x", encoding="utf-8") as f:
        f.write((SOURCE / "scripts" / "main.js").read_text(encoding="utf-8"))
    module.mkdir(mode=0o700)
    lab_policy = json.loads(json.dumps(permissions))
    lab_policy["module_permissions"]["@minecraft/server-net"]["allowed_uris"] = [LAB_URL]
    with (module / "permissions.json").open("x", encoding="utf-8") as f:
        json.dump(lab_policy, f, indent=2)
    with (module / "variables.json").open("x", encoding="utf-8") as f:
        json.dump({"aliceWitnessUrl": LAB_URL,
                   "aliceWitnessGamertag": "AliceLabWitness"}, f, indent=2)
    # Intentionally NO secrets.json: pack cannot send HTTP requests even if
    # the Beta experiment becomes enabled in the disposable world.
    with registration.open("x", encoding="utf-8") as f:
        json.dump([{"pack_id": PACK_ID, "version": [0, 1, 0]}], f, indent=2)
    return "lab_pack_staged_without_beta_or_network"


def report(mode, state):
    return {"audit": "ALICE_BDS_LAB_PACK_ONLY", "schemaVersion": 1,
            "observedAtUnix": int(time.time()),
            "mode": mode, "state": state,
            "betaApisExperiment": beta_api_experiment(LAB / "worlds" / WORLD / "level.dat"),
            "labOnly": True, "betaNbtModified": False, "secretsInstalled": False,
            "networkEnabled": False, "productionModified": False,
            "productionBdsRestarted": False, "labBdsStartedByThisAction": False,
            "serverModuleRuntimeVerified": False}


def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else "invalid"
    if mode not in ("check", "stage"):
        raise SystemExit("Usage: alice-bds-lab-pack.py check|stage")
    try:
        result = stage() if mode == "stage" else inspect()
    except (ValueError, TypeError, OSError, KeyError, UnicodeError):
        result = "preconditions_failed"
    print(json.dumps(report(mode, result), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
