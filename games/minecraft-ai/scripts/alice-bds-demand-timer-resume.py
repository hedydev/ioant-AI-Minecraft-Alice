#!/usr/bin/env python3
"""Resume already-installed, paused Alice 17879 demand timer only after fresh heartbeat."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import json,os,subprocess,sys,time\nfrom pathlib import Path\nh=Path.home();root=h/'.alice-bedrock-control'\nsys.path.insert(0,str(h/'minecraft-ai/scripts'))\nimport importlib.util\nsrc=h/'minecraft-ai/scripts/alice-bds-demand-timer.py'\nspec=importlib.util.spec_from_file_location('alice_demand_resume',src)\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\no={'audit':'ALICE_BDS_DEMAND_TIMER_RESUME','schemaVersion':1,'state':'blocked',\n 'reason':'preflight_failed','heartbeatFresh':False,'worldVerified':False,\n 'timerActive':False,'timerEnabled':False,'oldLoopInactive':False,\n 'bdsRestarted':False,'aliceRestarted':False,'serverCommandSent':False}\ntry:\n m.private_root()\n s,d=m.active_owner()\n if s.get('heartbeatAgeSeconds') is None or s['heartbeatAgeSeconds']>5:\n  raise ValueError('stale_heartbeat')\n o['heartbeatFresh']=True\n m.binding_ok()\n o['worldVerified']=True\n old=subprocess.run(['/usr/bin/systemctl','--user','is-active',\n    'alice-bds-position-witness.service'],capture_output=True,text=True,timeout=5,check=False)\n if old.returncode==0 and old.stdout.strip()=='active':\n  raise ValueError('old_loop_active')\n o['oldLoopInactive']=True\n opt=m.private_read(m.OPTIN,128)\n if opt!={'version':1,'enabled':True,'maxHourly':40,'minBatchSeconds':55}:\n  raise ValueError('optin_invalid')\n unitDir=h/'.config/systemd/user'\n for name in (m.SERVICE,m.TIMER):\n  p=unitDir/name\n  if p.is_symlink() or not p.is_file():\n   raise ValueError('unit_unavailable')\n  if p.stat().st_uid!=os.getuid():raise ValueError('unit_unsafe')\n current=subprocess.run(['/usr/bin/systemctl','--user','is-active',m.TIMER],\n   capture_output=True,text=True,timeout=5,check=False)\n if current.returncode==0 and current.stdout.strip()=='active':\n  raise ValueError('already_active')\n claim=root/'alice-mcsm-resume-after-heartbeat-20261101.intent'\n fd=os.open(claim,os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)\n with os.fdopen(fd,'w') as f:\n  f.write('resume only original user timer after verified current heartbeat\\n')\n  f.flush();os.fsync(f.fileno())\n z=subprocess.run(['/usr/bin/systemctl','--user','enable','--now',m.TIMER],\n   capture_output=True,text=True,timeout=20,check=False)\n if z.returncode!=0:raise ValueError('start_refused')\n a=subprocess.run(['/usr/bin/systemctl','--user','is-active',m.TIMER],\n   capture_output=True,text=True,timeout=5,check=False)\n b=subprocess.run(['/usr/bin/systemctl','--user','is-enabled',m.TIMER],\n   capture_output=True,text=True,timeout=5,check=False)\n o['timerActive']=a.returncode==0 and a.stdout.strip()=='active'\n o['timerEnabled']=b.returncode==0 and b.stdout.strip()=='enabled'\n o['state']='resumed' if o['timerActive'] and o['timerEnabled'] else 'unverified'\n o['reason']='none' if o['state']=='resumed' else 'state_unverified'\nexcept FileExistsError:o['reason']='one_shot_claimed'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):\n if o['reason']=='preflight_failed':o['reason']='safety_or_transport_error'\nprint(json.dumps(o,separators=(',',':')))\n"
REASONS={'preflight_failed','none','one_shot_claimed','state_unverified','safety_or_transport_error'}
FIELDS={'audit','schemaVersion','state','reason','heartbeatFresh','worldVerified',
'timerActive','timerEnabled','oldLoopInactive','bdsRestarted','aliceRestarted','serverCommandSent'}
def valid(x):
 if not isinstance(x,dict) or set(x)!=FIELDS or x.get('audit')!='ALICE_BDS_DEMAND_TIMER_RESUME' or x.get('schemaVersion')!=1 or x.get('state') not in ('blocked','resumed','unverified') or x.get('reason') not in REASONS:return None
 for k in FIELDS-{'audit','schemaVersion','state','reason'}:
  if type(x[k]) is not bool:return None
 if any(x[k] for k in ('bdsRestarted','aliceRestarted','serverCommandSent')):return None
 if x['state']=='resumed' and not all(x[k] for k in ('heartbeatFresh','worldVerified','timerActive','timerEnabled','oldLoopInactive')):return None
 return x
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 row=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=65,check=False)
  if p.returncode==0 and len(p.stdout)<1100:row=valid(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 data={'audit':'ALICE_BDS_DEMAND_TIMER_RESUME_RESULT','schemaVersion':1,
  'scope':'existing_user_timer_only','observation':row}
 fd=os.open(out/'alice_bds_timer_resume.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(data,f,separators=(',',':'))
 print(json.dumps({'state':row['state'] if row else 'unverified'}))
def selftest():
 compile(REMOTE,'<mint-timer-resume>','exec')
 assert 'm.active_owner()' in REMOTE
 assert "'enable','--now'" in REMOTE
 assert "'--once'" not in REMOTE and "'restart'" not in REMOTE
 x={'audit':'ALICE_BDS_DEMAND_TIMER_RESUME','schemaVersion':1,'state':'resumed',
  'reason':'none','heartbeatFresh':True,'worldVerified':True,'timerActive':True,
  'timerEnabled':True,'oldLoopInactive':True,'bdsRestarted':False,
  'aliceRestarted':False,'serverCommandSent':False}
 assert valid(x)==x
 assert valid({**x,'serverCommandSent':True}) is None
 print('ALICE_BDS_DEMAND_TIMER_RESUME_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--resume':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --resume OUTPUT_DIR')
