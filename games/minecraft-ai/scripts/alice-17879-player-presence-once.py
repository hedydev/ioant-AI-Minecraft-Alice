#!/usr/bin/env python3
"""One budgeted original-world player-presence query; never starts/stops Alice or BDS."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

REMOTE = r'''
import fcntl
import json
import os
import subprocess
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path.home()/'minecraft-ai/scripts'))
import bds_position_witness as w
import importlib.util
from alice_operator.process import AliceProcess
from alice_operator.config import load_environment
from alice_operator.diagnostics import alice_processes
dpath=Path.home()/'minecraft-ai/scripts/alice-bds-demand-timer.py'
spec=importlib.util.spec_from_file_location('alice_demand_budget',dpath)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
result={'schemaVersion':1,'audit':'ALICE_17879_PLAYER_PRESENCE','state':'blocked',
        'presence':'unverified','reason':'precheck_failed','querySent':False,
        'commandBudgetReserved':False,'budgetUsed':None,
        'bdsRestarted':False,'worldChanged':False,'aliceStarted':False}
def run():
    m.private_root()
    app=AliceProcess()
    if app.owner() is not None or alice_processes(app):
        result['reason']='alice_process_present'
        return
    env=load_environment(app.root)
    app.check(env)
    m.binding_ok()
    cfg,key=w.validated_config()
    if cfg['gamertag']!=env['ALICE_BEDROCK_BDS_GAMERTAG']:
        result['reason']='gamertag_binding_mismatch'
        return
    lock_fd=os.open(m.LOCK,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        if os.fstat(lock_fd).st_mode & 0o077:
            result['reason']='unsafe_budget_lock'
            return
        try: fcntl.flock(lock_fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            result['reason']='witness_timer_busy'
            return
        now=time.time()
        budget=m.budget_value(now,m.private_read(m.BUDGET,512)) if (
            m.BUDGET.exists() or m.BUDGET.is_symlink()) else m.budget_value(now)
        result['budgetUsed']=budget['used']
        if now-budget['lastBatch']<m.SUSTAINED_BATCH_SECONDS or budget['used']>=m.MAX_HOURLY:
            result['reason']='cooldown_or_budget'
            return
        if app.owner() is not None or alice_processes(app):
            result['reason']='alice_process_race'
            return
        budget['lastBatch']=now
        if not m.consume_budget(now,budget):
            result['reason']='budget_exhausted'
            return
        result['commandBudgetReserved']=True
        result['budgetUsed']=budget['used']
        result['querySent']=True
        result['state']='observed'
        try:
            w.probe_once(cfg,key,local_log_factory=w.capture_local_log)
            result['presence']='online'
            result['reason']='server_returned_player_target'
        except ValueError as e:
            if str(e)=='querytarget_no_matching_player_reported':
                result['presence']='absent'
                result['reason']='server_no_matching_player'
            else:
                result['reason']='query_outcome_unverified'
        except (OSError,Exception):
            result['reason']='query_outcome_unverified'
    finally:os.close(lock_fd)
try:run()
except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError):
    result['reason']='precheck_or_query_unavailable'
print(json.dumps(result,separators=(',',':')))
'''
FIELDS = {'schemaVersion','audit','state','presence','reason','querySent',
          'commandBudgetReserved','budgetUsed','bdsRestarted','worldChanged','aliceStarted'}
def go(output):
    value=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
            'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=65)
        if p.returncode==0 and len(p.stdout)<3000:
            value=json.loads(p.stdout)
            if (not isinstance(value,dict) or set(value)!=FIELDS or
                value['audit']!='ALICE_17879_PLAYER_PRESENCE' or
                any(value[x] for x in ('bdsRestarted','worldChanged','aliceStarted'))):
                value=None
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    if value is None:
        value={'state':'inconclusive','presence':'unverified',
               'reason':'remote_outcome_unavailable','doNotRepeat':True}
    output=Path(output)
    if output.is_symlink() or not output.is_dir():raise ValueError('unsafe_output')
    fd=os.open(output/'alice_17879_presence.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f:json.dump(value,f)
    print(json.dumps(value))
def selftest():
    compile(REMOTE,'<alice-presence>','exec')
    assert "w.probe_once(cfg,key" in REMOTE
    assert "m.consume_budget" in REMOTE
    assert "app.launch(" not in REMOTE and "app.stop(" not in REMOTE
    print("ALICE_PRESENCE_BUDGETED_CONTRACT_PASS")
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--probe':go(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --probe OUTPUT')
