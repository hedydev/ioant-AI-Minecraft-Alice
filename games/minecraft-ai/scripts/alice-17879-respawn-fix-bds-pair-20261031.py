#!/usr/bin/env python3
"""Two coordinated ON-DEMAND 17879 BDS querytarget requests only.

Require exact private MCSManager->production instance mapping. Query once,
WAIT for Alice's 2-second reader to ingest it, then query once more. No
loop, force movement, AI/server restart, or lab process changes.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,os,re,subprocess,sys,time,math
from pathlib import Path
home=Path.home();scripts=home/'minecraft-ai/scripts';root=home/'.alice-bedrock-control'
sys.path.insert(0,str(scripts))
import bds_position_witness as w
record={'audit':'ALICE_17879_COORDINATED_WITNESS','schemaVersion':1,
 'state':'blocked','reason':'none','queriesSent':0,'queriesAccepted':0,
 'observedAfterFirst':False,'observedAfterSecond':False,'beforeSamples':None,
 'afterSamples':None,'freshIndependentPair':False,'alignedWithin075':None,
 'independentPairTravel':None,'aliceConnectedAfter':False,'bdsRestarted':False,
 'aliceRestarted':False,'labStarted':False,'loopEnabled':False}
def status():
 p=subprocess.run(['/usr/bin/python3',str(scripts/'alice-mint.py'),'status'],
       capture_output=True,text=True,timeout=12,check=False)
 if p.returncode or len(p.stdout)>20000:raise ValueError('status_unavailable')
 s=json.loads(p.stdout)
 if s.get('processAlive') is not True or s.get('reportedConnected') is not True or s.get('sessionEstablished') is not True:
  raise ValueError('session_not_current')
 return s
def reason(proc):
 if proc.returncode==0 and proc.stdout.strip()=='BDS querytarget witness: accepted new independent sample':
  return None
 m=re.search(r'unavailable \(([A-Za-z0-9_]{3,85})\)',proc.stderr)
 return m.group(1) if m else 'query_response_unavailable'
def live_samples(s):
 v=s.get('bdsSamples')
 return v if type(v) is int and 0<=v<100000000 else None
def await_count(before,limit=5.2):
 deadline=time.monotonic()+limit
 while time.monotonic()<deadline:
  time.sleep(.3)
  s=status()
  n=live_samples(s)
  if n is not None and n>before:return s
 return None
try:
 cfg,_=w.validated_config()
 instance=Path('/opt/mcsmanager/daemon/data/InstanceConfig')/(cfg['instanceId']+'.json')
 if instance.is_symlink() or not instance.is_file() or instance.stat().st_size>65536:
  raise ValueError('instance_unverified')
 body=json.loads(instance.read_text())
 def cwd(o):
  if not isinstance(o,dict):return None
  for k in ('cwd','workingDirectory','workingDir'):
   if isinstance(o.get(k),str):return o[k]
  return cwd(o.get('config'))
 name=cwd(body)
 if not name or Path(name).resolve(strict=True)!=home/'minecraft-bedrock':
  raise ValueError('instance_not_production')
 s=status()
 before=live_samples(s)
 if before is None:raise ValueError('sample_counter_unavailable')
 record['beforeSamples']=before
 owner=root/'alice-respawn-fix-17879-bds-pair-20261031.intent'
 fd=os.open(owner,os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:
  f.write('bounded coordinated two queries only; no retry\n');f.flush();os.fsync(f.fileno())
 record['state']='attempted'
 for nth in (1,2):
  record['queriesSent']+=1
  p=subprocess.run(['/usr/bin/python3',str(scripts/'bds_position_witness.py'),'--once'],
        capture_output=True,text=True,timeout=32,check=False)
  failure=reason(p)
  if failure is not None:
   record['reason']=failure
   break
  record['queriesAccepted']+=1
  after=await_count(before if nth==1 else first)
  if nth==1:
   record['observedAfterFirst']=after is not None
   if after is None:
    record['reason']='first_not_ingested_within_window';break
   first=live_samples(after)
  else:
   record['observedAfterSecond']=after is not None
   if after is None:record['reason']='second_not_ingested_within_window'
 s=status()
 record['afterSamples']=live_samples(s)
 record['aliceConnectedAfter']=True
 # Read only bounded own-locked anonymous publisher data; export no player identity.
 obj=root/'status.json'
 if obj.is_file() and not obj.is_symlink() and obj.stat().st_uid==os.getuid() and obj.stat().st_mode&0o077==0 and obj.stat().st_size<=8192:
  d=json.loads(obj.read_text())
  if d.get('producerPid')==s.get('pid'):
   m=d.get('movementEvidence') or {}
   a,b=m.get('independentAt'),m.get('independentPreviousAt')
   now=int(time.time()*1000)
   record['freshIndependentPair']=(
      type(a) is int and type(b) is int and 0<b<a<=now and now-b<=4000)
   c=d.get('position');i=m.get('independentLatestFeet')
   if (isinstance(c,dict) and isinstance(i,dict) and
      all(type(c.get(k)) in (float,int) and type(i.get(k)) in (float,int) for k in ('x','y','z'))):
    delta=math.dist([c[k] for k in ('x','y','z')],[i[k] for k in ('x','y','z')])
    if math.isfinite(delta):record['alignedWithin075']=delta<=0.75
   step=m.get('independentPairTravelBlocks')
   if type(step) in (float,int) and math.isfinite(step) and 0<=step<32:
    record['independentPairTravel']=round(step,2)
 if record['observedAfterSecond'] and record['freshIndependentPair']:
  record['state']='two_fresh_observed'
 elif record['observedAfterFirst']:
  record['state']='one_or_two_not_fresh'
 else:record['state']='not_ingested'
except FileExistsError:
 record['reason']='one_shot_already_claimed'
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
 record['reason']='safety_preflight_or_transport_failed'
print(json.dumps(record,separators=(',',':')))
"""
FIELDS={'audit','schemaVersion','state','reason','queriesSent','queriesAccepted',
'observedAfterFirst','observedAfterSecond','beforeSamples','afterSamples',
'freshIndependentPair','alignedWithin075','independentPairTravel','aliceConnectedAfter',
'bdsRestarted','aliceRestarted','labStarted','loopEnabled'}
def validate(x):
    if not isinstance(x,dict) or set(x)!=FIELDS or x['audit']!='ALICE_17879_COORDINATED_WITNESS' or x['schemaVersion']!=1:return None
    if x['state'] not in ('blocked','attempted','two_fresh_observed','one_or_two_not_fresh','not_ingested'):return None
    if not isinstance(x['reason'],str) or len(x['reason'])>90 or not x['reason'].replace('_','').isalnum():return None
    if type(x['queriesSent']) is not int or type(x['queriesAccepted']) is not int or not 0<=x['queriesAccepted']<=x['queriesSent']<=2:return None
    for key in ('observedAfterFirst','observedAfterSecond','freshIndependentPair','aliceConnectedAfter','bdsRestarted','aliceRestarted','labStarted','loopEnabled'):
        if type(x[key]) is not bool:return None
    if any(x[k] for k in ('bdsRestarted','aliceRestarted','labStarted','loopEnabled')):return None
    for key in ('beforeSamples','afterSamples'):
        if x[key] is not None and (type(x[key]) is not int or not 0<=x[key]<100000000):return None
    if x['alignedWithin075'] is not None and type(x['alignedWithin075']) is not bool:return None
    if x['independentPairTravel'] is not None and (type(x['independentPairTravel']) not in (float,int) or not 0<=x['independentPairTravel']<32):return None
    return x
