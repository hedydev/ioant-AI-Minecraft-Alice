#!/usr/bin/env python3
"""Single original-17879 coordinate-aware operator probe; never issues BDS commands.

The only game command is the existing '安全试走' typed one-shot mailbox action,
which requires two fresh independent BDS samples before ANY path input. This
file cannot create, refresh or impersonate that independent evidence.
"""
import json,os,re,shlex,subprocess,sys
from pathlib import Path

REMOTE=r"""
import json,math,os,re,subprocess,time
from pathlib import Path
home=Path.home();root=home/'.alice-bedrock-control'
import sys
sys.path.insert(0,str(home/'minecraft-ai/dashboard'))
import remote_control as rc
result={'audit':'ALICE_ONE_TARGET_ORIGINAL17879','state':'blocked','reason':'preflight',
  'commandQueued':False,'receiptStatus':None,'receiptReason':None,'targetCell':None,
  'clientBefore':None,'clientAfter':None,'bdsBefore':None,'bdsAfter':None,
  'freshBdsBefore':False,'freshBdsAfter':False,'independentSamplesBefore':None,
  'independentSamplesAfter':None,'movingQueuedBefore':None,'movingQueuedAfter':None,
  'independentBdsMovementVerified':False,'clientMoved':False,
  'bdsCommandsSent':False,'bdsRestarted':False,'worldEditedByProbe':False}
def finite(v):
 return isinstance(v,dict) and all(type(v.get(k)) in (float,int) and math.isfinite(v[k]) and abs(v[k])<30000000 for k in ('x','y','z'))
def point(v):
 return {k:round(v[k],3) for k in ('x','y','z')} if finite(v) else None
def own():
 p=subprocess.run(['/usr/bin/python3',str(home/'minecraft-ai/scripts/alice-mint.py'),'status'],
  capture_output=True,text=True,check=False,timeout=10)
 if p.returncode or len(p.stdout)>20000:raise ValueError('no_operator_status')
 op=json.loads(p.stdout)
 if op.get('statusSource')!='current_process' or op.get('processAlive') is not True or op.get('heartbeatFresh') is not True or op.get('reportedConnected') is not True or op.get('sessionEstablished') is not True:raise ValueError('not_connected')
 path=root/'status.json'
 st=path.lstat()
 if not path.is_file() or path.is_symlink() or st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>8192:raise ValueError('unsafe_status')
 d=json.loads(path.read_text())
 if d.get('producerPid')!=op['pid'] or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879 or d.get('connected') is not True or d.get('sessionEstablished') is not True:raise ValueError('not_original')
 return d,op['pid']
def frame(d):
 m=d.get('movementEvidence') or {}
 at=m.get('independentAt');prev=m.get('independentPreviousAt')
 now=int(time.time()*1000)
 fresh=(type(at) is int and type(prev) is int and 0<prev<at<=now and now-prev<=4000 and m.get('independentSamples',0)>=2)
 bds=point(m.get('independentLatestFeet')) if fresh else None
 count=m.get('independentSamples')
 count=count if type(count) is int and 0<=count<100000000 else None
 q=None
 audit=root/'outbound-input-audit.json'
 if audit.is_file() and not audit.is_symlink() and audit.stat().st_uid==os.getuid() and audit.stat().st_mode&0o077==0 and audit.stat().st_size<8192:
  v=json.loads(audit.read_text()).get('movingQueued')
  if type(v) is int and 0<=v<1000000000:q=v
 return point(d.get('position')),bds,fresh,count,q
try:
 if root.is_symlink():raise ValueError('unsafe_root')
 d,pid=own()
 if d.get('followTarget') is not None or d.get('job') is not None or d.get('state')!='IDLE':raise ValueError('alice_busy_or_following')
 if type(d.get('health')) not in (int,float) or d['health']<16 or type(d.get('food')) not in (int,float) or d['food']<8:raise ValueError('vitals_not_safe')
 before=frame(d)
 result['clientBefore'],result['bdsBefore'],result['freshBdsBefore'],result['independentSamplesBefore'],result['movingQueuedBefore']=before
 if not result['clientBefore']:raise ValueError('client_position_unavailable')
 # One-time operator intent, never delete or replay, never turn off the safety gate.
 intent=root/'alice-target-coordinate-17879-20261101.intent'
 fd=os.open(intent,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:f.write('one existing-world safe probe; no independent BDS producer\n')
 queued=rc.queue_command({'text':'安全试走'},root)
 if queued.get('status')!='queued':
  result['reason']='mailbox_'+str(queued.get('reason','denied'))[:45]
 else:
  result['commandQueued']=True
  key=queued['id']
  first=None
  deadline=time.monotonic()+4
  while time.monotonic()<deadline:
   time.sleep(.2)
   r=rc.command_result(root)
   if r and r.get('id')==key and r.get('status') in ('started','failed','rejected','completed'):
    first=r;break
  if first:
   result['receiptStatus']=first['status'];result['receiptReason']=first.get('reason')
   match=re.search(r'目标坐标\s*(-?\d+),(-?\d+),(-?\d+)',first.get('message',''))
   if match:
    vals=[int(x) for x in match.groups()]
    if all(abs(x)<30000000 for x in vals):result['targetCell']=vals
   if first.get('reason')=='probe_armed':
    # Wait a SINGLE 12-second window for trusted evidence produced by
    # an already authorized server source; never query one here.
    deadline=time.monotonic()+13
    while time.monotonic()<deadline:
     time.sleep(.35)
     r=rc.command_result(root)
     if r and r.get('id')==key and r.get('reason')!='probe_armed' and r.get('status') in ('started','failed','rejected','completed'):
      first=r;break
   result['receiptStatus']=first['status'];result['receiptReason']=first.get('reason')
   result['state']='observed_receipt'
   result['reason']='none'
  else:result['reason']='receipt_unavailable'
 d2,pid2=own()
 if pid2!=pid:raise ValueError('alice_session_changed')
 after=frame(d2)
 result['clientAfter'],result['bdsAfter'],result['freshBdsAfter'],result['independentSamplesAfter'],result['movingQueuedAfter']=after
 if result['clientBefore'] and result['clientAfter']:
  result['clientMoved']=math.dist(list(result['clientBefore'].values()),list(result['clientAfter'].values()))>.25
 if result['bdsBefore'] and result['bdsAfter'] and result['freshBdsBefore'] and result['freshBdsAfter'] and result['independentSamplesAfter'] is not None and result['independentSamplesBefore'] is not None and result['independentSamplesAfter']>=result['independentSamplesBefore']+2:
  dist=math.dist(list(result['bdsBefore'].values()),list(result['bdsAfter'].values()))
  aligned=math.dist(list(result['clientAfter'].values()),list(result['bdsAfter'].values()))<=.75
  result['independentBdsMovementVerified']=.25<=dist<=1.8 and aligned
except FileExistsError:
 result['reason']='once_only_intent_already_consumed'
except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as exc:
 code=str(exc)
 result['reason']=code if re.fullmatch(r'[a-z][a-z0-9_]{1,70}',code) else 'preflight_or_transport_unavailable'
print(json.dumps(result,separators=(',',':')))
"""
FIELDS={'audit','state','reason','commandQueued','receiptStatus','receiptReason','targetCell',
'clientBefore','clientAfter','bdsBefore','bdsAfter','freshBdsBefore','freshBdsAfter',
'independentSamplesBefore','independentSamplesAfter','movingQueuedBefore','movingQueuedAfter',
'independentBdsMovementVerified','clientMoved','bdsCommandsSent','bdsRestarted','worldEditedByProbe'}
def valid(r):
 if not isinstance(r,dict) or set(r)!=FIELDS or r.get('audit')!='ALICE_ONE_TARGET_ORIGINAL17879':return False
 if r.get('state') not in ('blocked','observed_receipt') or not isinstance(r.get('reason'),str):return False
 for key in ('commandQueued','freshBdsBefore','freshBdsAfter','independentBdsMovementVerified','clientMoved','bdsCommandsSent','bdsRestarted','worldEditedByProbe'):
  if type(r[key]) is not bool:return False
 if any(r[k] for k in ('bdsCommandsSent','bdsRestarted','worldEditedByProbe')):return False
 for key in ('clientBefore','clientAfter','bdsBefore','bdsAfter'):
  p=r[key]
  if p is not None and (not isinstance(p,dict) or set(p)!={'x','y','z'} or any(type(p[k]) not in (int,float) or abs(p[k])>=30000000 for k in p)):return False
 for key in ('independentSamplesBefore','independentSamplesAfter','movingQueuedBefore','movingQueuedAfter'):
  v=r[key]
  if v is not None and (type(v) is not int or v<0 or v>=1000000000):return False
 target=r['targetCell']
 if target is not None and (not isinstance(target,list) or len(target)!=3 or any(type(v) is not int or abs(v)>=30000000 for v in target)):return False
 return True

