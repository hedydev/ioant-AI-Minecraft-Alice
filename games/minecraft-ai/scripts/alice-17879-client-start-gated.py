#!/usr/bin/env python3
"""Gated one-shot original Alice client START after a host reboot; never restarts BDS."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

TARGET = "tedz@192.168.0.104"
REMOTE = r'''
import fcntl
import json
import os
import subprocess
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path.home() / "minecraft-ai/scripts"))
from alice_operator.process import AliceProcess
from alice_operator.config import load_environment, private_path, private_json
from alice_operator.diagnostics import alice_processes

def receipt(operation):
    return dict(schemaVersion=1, operationId=operation, state="blocked",
                failureReason="not_checked", oldPid=None, newPid=None,
                startAttempted=False, launchCount=0, processAlive=False,
                heartbeatFresh=False, connected=False, sessionEstablished=False,
                ownerVerified=False, originalWorldVerified=False,
                bdsRestarted=False, worldReset=False)

def verify_no_alice(app):
    if app.owner() is not None:
        raise ValueError("alice_already_running")
    if alice_processes(app):
        raise ValueError("unowned_alice_process")
    return True

def read_status(app, pid):
    owner = app.owner()
    if owner is None or owner["pid"] != pid:
        return None
    _, birth, _ = app.inspect(owner)
    file = app.root / "status.json"
    status = private_json(file, limit=8192)
    if (status.get("producerPid") != pid or
            status.get("producerStartToken") != birth or
            not 0 <= time.time() - file.stat().st_mtime <= 12):
        return None
    return status

def preflight(app):
    verify_no_alice(app)
    env = load_environment(app.root)
    app.check(env)
    app.wait_bds_release(env)
    verify_no_alice(app)
    return env

def run(mode, operation):
    result = receipt(operation)
    app = AliceProcess()
    try:
        private_path(app.root, directory=True)
        if mode == "check":
            preflight(app)
            result.update(state="ready_for_start", failureReason="none",
                          ownerVerified=True, originalWorldVerified=True)
            return result
        assert mode == "start"
        root = app.root / "mcp-client-lifecycle"
        root.mkdir(mode=0o700, exist_ok=True)
        private_path(root, directory=True)
        lockpath = root / "lifecycle.lock"
        fd = os.open(lockpath, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            private_path(lockpath)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                result["failureReason"] = "lifecycle_busy"
                return result
            file = root / (operation + ".json")
            if file.exists() or file.is_symlink():
                previous = private_json(file, limit=8192)
                if previous.get("operationId") != operation:
                    raise ValueError("operation_claim_conflict")
                return previous
            # Verify original config and BDS readiness before claiming one launch.
            env = preflight(app)
            result.update(ownerVerified=True, originalWorldVerified=True)
            claimed = dict(result, state="inconclusive",
                           failureReason="claimed_outcome_requires_review")
            cfd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(cfd, "w") as stream:
                json.dump(claimed, stream); stream.flush(); os.fsync(stream.fileno())
            result.update(startAttempted=True, launchCount=1, state="inconclusive",
                          failureReason="login_not_yet_verified")
            try:
                launched = app.launch(env, None)
                pid = launched.get("newPid")
                if (launched.get("oldPid") is not None or type(pid) is not int
                        or pid <= 1):
                    raise ValueError("unexpected_launch_receipt")
                result["newPid"] = pid
                deadline = time.monotonic() + 75
                while time.monotonic() < deadline:
                    time.sleep(2)
                    current = read_status(app, pid)
                    if current is not None:
                        result.update(processAlive=True, heartbeatFresh=True,
                                      connected=current.get("connected") is True,
                                      sessionEstablished=current.get("sessionEstablished") is True)
                        if result["connected"] and result["sessionEstablished"]:
                            result.update(state="completed", failureReason="none")
                            break
                    elif app.owner() is None and not alice_processes(app):
                        result.update(state="failed", failureReason="client_exited_before_login")
                        break
            except (ValueError, OSError, subprocess.SubprocessError) as exc:
                # An exception after claiming can hide a launched client; never retry.
                result["failureReason"] = "launch_or_login_requires_review"
            tmp = root / (operation + ".result.tmp")
            tfd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(tfd, "w") as stream:
                json.dump(result, stream); stream.flush(); os.fsync(stream.fileno())
            os.replace(tmp, file)
            return result
        finally:
            os.close(fd)
    except (ValueError, OSError, subprocess.SubprocessError):
        result["failureReason"] = "production_preflight_failed"
        return result

mode, operation = sys.argv[1:3]
print(json.dumps(run(mode, operation), separators=(",", ":")))
'''

def invoke(mode, output, operation):
    result = None
    try:
        command = "/usr/bin/python3 -c " + shlex.quote(REMOTE) + " " + mode + " " + shlex.quote(operation)
        proc = subprocess.run([
            "/usr/bin/ssh", "-T", "-o", "BatchMode=yes",
            "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8",
            TARGET, command], capture_output=True, text=True, timeout=200)
        if proc.returncode == 0 and len(proc.stdout) <= 8192:
            result = json.loads(proc.stdout)
            expected = {"schemaVersion","operationId","state","failureReason","oldPid",
                        "newPid","startAttempted","launchCount","processAlive",
                        "heartbeatFresh","connected","sessionEstablished",
                        "ownerVerified","originalWorldVerified","bdsRestarted","worldReset"}
            if not isinstance(result, dict) or set(result) != expected or result["operationId"] != operation:
                result = None
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    if result is None:
        result = {"state":"inconclusive", "operationId":operation,
                  "failureReason":"transport_or_receipt_unavailable",
                  "doNotRepeat":True}
    filename = "alice_17879_start_preflight.json" if mode == "check" else "alice_17879_client_start.json"
    output = Path(output)
    if output.is_symlink() or not output.is_dir():
        raise ValueError("unsafe_output")
    fd = os.open(output / filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(result, stream)
    print(json.dumps(result))
    if mode == "check" and result.get("state") != "ready_for_start":
        raise SystemExit(1)

def selftest():
    compile(REMOTE, "<one-shot-client-start>", "exec")
    assert "app.launch(env, None)" in REMOTE
    assert "bdsRestarted=False" in REMOTE
    assert "worldReset=False" in REMOTE
    assert "app.stop(" not in REMOTE
    print("ALICE_ONE_SHOT_START_CONTRACT_PASS")

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        selftest()
    elif len(sys.argv) == 4 and sys.argv[1] in ("--check", "--start"):
        invoke(sys.argv[1][2:], sys.argv[2], sys.argv[3])
    else:
        raise SystemExit("usage: --self-test | --check OUTPUT OPERATION | --start OUTPUT OPERATION")
