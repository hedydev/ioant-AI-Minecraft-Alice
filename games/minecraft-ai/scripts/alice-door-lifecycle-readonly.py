#!/usr/bin/env python3
"""Owner-bound, bounded read-only door priority and BDS-step diagnosis."""
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

REMOTE = r"""
import json,os,re,subprocess,time
from pathlib import Path
root=Path.home()/'.alice-bedrock-control'
result={'state':'unverified','currentOwner':False,'connected':False,'sessionEstablished':False,
 'autonomyEnabled':False,'coreState':'unknown','health':None,'jobActive':False,
 'independentSamples':None,'escapeSurveyStatus':'unknown','doorApproachSteps':None,
 'escapeSurveyAgeBand':'unknown','doorPriorityCount':0,'doorApproachOutcomeCount':0,
 'doorApproachBdsVerifiedCount':0,'doorApproachBdsRejectedCount':0,
 'doorOpenOutcomeCount':0,'doorApproachGatedCount':0,'lastDoorReason':'unknown',
 'lastDoorPrioritySteps':None,'bdsQuerySent':False,'movementSentByAudit':False}
valid_text=lambda v: v if isinstance(v,str) and re.fullmatch('[a-z][a-z0-9_:]{0,89}',v) else 'unknown'
try:
 script=Path.home()/'minecraft-ai/scripts/alice-mint.py'
 p=subprocess.run(['/usr/bin/python3',str(script),'status'],capture_output=True,
                  text=True,timeout=12,check=False)
 if p.returncode!=0 or len(p.stdout)>20000:raise ValueError('status_not_trusted')
 m=json.loads(p.stdout);pid=m.get('pid')
 if m.get('statusSource')!='current_process' or type(pid) is not int or pid<=0 or m.get('heartbeatFresh') is not True:
  raise ValueError('wrong_owner')
 state=root/'status.json'
 if state.is_symlink() or not state.is_file() or state.stat().st_uid!=os.getuid() or state.stat().st_mode&0o077 or state.stat().st_size>8192:
  raise ValueError('unsafe_status')
 d=json.loads(state.read_text())
 if d.get('producerPid')!=pid or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879:
  raise ValueError('wrong_world')
 result['currentOwner']=True
 result['connected']=d.get('connected') is True
 result['sessionEstablished']=d.get('sessionEstablished') is True
 result['autonomyEnabled']=(d.get('settings') or {}).get('autonomyEnabled') is True
 result['coreState']=valid_text(str(d.get('state') or '').lower())
 result['jobActive']=d.get('job') is not None
 h=d.get('health')
 if type(h) in (int,float) and 0<=h<=20:result['health']=h
 n=(d.get('movementEvidence') or {}).get('independentSamples')
 if type(n) is int and 0<=n<=10000000:result['independentSamples']=n
 survey=(d.get('worldRoutine') or {}).get('escapeSurvey') or {}
 if isinstance(survey,dict):
  result['escapeSurveyStatus']=valid_text(survey.get('status'))
  door=survey.get('door') or {}
  if isinstance(door,dict):
   approach=door.get('approach') or {}
   step=approach.get('steps') if isinstance(approach,dict) else None
   if type(step) is int and 0<=step<=12:result['doorApproachSteps']=step
  at=survey.get('observedAt')
  if type(at) is int:
   age=(int(time.time()*1000)-at)/1000
   result['escapeSurveyAgeBand']='fresh25s' if 0<=age<=25 else 'within90s' if 0<=age<=90 else 'expired' if age>90 else 'invalid'
 log=(Path('/proc')/str(pid)/'fd/1').resolve(strict=True)
 if log.parent!=root or not log.name.startswith('operator-') or log.is_symlink() or log.stat().st_uid!=os.getuid():
  raise ValueError('untrusted_log')
 with open(log,'rb') as fp:
  fp.seek(0,2);size=fp.tell();fp.seek(max(0,size-250000))
  lines=fp.read(250000).decode('utf-8','replace').splitlines()
 types={
  '[Alice exploration] enclosed-door priority:':'doorPriorityCount',
  '[Alice exploration] doorway approach outcome:':'doorApproachOutcomeCount',
  '[Alice exploration] door first-cell BDS endpoint:':'doorApproachBdsOutcome',
  '[Alice exploration] door interaction outcome:':'doorOpenOutcomeCount',
  '[Alice exploration] doorway approach gated:':'doorApproachGatedCount'}
 for line in lines:
  for marker,key in types.items():
   if not line.startswith(marker):continue
   try:data=json.loads(line.split(marker,1)[1])
   except (TypeError,ValueError):continue
   if not isinstance(data,dict):continue
   if key=='doorApproachBdsOutcome':
    if data.get('serverMovementVerified') is True:
     result['doorApproachBdsVerifiedCount']+=1
    else:result['doorApproachBdsRejectedCount']+=1
   else:
    result[key]+=1
   reason=data.get('reason')
   if reason is not None:result['lastDoorReason']=valid_text(reason)
   if key=='doorPriorityCount':
    steps=data.get('steps')
    if type(steps) is int and 0<=steps<=12:result['lastDoorPrioritySteps']=steps
 result['state']='observed'
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
 pass
print(json.dumps(result,separators=(',',':')))
"""

