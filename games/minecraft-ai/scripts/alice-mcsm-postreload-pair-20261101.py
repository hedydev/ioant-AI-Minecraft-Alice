#!/usr/bin/env python3
"""Operator-scoped single finite live MCSM/BDS coordinate pair acceptance.

User-approved new intent (2026-11-01). Max 4 individual --once calls,
no querytarget loop, world modifications, BDS/Alice restart or other servers.
Never exports name, location, MCSM ID, API key, raw logs or credentials.
The task can be blocked independently by the configured tool safety review.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="\nimport json,math,os,re,subprocess,sys,time\nfrom pathlib import Path\nh=Path.home();root=h/'.alice-bedrock-control';scripts=h/'minecraft-ai/scripts'\nsys.path.insert(0,str(scripts))\nimport bds_position_witness as witness\nr={'audit':'ALICE_MCSM_DEMAND_LIVE_PAIR','schemaVersion':1,'state':'blocked',\n'reason':'preflight_not_completed','maxCommands':2,'commandsAttempted':0,\n'commandsAccepted':0,'freshPairObserved':False,'positionAligned':False,\n'sessionConnectedAtEnd':False,'initialIndependentSamples':None,'finalIndependentSamples':None,\n'worldModifiedByTool':False,'serviceRestarted':False,'loopEnabled':False}\nallowed=['preflight_not_completed','config_unavailable','instance_unverified','world_unverified',\n 'client_unverified','source_service_active','owner_unsafe','intent_already_consumed',\n 'status_unavailable','session_disconnected','query_failed','query_timeout',\n 'first_sample_not_ingested','samples_not_fresh','aligned_pair_observed','max_query_budget',\n 'unexpected_error']\ndef fail(code):\n if code not in allowed:code='unexpected_error'\n r['reason']=code\n raise ValueError(code)\ndef live():\n p=subprocess.run(['/usr/bin/python3',str(scripts/'alice-mint.py'),'status'],\n                   capture_output=True,text=True,timeout=13,check=False)\n if p.returncode or len(p.stdout)>24000:fail('status_unavailable')\n s=json.loads(p.stdout)\n if s.get('statusSource')!='current_process' or s.get('processAlive') is not True or \\\n    s.get('reportedConnected') is not True or s.get('sessionEstablished') is not True:\n  fail('session_disconnected')\n if s.get('world') not in (None,'Bedrock level') or s.get('serverPort') not in (None,17879):\n  fail('world_unverified')\n return s\ndef evidence_status(s):\n p=root/'status.json'\n if p.is_symlink() or not p.is_file():fail('owner_unsafe')\n st=p.stat()\n if st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>8192 or st.st_size==0:\n  fail('owner_unsafe')\n x=json.loads(p.read_text())\n if x.get('producerPid')!=s.get('pid') or x.get('world')!='Bedrock level' or x.get('serverPort')!=17879:\n  fail('client_unverified')\n return x\ndef inspect_sample():\n s=live();x=evidence_status(s);e=x.get('movementEvidence') or {}\n n=e.get('independentSamples')\n n=n if type(n) is int and 0<=n<100000000 else None\n now=int(time.time()*1000);a,b=e.get('independentAt'),e.get('independentPreviousAt')\n ready=type(a) is int and type(b) is int and 0<b<a<=now and now-b<=4000\n login=e.get('loginAt');life=e.get('lifeEpochAt')\n ready=ready and type(login) is int and b>login and (\n       type(life) is not int or b>life) and e.get('awaitingVerifiedRespawn') is not True\n p=x.get('position');q=e.get('independentLatestFeet')\n aligned=False\n if ready and isinstance(p,dict) and isinstance(q,dict) and all(\n     type(p.get(k)) in (int,float) and type(q.get(k)) in (int,float)\n     and math.isfinite(p[k]) and math.isfinite(q[k]) for k in ('x','y','z')):\n  aligned=math.dist([p[k] for k in ('x','y','z')],[q[k] for k in ('x','y','z')])<=.75\n return n,bool(ready),bool(aligned)\ntry:\n cfg,_=witness.validated_config()\n conf=Path('/opt/mcsmanager/daemon/data/InstanceConfig')/(cfg['instanceId']+'.json')\n if conf.is_symlink() or not conf.is_file() or conf.stat().st_size>65536:\n  fail('instance_unverified')\n body=json.loads(conf.read_text(encoding='utf-8'))\n def find_cwd(obj):\n  if not isinstance(obj,dict):return None\n  for key in ('cwd','workingDirectory','workingDir'):\n   if isinstance(obj.get(key),str):return obj[key]\n  return find_cwd(obj.get('config'))\n directory=find_cwd(body)\n if not directory or Path(directory).resolve(strict=True)!=h/'minecraft-bedrock':\n  fail('instance_unverified')\n prop=h/'minecraft-bedrock/server.properties'\n if prop.is_symlink() or not prop.is_file() or prop.stat().st_size>10000:\n  fail('world_unverified')\n props=prop.read_text(encoding='utf-8')\n if re.search(r'(?m)^server-port=17879\\s*$',props) is None:fail('world_unverified')\n service=subprocess.run(['/usr/bin/systemctl','--user','is-active','alice-bds-position-witness.service'],\n      capture_output=True,text=True,timeout=5,check=False)\n if service.returncode==0 and service.stdout.strip()=='active':fail('source_service_active')\n initial=live()\n n,ready,aligned=inspect_sample()\n r['initialIndependentSamples']=n\n if n is None:fail('client_unverified')\n if root.is_symlink() or not root.is_dir() or root.stat().st_uid!=os.getuid() or root.stat().st_mode&0o077:\n  fail('owner_unsafe')\n intent=root/'alice-mcsm-postreload-pair-20261101-once.intent'\n fd=os.open(intent,os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)\n with os.fdopen(fd,'w') as f:\n  f.write('explicit user consent; max 2 single querytarget; no loop; no retries after failure\\n')\n  f.flush();os.fsync(f.fileno())\n r['state']='attempted'\n for i in range(2):\n  live()\n  r['commandsAttempted']+=1\n  try:\n   p=subprocess.run(['/usr/bin/python3',str(scripts/'bds_position_witness.py'),'--once'],\n         capture_output=True,text=True,timeout=32,check=False)\n  except subprocess.TimeoutExpired:fail('query_timeout')\n  if p.returncode!=0 or p.stdout.strip()!='BDS querytarget witness: accepted new independent sample':\n   fail('query_failed')\n  r['commandsAccepted']+=1\n  # Wait for the existing 250ms file reader + current-process heartbeat.\n  after=None\n  deadline=time.monotonic()+3.6\n  while time.monotonic()<deadline:\n   time.sleep(.25)\n   after=inspect_sample()\n   if after[0] is not None and after[0]>n:break\n  if after is None or after[0] is None or after[0]<=n:\n   fail('first_sample_not_ingested')\n  n,ready,aligned=after\n  if ready and aligned:\n   r['freshPairObserved']=True;r['positionAligned']=True\n   r['reason']='aligned_pair_observed'\n   r['state']='verified'\n   break\n if r['state']=='attempted':\n  r['reason']='max_query_budget'\n  r['state']='incomplete'\nexcept FileExistsError:\n r['reason']='intent_already_consumed'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):\n if r['reason']=='preflight_not_completed':r['reason']='unexpected_error'\nfinally:\n try:\n  s=live();r['sessionConnectedAtEnd']=True\n  x=evidence_status(s);n=(x.get('movementEvidence') or {}).get('independentSamples')\n  if type(n) is int and 0<=n<100000000:r['finalIndependentSamples']=n\n except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass\n if r['state']=='attempted':r['state']='incomplete'\n print(json.dumps(r,separators=(',',':')))\n"
FIELDS={'audit','schemaVersion','state','reason','maxCommands','commandsAttempted',
 'commandsAccepted','freshPairObserved','positionAligned','sessionConnectedAtEnd',
 'initialIndependentSamples','finalIndependentSamples','worldModifiedByTool',
 'serviceRestarted','loopEnabled'}
STATES={'blocked','attempted','verified','incomplete'}
REASONS={'preflight_not_completed','config_unavailable','instance_unverified','world_unverified',
 'client_unverified','source_service_active','owner_unsafe','intent_already_consumed',
 'status_unavailable','session_disconnected','query_failed','query_timeout',
 'first_sample_not_ingested','samples_not_fresh','aligned_pair_observed',
 'max_query_budget','unexpected_error'}
def validate(v):
 if not isinstance(v,dict) or set(v)!=FIELDS or v['audit']!='ALICE_MCSM_DEMAND_LIVE_PAIR' or v['schemaVersion']!=1:
  return None
 if v['state'] not in STATES or v['reason'] not in REASONS or v['maxCommands']!=2:return None
 if type(v['commandsAttempted']) is not int or type(v['commandsAccepted']) is not int or not 0<=v['commandsAccepted']<=v['commandsAttempted']<=2:return None
 for k in ('freshPairObserved','positionAligned','sessionConnectedAtEnd','worldModifiedByTool','serviceRestarted','loopEnabled'):
  if type(v[k]) is not bool:return None
 if v['worldModifiedByTool'] or v['serviceRestarted'] or v['loopEnabled']:return None
 for k in ('initialIndependentSamples','finalIndependentSamples'):
  if v[k] is not None and (type(v[k]) is not int or not 0<=v[k]<100000000):return None
 if v['state']=='verified' and (not v['freshPairObserved'] or not v['positionAligned'] or v['commandsAccepted']<1):
  return None
 return v
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 observation=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104',
    '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=180,check=False)
  if p.returncode==0 and len(p.stdout)<=2000:
   observation=validate(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 result={'audit':'ALICE_MCSM_DEMAND_LIVE_REPORT','schemaVersion':1,
  'scope':'original_17879_only','maxCommands':2,'credentialOrCoordinateExported':False,
  'observation':observation}
 fd=os.open(out/'alice_mcsm_demand_live.json',
   os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'))
 print(json.dumps({'state':observation['state'] if observation else 'unverified',
   'accepted':observation['commandsAccepted'] if observation else None}))
def selftest():
 compile(REMOTE,'<mint_live_probe>','exec')
 assert "range(2)" in REMOTE
 assert "bds_position_witness.py'),'--once'" in REMOTE
 assert "'--loop'" not in REMOTE and "'--restart'" not in REMOTE
 assert ".resolve(strict=True)!=h/'minecraft-bedrock'" in REMOTE
 x={'audit':'ALICE_MCSM_DEMAND_LIVE_PAIR','schemaVersion':1,'state':'verified',
  'reason':'aligned_pair_observed','maxCommands':2,'commandsAttempted':2,'commandsAccepted':2,
  'freshPairObserved':True,'positionAligned':True,'sessionConnectedAtEnd':True,
  'initialIndependentSamples':0,'finalIndependentSamples':2,
  'worldModifiedByTool':False,'serviceRestarted':False,'loopEnabled':False}
 assert validate(x)==x
 assert validate({**x,'commandsAttempted':3}) is None
 assert validate({**x,'worldModifiedByTool':True}) is None
 print('ALICE_MCSM_POSTRELOAD_TWO_QUERY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--run':run(Path(sys.argv[2]))
 else:raise SystemExit('usage --self-test | --run OUTPUT_DIR')
