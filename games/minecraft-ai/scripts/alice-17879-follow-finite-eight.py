#!/usr/bin/env python3
"""Time-bounded 8-or-fewer single BDS querytarget samples from EXISTING 17879.

No automatic service/loop. Never touch another instance, process, or world.
Strictly record counters only: no credentials, names, coordinates, command logs.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,os,re,subprocess,time,math,sys
from pathlib import Path
home=Path.home();scripts=home/'minecraft-ai/scripts';root=home/'.alice-bedrock-control'
sys.path.insert(0,str(scripts));import bds_position_witness as w
o={'audit':'ALICE_17879_FINITE_ACCEPTANCE','schemaVersion':1,
   'state':'blocked','reason':'unverified','limit':8,'attempted':0,'accepted':0,
   'initialIndependentSamples':None,'finalIndependentSamples':None,
   'initialTravelBlocks':None,'finalTravelBlocks':None,
   'initialMovingInputs':None,'finalMovingInputs':None,
   'maxFreshPairObserved':False,'maxAlignedObserved':False,
   'serverMovementAtLeast025':False,'aliceSessionStillConnected':False,
   'lastState':'unknown','serviceOrWorldModified':False,'witnessLoopEnabled':False}
def call(mode,seconds=10):
 p=subprocess.run(['/usr/bin/python3',str(scripts/'alice-mint.py'),mode],
      capture_output=True,text=True,timeout=seconds,check=False)
 if p.returncode or len(p.stdout)>22000:raise ValueError('runtime_unavailable')
 return json.loads(p.stdout)
def snap():
 s=call('status',15)
 if s.get('processAlive') is not True or s.get('reportedConnected') is not True or s.get('sessionEstablished') is not True:
  raise ValueError('session_disconnected')
 value={'samples':s.get('bdsSamples'),'state':s.get('state')}
 # Current-process private publisher only, no entity identity output.
 p=root/'status.json'
 if p.is_file() and not p.is_symlink() and p.stat().st_uid==os.getuid() and p.stat().st_mode&0o077==0 and p.stat().st_size<=8192:
  d=json.loads(p.read_text())
  if d.get('producerPid')==s.get('pid'):
   m=d.get('movementEvidence') or {}
   value['travel']=m.get('independentTravelBlocks')
   value['followingOwner']=d.get('followTarget')=='MolarParsley191'
   a,b=m.get('independentAt'),m.get('independentPreviousAt')
   now=int(time.time()*1000)
   value['freshPair']=(type(a) is int and type(b) is int and 0<b<a<=now and now-b<=4000)
   c=d.get('position');i=m.get('independentLatestFeet')
   if isinstance(c,dict) and isinstance(i,dict) and all(type(c.get(k)) in (int,float) and type(i.get(k)) in (int,float) for k in ('x','y','z')):
    value['aligned']=math.dist([c[k] for k in ('x','y','z')],[i[k] for k in ('x','y','z')])<=.75
 p=root/'outbound-input-audit.json'
 if p.is_file() and not p.is_symlink() and p.stat().st_uid==os.getuid() and p.stat().st_mode&0o077==0 and p.stat().st_size<=8192 and 0<=time.time()-p.stat().st_mtime<12:
  a=json.loads(p.read_text())
  v=a.get('movingQueued')
  if type(v) is int and 0<=v<1000000000:value['moving']=v
 return value
def bounded(v):
 return v if type(v) in (int,float) and math.isfinite(v) and 0<=v<100000000 else None
try:
 cfg,_=w.validated_config()
 p=Path('/opt/mcsmanager/daemon/data/InstanceConfig')/(cfg['instanceId']+'.json')
 if p.is_symlink() or not p.is_file() or p.stat().st_size>65536:raise ValueError('instance_unknown')
 d=json.loads(p.read_text(encoding='utf-8'))
 def cwd(a):
  if not isinstance(a,dict):return None
  for k in ('cwd','workingDirectory','workingDir'):
   if isinstance(a.get(k),str):return a[k]
  return cwd(a.get('config'))
 x=cwd(d)
 if not x or Path(x).resolve(strict=True)!=home/'minecraft-bedrock':raise ValueError('wrong_instance')
 service=subprocess.run(['/usr/bin/systemctl','--user','is-active',
     'alice-bds-position-witness.service'],capture_output=True,text=True,timeout=5)
 if service.returncode==0 and service.stdout.strip()=='active':raise ValueError('legacy_loop_running')
 start=snap()
 if start.get('followingOwner') is not True:raise ValueError('escort_not_active')
 o['initialIndependentSamples']=bounded(start.get('samples'))
 o['initialTravelBlocks']=bounded(start.get('travel'))
 o['initialMovingInputs']=bounded(start.get('moving'))
 marker=root/'alice-17879-follow-bds-eight-20261031.intent'
 fd=os.open(marker,os.O_EXCL|os.O_CREAT|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:f.write('finite <=8 command acceptance; do not repeat\n');f.flush();os.fsync(f.fileno())
 o['state']='attempted'
 for n in range(8):
  # Never send another console command once real client session disappears.
  before=snap()
  if before.get('followingOwner') is not True:
   o['reason']='escort_not_active';break
  o['attempted']+=1
  p=subprocess.run(['/usr/bin/python3',str(scripts/'bds_position_witness.py'),'--once'],
            capture_output=True,text=True,timeout=32,check=False)
  if p.returncode!=0 or p.stdout.strip()!='BDS querytarget witness: accepted new independent sample':
   m=re.search(r'unavailable \(([A-Za-z0-9_]{3,85})\)',p.stderr)
   o['reason']=m.group(1) if m else 'single_query_unverified'
   break
  o['accepted']+=1
  time.sleep(1.5)
  s=snap()
  o['maxFreshPairObserved']=o['maxFreshPairObserved'] or s.get('freshPair') is True
  o['maxAlignedObserved']=o['maxAlignedObserved'] or s.get('aligned') is True
  old=o['initialTravelBlocks']
  if old is not None and bounded(s.get('travel')) is not None and s['travel']-old>=.25:
   o['serverMovementAtLeast025']=True
   break
 s=snap()
 o['aliceSessionStillConnected']=True
 o['finalIndependentSamples']=bounded(s.get('samples'))
 o['finalTravelBlocks']=bounded(s.get('travel'))
 o['finalMovingInputs']=bounded(s.get('moving'))
 state=s.get('state')
 o['lastState']=state if state in ('SURVIVE','IDLE','EXPLORE','FOLLOW','GATHER','COMBAT','RECOVER','SLEEP','LEARN_WEAPON','SECURE_SHELTER') else 'other'
 o['state']='movement_seen' if o['serverMovementAtLeast025'] else ('completed' if o['accepted']==8 else 'partial')
 if o['reason']=='unverified':o['reason']='none'
except FileExistsError:o['reason']='once_only_claimed'
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):o['reason']='safety_or_transport_error'
print(json.dumps(o,separators=(',',':')))
"""
FIELDS={'audit','schemaVersion','state','reason','limit','attempted','accepted',
'initialIndependentSamples','finalIndependentSamples','initialTravelBlocks',
'finalTravelBlocks','initialMovingInputs','finalMovingInputs','maxFreshPairObserved',
'maxAlignedObserved','serverMovementAtLeast025','aliceSessionStillConnected',
'lastState','serviceOrWorldModified','witnessLoopEnabled'}
def validate(x):
    if not isinstance(x,dict) or set(x)!=FIELDS or x['audit']!='ALICE_17879_FINITE_ACCEPTANCE' or x['schemaVersion']!=1:return None
    if x['limit']!=8 or type(x['attempted']) is not int or type(x['accepted']) is not int or not 0<=x['accepted']<=x['attempted']<=8:return None
    if x['state'] not in ('blocked','attempted','movement_seen','completed','partial'):return None
    if not isinstance(x['reason'],str) or len(x['reason'])>90 or not x['reason'].replace('_','').isalnum():return None
    if x['lastState'] not in ('unknown','SURVIVE','IDLE','EXPLORE','FOLLOW','GATHER','COMBAT','RECOVER','SLEEP','LEARN_WEAPON','SECURE_SHELTER','other'):return None
    for key in ('maxFreshPairObserved','maxAlignedObserved','serverMovementAtLeast025','aliceSessionStillConnected','serviceOrWorldModified','witnessLoopEnabled'):
        if type(x[key]) is not bool:return None
    if x['serviceOrWorldModified'] or x['witnessLoopEnabled']:return None
    for key in ('initialIndependentSamples','finalIndependentSamples','initialTravelBlocks','finalTravelBlocks','initialMovingInputs','finalMovingInputs'):
        if x[key] is not None and (type(x[key]) not in (float,int) or not 0<=x[key]<100000000):return None
    return x
