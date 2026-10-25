#!/usr/bin/env python3
"""Canonical Mint operator CLI. See docs/OPERATIONS.md for lifecycle and privacy."""
import argparse
import json
import os
import pathlib
import subprocess
import sys
import time

from alice_operator.config import load_environment, private_json, private_path, save_environment
from alice_operator.process import AliceProcess
from alice_operator.diagnostics import diagnose, witness_file_diagnose



def verified_process_start_ms(birth_token, *, proc_stat=None, ticks_per_second=None, now_ms=None):
    """Observed Linux process birth, never a respawn/game-time estimate.

    The token is the already identity-checked /proc/PID/stat starttime; btime
    is the kernel boot epoch. Only expose a plausible timestamp, no environ.
    """
    try:
        ticks = int(birth_token)
        hz = ticks_per_second if ticks_per_second is not None else os.sysconf('SC_CLK_TCK')
        if str(ticks) != str(birth_token) or ticks < 0 or type(hz) is not int or hz <= 0:
            return None
        lines = (pathlib.Path('/proc/stat').read_text() if proc_stat is None else proc_stat).splitlines()
        boot = [row.split() for row in lines if row.startswith('btime ')]
        if len(boot) != 1 or len(boot[0]) != 2:
            return None
        epoch = int(boot[0][1])
        start = epoch * 1000 + ticks * 1000 // hz
        limit = int(time.time() * 1000) if now_ms is None else now_ms
        return start if epoch > 0 and epoch * 1000 <= start <= limit + 1000 else None
    except (ValueError, TypeError, OSError, OverflowError):
        return None



# Runtime-generated classifications only. Do not surface unexpected
# witness text that might be injected into a private status file.
_WITNESS_STATES = frozenset({
    'accepted', 'duplicate_or_rejected', 'stale_or_invalid_witness',
    'not_configured', 'unsafe_witness_file', 'unavailable', 'disabled'
})


def witness_status_summary(m, *, now_ms=None):
    """Read the existing Alice heartbeat; never query MCSManager or world."""
    state = m.get('witnessStatus')
    state = state if isinstance(state, str) and state in _WITNESS_STATES else 'unknown'
    source = m.get('independentSource')
    source = source if source in ('bds_querytarget', 'bds_script_api') else None
    sample_at = m.get('independentAt')
    now = int(time.time() * 1000) if now_ms is None else now_ms
    age = (now - sample_at) / 1000 if type(sample_at) is int else None
    if age is not None and (age < 0 or age > 366 * 86400):
        age = None
    return {'bdsWitnessStatus': state,
            'bdsIndependentSource': source,
            'bdsLastIndependentAgeSeconds': round(age, 1) if age is not None else None}


def status(app):
    owner = app.owner()
    inspected = app.inspect(owner) if owner else None
    file = app.root / 'status.json'
    previous = private_json(file, limit=8192) if file.exists() else {}
    # status.json is shared across restarts. Its mtime alone cannot prove it
    # belongs to the currently locked process; previous Alice can have written
    # a heartbeat just milliseconds before its clean SIGINT shutdown.
    file_pid = previous.get('producerPid')
    matching = (
        owner is not None and
        type(file_pid) is int and file_pid == owner['pid'] and
        isinstance(previous.get('producerStartToken'), str) and
        previous['producerStartToken'] == inspected[1]
    )
    data = previous if matching else {}
    source = 'current_process' if matching else (
        'no_running_process' if owner is None else
        'awaiting_current_process_heartbeat'
    )
    started = verified_process_start_ms(inspected[1]) if matching else None
    m = data.get('movementEvidence') or {}
    age = round(time.time() - file.stat().st_mtime, 1) if matching else None
    witness = witness_status_summary(m) if matching else {
        'bdsWitnessStatus': None,
        'bdsIndependentSource': None,
        'bdsLastIndependentAgeSeconds': None
    }
    return {'pid': owner['pid'] if owner else None, 'processAlive': owner is not None,
            'statusSource': source,
            'statusFilePid': file_pid if type(file_pid) is int else None,
            'processStartAtUnixMs': started,
            'heartbeatAgeSeconds': age, 'heartbeatFresh': age is not None and 0 <= age < 15,
            'reportedConnected': data.get('connected'),
            'sessionEstablished': data.get('sessionEstablished'),
            'sessionExit': data.get('sessionExit'),
            'deathRecovery': data.get('deathRecovery'),
            'health': data.get('health'),
            'state': data.get('state'), 'job': data.get('job'), 'clientFeet': data.get('position'),
            'serverFeet': m.get('latestFeet'), 'serverTravelBlocks': m.get('travelBlocks'),
            'bdsSamples': m.get('independentSamples'),
            # The legacy travelBlocks is mixed packet + independent observations,
            # not verified BDS walking; retain old field for compatibility.
            'mixedObservedTravelUnverified': m.get('travelBlocks'),
            **witness,
            'idleHold': (data.get('worldRoutine') or {}).get('idleHold')}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['capture-config', 'check', 'test', 'status', 'diagnose', 'witness-diagnose', 'start', 'restart', 'logs'])
    args = p.parse_args(argv)
    if sys.platform != 'linux':
        raise ValueError('Run alice-mint.py on Mint; use alice-mac.sh on Mac')
    app = AliceProcess()
    if args.action == 'status':
        result = status(app)
    elif args.action == 'diagnose':
        result = diagnose(app)
    elif args.action == 'witness-diagnose':
        result = witness_file_diagnose(app)
    elif args.action == 'test':
        env = {**os.environ, 'PATH': str(app.node.parent) + os.pathsep + os.environ.get('PATH', '')}
        return subprocess.call([str(app.node), '--test', *sorted(str(f) for f in (app.project / 'test').glob('*.test.cjs')),
                                *sorted(str(f) for f in (app.project.parent / 'test').glob('*.test.cjs'))], cwd=app.project, env=env)
    else:
        owner = app.owner()
        if args.action == 'start' and owner:
            raise ValueError('Alice is already running; use: python3 ~/minecraft-ai/scripts/alice-mint.py restart')
        if args.action in ('restart', 'capture-config', 'logs') and not owner:
            raise ValueError('No active Alice process; use start with saved private configuration')
        if args.action == 'logs':
            app.inspect(owner)
            log = (pathlib.Path('/proc') / str(owner['pid']) / 'fd/1').resolve(strict=True)
            if log.parent != app.root or not log.name.startswith('operator-'):
                raise ValueError('Alice output belongs to its original terminal; view that terminal')
            private_path(log)
            os.execvp('tail', ['tail', '-n', '60', '-F', str(log)])
        env = app.inspect(owner)[2] if owner else load_environment(app.root)
        if args.action == 'capture-config':
            result = {'configCreated': save_environment(app.root, env),
                      'file': str(app.root / 'operator-env.json'), 'credentialsStored': False}
        elif args.action == 'check':
            app.check(env)
            if not owner:
                app.wait_bds_release(env)
            result = {'preflight': 'passed', 'activePid': owner['pid'] if owner else None,
                      'action': 'use_restart' if owner else 'ready_for_start'}
        else:
            result = app.launch(env, owner if args.action == 'restart' else None)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, subprocess.SubprocessError, KeyError) as exc:
        # Only our fixed errors may be shown. Never print env, arbitrary JSON or subprocess stderr.
        message = str(exc) if type(exc) is ValueError else type(exc).__name__
        print('Alice operator: ' + message, file=sys.stderr)
        raise SystemExit(1)
