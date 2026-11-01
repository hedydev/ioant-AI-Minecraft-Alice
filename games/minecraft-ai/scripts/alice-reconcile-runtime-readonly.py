#!/usr/bin/env python3
"""Use existing Mint Node24 and strict owner-bound Alice telemetry for live audit.
No AI decisions, BDS console calls, process signals, or raw coordinate export.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE = r'''
import json,subprocess,sys
from pathlib import Path
home=Path.home()
sys.path.insert(0,str(home/'minecraft-ai/scripts'))
from alice_operator.process import AliceProcess
app=AliceProcess()
script=(app.project/'scripts/inspect_reconciliation_runtime.cjs')
if script.is_symlink() or not script.is_file() or script.resolve(strict=True).parent!=app.project/'scripts':
 raise ValueError('script_unavailable')
p=subprocess.run([str(app.node),str(script)],cwd=app.project,
 capture_output=True,text=True,timeout=12,check=False)
if p.returncode!=0 or len(p.stdout)>1600:raise ValueError('report_unavailable')
print(p.stdout.strip())
'''
BOOLEANS={'readOnly','worldModified','bdsCommandSent','currentOwnerEvidence','telemetryPresent','bdsFreshPair'}
NUMBERS={'correctionReplays','replayedFrames','correctionFallbacks','correctionsRejected',
 'historyFrames','bdsPairTravel','clientBdsDistance'}
FIELDS={'audit','schemaVersion','evidenceLevel','lastCorrectionReason',*BOOLEANS,*NUMBERS}
def verify(x):
 if not isinstance(x,dict) or x.get('audit')!='ALICE_RECONCILIATION_LIVE_READONLY' or x.get('schemaVersion')!=1:return None
 if x.get('readOnly') is not True or x.get('worldModified') is not False or x.get('bdsCommandSent') is not False:return None
 if x.get('evidenceLevel')=='unavailable':
  if type(x.get('currentOwnerEvidence')) is not bool or type(x.get('telemetryPresent')) is not bool:return None
  return {'audit':x['audit'],'schemaVersion':1,'readOnly':True,'currentOwnerEvidence':False,'telemetryPresent':False,'evidenceLevel':'unavailable'}
 if set(x)!=FIELDS or x.get('evidenceLevel') not in ('runtime_counters_observed','runtime_counters_unavailable'):return None
 for k in BOOLEANS:
  if type(x[k]) is not bool:return None
 for k in NUMBERS:
  if x[k] is not None and (type(x[k]) not in (int,float) or not 0<=x[k]<=1e9):return None
 if type(x['lastCorrectionReason']) is not str or len(x['lastCorrectionReason'])>48:return None
 if x['telemetryPresent']!=(x['evidenceLevel']=='runtime_counters_observed'):return None
 return x
def run(folder):
 if folder.is_symlink() or not folder.is_dir():raise ValueError('unsafe_output')
 report=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
   '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
   capture_output=True,text=True,timeout=50,check=False)
  if p.returncode==0 and len(p.stdout)<1600:report=verify(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError,json.JSONDecodeError):pass
 doc={'audit':'ALICE_RECONCILIATION_RUNTIME_READONLY_REPORT','readOnly':True,'observation':report}
 fd=os.open(folder/'alice_reconciliation_runtime.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(doc,f,separators=(',',':'))
 print(json.dumps({'result':report['evidenceLevel'] if report else 'unverified'}))
def selftest():
 compile(REMOTE,'<alice-reconcile-audit>','exec')
 assert "'--test'" not in REMOTE and "'restart'" not in REMOTE
 probe={'audit':'ALICE_RECONCILIATION_LIVE_READONLY','schemaVersion':1,
 'evidenceLevel':'runtime_counters_unavailable','lastCorrectionReason':'unknown',
 'readOnly':True,'worldModified':False,'bdsCommandSent':False,
 'currentOwnerEvidence':True,'telemetryPresent':False,'bdsFreshPair':False,
 **{k:None for k in NUMBERS}}
 assert verify(probe)==probe
 assert verify({**probe,'bdsCommandSent':True}) is None
 print('ALICE_RECONCILE_RUNTIME_READONLY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--read':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --read OUTPUT_DIRECTORY')
