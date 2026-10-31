#!/usr/bin/env python3
"""Mac to existing Mint user-systemd install for low-rate Alice BDS demand timer.
User requested actual on-demand MCSManager repair, no new server/BDS restart.
Reports only enum state, not credentials, player identity or MCSM output.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,subprocess
from pathlib import Path
exe=Path.home()/'minecraft-ai/scripts/alice-bds-demand-timer.py'
out={'audit':'ALICE_MCSM_DEMAND_TIMER_INSTALL','schemaVersion':1,
 'state':'blocked','selftestPassed':False,'installReturnedSuccess':False,
 'timerActive':False,'timerEnabled':False,'bdsRestartedByTask':False,
 'worldModifiedByTask':False,'commandSentByInstaller':False}
try:
 a=subprocess.run(['/usr/bin/python3',str(exe),'--self-test'],
   capture_output=True,text=True,timeout=10,check=False)
 if a.returncode or a.stdout.strip()!='ALICE_BDS_DEMAND_TIMER_SELFTEST_PASS':
  raise ValueError('selftest_failed')
 out['selftestPassed']=True
 b=subprocess.run(['/usr/bin/python3',str(exe),'--install'],
   capture_output=True,text=True,timeout=35,check=False)
 if b.returncode or b.stdout.strip()!='ALICE_BDS_DEMAND_TIMER timer_enabled':
  raise ValueError('install_failed')
 out['installReturnedSuccess']=True
 p=subprocess.run(['/usr/bin/systemctl','--user','is-active','alice-bds-demand.timer'],
   capture_output=True,text=True,timeout=8,check=False)
 q=subprocess.run(['/usr/bin/systemctl','--user','is-enabled','alice-bds-demand.timer'],
   capture_output=True,text=True,timeout=8,check=False)
 out['timerActive']=p.returncode==0 and p.stdout.strip()=='active'
 out['timerEnabled']=q.returncode==0 and q.stdout.strip()=='enabled'
 out['state']='installed' if out['timerActive'] and out['timerEnabled'] else 'install_unverified'
except (OSError,ValueError,subprocess.SubprocessError):
 pass
print(json.dumps(out,separators=(',',':')))
"""
FIELDS={'audit','schemaVersion','state','selftestPassed','installReturnedSuccess',
 'timerActive','timerEnabled','bdsRestartedByTask','worldModifiedByTask',
 'commandSentByInstaller'}
def valid(x):
 if not isinstance(x,dict) or set(x)!=FIELDS or x['audit']!='ALICE_MCSM_DEMAND_TIMER_INSTALL' or x['schemaVersion']!=1:
  return None
 if x['state'] not in ('blocked','installed','install_unverified'):return None
 for k in FIELDS-{'audit','schemaVersion','state'}:
  if type(x[k]) is not bool:return None
 if x['bdsRestartedByTask'] or x['worldModifiedByTask'] or x['commandSentByInstaller']:return None
 if x['state']=='installed' and not all(x[k] for k in ('selftestPassed','installReturnedSuccess','timerActive','timerEnabled')):return None
 return x
def install(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_dir')
 observed=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=75,check=False)
  if p.returncode==0 and len(p.stdout)<=1200:observed=valid(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 result={'audit':'ALICE_MCSM_DEMAND_TIMER_INSTALL_REPORT','schemaVersion':1,
  'scope':'original_17879_only','observation':observed}
 fd=os.open(out/'alice_mcsm_timer_install.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'))
 print(json.dumps({'state':observed['state'] if observed else 'unverified'}))
def selftest():
 compile(REMOTE,'<mint-systemd-installer>','exec')
 x={'audit':'ALICE_MCSM_DEMAND_TIMER_INSTALL','schemaVersion':1,
 'state':'installed','selftestPassed':True,'installReturnedSuccess':True,
 'timerActive':True,'timerEnabled':True,'bdsRestartedByTask':False,
 'worldModifiedByTask':False,'commandSentByInstaller':False}
 assert valid(x)==x
 assert valid({**x,'commandSentByInstaller':True}) is None
 print('ALICE_MCSM_TIMER_INSTALL_WRAPPER_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--install':install(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --install OUTPUT_DIR')
