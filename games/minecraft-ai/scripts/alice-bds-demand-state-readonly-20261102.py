#!/usr/bin/env python3
"""Bounded read-only audit of Alice's existing 17879 demand timer and budget."""
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

REMOTE = r'''
import importlib.util,json,os,subprocess,time
from pathlib import Path
root=Path.home()/'.alice-bedrock-control'
module=Path.home()/'minecraft-ai/scripts/alice-bds-demand-timer.py'
report=dict(audit='ALICE_BDS_DEMAND_STATE',schemaVersion=1,state='unverified',
            readOnly=True,bdsCommandSent=False,clientRestarted=False,
            ownerValid=False,demandNow=False,optedIn=False,
            timerActive=False,timerEnabled=False,
            lastServiceResult='unknown',budgetUsed=None,hourlyLimit=40,
            lastBatchAgeSeconds=None,stalledPairs=None,
            pauseRemainingSeconds=None,serverTravel=None,
            recentIndependentSamples=None,heartbeatFresh=False)
try:
 spec=importlib.util.spec_from_file_location('alice_demand_audit_module',module)
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 m.private_root()
 status,doc=m.active_owner()
 report['ownerValid']=True
 report['heartbeatFresh']=bool(status.get('heartbeatFresh') is True)
 report['demandNow']=bool(m.demand_now(doc))
 report['optedIn']=m.private_read(m.OPTIN,128)=={
   'version':1,'enabled':True,'maxHourly':40,'minBatchSeconds':55}
 now=time.time()
 b=m.private_read(m.BUDGET,512) if m.BUDGET.is_file() else None
 if isinstance(b,dict):
  used=b.get('used');report['budgetUsed']=used if type(used) is int and 0<=used<=40 else None
  last=b.get('lastBatch')
  if type(last) in (int,float) and 0<=now-last<100000:
   report['lastBatchAgeSeconds']=round(now-last,1)
  count=b.get('stalledPairs')
  if type(count) is int and 0<=count<=3:report['stalledPairs']=count
  pause=b.get('pauseUntil')
  if type(pause) in (int,float) and 0<=pause-now<100000:
   report['pauseRemainingSeconds']=round(pause-now,1)
  elif type(pause) in (int,float) and pause<=now:
   report['pauseRemainingSeconds']=0
 travel=m.server_travel(doc)
 if travel is not None:report['serverTravel']=travel
 samples=(doc.get('movementEvidence') or {}).get('independentSamples')
 if type(samples) is int and 0<=samples<=100000000:
  report['recentIndependentSamples']=samples
 for flag,verb in (('timerActive','is-active'),('timerEnabled','is-enabled')):
  p=subprocess.run(['/usr/bin/systemctl','--user',verb,'alice-bds-demand.timer'],
                   capture_output=True,text=True,timeout=7,check=False)
  report[flag]=p.returncode==0 and p.stdout.strip() in ('active','enabled')
 p=subprocess.run(['/usr/bin/journalctl','--user','-u','alice-bds-demand.service',
                   '-n','20','--no-pager','-o','cat'],
                  capture_output=True,text=True,timeout=9,check=False)
 allowed={'position_pair_verified','stalled_navigation_cooldown','cooldown_or_budget',
          'no_navigation_demand','not_opted_in','ack_timeout','pair_not_aligned',
          'safe_failure','navigation_context_changed','command_unverified',
          'sample_counter_missing','session_changed','already_running','budget_exhausted'}
 if p.returncode==0:
  for line in reversed(p.stdout.splitlines()):
   marker='ALICE_BDS_DEMAND_TIMER '
   if marker in line:
    word=line.split(marker,1)[1].strip().split(' ',1)[0]
    report['lastServiceResult']=word if word in allowed else 'other'
    break
 report['state']='observed'
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError,
        AttributeError,ImportError,json.JSONDecodeError):
 report['state']='unverified'
print(json.dumps(report,separators=(',',':')))
'''
FIELDS={'audit','schemaVersion','state','readOnly','bdsCommandSent','clientRestarted',
 'ownerValid','demandNow','optedIn','timerActive','timerEnabled',
 'lastServiceResult','budgetUsed','hourlyLimit','lastBatchAgeSeconds',
 'stalledPairs','pauseRemainingSeconds','serverTravel','recentIndependentSamples',
 'heartbeatFresh'}
def validate(v):
 if not isinstance(v,dict) or set(v)!=FIELDS or v['audit']!='ALICE_BDS_DEMAND_STATE' or v['schemaVersion']!=1:return None
 if v['state'] not in ('observed','unverified') or not v['readOnly'] or v['bdsCommandSent'] or v['clientRestarted']:return None
 for k in ('ownerValid','demandNow','optedIn','timerActive','timerEnabled','heartbeatFresh'):
  if type(v[k]) is not bool:return None
 for k in ('budgetUsed','stalledPairs','recentIndependentSamples'):
  if v[k] is not None and (type(v[k]) is not int or v[k]<0 or v[k]>100000000):return None
 for k in ('lastBatchAgeSeconds','pauseRemainingSeconds','serverTravel'):
  if v[k] is not None and (type(v[k]) not in (int,float) or not 0<=v[k]<=30000000):return None
 if v['hourlyLimit']!=40 or type(v['lastServiceResult']) is not str or len(v['lastServiceResult'])>60:return None
 return v
def run(out):
 if not out.is_dir() or out.is_symlink():raise ValueError('unsafe_output')
 observation=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
      '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
      'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
      capture_output=True,text=True,timeout=55,check=False)
  if p.returncode==0 and len(p.stdout)<2200:
   observation=validate(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError,json.JSONDecodeError):pass
 document={'audit':'ALICE_BDS_DEMAND_STATE_READONLY_REPORT','schemaVersion':1,
  'readOnly':True,'observation':observation}
 fd=os.open(out/'alice_bds_demand_state.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(document,f,separators=(',',':'))
 print(json.dumps({'state':observation['state'] if observation else 'unverified'}))
def selftest():
 compile(REMOTE,'<alice-demand-remote>','exec')
 assert 'bds_position_witness.py' not in REMOTE
 assert '--once' not in REMOTE and '--run' not in REMOTE and '--install' not in REMOTE
 assert validate(dict(audit='ALICE_BDS_DEMAND_STATE',schemaVersion=1,state='unverified',
     readOnly=True,bdsCommandSent=False,clientRestarted=False,ownerValid=False,
     demandNow=False,optedIn=False,timerActive=False,timerEnabled=False,
     lastServiceResult='unknown',budgetUsed=None,hourlyLimit=40,
     lastBatchAgeSeconds=None,stalledPairs=None,pauseRemainingSeconds=None,
     serverTravel=None,recentIndependentSamples=None,heartbeatFresh=False))
 print('ALICE_BDS_DEMAND_STATE_READONLY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--read':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --read OUTPUT_DIRECTORY')
