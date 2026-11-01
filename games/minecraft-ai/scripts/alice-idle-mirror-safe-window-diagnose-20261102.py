#!/usr/bin/env python3
"""Read-only predicate audit of the guarded Alice-only reload. No commands."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import json,subprocess,os,time\nfrom pathlib import Path\nh=Path.home();root=h/'.alice-bedrock-control'\nout={'audit':'ALICE_IDLE_MIRROR_WINDOW_DIAG','state':'unknown','checkPassed':False,\n'checkUseRestart':False,'checkPidMatched':False,'statusSourceCurrent':False,'heartbeatFresh':False,\n'ownerPidMatched':False,'worldExact':False,'portExact':False,'stateIdle':False,\n'healthSafe':False,'noJob':False,'autonomous':False,'idleGateAllowed':False,\n'statusAgeFresh':False,'allConditions':False,'bdsCommandSent':False,'restartAttempted':False}\ntry:\n def call(s):\n  p=subprocess.run(['/usr/bin/python3',str(h/'minecraft-ai/scripts/alice-mint.py'),s],\n     capture_output=True,text=True,timeout=105 if s=='check' else 15,check=False)\n  return json.loads(p.stdout) if p.returncode==0 and len(p.stdout)<22000 else {}\n ch=call('check');s=call('status')\n out['checkPassed']=ch.get('preflight')=='passed'\n out['checkUseRestart']=ch.get('action')=='use_restart'\n out['checkPidMatched']=type(ch.get('activePid')) is int and ch['activePid']>0 and ch['activePid']==s.get('pid')\n out['statusSourceCurrent']=s.get('statusSource')=='current_process'\n out['heartbeatFresh']=s.get('heartbeatFresh') is True\n p=root/'status.json'\n if p.is_symlink() or not p.is_file() or p.stat().st_uid!=os.getuid() or p.stat().st_mode&0o077 or p.stat().st_size>8192:raise ValueError('unsafe_file')\n d=json.loads(p.read_text())\n out['statusAgeFresh']=0<=time.time()-p.stat().st_mtime<=10\n out['ownerPidMatched']=d.get('producerPid')==s.get('pid')\n out['worldExact']=d.get('world')=='Bedrock level'\n out['portExact']=d.get('serverPort')==17879\n out['stateIdle']=d.get('state')=='IDLE'\n out['healthSafe']=type(d.get('health')) in (int,float) and d['health']>=16\n out['noJob']=d.get('job') is None\n settings=d.get('settings') or {}\n out['autonomous']=settings.get('autonomyEnabled') is True and settings.get('agentMode')=='autonomous'\n out['idleGateAllowed']=(d.get('worldRoutine') or {}).get('idleGate') in (\n   'eligible_for_work','work_cooldown','position_witness_unverified')\n flags=[v for k,v in out.items() if k not in ('audit','state','allConditions','bdsCommandSent','restartAttempted')]\n out['allConditions']=all(flags)\n out['state']='checked'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass\nprint(json.dumps(out,separators=(',',':')))\n"
FIELDS={'audit','state','checkPassed','checkUseRestart','checkPidMatched',
'statusSourceCurrent','heartbeatFresh','ownerPidMatched','worldExact','portExact',
'stateIdle','healthSafe','noJob','autonomous','idleGateAllowed','statusAgeFresh',
'allConditions','bdsCommandSent','restartAttempted'}
def valid(x):
 return x if isinstance(x,dict) and set(x)==FIELDS and x['audit']=='ALICE_IDLE_MIRROR_WINDOW_DIAG' and x['state'] in ('unknown','checked') and all(type(x[k]) is bool for k in FIELDS-{'audit','state'}) and not x['bdsCommandSent'] and not x['restartAttempted'] else None
def check(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 row=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
   '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
   capture_output=True,text=True,timeout=145,check=False)
  if p.returncode==0 and len(p.stdout)<1200:row=valid(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 result={'audit':'ALICE_IDLE_MIRROR_WINDOW_RESULT','readOnly':True,'observation':row}
 fd=os.open(out/'alice_idle_mirror_window.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'))
 print(json.dumps({'state':row['state'] if row else 'unverified'}))
def selftest():
 compile(REMOTE,'<mint-audit>','exec')
 assert "call('check')" in REMOTE and "call('status')" in REMOTE
 assert "call('restart')" not in REMOTE
 x={'audit':'ALICE_IDLE_MIRROR_WINDOW_DIAG','state':'checked'}
 x.update({k:True for k in FIELDS-{'audit','state','bdsCommandSent','restartAttempted'}})
 x.update(bdsCommandSent=False,restartAttempted=False)
 assert valid(x)==x
 print('ALICE_IDLE_MIRROR_WINDOW_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--inspect':check(Path(sys.argv[2]))
 else:raise SystemExit('usage --self-test | --inspect OUTPUT_DIR')