def run(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    observation=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
          '-o','StrictHostKeyChecking=yes','tedz@192.168.0.104',
          '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,
          text=True,timeout=120,check=False)
        if p.returncode==0 and len(p.stdout)<2400:observation=validate(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    result={'audit':'ALICE_17879_COORDINATED_WITNESS_REPORT','schemaVersion':1,
     'originalWorldOnly':True,'noServicesRestarted':True,'observation':observation}
    fd=os.open(out/'alice_coord_witness.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':observation['state'] if observation else 'unverified'}))
def selftest():
    a={'audit':'ALICE_17879_COORDINATED_WITNESS','schemaVersion':1,'state':'two_fresh_observed',
      'reason':'none','queriesSent':2,'queriesAccepted':2,'observedAfterFirst':True,
      'observedAfterSecond':True,'beforeSamples':0,'afterSamples':2,
      'freshIndependentPair':True,'alignedWithin075':True,'independentPairTravel':0.,
      'aliceConnectedAfter':True,'bdsRestarted':False,'aliceRestarted':False,
      'labStarted':False,'loopEnabled':False}
    assert validate(a)==a
    assert validate({**a,'queriesSent':3}) is None
    print('ALICE_17879_COORDINATED_WITNESS_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--run':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --run OUTPUT_DIR')