KEYS={'state','currentOwner','connected','sessionEstablished','autonomyEnabled',
      'coreState','health','jobActive','independentSamples','escapeSurveyStatus',
      'doorApproachSteps','escapeSurveyAgeBand','doorPriorityCount',
      'doorApproachOutcomeCount','doorApproachBdsVerifiedCount',
      'doorApproachBdsRejectedCount','doorOpenOutcomeCount','doorApproachGatedCount',
      'lastDoorReason','lastDoorPrioritySteps','bdsQuerySent','movementSentByAudit'}

def valid(row):
    if not isinstance(row,dict) or set(row)!=KEYS or row['state'] not in ('observed','unverified'):
        return None
    if not all(type(row[k]) is bool for k in
        ('currentOwner','connected','sessionEstablished','autonomyEnabled',
         'jobActive','bdsQuerySent','movementSentByAudit')):
        return None
    if row['bdsQuerySent'] or row['movementSentByAudit']:
        return None
    for k in ('doorPriorityCount','doorApproachOutcomeCount','doorApproachBdsVerifiedCount',
              'doorApproachBdsRejectedCount','doorOpenOutcomeCount','doorApproachGatedCount'):
        if type(row[k]) is not int or not 0<=row[k]<=10000000:return None
    for k in ('independentSamples','doorApproachSteps','lastDoorPrioritySteps'):
        if row[k] is not None and (type(row[k]) is not int or not 0<=row[k]<=10000000):
            return None
    if row['health'] is not None and (type(row['health']) not in (int,float) or not 0<=row['health']<=20):
        return None
    for k in ('coreState','escapeSurveyStatus','escapeSurveyAgeBand','lastDoorReason'):
        if not isinstance(row[k],str) or not re.fullmatch(r'[a-z][a-z0-9_:]{0,89}',row[k]):
            return None
    return row

def read(out):
    target=Path(out)
    if target.is_symlink() or not target.is_dir():
        raise ValueError('unsafe_output')
    row=None
    try:
        proc=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
            'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=45,check=False)
        if proc.returncode==0 and len(proc.stdout)<2600:
            row=valid(json.loads(proc.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    report={'audit':'ALICE_17879_DOOR_AUTONOMY_READONLY','schemaVersion':1,
        'readOnly':True,'bdsCommandSent':False,'movementAttempted':False,'observation':row}
    fd=os.open(target/'alice_door_autonomy.json',
        os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:
        json.dump(report,f,separators=(',',':'))
        f.write('\n')
    print(json.dumps({'state':row['state'] if row else 'unverified'}))

def selftest():
    compile(REMOTE,'<mint-door-readonly>','exec')
    assert "d.get('serverPort')!=17879" in REMOTE
    assert "m.get('statusSource')!='current_process'" in REMOTE
    assert 'bot.setControlState' not in REMOTE
    assert 'querytarget' not in REMOTE
    assert 'alice-mac.sh restart' not in REMOTE
    print('ALICE_DOOR_AUTONOMY_READONLY_SELFTEST_PASS')

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--read':read(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR')
