#!/usr/bin/env python3
"""Approved Alice-only lifecycle task. No BDS control, model or automatic retry."""
import fcntl
import hashlib
import importlib.util
import inspect
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time

PRIOR_DENIED = 'alice_idle_late_drift_safe_reload_after_audit_20261102_h01'
REMOTE_PINS = {
    'alice-mint.py': '5c4dac4645b0e8f2827bda1b1db496b5f069963c921e9a1455ef86a039b23570',
    'alice_operator/process.py': '7175e12e50adf5aebeef9e17d3bfce731c2782f00d346fc0a54dd6c8f0e34d04',
    'alice_operator/config.py': '37441a9adb91cf6bc7d684787b43a4f37d78ad51930c1a469daba3a6e6fe0411'
}


def empty_receipt(operation):
    return {'schemaVersion': 3, 'operationId': operation, 'state': 'blocked',
            'failureReason': 'preflight_not_completed', 'oldPid': None, 'newPid': None,
            'restartAttempted': False, 'processAlive': False, 'heartbeatFresh': False,
            'connected': False, 'sessionEstablished': False, 'ownerVerified': False,
            'worldVerified': False, 'portVerified': False, 'existingTask': False,
            'bdsRestarted': False, 'worldChanged': False, 'replacementCount': 0,
            'exitVerified': False}


def read_live(app, status_reader):
    # Existing status pins PID and /proc birth token. Recheck private raw status
    # for exact world/port and game-job safety; no environment is exported.
    owner = app.owner()
    if owner is None:
        raise ValueError('client_not_running')
    _, token, env = app.inspect(owner)
    status = status_reader(app)
    raw = app.root / 'status.json'
    stat = raw.lstat()
    if (raw.is_symlink() or not raw.is_file() or stat.st_uid != os.getuid()
            or stat.st_mode & 0o077 or stat.st_size > 8192):
        raise ValueError('unsafe_status')
    data = json.loads(raw.read_text())
    if (status.get('statusSource') != 'current_process' or status.get('pid') != owner['pid']
            or data.get('producerPid') != owner['pid']
            or data.get('producerStartToken') != token):
        raise ValueError('owner_changed')
    if (status.get('heartbeatFresh') is not True or
            not 0 <= time.time() - stat.st_mtime <= 10):
        raise ValueError('stale_heartbeat')
    if data.get('world') != 'Bedrock level':
        raise ValueError('wrong_world')
    if data.get('serverPort') != 17879:
        raise ValueError('wrong_port')
    if status.get('reportedConnected') is not True or status.get('sessionEstablished') is not True:
        raise ValueError('game_session_unverified')
    return owner, token, env, status, data


def verify_safe_state(data):
    if data.get('job') is not None:
        raise ValueError('game_task_active')
    if data.get('state') != 'IDLE':
        raise ValueError('unsafe_live_state')
    health = data.get('health')
    if type(health) not in (int, float) or not 16 <= health <= 20:
        raise ValueError('unsafe_health')
    if (data.get('worldRoutine') or {}).get('idleGate') not in (
            'eligible_for_work', 'work_cooldown', 'position_witness_unverified'):
        raise ValueError('game_safety_gate')


def perform_restart(app, status_reader, operation, *, pause=time.sleep, clock=time.monotonic,
                    verify_exit=lambda old_pid, new_pid: False):
    result = empty_receipt(operation)
    try:
        owner, token, env, _, data = read_live(app, status_reader)
        result.update(oldPid=owner['pid'], ownerVerified=True,
                      worldVerified=True, portVerified=True,
                      existingTask=data.get('job') is not None)
        verify_safe_state(data)
        app.check(env)  # original production world/backup/chunk preflight
        # Revalidate AFTER the slow production check and again immediately before
        # existing stop(). Never authorize stopping a replacement owner's PID.
        original_stop = app.stop

        def guarded_stop(candidate, birth):
            current, current_token, _, _, current_data = read_live(app, status_reader)
            if current != owner or current_token != token or candidate != owner or birth != token:
                raise ValueError('owner_changed')
            verify_safe_state(current_data)
            result['restartAttempted'] = True
            original_stop(candidate, birth)

        app.stop = guarded_stop
        try:
            replacement = app.launch(env, owner)
        finally:
            app.stop = original_stop
        if (replacement.get('oldPid') != owner['pid']
                or type(replacement.get('newPid')) is not int
                or replacement['newPid'] <= 1 or replacement['newPid'] == owner['pid']):
            raise ValueError('replacement_unverified')
        result.update(newPid=replacement['newPid'], replacementCount=1,
                      state='inconclusive', failureReason='login_not_yet_verified')
        deadline = clock() + 55
        while clock() < deadline:
            pause(2)
            try:
                current, _, _, live, current_data = read_live(app, status_reader)
            except (ValueError, OSError):
                if verify_exit(result['oldPid'], result['newPid']):
                    result.update(state='failed', failureReason='client_exited_before_login',
                                  exitVerified=True)
                    return result
                continue
            if current['pid'] != result['newPid']:
                result['failureReason'] = 'unexpected_replacement'
                return result
            result.update(processAlive=live.get('processAlive') is True,
                          heartbeatFresh=live.get('heartbeatFresh') is True,
                          connected=live.get('reportedConnected') is True,
                          sessionEstablished=live.get('sessionEstablished') is True)
            if all(result[k] for k in ('processAlive', 'heartbeatFresh', 'connected', 'sessionEstablished')):
                result.update(state='completed', failureReason='none')
                return result
        return result
    except Exception as exc:
        # A stop may have happened even if launch raised: never auto-retry.
        reason = str(exc) if isinstance(exc, ValueError) else ''
        known = {'client_not_running', 'unsafe_status', 'owner_changed', 'stale_heartbeat',
                 'wrong_world', 'wrong_port', 'game_session_unverified', 'game_task_active',
                 'unsafe_live_state', 'unsafe_health', 'game_safety_gate',
                 'replacement_unverified'}
        result.update(state='inconclusive' if result['restartAttempted'] else 'blocked',
                      failureReason=reason if reason in known else 'operator_failure_requires_review')
        return result


