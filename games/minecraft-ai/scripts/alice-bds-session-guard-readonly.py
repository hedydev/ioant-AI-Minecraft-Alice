#!/usr/bin/env python3
"""Read-only classification of original-world Alice post-reboot session guard."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

REMOTE = r'''
import json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path.home() / 'minecraft-ai/scripts'))
from alice_operator.process import AliceProcess
from alice_operator.config import load_environment
app=AliceProcess()
result={'audit':'ALICE_BDS_SESSION_READONLY','state':'unavailable','category':'unknown',
        'productionGatePassed':False,'productionCheckPassed':False,
        'sessionLogAgeSeconds':None,'clientRunning':None}
try:
    result['clientRunning']=app.owner() is not None
    env=load_environment(app.root)
    app.check(env)
    result['productionGatePassed']=True
    log=env.get('ALICE_BEDROCK_BDS_SESSION_LOG')
    if log:
        p=Path(log)
        if p.is_file() and not p.is_symlink():
            seconds=time.time()-p.stat().st_mtime
            if 0<=seconds<=365*86400:result['sessionLogAgeSeconds']=round(seconds,1)
    command=[str(app.node),'src/main.cjs','--production-check']
    proc=subprocess.run(command,cwd=app.project,env=env,capture_output=True,timeout=30)
    result['state']='observed'
    result['productionCheckPassed']=proc.returncode==0
    error=(proc.stderr or b'').decode('utf-8','replace')[:16000]
    conditions=[
     ('BDS session log is stale','stale_server_session_log'),
     ('BDS session history has no verified prior Alice disconnect','no_verified_disconnect'),
     ('BDS still records configured Alice Gamertag ONLINE','bds_records_alice_online'),
     ('BDS session log unreadable','session_log_unreadable'),
     ('BDS session guard requires both','session_guard_config_missing'),
     ('BDS session log must be one explicit','wrong_session_log_binding'),
     ('BDS session log is missing or empty','session_log_missing_or_empty'),
    ]
    result['category']='passed' if proc.returncode==0 else next(
        (label for match,label in conditions if match in error),'other_production_check_failure')
except (ValueError,OSError,subprocess.SubprocessError):
    result['state']='blocked'
    result['category']='precheck_unavailable'
print(json.dumps(result,separators=(',',':')))
'''

def run(out):
    result=None
    try:
        proc=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
            'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=70)
        if proc.returncode==0 and len(proc.stdout)<=4096:
            result=json.loads(proc.stdout)
            if result.get('audit')!='ALICE_BDS_SESSION_READONLY':result=None
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    if result is None:
        result={'audit':'ALICE_BDS_SESSION_READONLY','state':'unavailable'}
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    with (out/'alice_bds_session_readonly.json').open('x') as f:
        json.dump(result,f)
    print(json.dumps(result))
def selftest():
    compile(REMOTE,'<safe-guard-readonly>','exec')
    assert '--production-check' in REMOTE and '--production-start' not in REMOTE
    assert not any(x in REMOTE for x in ('app.launch(', 'app.stop(', 'worlds/'))
    print('BDS_SESSION_DIAGNOSTIC_READONLY_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT')
