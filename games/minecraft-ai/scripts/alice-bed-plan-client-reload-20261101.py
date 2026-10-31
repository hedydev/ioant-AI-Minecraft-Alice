#!/usr/bin/env python3
"""One guarded Alice-only reload for bounded bed-route observation; never BDS.

First perform reviewed operator 'check' (without stopping Alice). If and only
if it passes and owned PID is valid, exclusively claim a restart intent, then
use existing alice-mint.py restart once, reusing original environment and
post-logout guard. Never log credentials/env/player data or launch two clients.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path

REMOTE=r"""
import json,os,subprocess,time
from pathlib import Path
home=Path.home();cli=home/'minecraft-ai/scripts/alice-mint.py'
result={'audit':'ALICE_17879_WITNESS_READER_RESTART','schemaVersion':1,
  'state':'preflight_blocked','reason':'unknown','clientRestartAttempted':False,
  'clientRestartAccepted':False,'heartbeatFresh':False,'connected':False,
  'sessionEstablished':False,'newClientOwnerVerified':False,
  'bdsRestarted':False,'otherServersTouched':False,'newWorldCreated':False}
def call(mode,sec):
 p=subprocess.run(['/usr/bin/python3',str(cli),mode],
     capture_output=True,text=True,timeout=sec,check=False)
 if p.returncode!=0 or len(p.stdout)>20000:return None
 try:return json.loads(p.stdout)
 except (TypeError,ValueError):return None
try:
 before=call('check',100)
 if not isinstance(before,dict) or before.get('preflight')!='passed' or before.get('action')!='use_restart' or type(before.get('activePid')) is not int or before['activePid']<=0:
  result['reason']='operator_check_failed_or_owner_unverified'
 else:
  root=home/'.alice-bedrock-control'
  intent=root/'alice-bed-observed-route-phase3-20261101.intent'
  fd=os.open(intent,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
  with os.fdopen(fd,'w') as f:
   f.write('once-only Alice client restart; never BDS restart\n');f.flush();os.fsync(f.fileno())
  result['clientRestartAttempted']=True
  out=call('restart',145)
  if not isinstance(out,dict) or out.get('oldPid')!=before['activePid'] or type(out.get('newPid')) is not int or out['newPid']<=0 or out.get('status')!='process_started_game_login_not_yet_verified':
   result['state']='restart_outcome_unverified'
   result['reason']='operator_did_not_confirm_replacement'
  else:
   result['clientRestartAccepted']=True
   result['state']='client_process_replaced_login_pending'
   result['reason']='none'
   deadline=time.monotonic()+55
   while time.monotonic()<deadline:
    time.sleep(2)
    live=call('status',15)
    if not isinstance(live,dict):continue
    if live.get('pid')!=out['newPid'] or live.get('statusSource')!='current_process':continue
    result['newClientOwnerVerified']=True
    result['heartbeatFresh']=live.get('heartbeatFresh') is True
    result['connected']=live.get('reportedConnected') is True
    result['sessionEstablished']=live.get('sessionEstablished') is True
    if result['heartbeatFresh'] and result['connected'] and result['sessionEstablished']:
     result['state']='client_reconnected_17879'
     break
except FileExistsError:
 result['reason']='once_only_intent_already_present'
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
 result['reason']='operator_or_transport_unavailable'
print(json.dumps(result,separators=(',',':')))
"""
ALLOWED_STATES={'preflight_blocked','restart_outcome_unverified','client_process_replaced_login_pending','client_reconnected_17879'}
REASONS={'unknown','operator_check_failed_or_owner_unverified','operator_did_not_confirm_replacement','none','once_only_intent_already_present','operator_or_transport_unavailable'}
def check(x):
    fields={'audit','schemaVersion','state','reason','clientRestartAttempted',
            'clientRestartAccepted','heartbeatFresh','connected','sessionEstablished',
            'newClientOwnerVerified','bdsRestarted','otherServersTouched','newWorldCreated'}
    if not isinstance(x,dict) or set(x)!=fields or x['audit']!='ALICE_17879_WITNESS_READER_RESTART' or x['schemaVersion']!=1:return None
    if x['state'] not in ALLOWED_STATES or x['reason'] not in REASONS:return None
    if any(type(x[k]) is not bool for k in fields-{'audit','schemaVersion','state','reason'}):return None
    if any(x[k] for k in ('bdsRestarted','otherServersTouched','newWorldCreated')):return None
    return x
def run(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    obs=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
           '-o','StrictHostKeyChecking=yes','tedz@192.168.0.104',
           '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,
           text=True,timeout=245,check=False)
        if p.returncode==0 and len(p.stdout)<1800:obs=check(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    report={'audit':'ALICE_EXISTING_WORLD_CLIENT_RESTART_RESULT','schemaVersion':1,
            'operatorOnly':True,'bdsOperationsInvoked':False,'observation':obs}
    fd=os.open(out/'alice_17879_client_restart.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':obs['state'] if obs else 'unverified'}))
def selftest():
    x={'audit':'ALICE_17879_WITNESS_READER_RESTART','schemaVersion':1,
        'state':'client_reconnected_17879','reason':'none','clientRestartAttempted':True,
        'clientRestartAccepted':True,'heartbeatFresh':True,'connected':True,
        'sessionEstablished':True,'newClientOwnerVerified':True,
        'bdsRestarted':False,'otherServersTouched':False,'newWorldCreated':False}
    assert check(x)==x
    assert check({**x,'bdsRestarted':True}) is None
    assert 'once-only Alice client restart' in REMOTE
    assert 'alice-bed-observed-route-phase3-20261101.intent' in REMOTE
    assert "'check'" in REMOTE and "'restart'" in REMOTE
    print('ALICE_17879_CLIENT_RESTART_CONTRACT_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--restart':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --restart OUTPUT_DIR')
