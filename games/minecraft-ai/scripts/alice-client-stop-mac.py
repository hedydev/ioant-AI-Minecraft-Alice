#!/usr/bin/env python3
"""Explicit operator request: stop one identity-verified Alice, never launch."""
import inspect
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time


def stop_client(app, pause):
    owner = app.owner()
    if owner is None:
        return {'state': 'already_offline', 'replacementStarted': False}
    token = app.inspect(owner)[1]
    app.stop(owner, token)
    # Observe, never stop an unexpected replacement or retry an uncertain stop.
    pause(5)
    if app.owner() is not None:
        raise ValueError('Alice owner present after stop; do not repeat')
    return {'state': 'stopped', 'oldPid': owner['pid'],
            'processAlive': False, 'replacementStarted': False}


REMOTE = ('import sys,json,time\nfrom pathlib import Path\n'
          "sys.path.insert(0,str(Path.home()/'minecraft-ai/scripts'))\n"
          'from alice_operator.process import AliceProcess\n' +
          inspect.getsource(stop_client) +
          '\nprint(json.dumps(stop_client(AliceProcess(),time.sleep)))\n')


def main():
    if sys.argv[1:] == ['--self-test']:
        compile(REMOTE, '<alice-stop>', 'exec')
        print('ALICE_CLIENT_STOP_SELFTEST_PASS')
        return
    if len(sys.argv) != 3 or sys.argv[1] != '--stop':
        raise ValueError('usage: --self-test | --stop OUTPUT_DIR')
    output = Path(sys.argv[2])
    if output.is_symlink() or not output.is_dir():
        raise ValueError('unsafe_output')
    # One SSH submission only; timeout is uncertain and must not be retried.
    result = subprocess.run(
        ['/usr/bin/ssh', '-T', '-o', 'BatchMode=yes', '-o',
         'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8',
         'tedz@192.168.0.104', '/usr/bin/python3 -c ' + shlex.quote(REMOTE)],
        capture_output=True, text=True, timeout=40, check=False)
    if result.returncode or len(result.stdout) > 1000:
        raise ValueError('stop_receipt_unavailable_do_not_repeat')
    data = json.loads(result.stdout)
    if data.get('state') not in ('stopped', 'already_offline') or data.get('replacementStarted') is not False:
        raise ValueError('stop_receipt_invalid_do_not_repeat')
    fd = os.open(output/'alice_client_stop.json',
                 os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(data, stream)
    print(json.dumps(data))


if __name__ == '__main__':
    main()
