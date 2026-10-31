#!/usr/bin/env python3
"""Two-or-fewer user-approved MCSManager coordinate requests with 250ms Alice ACK.
Only registered existing 17879 BDS. Never loops, restarts BDS, leaks credentials or coordinates.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="\nimport json,math,os,subprocess,sys,time\nfrom pathlib import Path\nh=Path.home();root=h/'.alice-bedrock-control';scripts=h/'minecraft-ai/scripts'\nsys.path.insert(0,str(scripts))\nimport bds_position_witness as witness\nr={'audit':'ALICE_MCSM_ACK_COORD_PAIR','schemaVersion':1,\n 'state':'blocked','reason':'preflight_failed','commandLimit':2,'commandsAttempted':0,\n 'commandsAccepted':0,'acceptedAcks':0,'gateSatisfiedAtAck':False,\n 'currentSessionAlive':False,'worldChangedByTask':False,'bdsRestarted':False,\n 'loopEnabled':False}\ndef fail(reason):\n r['reason']=reason\n raise ValueError(reason)\ndef operator_status():\n p=subprocess.run(['/usr/bin/python3',str(scripts/'alice-mint.py'),'status'],\n  capture_output=True,text=True,timeout=12,check=False)\n if p.returncode or len(p.stdout)>22000:fail('status_unavailable')\n s=json.loads(p.stdout)\n if s.get('statusSource')!='current_process' or s.get('reportedConnected') is not True or s.get('sessionEstablished') is not True or s.get('processAlive') is not True:\n  fail('session_unavailable')\n if s.get('world') not in (None,'Bedrock level') or s.get('serverPort') not in (None,17879):\n  fail('wrong_world')\n p=root/'status.json'\n if p.is_symlink() or not p.is_file() or p.stat().st_uid!=os.getuid() or p.stat().st_mode&0o077 or p.stat().st_size>8192:\n  fail('unsafe_owner_status')\n data=json.loads(p.read_text())\n if data.get('producerPid')!=s.get('pid') or data.get('world')!='Bedrock level' or data.get('serverPort')!=17879:\n  fail('owner_mismatch')\n if not isinstance(data.get('producerStartToken'),str):fail('owner_mismatch')\n return s,data\ndef read_ack(s,d):\n p=root/'bds-witness-ack.json'\n if not p.exists():return None\n if p.is_symlink() or not p.is_file() or p.stat().st_uid!=os.getuid() or p.stat().st_mode&0o077 or p.stat().st_size>420:\n  fail('unsafe_ack')\n ack=json.loads(p.read_text())\n if not isinstance(ack,dict) or ack.get('version')!=1 or ack.get('writerPid')!=s['pid'] or \\\n    ack.get('producerStartToken')!=d['producerStartToken'] or \\\n    ack.get('loginAt')!=(d.get('movementEvidence') or {}).get('loginAt'):\n  return None\n n,t=ack.get('independentSamples'),ack.get('independentAt')\n now=int(time.time()*1000)\n if type(n) is not int or n<1 or type(t) is not int or t<=ack['loginAt'] or t>now or now-t>4000:\n  return None\n if type(ack.get('positionGateSatisfied')) is not bool:return None\n return {'n':n,'at':t,'gate':ack['positionGateSatisfied']}\ntry:\n cfg,_=witness.validated_config()\n conf=Path('/opt/mcsmanager/daemon/data/InstanceConfig')/(cfg['instanceId']+'.json')\n if conf.is_symlink() or not conf.is_file() or conf.stat().st_size>65536:fail('instance_unverified')\n body=json.loads(conf.read_text(encoding='utf-8'))\n def findcwd(v):\n  if not isinstance(v,dict):return None\n  for k in ('cwd','workingDirectory','workingDir'):\n   if isinstance(v.get(k),str):return v[k]\n  return findcwd(v.get('config'))\n cwd=findcwd(body)\n if not cwd or Path(cwd).resolve(strict=True)!=h/'minecraft-bedrock':fail('instance_unverified')\n prop=h/'minecraft-bedrock/server.properties'\n if prop.is_symlink() or not prop.is_file() or prop.stat().st_size>10000 or \\\n    'server-port=17879' not in prop.read_text(encoding='utf-8').splitlines():\n  fail('wrong_world')\n svc=subprocess.run(['/usr/bin/systemctl','--user','is-active','alice-bds-position-witness.service'],\n   capture_output=True,text=True,timeout=5,check=False)\n if svc.returncode==0 and svc.stdout.strip()=='active':fail('legacy_loop_active')\n s,d=operator_status()\n if root.is_symlink() or root.stat().st_uid!=os.getuid() or root.stat().st_mode&0o077:\n  fail('unsafe_control_root')\n ack=read_ack(s,d)\n last=ack['n'] if ack else (d.get('movementEvidence') or {}).get('independentSamples')\n if type(last) is not int or last<0:fail('sample_unavailable')\n pid=s['pid'];token=d['producerStartToken']\n claim=root/'alice-mcsm-fast-ack-pair-20261101-one-shot.intent'\n fd=os.open(claim,os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)\n with os.fdopen(fd,'w') as f:\n  f.write('user-approved 2-or-fewer isolated queries, wait for private ACK; never loop\\n')\n  f.flush();os.fsync(f.fileno())\n r['state']='attempted'\n for i in range(2):\n  s,d=operator_status()\n  if s['pid']!=pid or d['producerStartToken']!=token:fail('session_changed')\n  r['commandsAttempted']+=1\n  issued=int(time.time()*1000)\n  try:\n   p=subprocess.run(['/usr/bin/python3',str(scripts/'bds_position_witness.py'),'--once'],\n     capture_output=True,text=True,timeout=32,check=False)\n  except subprocess.TimeoutExpired:fail('query_timeout')\n  if p.returncode!=0 or p.stdout.strip()!='BDS querytarget witness: accepted new independent sample':\n   fail('query_failed')\n  r['commandsAccepted']+=1\n  observed=None\n  deadline=time.monotonic()+2.0\n  while time.monotonic()<deadline:\n   time.sleep(.1)\n   s,d=operator_status()\n   if s['pid']!=pid or d['producerStartToken']!=token:fail('session_changed')\n   x=read_ack(s,d)\n   if x and x['n']>last and x['at']>=issued-100:\n    observed=x;break\n  if observed is None:fail('ack_not_observed')\n  r['acceptedAcks']+=1\n  last=observed['n']\n  if observed['gate']:\n   r['gateSatisfiedAtAck']=True\n   r['state']='verified';r['reason']='fresh_pair_aligned';break\n if r['state']=='attempted':\n  r['state']='incomplete';r['reason']='pair_not_aligned_within_budget'\nexcept FileExistsError:r['reason']='one_shot_already_claimed'\nexcept (OSError,ValueError,TypeError,IndexError,KeyError,subprocess.SubprocessError):\n if r['reason']=='preflight_failed':r['reason']='transport_or_preflight_error'\nfinally:\n try:\n  s,d=operator_status();r['currentSessionAlive']=True\n except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):pass\n if r['state']=='attempted':r['state']='incomplete'\n print(json.dumps(r,separators=(',',':')))\n"
FIELDS={'audit','schemaVersion','state','reason','commandLimit','commandsAttempted',
'commandsAccepted','acceptedAcks','gateSatisfiedAtAck','currentSessionAlive',
'worldChangedByTask','bdsRestarted','loopEnabled'}
STATES={'blocked','attempted','verified','incomplete'}
REASONS={'preflight_failed','status_unavailable','session_unavailable','wrong_world',
'unsafe_owner_status','owner_mismatch','unsafe_ack','instance_unverified',
'legacy_loop_active','unsafe_control_root','sample_unavailable','session_changed',
'query_timeout','query_failed','ack_not_observed','fresh_pair_aligned',
'pair_not_aligned_within_budget','one_shot_already_claimed',
'transport_or_preflight_error'}
def validate(x):
 if not isinstance(x,dict) or set(x)!=FIELDS or x['audit']!='ALICE_MCSM_ACK_COORD_PAIR' or x['schemaVersion']!=1:
  return None
 if x['state'] not in STATES or x['reason'] not in REASONS or x['commandLimit']!=2:return None
 for key in ('commandsAttempted','commandsAccepted','acceptedAcks'):
  if type(x[key]) is not int or not 0<=x[key]<=2:return None
 if not x['acceptedAcks']<=x['commandsAccepted']<=x['commandsAttempted']:return None
 for k in ('gateSatisfiedAtAck','currentSessionAlive','worldChangedByTask','bdsRestarted','loopEnabled'):
  if type(x[k]) is not bool:return None
 if x['worldChangedByTask'] or x['bdsRestarted'] or x['loopEnabled']:return None
 if x['state']=='verified' and (not x['gateSatisfiedAtAck'] or x['acceptedAcks']<2):
  return None
 return x
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 record=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104',
    '/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=115,check=False)
  if p.returncode==0 and len(p.stdout)<=2100:record=validate(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 report={'audit':'ALICE_MCSM_ACK_COORDINATED_REPORT','schemaVersion':1,
   'world':'original_17879_only','observed':record,'modelOrClientBdsCommandsSent':False}
 fd=os.open(out/'alice_mcsm_ack_pair.json',os.O_WRONLY|os.O_EXCL|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'))
 print(json.dumps({'state':record['state'] if record else 'unverified'}))
def selftest():
 compile(REMOTE,'<mint-ack-coordinator>','exec')
 assert 'range(2)' in REMOTE
 assert "'--once'" in REMOTE and "'--loop'" not in REMOTE
 assert 'bds-witness-ack.json' in REMOTE
 assert 'time.monotonic()+2.0' in REMOTE
 sample={'audit':'ALICE_MCSM_ACK_COORD_PAIR','schemaVersion':1,'state':'verified',
  'reason':'fresh_pair_aligned','commandLimit':2,'commandsAttempted':2,'commandsAccepted':2,
  'acceptedAcks':2,'gateSatisfiedAtAck':True,'currentSessionAlive':True,
  'worldChangedByTask':False,'bdsRestarted':False,'loopEnabled':False}
 assert validate(sample)==sample
 assert validate({**sample,'acceptedAcks':1,'state':'verified'}) is None
 assert validate({**sample,'commandsAttempted':3}) is None
 print('ALICE_MCSM_ACK_COORDINATOR_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--run':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --run OUTPUT_DIR')
