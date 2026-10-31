#!/usr/bin/env python3
"""Read-only, bounded preflight for installing an opt-in BDS Script API witness.

Runs the maintained Mint side preflight. Never writes to BDS, Minecraft world,
server control console, local private token or settings. No instance restart.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ALLOWED_BOOLEANS = (
    "bdsRootMatchesExpected", "propertiesMatchProduction17879BedrockLevel",
    "targetWorldStructurallyPresent", "alreadyAttached",
    "packSourceAndRestrictedHttpPolicyValid", "modulePermissionsAlreadyPresent",
    "targetPackDirectoryExists", "receiverPrivateConfigExists",
    "receiverPrivateTokenExists", "receiverLoopbackPortConfigured",
)
ENUMS = {
    "targetWorldPackListState": {"valid", "missing", "unreadable_or_unexpected"},
    "betaApisExperiment": {"enabled_in_level_dat", "disabled_in_level_dat",
                            "not_declared_in_level_dat", "unverified"},
    "betaModulesLoaded": {"not_verified_without_bds_log_or_runtime_witness"},
    "verifiedOfflineWorldBackup": {"not_verified_requires_backup_and_restore_test"},
    "operatorBackupManifest": {"not_verified",
                               "configured_manifest_present_not_restore_verified"},
    "isolated17880Lab": {"absent", "unverified", "isolated_metadata_verified"},
}
COMMAND = [
    "/usr/bin/ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
    "-o", "StrictHostKeyChecking=yes", "tedz@192.168.0.104",
    "/usr/bin/python3 /home/tedz/minecraft-ai/scripts/alice-bds-witness-preflight.py",
]


def sanitize(obj, now):
    if not isinstance(obj, dict) or obj.get("audit") != "ALICE_BDS_SILENT_WITNESS_READ_ONLY":
        return None
    if obj.get("schemaVersion") != 2 or obj.get("readOnly") is not True:
        return None
    if obj.get("safeToApplyWorldChanges") is not False:
        return None
    t = obj.get("observedAtUnix")
    if type(t) is not int or abs(now-t) > 900:
        return None
    filtered = {"audit": obj["audit"], "schemaVersion": 2,
                "observedAtUnix": t, "readOnly": True,
                "safeToApplyWorldChanges": False}
    for k in ALLOWED_BOOLEANS:
        if type(obj.get(k)) is bool:
            filtered[k] = obj[k]
    for k, vals in ENUMS.items():
        if obj.get(k) in vals:
            filtered[k] = obj[k]
    processes = obj.get("processes")
    if isinstance(processes, dict) and processes.get("state") in (
        "unknown", "found_running", "not_found_not_offline_proof"):
        count=processes.get("count")
        if count is None or type(count) is int and 0 <= count <= 10000:
            filtered["processes"]={"state":processes["state"],"count":count}
    return filtered


def run(directory):
    dest=Path(directory)
    if dest.is_symlink() or not dest.is_dir():
        raise ValueError("unsafe_output")
    report=None
    try:
        proc=subprocess.run(COMMAND, capture_output=True, text=True,
                            timeout=50, check=False)
        if proc.returncode == 0 and len(proc.stdout) <= 16384:
            report=sanitize(json.loads(proc.stdout),int(time.time()))
    except (OSError, ValueError, TypeError, subprocess.SubprocessError):
        pass
    result={"audit":"ALICE_PRODUCTION_SCRIPT_WITNESS_META",
            "schemaVersion":1,"readOnly":True,"worldModified":False,
            "consoleCommandsSent":False,"serviceStarted":False,
            "report":report}
    flags=os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,"O_NOFOLLOW",0)
    fd=os.open(dest/"bds_script_preflight_readonly.json",flags,0o600)
    with os.fdopen(fd,"w",encoding="utf-8") as out:
        json.dump(result,out,separators=(",",":"));out.write("\n")
    print(json.dumps({"state":"observed" if report else "unverified"}))


def selftest():
    assert COMMAND[-1].endswith("alice-bds-witness-preflight.py")
    assert not any("querytarget" in x or "restart" in x for x in COMMAND)
    obj={"audit":"ALICE_BDS_SILENT_WITNESS_READ_ONLY",
         "schemaVersion":2,"observedAtUnix":1000,"readOnly":True,
         "safeToApplyWorldChanges":False,
         "betaApisExperiment":"not_declared_in_level_dat",
         "receiverPrivateTokenExists":False,"privateKey":"secret_value"}
    clean=sanitize(obj,1000)
    assert clean["betaApisExperiment"]=="not_declared_in_level_dat"
    assert clean["receiverPrivateTokenExists"] is False
    assert "privateKey" not in clean
    assert sanitize({**obj,"safeToApplyWorldChanges":True},1000) is None
    print("ALICE_BDS_SCRIPT_META_READONLY_SELFTEST_PASS")


if __name__=="__main__":
    if sys.argv[1:]==["--self-test"]:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=="--inspect":run(sys.argv[2])
    else:raise SystemExit("usage: --self-test | --inspect OUTPUT_DIR")
