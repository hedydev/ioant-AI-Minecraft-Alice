#!/usr/bin/env python3
"""Observe existing current-owner telemetry for <=210s; never query/control BDS."""
import json,math,os,re,shlex,subprocess,sys
from pathlib import Path
REMOTE=r'''
import json,subprocess,sys
from pathlib import Path
home=Path.home();sys.path.insert(0,str(home/'minecraft-ai/scripts'))
from alice_operator.process import AliceProcess
app=AliceProcess();script=app.project/'scripts/watch_reconciliation_runtime.cjs'
if script.is_symlink() or not script.is_file() or script.resolve().parent!=app.project/'scripts':
 raise ValueError('observer_unavailable')
p=subprocess.run([str(app.node),str(script),'--observe'],cwd=app.project,
 capture_output=True,text=True,timeout=235,check=False)
if p.returncode or len(p.stdout)>8192:raise ValueError('observation_unavailable')
print(p.stdout.strip())
'''
COUNTERS={'correctionReplays','replayedFrames','correctionFallbacks','correctionsRejected','historyFrames'}
REASONS={'bds_pair_unverified','position_time_unverified','sample_time_skew',
 'client_position_unavailable','fresh_relative_sample'}
WINDOW={'firstObservedAfterMs','observations','minDistance','maxDistance','lastDistance',
 'bdsPairTravel','idleOnly','movementInputsObserved','maxSampleSkewMs'}
TOP={'audit','schemaVersion','readOnly','bdsCommandSent','clientRestarted','worldModified',
 'state','ownerPid','elapsedMs','observations','telemetryPresent','comparisonReasons',
 'windows','firstCounters','lastCounters','snapshotFailure','activityGuardVersion'}
def number(v,maximum=1e9):return type(v) in (int,float) and math.isfinite(v) and 0<=v<=maximum
def target_binding():
 # Reuse the enrolled repository's existing maintained sync destination;
 # don't add a second machine-private host binding or read credentials.
 task=Path(__file__).resolve().parents[3]/'.openclaw/tasks/alice_mint_nonrestart_sync.json'
 if task.is_symlink() or not task.is_file():raise ValueError('binding_unavailable')
 steps=json.loads(task.read_text())['steps']
 args=next(s['args'] for s in steps if s['name']=='mint_nonrestart_sync')
 if len(args)!=3 or args[:2]!=['--sync','@output_dir'] or not re.fullmatch(
   r'[a-z_][a-z0-9_-]*@(?:[0-9]{1,3}\.){3}[0-9]{1,3}',args[2]):raise ValueError('binding_unavailable')
 return args[2]
def validate(d):
 if not isinstance(d,dict) or set(d)!=TOP:return None
 if d['audit']!='ALICE_RECONCILIATION_FINITE_OBSERVATION' or d['schemaVersion']!=1:return None
 if d['readOnly'] is not True or any(d[k] is not False for k in ('bdsCommandSent','clientRestarted','worldModified')):return None
 if d['state'] not in ('no_fresh_samples','fresh_relative_samples_observed','snapshot_unavailable','session_unverified','owner_changed'):return None
 if d['snapshotFailure'] not in (None,'unsafe_movement_report_source','movement_process_identity_unavailable',
   'movement_process_identity_mismatch','movement_report_stale','inspection_unavailable'):return None
 if d['ownerPid'] is not None and (type(d['ownerPid']) is not int or not 1<d['ownerPid']<=1e9):return None
 if d['activityGuardVersion'] is not None and (type(d['activityGuardVersion']) is not int or d['activityGuardVersion']!=1):return None
 if not number(d['elapsedMs'],235000) or not number(d['observations'],1000) or type(d['telemetryPresent']) is not bool:return None
 reasons=d['comparisonReasons']
 if not isinstance(reasons,dict) or not set(reasons)<=REASONS or any(not number(n,1000) for n in reasons.values()):return None
 if type(d['windows']) is not list or len(d['windows'])>6:return None
 for w in d['windows']:
  if not isinstance(w,dict) or set(w)!=WINDOW:return None
  if any(type(w[k]) is not bool for k in ('idleOnly','movementInputsObserved')):return None
  if any(not number(w[k]) for k in WINDOW-{'idleOnly','movementInputsObserved','bdsPairTravel'}):return None
  if w['bdsPairTravel'] is not None and not number(w['bdsPairTravel']):return None
 for name in ('firstCounters','lastCounters'):
  c=d[name]
  if c is not None and (not isinstance(c,dict) or set(c)!=COUNTERS or any(not number(n) for n in c.values())):return None
 return d
def run(folder):
 if folder.is_symlink() or not folder.is_dir():raise ValueError('unsafe_output')
 observation=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8',target_binding(),'/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=255,check=False)
  if p.returncode==0 and len(p.stdout)<=8192:observation=validate(json.loads(p.stdout))
 except (OSError,ValueError,TypeError,subprocess.SubprocessError):pass
 result={'audit':'ALICE_RECONCILIATION_FINITE_READONLY_REPORT','readOnly':True,'observation':observation}
 fd=os.open(folder/'alice_reconciliation_observation.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as file:json.dump(result,file,separators=(',',':'))
 print(json.dumps({'result':observation['state'] if observation else 'unverified'}))
def selftest():
 compile(REMOTE,'<finite-observer>','exec')
 assert '@' in target_binding()
 good=dict(audit='ALICE_RECONCILIATION_FINITE_OBSERVATION',schemaVersion=1,readOnly=True,
   bdsCommandSent=False,clientRestarted=False,worldModified=False,state='no_fresh_samples',
   ownerPid=123,elapsedMs=210000,observations=840,telemetryPresent=True,
   comparisonReasons={'bds_pair_unverified':840},windows=[],firstCounters=None,lastCounters=None,snapshotFailure=None,activityGuardVersion=None)
 assert validate(good)==good
 assert validate({**good,'bdsCommandSent':True}) is None
 assert validate({**good,'position':{'x':1,'y':2,'z':3}}) is None
 assert validate({**good,'elapsedMs':float('nan')}) is None
 print('ALICE_RECONCILE_FINITE_OBSERVER_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--observe':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --observe OUTPUT_DIRECTORY')
