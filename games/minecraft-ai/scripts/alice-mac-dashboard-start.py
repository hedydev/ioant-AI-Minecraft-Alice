#!/usr/bin/env python3
"""Idempotently start only the existing Alice Mac web dashboard at :8788.

No Minecraft BDS process, Alice client, world, credentials or Mint service
is modified. Never touch occupied ports owned by another process.
The dashboard follows its existing documented LAN exposure policy.
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE=Path(__file__).resolve().parent
RUN=HERE/'run-dashboard.sh'
WEB_PORT=8788
API_PORT=18788
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}))

def http(path, *, timeout=3):
    try:
        with OPENER.open('http://127.0.0.1:8788'+path,timeout=timeout) as r:
            return r.status,r.read(8192)
    except (OSError,urllib.error.URLError):
        return None,b''

def web_ready():
    status,body=http('/')
    if status!=200 or b'<title>AliceAI' not in body:
        return False
    code,data=http('/api/health')
    if code!=200:
        return False
    try:
        return json.loads(data)=={'ok':True,'localOnly':True}
    except (ValueError,TypeError):
        return False

def port_bound(port):
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as s:
        s.settimeout(.5)
        return s.connect_ex(('127.0.0.1',port))==0

def supported():
    return RUN.is_file() and not RUN.is_symlink() and all(
        shutil.which(x,path='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin') for x in ('nginx','python3','curl','mktemp'))

def status():
    ready=web_ready()
    blocked=not ready and (port_bound(WEB_PORT) or port_bound(API_PORT))
    return {'ready':ready,'portsOccupiedWithoutValidAlice':blocked,
            'launcherAvailable':supported()}

def launch():
    before=status()
    state='already_running' if before['ready'] else 'blocked' if before['portsOccupiedWithoutValidAlice'] else 'unavailable' if not before['launcherAvailable'] else 'not_started'
    launched=False
    if state=='not_started':
        logdir=Path.home()/'Library'/'Logs'
        if logdir.is_symlink():
            state='unsafe_log_directory'
        else:
            logdir.mkdir(parents=True,exist_ok=True)
            log=logdir/'ioant-alice-dashboard.log'
            if log.is_symlink():
                state='unsafe_log_file'
            else:
                fd=os.open(log,os.O_APPEND|os.O_CREAT|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
                try:
                    env={**os.environ,
                         'ALICE_DASHBOARD_PORT':str(WEB_PORT),
                         'ALICE_DASHBOARD_API_PORT':str(API_PORT),
                         'ALICE_SSH_TARGET':'tedz@192.168.0.104',
                         'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'}
                    child=subprocess.Popen(['/bin/bash',str(RUN)],
                        cwd=HERE.parent,stdin=subprocess.DEVNULL,stdout=fd,
                        stderr=subprocess.STDOUT,env=env,
                        close_fds=True,start_new_session=True)
                    launched=True
                finally:
                    os.close(fd)
                for _ in range(40):
                    if web_ready():
                        state='started_and_verified';break
                    if child.poll() is not None:
                        state='launcher_exited';break
                    time.sleep(.3)
                else:
                    state='start_outcome_unverified'
    ready=web_ready()
    api_code,_=http('/api/control/status',timeout=16) if ready else (None,b'')
    out={'audit':'ALICE_MAC_DASHBOARD_START',
         'schemaVersion':1,'state':state,
         'alreadyRunning':before['ready'],'launchedByTask':launched,
         'webReady':ready,'controlStatusHttp':api_code if api_code in (200,502,503) else None,
         'webPort':WEB_PORT,'apiPort':API_PORT,
         'aliceClientRestarted':False,'bdsRestarted':False,
         'minecraftWorldModified':False,
         'publicInternetForwardingConfigured':False,
         'lanBindPerExistingLauncher':True}
    print(json.dumps(out,separators=(',',':')))
    return out

def main(args):
    if args not in (['--self-test'],['--start']):
        raise SystemExit('usage: --self-test | --start')
    if args==['--self-test']:
        assert WEB_PORT!=API_PORT and str(RUN).endswith('/run-dashboard.sh')
        assert callable(web_ready) and callable(status)
        print('ALICE_MAC_DASHBOARD_START_SELFTEST_PASS')
        return
    launch()

if __name__=='__main__':
    main(sys.argv[1:])
