#!/usr/bin/env python3
"""Verify configured archived world via isolated restore; optionally prepare 17880 lab.

No production world writes, BDS actions, server starts, port changes to 17879,
XBox login or service changes. --prepare creates a NEW disposable directory
only after the existing backup passes full SHA and isolated restore checks.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time

from alice_operator.config import private_json

SCRIPTS = Path(__file__).resolve().parent
ROOT = Path.home() / ".alice-bedrock-control"
PRODUCTION = Path.home() / "minecraft-bedrock"
LAB = Path.home() / "minecraft-bedrock-alice-lab"
WORLD = "Bedrock level"


def load_module(alias, filename):
    spec = importlib.util.spec_from_file_location(alias, SCRIPTS / filename)
    if spec is None or spec.loader is None:
        raise ValueError("missing_project_utility")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def configured_manifest():
    """Use the existing owner-only operator config without printing any paths."""
    data = private_json(ROOT / "operator-env.json")
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError("operator_config_invalid")
    settings = data.get("settings")
    if not isinstance(settings, dict):
        raise ValueError("operator_config_invalid")
    path = settings.get("ALICE_BEDROCK_BACKUP_MANIFEST")
    if not isinstance(path, str) or not path.startswith("/") or len(path) > 1024:
        raise ValueError("backup_manifest_not_configured")
    return Path(path)


def production_target_valid():
    try:
        # Reject a symlink at the named production directory itself. Do not
        # reject a valid canonical ancestor alias (macOS /var -> /private/var
        # when unit tests use tempfile.TemporaryDirectory).
        if PRODUCTION.is_symlink():
            return False
        source = PRODUCTION.resolve(strict=True)
        if not source.is_dir() or not (source / "bedrock_server").is_file():
            return False
        file = source / "server.properties"
        if file.is_symlink() or not file.is_file():
            return False
        p = {}
        for line in file.read_text(encoding="utf-8").splitlines():
            if line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            if name in ("server-port", "level-name", "online-mode"):
                p[name] = value.strip()
        return (p.get("server-port") == "17879" and p.get("level-name") == WORLD
                and p.get("online-mode") == "true")
    except (OSError, ValueError, UnicodeError):
        return False


def result(mode, backup, lab, reason="none"):
    return {"audit": "ALICE_BDS_ARCHIVED_LAB",
            "schemaVersion": 1, "observedAtUnix": int(time.time()),
            "mode": mode, "backupRestore": backup, "labState": lab,
            "reason": reason, "productionWorldModified": False,
            "productionBdsRestarted": False, "safeToChangeProductionWorld": False}


def operate(mode, *, verifier=None, lab_preparer=None):
    if not production_target_valid():
        return result(mode, "not_verified", "unknown", "production_target_mismatch")
    if LAB.exists() or LAB.is_symlink():
        return result(mode, "not_verified", "already_exists", "lab_exists_do_not_overwrite")
    try:
        manifest = configured_manifest()
    except (OSError, ValueError, TypeError):
        return result(mode, "not_verified", "absent", "configured_manifest_unavailable")
    try:
        verify = verifier or load_module("alice_offline_backup_verify", "verify-world-backup.py").verify
        verified = verify(manifest, PRODUCTION)
        if verified.get("verified") is not True or verified.get("temporaryRestore") is not True:
            return result(mode, "not_verified", "absent", "backup_restore_not_verified")
        if verified.get("worlds") != ["worlds/" + WORLD]:
            return result(mode, "not_verified", "absent", "wrong_backup_world")
    except (OSError, ValueError, TypeError, KeyError, RuntimeError, EOFError):
        return result(mode, "not_verified", "absent", "backup_restore_failed")
    if mode == "check":
        return result(mode, "archive_sha256_isolated_restore_verified", "absent",
                      "ready_for_explicit_lab_prepare")
    if mode != "prepare":
        return result(mode, "not_verified", "unknown", "invalid_mode")
    try:
        prepare = lab_preparer or load_module("alice_disposable_lab_prepare", "prepare-bedrock-alice-lab.py").prepare
        created = prepare(PRODUCTION, manifest, LAB)
        if created.get("port") != 17880 or created.get("world") != WORLD:
            return result(mode, "archive_sha256_isolated_restore_verified",
                          "unknown", "prepared_lab_contract_failed")
    except (OSError, ValueError, TypeError, KeyError, RuntimeError, EOFError):
        return result(mode, "archive_sha256_isolated_restore_verified",
                      "unknown", "isolated_lab_prepare_failed")
    return result(mode, "archive_sha256_isolated_restore_verified",
                  "new_disposable_copy_created_not_started", "lab_ready_for_future_beta_test")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["check", "prepare"])
    args = parser.parse_args()
    try:
        outcome = operate(args.mode)
    except Exception:
        # Never leak private paths or archive entries from a remote exception.
        outcome = result(args.mode, "not_verified", "unknown", "internal_error")
    print(json.dumps(outcome, separators=(",", ":")))
    # Controlled failure reasons are reportable states, not transport errors.
    return 0


if __name__ == "__main__":
    sys.exit(main())
