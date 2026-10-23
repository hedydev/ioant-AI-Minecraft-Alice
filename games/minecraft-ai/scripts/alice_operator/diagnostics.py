"""Read-only inventory of Alice processes and operator log paths.

Never inspects Xbox credentials, environment values, BDS worlds, or packet data.
"""
import os
import pathlib
import re
from .config import private_path


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
