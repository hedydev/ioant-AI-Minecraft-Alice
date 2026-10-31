#!/usr/bin/env python3
"""Observe existing Alice demand-only MCSManager timer on Mint, no BDS commands.
All outputs bounded enumerations and counts, not coordinates/identities/credentials.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import json,os,subprocess,sys,time\nfrom pathlib import Path\nhome=Path.home();root=home/'.alice-bedrock-control'\nsys.path.insert(0,str(home/'minecraft-ai/scripts'))\nimport importlib.util\nmfile=home/'minecraft-ai/scripts/alice-bds-demand-timer.py'\nspec=importlib.util.spec_from_file_location('alice_demand_unit',mfile)\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\no={'audit':'ALICE_MCSM_TIMER_LIVE_AUDIT','schemaVersion':1,'state':'unverified',\n   'timerActive':False,'timerEnabled':False,'legacyLoopActive':False,\n   'timerTriggered':False,'clientConnected':False,'ownerMatched':False,\n   'demandFlag':False,'witnessNeed':'unknown','idleGate':'unknown',\n   'budgetUsedHour':None,'lastResult':'unknown','optedIn':False,'bdsCommandSentByAudit':False}\ndef run(cmd,secs=7):\n return subprocess.run(cmd,capture_output=True,text=True,timeout=secs,check=False)\ndef active(unit):\n x=run(['/usr/bin/systemctl','--user','is-active',unit])\n return x.returncode==0 and x.stdout.strip()=='active'\ntry:\n o['timerActive']=active(m.TIMER)\n en=run(['/usr/bin/systemctl','--user','is-enabled',m.TIMER])\n o['timerEnabled']=en.returncode==0 and en.stdout.strip()=='enabled'\n o['legacyLoopActive']=active('alice-bds-position-witness.service')\n z=run(['/usr/bin/systemctl','--user','show',m.TIMER,'--property=LastTriggerUSecMonotonic'])\n vals=z.stdout.strip().split('=',1)\n o['timerTriggered']=z.returncode==0 and len(vals)==2 and vals[1].isdigit() and int(vals[1])>0\n s,d=m.active_owner()\n o['clientConnected']=True\n o['ownerMatched']=True\n o['demandFlag']=m.demand_now(d)\n need=(d.get('movementEvidence') or {}).get('witnessDemand') or {}\n if need.get('state') in ('session_not_connected','login_not_verified','respawn_not_verified',\n   'client_position_unavailable','fresh_pair_aligned','client_server_diverged',\n   'needs_two_fresh_samples','needs_second_fresh_sample','pair_present_but_unverified'):\n  o['witnessNeed']=need['state']\n gate=(d.get('worldRoutine') or {}).get('idleGate')\n if isinstance(gate,str) and len(gate)<=45 and gate.replace('_','').isalnum():o['idleGate']=gate\n try:\n  b=m.private_read(m.BUDGET,256)\n  current=m.budget_value(time.time(),b)\n  o['budgetUsedHour']=current.get('used')\n except (OSError,ValueError,TypeError,KeyError):\n  pass\n try:\n  opt=m.private_read(m.OPTIN,128)\n  o['optedIn']=opt=={'version':1,'enabled':True,'maxHourly':40,'minBatchSeconds':55}\n except (OSError,ValueError,TypeError,KeyError):pass\n j=run(['/usr/bin/journalctl','--user','-u','alice-bds-demand.service',\n     '--since','-10 minutes','--no-pager','-n','30'])\n allowed={'not_opted_in','unsafe_lock','already_running','no_navigation_demand',\n 'cooldown_or_budget','sample_counter_missing','navigation_context_changed',\n 'budget_exhausted','command_unverified','session_changed','ack_timeout',\n 'position_pair_verified','pair_not_aligned','safe_failure'}\n import re\n rows=re.findall(r'ALICE_BDS_DEMAND_TIMER ([a-z_]+)',j.stdout)\n if j.returncode==0 and rows:\n  row=rows[-1]\n  if row in allowed:o['lastResult']=row\n o['state']='observed'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):\n pass\nprint(json.dumps(o,separators=(',',':')))\n"
FIELDS={'audit','schemaVersion','state','timerActive','timerEnabled','legacyLoopActive',
'timerTriggered','clientConnected','ownerMatched','demandFlag','witnessNeed',
'idleGate','budgetUsedHour','lastResult','optedIn','bdsCommandSentByAudit'}
def valid(v):
 if not isinstance(v,dict) or set(v)!=FIELDS or v['audit']!='ALICE_MCSM_TIMER_LIVE_AUDIT' or v['schemaVersion']!=1:return None
 if v['state'] not in ('observed','unverified'):return None
 for key in ('timerActive','timerEnabled','legacyLoopActive','timerTriggered','clientConnected',
   'ownerMatched','demandFlag','optedIn','bdsCommandSentByAudit'):
  if type(v[key]) is not bool:return None
 if v['bdsCommandSentByAudit']:return None
 if v['budgetUsedHour'] is not None and (type(v['budgetUsedHour']) is not int or not 0<=v['budgetUsedHour']<=40):return None
 if not isinstance(v['witnessNeed'],str) or len(v['witnessNeed'])>48 or not isinstance(v['idleGate'],str) or len(v['idleGate'])>48:return None
 if not isinstance(v['lastResult'],str) or len(v['lastResult'])>48:return None
 return v
def audit(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 v=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
   '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
   'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
   capture_output=True,text=True,timeout=50,check=False)
  if p.returncode==0 and len(p.stdout)<1600:v=valid(json.loads(p.stdout))
 except (OSError,ValueError,TypeError,subprocess.SubprocessError):pass
 result={'audit':'ALICE_MCSM_TIMER_STATUS_READONLY','schemaVersion':1,
   'readOnly':True,'consoleCommandSent':False,'worldChanged':False,
   'bdsRestarted':False,'observation':v}
 fd=os.open(out/'alice_timer_audit.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'))
 print(json.dumps({'state':v['state'] if v else 'unavailable','readOnly':True}))
def selftest():
 compile(REMOTE,'<mint-read-only>','exec')
 assert 'm.active_owner()' in REMOTE and 'm.demand_now(d)' in REMOTE
 assert "'--once'" not in REMOTE and "'--install'" not in REMOTE
 sample={'audit':'ALICE_MCSM_TIMER_LIVE_AUDIT','schemaVersion':1,'state':'observed',
 'timerActive':True,'timerEnabled':True,'legacyLoopActive':False,'timerTriggered':True,
 'clientConnected':True,'ownerMatched':True,'demandFlag':True,'witnessNeed':'needs_two_fresh_samples',
 'idleGate':'position_witness_unverified','budgetUsedHour':2,
 'lastResult':'position_pair_verified','optedIn':True,'bdsCommandSentByAudit':False}
 assert valid(sample)==sample
 assert valid({**sample,'bdsCommandSentByAudit':True}) is None
 print('ALICE_MCSM_TIMER_AUDIT_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--inspect':audit(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
