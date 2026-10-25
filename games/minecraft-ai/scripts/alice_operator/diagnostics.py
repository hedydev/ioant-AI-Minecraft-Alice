"""Read-only inventory of Alice processes and operator log paths.

Never inspects Xbox credentials, environment values, BDS worlds, or packet data.
"""
import os
import pathlib
import re
import json
import math
import time
from .config import private_path, private_json


def alice_processes(app, *, proc=pathlib.Path('/proc')):
    result = []
    approved_cwds = {app.project.resolve(),
                     (app.home / '.alice-bedrock-autonomy-state').resolve()}
    node_root = app.node_root.resolve()
    for directory in proc.iterdir():
        if not directory.name.isdecimal():
            continue
        try:
            if directory.stat().st_uid != os.getuid():
                continue
            args = (directory / 'cmdline').read_bytes().split(b'\x00')
            if args[-1:] == [b'']:
                args.pop()
            if (len(args) != 3 or
                    pathlib.Path(os.fsdecode(args[0])).name != 'node' or
                    args[1:] != [b'src/main.cjs', b'--production-start']):
                continue
            executable = (directory / 'exe').resolve(strict=True)
            cwd = (directory / 'cwd').resolve(strict=True)
            if not executable.is_relative_to(node_root) or cwd not in approved_cwds:
                continue
            result.append({'pid': int(directory.name),
                           'cwd': 'runtime_state' if cwd != app.project.resolve() else 'project'})
        except (OSError, ValueError, PermissionError):
            # Processes exit while being enumerated; do not infer ownership.
            continue
    return sorted(result, key=lambda x: x['pid'])


def current_log(app, owner):
    if not owner:
        return None
    try:
        fd = pathlib.Path('/proc') / str(owner['pid']) / 'fd/1'
        target = fd.resolve(strict=True)
        if target.parent != app.root or not target.name.startswith('operator-alice-') or target.suffix != '.log':
            return None
        private_path(target)
        return str(target)
    except (OSError, ValueError):
        return None


def recent_logs(app, *, max_files=8):
    logs = []
    for path in app.root.glob('operator-alice-*.log'):
        try:
            info = private_path(path)
            logs.append({'path': str(path),
                         'lastWriteAt': int(info.st_mtime),
                         'bytes': info.st_size})
        except (OSError, ValueError):
            continue
    return sorted(logs, key=lambda item: item['lastWriteAt'], reverse=True)[:max_files]



# Only fixed event labels and locally generated ISO timestamps are returned.
# Never return raw log content: authentication prompts and Xbox device codes
# can appear in the same operator log as a disconnection.
_LIFECYCLE = (
    ('[Alice session] lifecycle:', 'session_lifecycle'),
    ('[Alice wire] server_disconnect', 'server_disconnect'),
    ('[Alice wire] session_closed', 'session_closed'),
    ('[Alice Bedrock live] connection ended:', 'connection_ended'),
    ('[Alice Bedrock] kicked:', 'server_kicked'),
    ('[Alice life] respawn recovery:', 'respawn_recovery'),
    ('[Alice life] death observed:', 'death_observed'),
    ('spawn confirmed', 'spawn_confirmed'),
    ('[Alice shutdown] requested:', 'shutdown_requested'),
    ('[Alice Bedrock autonomy]', 'uncaught_runtime_error'),
)
_TIMESTAMP = re.compile(r'^\[(\d{4}-\d{2}-\d{2}T[^ ]{16,40}) PID=(\d+)\] ')
_KINDS = {'none', 'server_disconnect', 'server_kicked',
          'transport_closed', 'transport_ended', 'operator_shutdown'}
_RESPAWN_PHASES = frozenset({
    'waiting_for_server_respawn', 'cannot_retry_without_player_runtime_id',
    'respawn_ready_retried_waiting_for_server', 'respawn_action_after_server_ready',
    'respawn_action_retried_once', 'respawn_retry_send_failed',
    'server_ready_seen', 'respawn_stalled', 'health_restored_awaiting_spawn',
    'spawn_without_positive_health', 'respawn_verified',
    'transport_closed_during_respawn'
})
_RESPAWN_REASONS = frozenset({
    'death_observed', 'no_runtime_id', 'server_ready_not_seen',
    'server_ready_but_health_zero', 'server_ready_to_spawn',
    'final_action_after_server_ready', 'queue_error',
    'server_ready_without_spawn', 'no_server_ready_or_spawn',
    'positive_health_seen', 'spawn_health_not_ready',
    'spawn_with_positive_health', 'transport_closed'
})


def recent_lifecycle(logs, *, max_events=18):
    rows = []
    # recent_logs returns newest first. Walk old->new so the tail shows
    # the ACTUAL current PID's most recent events, not an older restart.
    for item in reversed(logs[:3]):
        path = pathlib.Path(item['path'])
        try:
            private_path(path)
            with path.open('rb') as stream:
                stream.seek(0, os.SEEK_END)
                stream.seek(max(0, stream.tell() - 65536))
                data = stream.read(65536).decode('utf-8', 'replace')
        except (OSError, ValueError):
            continue
        for line in data.splitlines():
            match = _TIMESTAMP.match(line)
            event = next((label for pattern, label in _LIFECYCLE if pattern in line), None)
            if event is None:
                continue
            row = {'event': event, 'file': path.name,
                   'time': match.group(1) if match else None,
                   'pid': int(match.group(2)) if match else None}
            if event == 'session_lifecycle':
                kind = re.search(r'"kind":"([a-z_]+)"', line)
                if kind and kind.group(1) in _KINDS:
                    row['kind'] = kind.group(1)
            elif event == 'respawn_recovery':
                phase = re.search(r'"phase":"([a-z_]+)"', line)
                reason = re.search(r'"reason":"([a-z_]+)"', line)
                if phase and phase.group(1) in _RESPAWN_PHASES:
                    row['phase'] = phase.group(1)
                if reason and reason.group(1) in _RESPAWN_REASONS:
                    row['reason'] = reason.group(1)
            rows.append(row)
    return rows[-max_events:]


