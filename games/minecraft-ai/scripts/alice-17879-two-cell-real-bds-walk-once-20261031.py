#!/usr/bin/env python3
"""Single scoped Alice 17879 walking probe with <=6 independent BDS reads."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="\nimport json,os,sys,time,re,math,subprocess\nfrom pathlib import Path\nhome=Path.home();root=home/'.alice-bedrock-control';scripts=home/'minecraft-ai/scripts'\nsys.path.insert(0,str(scripts))\nimport bds_position_witness as w\nsys.path.insert(0,str(home/'minecraft-ai/dashboard'))\nimport remote_control as rc\na={'audit':'ALICE_ORIGINAL_WORLD_REAL_WALK','schemaVersion':1,'state':'blocked',\n'blockReason':'preflight','queriesSent':0,'queriesAccepted':0,'firstPairObserved':False,\n'commandQueued':False,'commandStarted':False,'commandReceiptReason':None,\n'targetCell':None,'sourceBdsSamples':None,'finalBdsSamples':None,\n'maxIndependentDistance':None,'finalIndependentDistance':None,'bdsMoved':False,\n'clientAlignedAtLastSample':None,'aliceConnected':False,\n'worldChanged':False,'teleported':False,'bdsRestarted':False,\n'otherServersTouched':False,'attempts':0}\ndef status():\n p=subprocess.run(['/usr/bin/python3',str(scripts/'alice-mint.py'),'status'],\n   capture_output=True,text=True,timeout=12,check=False)\n if p.returncode or len(p.stdout)>20000:raise ValueError('operator_status')\n d=json.loads(p.stdout)\n if d.get('statusSource')!='current_process' or d.get('processAlive') is not True or d.get('heartbeatFresh') is not True or d.get('reportedConnected') is not True or d.get('sessionEstablished') is not True:\n  raise ValueError('alice_not_verified')\n return d\ndef own():\n st=status();p=root/'status.json'\n l=p.lstat()\n if not p.is_file() or p.is_symlink() or l.st_uid!=os.getuid() or l.st_mode&0o077 or l.st_size>8192:raise ValueError('status_not_private')\n d=json.loads(p.read_text())\n if d.get('producerPid')!=st['pid'] or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879 or d.get('connected') is not True:raise ValueError('wrong_instance')\n return st,d\ndef pos(v):\n if not isinstance(v,dict) or not all(type(v.get(k)) in (int,float) and math.isfinite(v[k]) for k in ('x','y','z')):return None\n return [v[k] for k in ('x','y','z')]\ndef data():\n st,d=own()\n m=d.get('movementEvidence') or {}\n return st,d,m\ndef confirm(before,limit=3.2):\n end=time.monotonic()+limit\n while time.monotonic()<end:\n  time.sleep(.25)\n  st,d,m=data()\n  n=m.get('independentSamples')\n  if type(n) is int and n>before and pos(m.get('independentLatestFeet')) is not None:return st,d,m\n return None\ndef query(before):\n if a['queriesSent']>=6:raise ValueError('query_budget_exhausted')\n a['queriesSent']+=1\n p=subprocess.run(['/usr/bin/python3',str(scripts/'bds_position_witness.py'),'--once'],\n  capture_output=True,text=True,timeout=29,check=False)\n if p.returncode or p.stdout.strip()!='BDS querytarget witness: accepted new independent sample':\n  raise ValueError('witness_unavailable')\n a['queriesAccepted']+=1\n obs=confirm(before)\n if obs is None:raise ValueError('witness_not_ingested')\n return obs\ndef samplesFresh(m):\n n=int(time.time()*1000);x=m.get('independentAt');y=m.get('independentPreviousAt')\n return type(x) is int and type(y) is int and 0<y<x<=n and n-y<=4000 and n-x<=4000\ntry:\n # Exactly the pre-enrolled original instance. Never infer a different world.\n cfg,_=w.validated_config()\n instance=Path('/opt/mcsmanager/daemon/data/InstanceConfig')/(cfg['instanceId']+'.json')\n if not instance.is_file() or instance.is_symlink() or instance.stat().st_size>65536:raise ValueError('instance_unverified')\n body=json.loads(instance.read_text())\n def cwd(o):\n  if not isinstance(o,dict):return None\n  for k in ('cwd','workingDirectory','workingDir'):\n   if isinstance(o.get(k),str):return o[k]\n  return cwd(o.get('config'))\n if Path(cwd(body) or '/nonexistent').resolve(strict=True)!=home/'minecraft-bedrock':raise ValueError('not_original_17879')\n st,d,m=data()\n if d.get('followTarget') is not None or d.get('job') is not None or d.get('state')!='IDLE':\n  raise ValueError('alice_not_idle_or_following')\n if type(d.get('health')) not in (int,float) or d['health']<16 or type(d.get('food')) not in (int,float) or d['food']<8:\n  raise ValueError('health_or_food_not_safe')\n a['aliceConnected']=True\n owner=root/'alice-original-17879-two-cell-walk-20261031.intent'\n fd=os.open(owner,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)\n with os.fdopen(fd,'w') as f:\n  f.write('one verified two-cell probe; max six on-demand BDS queries; never retry\\n');f.flush();os.fsync(f.fileno())\n a['attempts']=1\n a['sourceBdsSamples']=m.get('independentSamples')\n # Two strictly fresh, distinct trusted BDS points BEFORE any path is set.\n o=query(m.get('independentSamples',0));o=query(o[2]['independentSamples'])\n _,d,m=o\n a['firstPairObserved']=samplesFresh(m)\n base=pos(m.get('independentLatestFeet'))\n local=pos(d.get('position'))\n if not a['firstPairObserved'] or base is None or local is None or math.dist(base,local)>.75:\n  raise ValueError('admission_pair_not_aligned')\n # Dispatch same closed-vocabulary mailbox path as Mac Web, not arbitrary game command.\n queued=rc.queue_command({'text':'安全试走'},root)\n if queued.get('status')!='queued' or not re.fullmatch('[a-f0-9]{32}',str(queued.get('id',''))):\n  a['blockReason']=str(queued.get('reason','rejected')) if str(queued.get('reason','')).replace('_','').isalnum() else 'queue_denied'\n  raise ValueError('command_queue_denied')\n a['commandQueued']=True;a['state']='command_queued'\n ident=queued['id']\n end=time.monotonic()+4.2\n receipt=None\n while time.monotonic()<end:\n  time.sleep(.18)\n  r=rc.command_result(root)\n  if r and r.get('id')==ident and r.get('status') in ('started','completed','failed','rejected'):\n   receipt=r;break\n if not receipt:raise ValueError('no_command_receipt')\n reason=receipt.get('reason')\n a['commandReceiptReason']=reason if isinstance(reason,str) and re.fullmatch('[a-z][a-z0-9_]{0,70}',reason) else None\n a['commandStarted']=receipt.get('status')=='started' and reason=='probe_route_started'\n if not a['commandStarted']:\n  a['state']='probe_rejected';a['blockReason']=a['commandReceiptReason'] or 'probe_not_started'\n else:\n  match=re.search(r'(-?\\d+),(-?\\d+),(-?\\d+)',str(receipt.get('message','')))\n  if match:\n   cell=[int(x) for x in match.groups()]\n   if all(abs(x)<30000000 for x in cell):a['targetCell']=cell\n  a['state']='probe_started'\n  # Fixed budget of 4 post-command BDS observations; no continuous polling.\n  maxTravel=0.0;last=base\n  for k in range(4):\n   time.sleep(.8)\n   st,d,m=query(m.get('independentSamples',0))\n   feet=pos(m.get('independentLatestFeet'))\n   if feet:\n    dist=math.dist(base,feet)\n    maxTravel=max(maxTravel,dist)\n    last=feet\n   a['finalBdsSamples']=m.get('independentSamples')\n  a['maxIndependentDistance']=round(maxTravel,3)\n  a['finalIndependentDistance']=round(math.dist(base,last),3)\n  a['bdsMoved']=0.45<maxTravel<=4.5\n  current=pos(d.get('position'))\n  a['clientAlignedAtLastSample']=current is not None and math.dist(current,last)<=.75\n  a['state']='bds_travel_verified' if a['bdsMoved'] and a['clientAlignedAtLastSample'] else 'movement_not_verified'\n  a['blockReason']='none' if a['state']=='bds_travel_verified' else 'no_aligned_bds_movement'\nexcept FileExistsError:\n a['blockReason']='one_shot_already_claimed'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError) as err:\n if a['blockReason']=='preflight':\n  reason=str(err)\n  a['blockReason']=reason if re.fullmatch('[a-z][a-z0-9_]{0,70}',reason) else 'preflight_or_transport_unavailable'\ntry:\n st=status();a['aliceConnected']=True\nexcept (OSError,ValueError,TypeError,subprocess.SubprocessError):pass\nprint(json.dumps(a,separators=(',',':')))\n"
FIELDS={'audit','schemaVersion','state','blockReason','queriesSent','queriesAccepted',
 'firstPairObserved','commandQueued','commandStarted','commandReceiptReason','targetCell',
 'sourceBdsSamples','finalBdsSamples','maxIndependentDistance','finalIndependentDistance',
 'bdsMoved','clientAlignedAtLastSample','aliceConnected','worldChanged','teleported',
 'bdsRestarted','otherServersTouched','attempts'}
def validate(x):
 if not isinstance(x,dict) or set(x)!=FIELDS or x.get('audit')!='ALICE_ORIGINAL_WORLD_REAL_WALK' or x.get('schemaVersion')!=1:return None
 if x.get('state') not in ('blocked','command_queued','probe_rejected','probe_started','bds_travel_verified','movement_not_verified'):return None
 if not isinstance(x.get('blockReason'),str) or len(x['blockReason'])>80 or not x['blockReason'].replace('_','').isalnum():return None
 for k in ('queriesSent','queriesAccepted'):
  if type(x[k]) is not int or not 0<=x[k]<=6:return None
 if x['queriesAccepted']>x['queriesSent'] or type(x['attempts']) is not int or not 0<=x['attempts']<=1:return None
 for k in ('firstPairObserved','commandQueued','commandStarted','bdsMoved','aliceConnected','worldChanged','teleported','bdsRestarted','otherServersTouched'):
  if type(x[k]) is not bool:return None
 if any(x[k] for k in ('worldChanged','teleported','bdsRestarted','otherServersTouched')):return None
 for k in ('clientAlignedAtLastSample',):
  if x[k] is not None and type(x[k]) is not bool:return None
 if x['targetCell'] is not None and (not isinstance(x['targetCell'],list) or len(x['targetCell'])!=3 or any(type(c) is not int or abs(c)>=30000000 for c in x['targetCell'])):return None
 for k in ('sourceBdsSamples','finalBdsSamples'):
  if x[k] is not None and (type(x[k]) is not int or not 0<=x[k]<=100000000):return None
 for k in ('maxIndependentDistance','finalIndependentDistance'):
  if x[k] is not None and (type(x[k]) not in (int,float) or not 0<=x[k]<=1000):return None
 v=x['commandReceiptReason']
 if v is not None and (not isinstance(v,str) or len(v)>75 or not v.replace('_','').isalnum()):return None
 return x
def main(output):
 out=Path(output)
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 observed=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',
   'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
   capture_output=True,text=True,timeout=210,check=False)
  if p.returncode==0 and len(p.stdout)<2800:observed=validate(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 report={'audit':'ALICE_REAL17879_WALK_EXECUTION','schemaVersion':1,'originalWorldOnly':True,
  'noBdsRestart':True,'observation':observed}
 fd=os.open(out/'alice_real_walk_result.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
 print(json.dumps({'state':observed['state'] if observed else 'unverified'}))
def selftest():
 assert 'queriesSent' in REMOTE and 'query_budget_exhausted' in REMOTE
 assert 'probe_route_started' in REMOTE and 'strict' not in 'teleport'
 x={'audit':'ALICE_ORIGINAL_WORLD_REAL_WALK','schemaVersion':1,'state':'blocked',
    'blockReason':'preflight','queriesSent':0,'queriesAccepted':0,'firstPairObserved':False,
    'commandQueued':False,'commandStarted':False,'commandReceiptReason':None,
    'targetCell':None,'sourceBdsSamples':None,'finalBdsSamples':None,
    'maxIndependentDistance':None,'finalIndependentDistance':None,'bdsMoved':False,
    'clientAlignedAtLastSample':None,'aliceConnected':False,'worldChanged':False,
    'teleported':False,'bdsRestarted':False,'otherServersTouched':False,'attempts':0}
 assert validate(x)==x
 assert validate({**x,'queriesSent':7}) is None
 print('ALICE_REAL_WALK_CONTRACT_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--once':main(sys.argv[2])
 else:raise SystemExit('usage --self-test|--once OUTPUT_DIR')