def private_directory(path):
    path.mkdir(mode=0o700, exist_ok=True)
    stat = path.lstat()
    if path.is_symlink() or not path.is_dir() or stat.st_uid != os.getuid() or stat.st_mode & 0o077:
        raise ValueError('unsafe_lifecycle_directory')


def verify_client_exit(app, old_pid, new_pid):
    from alice_operator.diagnostics import alice_processes
    return (app.owner() is None and not alice_processes(app) and
            not (Path('/proc')/str(old_pid)).exists() and
            not (Path('/proc')/str(new_pid)).exists())


def remote_run(operation, pins):
    # Claim is persisted before attempting shutdown. Same ID only reads a saved
    # result. Incomplete claims remain uncertain, even after disconnect/crash.
    home = Path.home()
    source = home / 'minecraft-ai/scripts'
    for name, digest in pins.items():
        path = source / name
        if path.is_symlink() or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            result = empty_receipt(operation)
            result['failureReason'] = 'operator_source_mismatch'
            return result
    sys.path.insert(0, str(source))
    from alice_operator.process import AliceProcess
    spec = importlib.util.spec_from_file_location('alice_lifecycle_operator', source / 'alice-mint.py')
    cli = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli)
    app = AliceProcess()
    from alice_operator.config import private_path
    private_path(app.root, directory=True)
    root = app.root / 'mcp-client-lifecycle'
    private_directory(root)
    file = root / (operation + '.json')
    try:
        fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        private_path(file)
        if file.stat().st_size > 8192:
            raise ValueError('unsafe_claim')
        saved = json.loads(file.read_text())
        if saved.get('operationId') != operation:
            raise ValueError('claim_conflict')
        return saved
    initial = empty_receipt(operation)
    initial.update(state='inconclusive', failureReason='claimed_outcome_requires_review')
    with os.fdopen(fd, 'w') as stream:
        json.dump(initial, stream); stream.flush(); os.fsync(stream.fileno())
    lock = root / 'lifecycle.lock'
    lock_fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        private_path(lock)
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            initial.update(state='blocked', failureReason='lifecycle_busy')
            result = initial
        else:
            result = perform_restart(app, cli.status, operation,
                                     verify_exit=lambda old, new: verify_client_exit(app, old, new))
        temp = root / (operation + '.result.tmp')
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(result, stream); stream.flush(); os.fsync(stream.fileno())
        os.replace(temp, file)
        return result
    finally:
        os.close(lock_fd)


def remote_source(operation):
    header = ('import fcntl,hashlib,importlib.util,json,os,sys,time\nfrom pathlib import Path\n')
    functions = (empty_receipt, read_live, verify_safe_state, perform_restart,
                 private_directory, verify_client_exit, remote_run)
    return header + '\n'.join(inspect.getsource(f) for f in functions) + (
        '\nprint(json.dumps(remote_run(' + repr(operation) + ',' + repr(REMOTE_PINS) + ')))\n')


def run(output, operation):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{7,79}', operation) or operation == PRIOR_DENIED:
        raise ValueError('invalid_or_previously_denied_operation')
    output = Path(output)
    if output.is_symlink() or not output.is_dir():
        raise ValueError('unsafe_output')
    result = empty_receipt(operation)
    try:
        proc = subprocess.run(
            ['/usr/bin/ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
             '-o', 'ConnectTimeout=8', 'tedz@192.168.0.104',
             '/usr/bin/python3 -c ' + shlex.quote(remote_source(operation))],
            capture_output=True, text=True, timeout=410, check=False)
        if proc.returncode or len(proc.stdout) > 8192:
            raise ValueError('remote_receipt_unavailable')
        candidate = json.loads(proc.stdout)
        if set(candidate) != set(result) or candidate.get('operationId') != operation:
            raise ValueError('invalid_remote_receipt')
        result = candidate
    except (OSError, ValueError, subprocess.SubprocessError):
        result.update(state='inconclusive', failureReason='transport_outcome_requires_review')
    fd = os.open(output / 'alice_17879_client_restart.json',
                 os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(result, stream)
    print(json.dumps(result))


def selftest():
    compile(remote_source('alice_lifecycle_selftest'), '<approved-alice-lifecycle>', 'exec')
    assert not verify_safe_state({'state': 'IDLE', 'health': 20, 'job': None,
                                 'worldRoutine': {'idleGate': 'position_witness_unverified'}})
    print('ALICE_17879_CLIENT_RESTART_CONTRACT_PASS')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        selftest()
    elif len(sys.argv) == 4 and sys.argv[1] == '--restart':
        run(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit('usage: --self-test | --restart OUTPUT_DIR OPERATION_ID')
