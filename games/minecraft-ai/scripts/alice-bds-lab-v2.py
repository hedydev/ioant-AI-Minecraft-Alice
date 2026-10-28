#!/usr/bin/env python3
"""New-only v2 BDS lab: verify archive, then opt-in fresh disposable restore.

Never launches BDS, changes production files, alters the consumed v1 lab,
changes any host port, or activates script networking.
"""
import importlib.util
import json
from pathlib import Path
import sys
import time

HERE = Path(__file__).resolve().parent
V2_NAME = "minecraft-bedrock-alice-lab-v2"


def load_legacy():
    spec = importlib.util.spec_from_file_location(
        "alice_v2_verified_archive", HERE / "alice-bds-archived-lab.py")
    if spec is None or spec.loader is None:
        raise ValueError("missing_archived_lab_tool")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def operate(mode, *, archive_module=None, home=None):
    if mode not in ("check", "prepare"):
        raise ValueError("invalid_mode")
    root = Path.home() if home is None else Path(home)
    module = archive_module if archive_module is not None else load_legacy()
    # This module is imported into a fresh Python process each invocation;
    # changing its LAB affects only the v2 operation, never the v1 workflow.
    module.LAB = root / V2_NAME
    out = module.operate(mode)
    if (not isinstance(out, dict) or
        out.get("audit") != "ALICE_BDS_ARCHIVED_LAB"
        or out.get("mode") != mode
        or out.get("productionWorldModified") is not False
        or out.get("productionBdsRestarted") is not False
        or out.get("safeToChangeProductionWorld") is not False):
        raise ValueError("invalid_archive_contract")
    allowed_backups = {"not_verified", "archive_sha256_isolated_restore_verified"}
    allowed_states = {"absent","unknown","already_exists",
                      "new_disposable_copy_created_not_started"}
    allowed_reasons = {
        "none", "production_target_mismatch","lab_exists_do_not_overwrite",
        "configured_manifest_unavailable","backup_restore_not_verified",
        "wrong_backup_world","backup_restore_failed","invalid_mode",
        "prepared_lab_contract_failed","isolated_lab_prepare_failed",
        "ready_for_explicit_lab_prepare","lab_ready_for_future_beta_test",
        "internal_error",
    }
    if (out.get("backupRestore") not in allowed_backups or
        out.get("labState") not in allowed_states or
        out.get("reason") not in allowed_reasons):
        raise ValueError("invalid_archive_contract")
    return {
        "audit":"ALICE_BDS_ARCHIVED_LAB_V2","schemaVersion":1,
        "observedAtUnix":int(time.time()),"mode":mode,
        "state":out["labState"],"backupRestore":out["backupRestore"],
        "reason":out["reason"],"v2DirectoryOnly":True,
        "oldV1LabModified":False,"labBdsStarted":False,
        "productionWorldModified":False,"productionBdsRestarted":False,
        "productionWitnessUsed":False,
    }


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("check", "prepare"):
        raise SystemExit("Usage: alice-bds-lab-v2.py check|prepare")
    mode=sys.argv[1]
    try:
        result=operate(mode)
    except (OSError,ValueError,TypeError,KeyError):
        result={
            "audit":"ALICE_BDS_ARCHIVED_LAB_V2","schemaVersion":1,
            "observedAtUnix":int(time.time()),"mode":mode,
            "state":"unknown","backupRestore":"not_verified",
            "reason":"internal_error","v2DirectoryOnly":True,
            "oldV1LabModified":False,"labBdsStarted":False,
            "productionWorldModified":False,"productionBdsRestarted":False,
            "productionWitnessUsed":False,
        }
    print(json.dumps(result,separators=(",",":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