def main(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('invalid_output')
    obs=None
    try:
        r=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
          '-o','StrictHostKeyChecking=yes','tedz@192.168.0.104',
          '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=370,check=False)
        if r.returncode==0 and len(r.stdout)<2500:obs=validate(json.loads(r.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    result={'audit':'ALICE_REAL_17879_FINITE_TEST_REPORT','schemaVersion':1,
       'noBdsRestart':True,'noExperimentalWorld':True,'observation':obs}
    fd=os.open(out/'alice_17879_finite_test.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':obs['state'] if obs else 'unverified'}))
def selftest():
    x={'audit':'ALICE_17879_FINITE_ACCEPTANCE','schemaVersion':1,'state':'completed','reason':'none','limit':8,
      'attempted':8,'accepted':8,'initialIndependentSamples':2,'finalIndependentSamples':10,
      'initialTravelBlocks':0,'finalTravelBlocks':0,'initialMovingInputs':0,'finalMovingInputs':0,
      'maxFreshPairObserved':True,'maxAlignedObserved':True,'serverMovementAtLeast025':False,
      'aliceSessionStillConnected':True,'lastState':'SURVIVE','serviceOrWorldModified':False,'witnessLoopEnabled':False}
    assert validate(x)==x
    assert validate({**x,'attempted':10}) is None
    assert "'--loop'" not in REMOTE
    print('ALICE_FINITE_EIGHT_17879_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--run':main(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --run OUTPUT_DIR')