def diagnose(app):
    owner = app.owner()
    # Candidate scan validates command/exe/cwd without loading /proc/PID/environ.
    # The operator's private credentials need not be read to list processes.
    candidates = alice_processes(app)
    current = current_log(app, owner)
    logs = recent_logs(app)
    return {
        'lockedPid': owner['pid'] if owner else None,
        'aliceProcessCandidates': candidates,
        'candidateCount': len(candidates),
        'possibleDuplicate': len(candidates) > 1,
        'ownerMatchesCandidate': owner is None or any(p['pid'] == owner['pid'] for p in candidates),
        'currentOperatorLog': current,
        'recentOperatorLogs': logs,
        'recentLifecycle': recent_lifecycle(logs),
        'note': 'Only exact local Node24 Alice launch candidates are listed; BDS session count is independent.'
    }

# A separate, explicitly invoked read-only postmortem. Inspect only the
# fixed private witness file; do NOT call the MCSManager API, send querytarget,
# read gamertag/uniqueId into output, or trust the row as server confirmation.
def witness_file_diagnose(app, *, now_ms=None):
    now = int(time.time() * 1000) if now_ms is None else now_ms
    report = {
        'audit': 'ALICE_BDS_WITNESS_FILE_READ_ONLY',
        'schemaVersion': 1,
        'bdsCommandSent': False,
        'aliceRestarted': False,
        'worldModified': False,
        'pid': None,
        'state': 'unavailable',
        'filePresent': False,
        'sampleAgeSeconds': None,
        'fileModifiedAgeSeconds': None,
        'sampleBeforeCurrentLogin': None,
        'runtimeWitnessStatus': None,
        'note': 'File timestamps and shape cannot prove MCSManager instance ownership or BDS movement'
    }
    try:
        owner = app.owner()
        if not owner:
            report['state'] = 'alice_not_running'
            return report
        _, birth, _ = app.inspect(owner)
        report['pid'] = owner['pid']
        live_file = app.root / 'status.json'
        live = private_json(live_file, limit=8192)
        status_mtime = live_file.stat().st_mtime * 1000
        if (type(live.get('producerPid')) is not int or
                live['producerPid'] != owner['pid'] or
                live.get('producerStartToken') != birth or
                not 0 <= now - status_mtime <= 15000):
            report['state'] = 'current_heartbeat_unavailable'
            return report
        m = live.get('movementEvidence')
        if not isinstance(m, dict):
            report['state'] = 'login_evidence_missing'
            return report
        prior = m.get('witnessStatus')
        allowed = {'accepted', 'duplicate_or_rejected', 'stale_or_invalid_witness',
                   'not_configured', 'unsafe_witness_file', 'unavailable', 'disabled'}
        report['runtimeWitnessStatus'] = prior if type(prior) is str and prior in allowed else 'unknown'
        login_at = m.get('loginAt')
        if type(login_at) is not int or not 0 < login_at <= now:
            report['state'] = 'login_evidence_missing'
            return report
        file = app.root / 'bds-position-witness.json'
        if not file.exists() and not file.is_symlink():
            report['state'] = 'file_missing'
            return report
        report['filePresent'] = True
        row = private_json(file, limit=1024)
        mtime_delta = (now - file.stat().st_mtime * 1000) / 1000
        if 0 <= mtime_delta <= 366 * 86400:
            report['fileModifiedAgeSeconds'] = round(mtime_delta, 1)
        valid = (isinstance(row, dict) and row.get('version') == 1 and
                 row.get('source') in ('mcsm_querytarget', 'bds_script_api') and
                 type(row.get('gamertag')) is str and
                 re.fullmatch(r'[A-Za-z0-9_ ]{3,16}', row['gamertag']) is not None and
                 type(row.get('serial')) is str and
                 re.fullmatch(r'[0-9]{16,20}', row['serial']) is not None and
                 type(row.get('uniqueId')) is str and
                 re.fullmatch(r'[-A-Za-z0-9]{8,72}', row['uniqueId']) is not None and
                 type(row.get('observedAt')) is int and
                 0 < row['observedAt'] <= 9007199254740991 and
                 type(row.get('feet')) is dict and
                 all(type(row['feet'].get(k)) in (float, int) and
                     math.isfinite(row['feet'][k]) and
                     abs(row['feet'][k]) < 30000000 for k in ('x', 'y', 'z')))
        if not valid:
            report['state'] = 'invalid_witness_shape'
            return report
        at = row['observedAt']
        age = (now - at) / 1000
        if 0 <= age <= 366 * 86400:
            report['sampleAgeSeconds'] = round(age, 1)
        report['sampleBeforeCurrentLogin'] = at <= login_at
        if at > now:
            report['state'] = 'future_sample'
        elif at <= login_at:
            report['state'] = 'sample_predates_current_login'
        elif now - at > 4000:
            report['state'] = 'sample_expired_over_4s'
        else:
            # No gamertag or BDS instance can be proved by shape/time alone.
            report['state'] = 'recent_candidate_not_acceptance_proof'
        if app.owner() != owner:
            report['state'] = 'owner_changed_during_check'
            report['sampleAgeSeconds'] = None
        return report
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        report['state'] = 'unsafe_or_unreadable_source'
        return report
