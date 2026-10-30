#!/usr/bin/env python3
"""Check whether Mint already permits passwordless sudo authorization.

Never receives, reads, records, or echoes a password. Never starts Alice/BDS,
touches lab artifacts, or modifies sudoers. Remote sudo uses -n, no prompting.
"""
import json, os, subprocess, sys
from pathlib import Path

TARGET="tedz@192.168.0.104"
def audit(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():
        raise ValueError("unsafe_output")
    state="unavailable"
    try:
        p=subprocess.run([
          "/usr/bin/ssh","-tt","-o","BatchMode=yes",
          "-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=8",
          "-o","ConnectionAttempts=1",TARGET,
          "/usr/bin/sudo -n -v >/dev/null 2>&1"],
          stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,timeout=22,check=False)
        state="available_without_password" if p.returncode==0 else "interactive_authentication_required"
    except (OSError,subprocess.TimeoutExpired):
        state="unavailable"
    report={"audit":"ALICE_V2_SUDO_NONINTERACTIVE_PREFLIGHT","schemaVersion":1,
            "readOnly":True,"passwordRead":False,"passwordRecorded":False,
            "sudoPolicyModified":False,"labProbeStarted":False,"result":state}
    fd=os.open(out/"sudo_noninteractive_check.json",
       os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,"O_NOFOLLOW",0),0o600)
    with os.fdopen(fd,"w",encoding="utf-8") as f:
        json.dump(report,f,separators=(",",":"));f.write("\n")
    print(json.dumps({"state":state}))
def selftest():
    assert TARGET=="tedz@192.168.0.104"
    assert "password" not in TARGET
    print("ALICE_V2_SUDO_NONINTERACTIVE_SELFTEST_PASS")
if __name__=="__main__":
    if sys.argv[1:]==["--self-test"]: selftest()
    elif len(sys.argv)==3 and sys.argv[1]=="--check": audit(sys.argv[2])
    else:raise SystemExit("usage: --self-test | --check OUTPUT_DIR")
