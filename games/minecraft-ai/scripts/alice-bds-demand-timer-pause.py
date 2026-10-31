#!/usr/bin/env python3
"""Pause ONLY the new Alice demand timer pending live status freshness repair."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import json,subprocess\nr={'audit':'ALICE_BDS_DEMAND_TIMER_PAUSE','schemaVersion':1,'state':'unverified',\n'timerStopped':False,'timerDisabled':False,'bdsRestarted':False,'aliceRestarted':False,\n'serverCommandSent':False}\ntry:\n p=subprocess.run(['/usr/bin/systemctl','--user','disable','--now',\n  'alice-bds-demand.timer'],capture_output=True,text=True,timeout=20,check=False)\n if p.returncode!=0:raise ValueError('systemctl_refused')\n a=subprocess.run(['/usr/bin/systemctl','--user','is-active','alice-bds-demand.timer'],\n  capture_output=True,text=True,timeout=6,check=False)\n b=subprocess.run(['/usr/bin/systemctl','--user','is-enabled','alice-bds-demand.timer'],\n  capture_output=True,text=True,timeout=6,check=False)\n r['timerStopped']=a.returncode!=0 and a.stdout.strip()!='active'\n r['timerDisabled']=b.returncode!=0 and b.stdout.strip() not in ('enabled','enabled-runtime')\n r['state']='paused' if r['timerStopped'] and r['timerDisabled'] else 'unverified'\nexcept (OSError,ValueError,subprocess.SubprocessError):pass\nprint(json.dumps(r,separators=(',',':')))\n"
def validate(x):
 keys={'audit','schemaVersion','state','timerStopped','timerDisabled',
 'bdsRestarted','aliceRestarted','serverCommandSent'}
 return x if isinstance(x,dict) and set(x)==keys and x.get('audit')=='ALICE_BDS_DEMAND_TIMER_PAUSE' and x.get('schemaVersion')==1 and x.get('state') in ('paused','unverified') and all(type(x[k]) is bool for k in keys-{'audit','schemaVersion','state'}) and not any(x[k] for k in ('bdsRestarted','aliceRestarted','serverCommandSent')) else None
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 v=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
   '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
   capture_output=True,text=True,timeout=45,check=False)
  if p.returncode==0 and len(p.stdout)<700:v=validate(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 result={'audit':'ALICE_BDS_DEMAND_TIMER_PAUSE_REPORT','observation':v}
 fd=os.open(out/'alice_demand_timer_pause.json',
   os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f)
 print(json.dumps({'state':v['state'] if v else 'unverified'}))
def selftest():
 compile(REMOTE,'<mint-pause>','exec')
 assert "disable','--now'" in REMOTE
 assert "'alice-bds-demand.timer'" in REMOTE
 assert "'bedrock_server'" not in REMOTE
 x={'audit':'ALICE_BDS_DEMAND_TIMER_PAUSE','schemaVersion':1,'state':'paused',
 'timerStopped':True,'timerDisabled':True,'bdsRestarted':False,
 'aliceRestarted':False,'serverCommandSent':False}
 assert validate(x)==x
 print('ALICE_BDS_TIMER_PAUSE_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--pause':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --pause OUTPUT_DIR')
