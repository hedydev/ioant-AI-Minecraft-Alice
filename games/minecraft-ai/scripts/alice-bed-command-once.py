#!/usr/bin/env python3
"""One typed bed request via the existing Mac-local control plane, never raw MC commands."""
import json
import os
from pathlib import Path
import re
import sys
import urllib.request

BASE = 'http://127.0.0.1:8788'
ACTIONS = {'set_spawnpoint': '设置重生点', 'sleep': '睡觉'}


def request(route, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + route, data=body, headers={
        'Origin': BASE, 'Content-Type': 'application/json'})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError('redirect_forbidden')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=15) as result:
        data = result.read(16385)
        if len(data) > 16384:
            raise ValueError('response_too_large')
        return json.loads(data)


def ready(data):
    r = data.get('runtime') or {}
    return (data.get('online') is True and data.get('canCommand') is True and
            r.get('world') == 'Bedrock level' and r.get('serverPort') == 17879 and
            r.get('sessionEstablished') is True and r.get('connected') is True and
            type(r.get('producerPid')) is int and
            (r.get('worldRoutine') or {}).get('bedLogicVersion') == 5 and
            r.get('state') == 'IDLE' and not r.get('job') and
            type(r.get('health')) in (int, float) and 16 <= r['health'] <= 20)


def submit(action, folder, api=request):
    if action not in ACTIONS:
        raise ValueError('unsupported_bed_action')
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError('unsafe_output')
    file = folder / 'bed_command.json'
    # Persist uncertainty BEFORE transmitting. Never resend after HTTP timeout,
    # process death, or a repeated invocation using the same output directory.
    result = {'action': action, 'state': 'not_submitted', 'reason': 'preflight',
              'commandId': None, 'submitted': False, 'doNotRepeat': True,
              'bedCompleted': False, 'sleepEntered': False}
    fd = os.open(file, os.O_CREAT | os.O_EXCL | os.O_WRONLY |
                 getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(result, stream)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        if not ready(api('/api/control/status')):
            result.update(state='blocked', reason='current_loaded_idle_client_required')
        else:
            result.update(state='submission_unknown', reason='awaiting_transport', submitted=True)
            file.write_text(json.dumps(result))
            reply = api('/api/control/command', {'text': ACTIONS[action]})
            identity = reply.get('id')
            if reply.get('status') == 'queued' and isinstance(identity, str) and re.fullmatch('[a-f0-9]{32}', identity):
                result.update(state='queued', reason='awaiting_runtime_receipt', commandId=identity)
            elif reply.get('status') == 'rejected':
                result.update(state='rejected', reason='runtime_command_rejected')
    except (OSError, ValueError):
        # Conservatively preserve submitted=true if the POST may have reached
        # the server. Only read the existing command receipt after uncertainty.
        result['reason'] = 'transport_unavailable_do_not_repeat'
    file.write_text(json.dumps(result))
    return result


def inspect_state(folder, api=request):
    data = api('/api/control/status')
    r = data.get('runtime') or {}
    w = r.get('worldRoutine') or {}
    command = data.get('commandResult') or {}
    witness = (r.get('movementEvidence') or {}).get('witnessDemand') or {}
    door = w.get('escapeSurvey') or {}
    safe = lambda value: value if isinstance(value, str) and re.fullmatch('[a-zA-Z0-9_]{1,90}', value) else None
    result = {'readOnly': True, 'online': data.get('online') is True,
              'producerPid': r.get('producerPid'), 'state': safe(r.get('state')),
              'bedLogicVersion': w.get('bedLogicVersion'), 'isSleeping': r.get('isSleeping'),
              'canSleep': w.get('canSleep'), 'personalBedStatus': safe((w.get('homeBed') or {}).get('status')),
              'bedRequestStage': safe((w.get('bedRequest') or {}).get('stage')),
              'bedWitnessKind': safe((w.get('bedWitness') or {}).get('kind')),
              'bedWitnessState': safe((w.get('bedWitness') or {}).get('state')),
              'idleGate': safe(w.get('idleGate')),
              'witnessDemandState': safe(witness.get('state')),
              'positionGateSatisfied': witness.get('positionGateSatisfied') is True,
              'doorActionReason': safe((door.get('doorAction') or {}).get('reason')),
              'passageActionReason': safe((door.get('passageAction') or {}).get('reason')),
              'bedStepStatus': safe((w.get('bedApproachAction') or {}).get('status')),
              'bedStepReason': safe((w.get('bedApproachAction') or {}).get('reason')),
              'sleepOpportunity': safe((w.get('sleepOpportunity') or {}).get('status')),
              'commandId': safe(command.get('id')), 'commandStatus': safe(command.get('status')),
              'commandReason': safe(command.get('reason'))}
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError('unsafe_output')
    fd = os.open(folder / 'bed_state.json', os.O_CREAT | os.O_EXCL | os.O_WRONLY |
                 getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(result, stream)
    return result


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: inspect|set_spawnpoint|sleep OUTPUT_DIR')
    print(json.dumps(inspect_state(Path(sys.argv[2])) if sys.argv[1] == 'inspect'
                     else submit(sys.argv[1], Path(sys.argv[2]))))
