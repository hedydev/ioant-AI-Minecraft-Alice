#!/usr/bin/env python3
"""Read-only private ACK, current Alice heartbeat, timer journal consistency.
All outputs redacted counts and enums; no API calls or raw server logs.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import json,os,re,subprocess,sys,time\nfrom pathlib import Path\nroot=Path.home()/'.alice-bedrock-control';sys.path.insert(0,str(Path.home()/'minecraft-ai/scripts'))\nimport importlib.util\nsrc=Path.home()/'minecraft-ai/scripts/alice-bds-demand-timer.py'\nspec=importlib.util.spec_from_file_location('alice_demand_consistency',src)\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nout={'audit':'ALICE_MCSM_DEMAND_CONSISTENCY','schemaVersion':1,'state':'unverified',\n 'clientConnected':False,'statusAgeBand':'unknown','demandNow':False,\n 'statusSampleCount':None,'statusIndependentAgeBand':'unknown',\n 'statusWitnessState':'unknown','readerState':'unknown',\n 'ackExists':False,'ackSameSession':False,'ackSampleCount':None,\n 'ackAgeBand':'unknown','ackGateAtWrite':None,'budgetUsedHour':None,\n 'budgetLastBatchAgeBand':'unknown','serviceResultEvents':[],\n 'worldChangedByAudit':False,'bdsCommandSentByAudit':False}\ndef band(seconds):\n if not isinstance(seconds,(float,int)) or seconds<0:return 'unknown'\n if seconds<=4:return 'within4s'\n if seconds<=30:return 'within30s'\n if seconds<=90:return 'within90s'\n if seconds<=300:return 'within5min'\n return 'older'\ndef bounded(v):\n return v if type(v) is int and 0<=v<=100000000 else None\ntry:\n s,d=m.active_owner();out['clientConnected']=True\n status=root/'status.json'\n out['statusAgeBand']=band(time.time()-status.stat().st_mtime)\n e=d.get('movementEvidence') or {}\n out['statusSampleCount']=bounded(e.get('independentSamples'))\n nowms=int(time.time()*1000);age=e.get('independentAt')\n if type(age) is int:out['statusIndependentAgeBand']=band((nowms-age)/1000)\n demand=e.get('witnessDemand') or {}\n allowed={'needs_two_fresh_samples','needs_second_fresh_sample',\n  'fresh_pair_aligned','client_server_diverged','pair_present_but_unverified',\n  'login_not_verified','session_not_connected','respawn_not_verified'}\n if demand.get('state') in allowed:out['statusWitnessState']=demand['state']\n if e.get('witnessStatus') in ('accepted','already_consumed','expired_witness',\n   'prior_login_witness','prior_life_witness','unavailable','duplicate_or_rejected'):\n  out['readerState']=e['witnessStatus']\n out['demandNow']=m.demand_now(d)\n try:\n  a=m.private_read(root/'bds-witness-ack.json',420)\n  out['ackExists']=True\n  out['ackSameSession']=a.get('writerPid')==s['pid'] and \\\n   a.get('producerStartToken')==d.get('producerStartToken') and \\\n   a.get('loginAt')==e.get('loginAt')\n  if out['ackSameSession']:\n   out['ackSampleCount']=bounded(a.get('independentSamples'))\n   at=a.get('independentAt')\n   if type(at) is int:out['ackAgeBand']=band((nowms-at)/1000)\n   if type(a.get('positionGateSatisfied')) is bool:out['ackGateAtWrite']=a['positionGateSatisfied']\n except (OSError,ValueError,TypeError,KeyError, json.JSONDecodeError):pass\n try:\n  b=m.private_read(m.BUDGET,256);obj=m.budget_value(time.time(),b)\n  out['budgetUsedHour']=bounded(obj.get('used'))\n  out['budgetLastBatchAgeBand']=band(time.time()-obj.get('lastBatch',0))\n except (OSError,ValueError,TypeError,KeyError):pass\n j=subprocess.run(['/usr/bin/journalctl','--user','-u','alice-bds-demand.service',\n    '--since','-30 minutes','--output=json','--no-pager','-n','80'],\n    capture_output=True,text=True,timeout=12,check=False)\n allowedResults={'not_opted_in','unsafe_lock','already_running','no_navigation_demand',\n 'cooldown_or_budget','sample_counter_missing','navigation_context_changed',\n 'budget_exhausted','command_unverified','session_changed','ack_timeout',\n 'position_pair_verified','pair_not_aligned','safe_failure'}\n events=[]\n if j.returncode==0:\n  for row in j.stdout.splitlines():\n   try:\n    item=json.loads(row);msg=item.get('MESSAGE','')\n    match=re.search(r'ALICE_BDS_DEMAND_TIMER ([a-z_]{3,45})',msg)\n    if not match or match.group(1) not in allowedResults:continue\n    epoch=item.get('__REALTIME_TIMESTAMP')\n    age=(time.time()-int(epoch)/1000000) if str(epoch).isdigit() else None\n    events.append({'result':match.group(1),'ageBand':band(age)})\n   except (ValueError,TypeError):pass\n out['serviceResultEvents']=events[-5:]\n out['state']='observed'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass\nprint(json.dumps(out,separators=(',',':')))\n"
FIELDS={'audit','schemaVersion','state','clientConnected','statusAgeBand',
'demandNow','statusSampleCount','statusIndependentAgeBand','statusWitnessState',
'readerState','ackExists','ackSameSession','ackSampleCount','ackAgeBand',
'ackGateAtWrite','budgetUsedHour','budgetLastBatchAgeBand',
'serviceResultEvents','worldChangedByAudit','bdsCommandSentByAudit'}
AGE={'unknown','within4s','within30s','within90s','within5min','older'}
def valid(x):
 if not isinstance(x,dict) or set(x)!=FIELDS or x['audit']!='ALICE_MCSM_DEMAND_CONSISTENCY' or x['schemaVersion']!=1 or x['state'] not in ('unverified','observed'):
  return None
 for key in ('statusAgeBand','statusIndependentAgeBand','ackAgeBand','budgetLastBatchAgeBand'):
  if x[key] not in AGE:return None
 for key in ('clientConnected','demandNow','ackExists','ackSameSession','worldChangedByAudit','bdsCommandSentByAudit'):
  if type(x[key]) is not bool:return None
 if x['worldChangedByAudit'] or x['bdsCommandSentByAudit']:return None
 for key in ('statusSampleCount','ackSampleCount','budgetUsedHour'):
  if x[key] is not None and (type(x[key]) is not int or not 0<=x[key]<=100000000):return None
 if x['ackGateAtWrite'] is not None and type(x['ackGateAtWrite']) is not bool:return None
 if not isinstance(x['serviceResultEvents'],list) or len(x['serviceResultEvents'])>5:return None
 for e in x['serviceResultEvents']:
  if not isinstance(e,dict) or set(e)!=('result','ageBand') or e['ageBand'] not in AGE or
     not isinstance(e['result'],str) or len(e['result'])>45:return None
 return x
def read(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 data=None
 try:
  proc=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
     '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
     'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
     capture_output=True,text=True,timeout=50,check=False)
  if proc.returncode==0 and len(proc.stdout)<=2000:data=valid(json.loads(proc.stdout))
 except (OSError,ValueError,TypeError,subprocess.SubprocessError):pass
 report={'audit':'ALICE_MCSM_DEMAND_CONSISTENCY_READONLY','readOnly':True,
 'commandSentByTask':False,'bdsRestarted':False,'observation':data}
 fd=os.open(out/'alice_demand_consistency.json',
   os.O_EXCL|os.O_CREAT|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'))
 print(json.dumps({'state':data['state'] if data else 'unavailable'}))
def selftest():
 compile(REMOTE,'<mint-consistency>','exec')
 assert "'--once'" not in REMOTE and "'--install'" not in REMOTE
 sample={'audit':'ALICE_MCSM_DEMAND_CONSISTENCY','schemaVersion':1,'state':'observed',
 'clientConnected':True,'statusAgeBand':'within4s','demandNow':True,
 'statusSampleCount':8,'statusIndependentAgeBand':'within30s',
 'statusWitnessState':'needs_two_fresh_samples','readerState':'expired_witness',
 'ackExists':True,'ackSameSession':True,'ackSampleCount':8,
 'ackAgeBand':'within30s','ackGateAtWrite':True,'budgetUsedHour':6,
 'budgetLastBatchAgeBand':'within90s','serviceResultEvents':[{'result':'position_pair_verified','ageBand':'within30s'}],
 'worldChangedByAudit':False,'bdsCommandSentByAudit':False}
 assert valid(sample)==sample
 assert valid({**sample,'statusAgeBand':'invalid'}) is None
 print('ALICE_MCSM_CONSISTENCY_READONLY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--read':read(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR')