def main(out):
 out=Path(out)
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 obs=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
   '-o','StrictHostKeyChecking=yes','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
   capture_output=True,text=True,timeout=52,check=False)
  if p.returncode==0 and len(p.stdout)<3400:
   d=json.loads(p.stdout)
   if valid(d):obs=d
 except (OSError,ValueError,subprocess.SubprocessError):pass
 result={'audit':'ALICE_ONE_TARGET_COMMAND_RESULT','schemaVersion':1,
  'originalBdsPort':17879,'bdsCommandsSent':False,'originalWorldModifiedByTool':False,
  'observation':obs}
 fd=os.open(out/'alice_one_target_live.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
 print(json.dumps({'state':obs['state'] if obs else 'unverified'}))

def selftest():
 compile(REMOTE,'<remote-one-target>','exec')
 assert "queue_command({'text':'安全试走'}" in REMOTE
 assert 'bds_position_witness' not in REMOTE and "'--once'" not in REMOTE
 assert 'independentBdsMovementVerified' in REMOTE
 assert valid({'audit':'ALICE_ONE_TARGET_ORIGINAL17879','state':'blocked','reason':'preflight',
 'commandQueued':False,'receiptStatus':None,'receiptReason':None,'targetCell':None,
 'clientBefore':None,'clientAfter':None,'bdsBefore':None,'bdsAfter':None,
 'freshBdsBefore':False,'freshBdsAfter':False,'independentSamplesBefore':None,
 'independentSamplesAfter':None,'movingQueuedBefore':None,'movingQueuedAfter':None,
 'independentBdsMovementVerified':False,'clientMoved':False,'bdsCommandsSent':False,
 'bdsRestarted':False,'worldEditedByProbe':False})
 print('ALICE_ONE_TARGET_NO_BDS_COMMANDS_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--once':main(sys.argv[2])
 else:raise SystemExit('usage --self-test | --once OUTPUT_DIR')
