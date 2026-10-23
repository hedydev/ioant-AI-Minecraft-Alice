#!/usr/bin/env python3
"""Install only the owned Alice runtime modules into a separately managed Mindcraft checkout.

This script never rewrites Mindcraft's agent.js, modes.js, skills.js or commands.
It requires the integration already tested on the destination and preserves bot data.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "runtime"
VERSION = "0.3.1"
FILES = tuple(sorted(p.relative_to(SOURCE) for p in SOURCE.rglob("*.js")))
CHECKS = {
    "src/agent/agent.js": ("new AliceCore", "new AliceAutonomy", "aliceAutonomy?.start"),
    "src/agent/action_manager.js": ("onActionStart", "onActionEnd"),
    "src/agent/commands/actions.js": ("aliceTasks", "!aliceLearnWeapon", "!aliceCollectWood"),
    "src/agent/library/skills.js": ("AliceMovementController",),
    "src/agent/modes.js": ("allowsMode(",),
}

OPTIONAL_CHECKS = {
    # This early Mint adapter does not always have stale-LLM message epochs.
    # Epochs are only needed for safely resuming interrupted work, not basic operation.
    "src/agent/agent.js": ("_aliceMessageEpoch",),
}

def warn_optional_features(target: Path) -> None:
    for filename, markers in OPTIONAL_CHECKS.items():
        code = (target / filename).read_text()
        missing = [marker for marker in markers if marker not in code]
        if missing:
            print(
                "WARNING: optional Alice message-epoch integration not found in "
                + filename + " (" + ", ".join(missing) + "). "
                "Command handling still uses the existing Mindcraft adapter, "
                "but resuming interrupted wood gathering after combat is disabled "
                "until a verified message epoch is available.",
                file=sys.stderr,
            )


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def relpath(file: Path) -> str:
    return "src/agent/" + file.as_posix()

def verify_target(target: Path) -> None:
    if not (target / "package.json").is_file():
        raise RuntimeError("Not a Mindcraft checkout: package.json is missing")
    for name, symbols in CHECKS.items():
        p = target / name
        if not p.is_file():
            raise RuntimeError("Required integration file missing: " + name)
        code = p.read_text()
        missing = [s for s in symbols if s not in code]
        if missing:
            raise RuntimeError(name + " is missing integration markers " + repr(missing) +
                "; do not overwrite this checkout. Export local files for a migration review first.")
    pkg = json.loads((target / "package.json").read_text())
    if pkg.get("type") != "module":
        raise RuntimeError("Mindcraft must be a Node ES module project (package.json type=module)")
    warn_optional_features(target)

def check_syntax() -> None:
    if not shutil.which("node"):
        raise RuntimeError("node executable not found")
    for p in SOURCE.rglob("*.js"):
        cp = subprocess.run(["node", "--check", "--input-type=module"],
            input=p.read_text(), text=True, capture_output=True)
        if cp.returncode:
            raise RuntimeError("Syntax failed for " + str(p) + ": " + cp.stderr.strip())

def load_manifest(target: Path) -> dict | None:
    p = target / ".alice-project" / "install.json"
    return json.loads(p.read_text()) if p.exists() else None

def changes(target: Path) -> list[dict]:
    entries = []
    for f in FILES:
        src = SOURCE / f
        dst = target / relpath(f)
        new = sha(src.read_bytes())
        old = sha(dst.read_bytes()) if dst.is_file() else None
        entries.append({"path": relpath(f), "before": old, "after": new,
                        "status": "unchanged" if old == new else "replace" if old else "create"})
    return entries

def check_drift(target: Path, entries: list[dict], previous: dict | None) -> None:
    if previous is None:
        return
    recorded = previous.get("installed", {})
    for e in entries:
        if e["path"] in recorded and e["before"] != recorded[e["path"]]:
            raise RuntimeError("Local edit detected in " + e["path"] +
                "; refuse overwrite. Review the local change before continuing.")

def atomic_bytes(dst: Path, payload: bytes) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".alice-update-", dir=str(dst.parent))
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(payload)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(tmp, 0o644)
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def install(target: Path) -> None:
    verify_target(target)
    check_syntax()
    entries = changes(target)
    state = target / ".alice-project"
    previous = load_manifest(target)
    check_drift(target, entries, previous)
    changed = [e for e in entries if e["status"] != "unchanged"]
    print("Alice project " + VERSION + ": " + str(len(changed)) + " changed runtime files")
    for e in entries:
        print("  " + e["status"].ljust(9) + " " + e["path"])
    if not changed:
        print("Already installed; no changes made.")
        return
    identity = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = state / "backups" / identity
    backups = {}
    for e in changed:
        dst = target / e["path"]
        backups[e["path"]] = bool(e["before"])
        if e["before"]:
            src = backup / e["path"]
            src.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dst, src)
    state.mkdir(exist_ok=True)
    (backup / "backup.json").parent.mkdir(parents=True, exist_ok=True)
    (backup / "backup.json").write_text(json.dumps({
        "id": identity, "version": VERSION, "previous_manifest": previous,
        "existed": backups, "managed_files": [e["path"] for e in changed],
    }, indent=2) + "\n")
    try:
        for e in changed:
            f = Path(e["path"]).relative_to("src/agent")
            atomic_bytes(target / e["path"], (SOURCE / f).read_bytes())
        installed = {e["path"]: e["after"] for e in entries}
        manifest = {"version": VERSION, "installed": installed,
                    "updatedAt": identity, "backup": identity}
        atomic_bytes(state / "install.json", (json.dumps(manifest,indent=2)+"\n").encode())
    except Exception:
        restore_backup(target, backup)
        raise
    print("Installed successfully; backup: " + str(backup))
    print("Mindcraft code integrations and bots/ data were not touched.")

def restore_backup(target: Path, backup: Path) -> None:
    info = json.loads((backup / "backup.json").read_text())
    for name, existed in info["existed"].items():
        dst = target / name
        if existed:
            atomic_bytes(dst, (backup / name).read_bytes())
        elif dst.exists():
            dst.unlink()
    manifest = info.get("previous_manifest")
    state = target / ".alice-project" / "install.json"
    if manifest is None:
        if state.exists():
            state.unlink()
    else:
        atomic_bytes(state, (json.dumps(manifest,indent=2)+"\n").encode())

def rollback(target: Path, identity: str) -> None:
    state = target / ".alice-project"
    manifest = load_manifest(target)
    if not manifest:
        raise RuntimeError("No managed Alice installation found")
    if identity == "latest":
        identity = manifest["backup"]
    if identity != manifest["backup"]:
        raise RuntimeError("Rollback must target current install backup " + manifest["backup"])
    entries = changes(target)
    check_drift(target, entries, manifest)
    backup = state / "backups" / identity
    if not (backup / "backup.json").is_file():
        raise RuntimeError("Backup missing: " + str(backup))
    restore_backup(target,backup)
    print("Restored " + identity + "; bot memory and world untouched")

def main() -> int:
    ap = argparse.ArgumentParser(description="Safe Alice/Mindcraft modular runtime installer")
    ap.add_argument("--target",type=Path,default=Path.home()/"mindcraft-alice")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--check",action="store_true",help="read-only target/compatibility check")
    group.add_argument("--install",action="store_true",help="back up and install managed modules")
    group.add_argument("--rollback",metavar="BACKUP_ID",help="'latest' or current backup id")
    args = ap.parse_args()
    target = args.target.expanduser().resolve()
    try:
        if args.rollback:
            rollback(target,args.rollback)
        elif args.install:
            install(target)
        else:
            verify_target(target)
            check_syntax()
            check_drift(target,changes(target),load_manifest(target))
            for e in changes(target):
                print(e["status"].ljust(9) + e["path"])
            print("CHECK OK: Mindcraft integration present; bots/ preserved.")
        return 0
    except Exception as e:
        print("ERROR: " + str(e),file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
