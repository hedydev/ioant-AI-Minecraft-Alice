#!/usr/bin/env python3
"""Only summarize existing Alice 17879 private log model proposals / nav rejections."""
import inspect,json,os,shlex,subprocess,sys
from alice_witness_log_summary import summarize_witness_log, summarize_witness_journal
from pathlib import Path
REMOTE="import json,os,re,subprocess\nfrom pathlib import Path\nroot=Path.home()/'.alice-bedrock-control'\nv={'audit':'ALICE_MODEL_NAVIGATION_LOG','schemaVersion':1,'state':'unverified',\n 'currentOwner':False,'freshStatus':False,'coreState':'unknown','health':None,\n 'independentSamples':None,'independentAgeBand':'unknown',\n 'lastModelTool':'unknown','modelProposalCount':0,\n 'modelFailureCount':0,'navRejectCount':0,'lastNavReject':'unknown',\n 'lastNavRejectDistance':None,'scoutOutcomeCount':0,\n 'serverTravelBetweenPair':None,'deathRecoveryPhase':'unknown','deathRecoveryCycles':None,\n 'clientServerAxisDelta':None,'idleMirrorCount':0,'respawnMirrorCount':0,\n 'lastIdleMirrorDistance':None,'modelObserveWithoutActionCount':0,\n 'lastModelObserveReason':'unknown','verifiedLocalSkillCount':0,\n 'flatRouteChangedCount':0,'modelInferenceInvoked':False,'bdsCommandSent':False}\ntry:\n r=subprocess.run(['/usr/bin/python3',str(Path.home()/'minecraft-ai/scripts/alice-mint.py'),'status'],capture_output=True,text=True,timeout=12,check=False)\n if r.returncode!=0 or len(r.stdout)>20000:raise ValueError('operator_unavailable')\n s=json.loads(r.stdout);pid=s.get('pid')\n if type(pid) is not int or s.get('statusSource')!='current_process':raise ValueError('wrong_owner')\n v['currentOwner']=True;v['freshStatus']=s.get('heartbeatFresh') is True\n p=root/'status.json'\n if p.is_symlink() or not p.is_file() or p.stat().st_uid!=os.getuid() or p.stat().st_mode&0o077 or p.stat().st_size>8192:\n  raise ValueError('unsafe_status')\n d=json.loads(p.read_text())\n if d.get('producerPid')!=pid or d.get('serverPort')!=17879:raise ValueError('wrong_world')\n v['coreState']=d.get('state') if d.get('state') in ('IDLE','SURVIVE','COMBAT','EXPLORE','FOLLOW','RECOVER') else 'unknown'\n recovery=d.get('deathRecovery') or {}\n if recovery.get('phase') in ('respawn_verified','respawn_stalled','respawn_awaiting_ready',\n    'respawn_action_retried_once','waiting_for_server_respawn','alive','none'):\n  v['deathRecoveryPhase']=recovery['phase']\n cy=recovery.get('cycles')\n if type(cy) is int and 0<=cy<=1000000:v['deathRecoveryCycles']=cy\n hp=d.get('health');v['health']=hp if type(hp) in (int,float) and 0<=hp<=20 else None\n e=d.get('movementEvidence') or {}\n n=e.get('independentSamples');v['independentSamples']=n if type(n) is int and 0<=n<=100000000 else None\n a=e.get('independentAt')\n import time\n if type(a) is int:\n  age=(int(time.time()*1000)-a)/1000\n  v['independentAgeBand']='within4s' if 0<=age<=4 else 'within30s' if 0<=age<=30 else 'expired' if age>30 else 'invalid'\n dx=e.get('independentPairTravelBlocks')\n if type(dx) in (int,float) and 0<=dx<=1000:v['serverTravelBetweenPair']=round(dx,3)\n p=d.get('position') or {};q=e.get('independentLatestFeet') or {}\n if all(type(p.get(k)) in (int,float) and type(q.get(k)) in (int,float) for k in ('x','y','z')):\n  v['clientServerAxisDelta']={k:round(p[k]-q[k],3) for k in ('x','y','z')}\n log=Path('/proc')/str(pid)/'fd/1'\n location=log.resolve(strict=True)\n if location.parent!=root or not location.name.startswith('operator-') or location.is_symlink() or location.stat().st_uid!=os.getuid():raise ValueError('unsafe_log')\n with open(location,'rb') as file:\n  file.seek(0,2);size=file.tell();file.seek(max(0,size-250000))\n  tail=file.read(250000).decode('utf-8','replace')\n v['modelProposalCount']=tail.count('[Alice agent] Ollama proposed tool:')\n v['modelFailureCount']=tail.count('[Alice agent] Ollama plan unavailable:')\n v['navRejectCount']=tail.count('[Alice navigation] BDS start rejected:')\n v['scoutOutcomeCount']=tail.count('[Alice exploration] endpoint feedback:')\n v['idleMirrorCount']=tail.count('[Alice movement] safe-idle BDS-local mirror:')\n v['respawnMirrorCount']=tail.count('[Alice movement] respawn BDS-verified LOCAL mirror restored:')\n v['modelObserveWithoutActionCount']=tail.count('[Alice autonomy] model observe without local action:')\n v['verifiedLocalSkillCount']=tail.count('[Alice autonomy] verified local skill after model observation:')\n v['flatRouteChangedCount']=tail.count('flat_route_changed_during_model_planning')\n for line in reversed(tail.splitlines()):\n  if v['lastModelObserveReason']=='unknown' and '[Alice autonomy] model observe without local action:' in line:\n   try:\n    row=json.loads(line.split('model observe without local action:',1)[1])\n    reason=row.get('reason')\n    if reason in ('daylight_required','movement_evidence_cooldown',\n      'no_verified_flat_walk_candidate','no_authorized_skill_for_current_goal',\n      'no_safe_route','flat_route_changed_during_model_planning',\n      'model_unavailable','no_scout_candidate'):\n     v['lastModelObserveReason']=reason\n    else:v['lastModelObserveReason']='other_or_unavailable'\n   except (TypeError,ValueError):pass\n  if v['lastIdleMirrorDistance'] is None and '[Alice movement] safe-idle BDS-local mirror:' in line:\n   try:\n    row=json.loads(line.split('safe-idle BDS-local mirror:',1)[1])\n    correction=row.get('correctionBlocks')\n    if type(correction) in (float,int) and 0.75<correction<=3:\n     v['lastIdleMirrorDistance']=round(correction,3)\n   except (TypeError,ValueError):pass\n  if v['lastModelTool']=='unknown' and '[Alice agent] Ollama proposed tool:' in line:\n   try:\n    x=json.loads(line.split('Ollama proposed tool:',1)[1])\n    if x.get('tool') in ('observe','scout_safe','gather_wood','craft_wooden_sword','adapt_terrain'):\n     v['lastModelTool']=x['tool']\n   except (ValueError,TypeError):pass\n  if v['lastNavReject']=='unknown' and '[Alice navigation] BDS start rejected:' in line:\n   try:\n    x=json.loads(line.split('BDS start rejected:',1)[1])\n    if x.get('reason') in ('scout_client_server_position_diverged','scout_bds_position_unavailable',\n      'scout_client_position_unavailable'):\n     v['lastNavReject']=x['reason']\n     d=x.get('distance')\n     if type(d) in (int,float) and 0<=d<1000:v['lastNavRejectDistance']=round(d,3)\n   except (ValueError,TypeError):pass\n v['state']='observed'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass\nprint(json.dumps(v,separators=(',',':')))\n"
# Embed the reviewed, pure parser into the existing bounded remote read. No
# deployment or client restart is required; both sides share one implementation.
assert "\ntry:\n" in REMOTE and " v['state']='observed'" in REMOTE
REMOTE = REMOTE.replace("\ntry:\n", "\nv.update(summarize_witness_log(''))\ntry:\n", 1)
REMOTE = REMOTE.replace(" v['state']='observed'", " v.update(summarize_witness_log(tail))\n v['state']='observed'", 1)
REMOTE = REMOTE.replace("v.update(summarize_witness_log(''))", "v.update(summarize_witness_log(''))\nv['witnessJournalSummary']=summarize_witness_journal([],None,0)", 1)
_JOURNAL = """ journal_root=root/'acceptance'
 records=[]
 if (journal_root.is_dir() and not journal_root.is_symlink() and
     journal_root.stat().st_uid==os.getuid() and not journal_root.stat().st_mode&0o077):
  for name in ('events.jsonl','events.1.jsonl','events.2.jsonl','events.3.jsonl','events.4.jsonl'):
   file=journal_root/name
   if (file.is_file() and not file.is_symlink() and file.stat().st_uid==os.getuid() and
       not file.stat().st_mode&0o077 and file.stat().st_size<=1048576):
    for line in file.read_text().splitlines():
     if len(line)>4096:continue
     try:records.append(json.loads(line))
     except (ValueError,TypeError):pass
 times=[s.get('processStartAtUnixMs'),e.get('loginAt'),e.get('lifeEpochAt')]
 since=max(t for t in times if type(t) is int) if type(times[0]) is int else None
 v['witnessJournalSummary']=summarize_witness_journal(records,since,int(time.time()*1000))
"""
REMOTE = REMOTE.replace(" v['state']='observed'", _JOURNAL + " v['state']='observed'", 1)
REMOTE = inspect.getsource(summarize_witness_log) + "\n" + inspect.getsource(summarize_witness_journal) + "\n" + REMOTE
FIELDS={'audit','schemaVersion','state','currentOwner','freshStatus','coreState',
'health','independentSamples','independentAgeBand','lastModelTool',
'modelProposalCount','modelFailureCount','navRejectCount','lastNavReject',
'lastNavRejectDistance','scoutOutcomeCount','serverTravelBetweenPair',
'modelInferenceInvoked','bdsCommandSent','deathRecoveryPhase','deathRecoveryCycles','clientServerAxisDelta','idleMirrorCount','respawnMirrorCount','lastIdleMirrorDistance','modelObserveWithoutActionCount','lastModelObserveReason','verifiedLocalSkillCount','flatRouteChangedCount','witnessHandoffCount','lastWitnessHandoff','idleMirrorDeferredCount','lastIdleMirrorDeferred','preparedScoutStartCount','witnessJournalSummary','endpointFeedbackCount','confirmedEndpointCount','unverifiedEndpointCount','waypointFailureCount','lastWaypointFailure','lastCompletedLocalWaypoints','lastLocalTravelEstimate'}
def valid(v):
 if not isinstance(v,dict) or set(v)!=FIELDS or v.get('audit')!='ALICE_MODEL_NAVIGATION_LOG' or v.get('schemaVersion')!=1 or v.get('state') not in ('unverified','observed'):return None
 for k in ('currentOwner','freshStatus','modelInferenceInvoked','bdsCommandSent'):
  if type(v[k]) is not bool:return None
 if v['modelInferenceInvoked'] or v['bdsCommandSent']:return None
 for k in ('modelProposalCount','modelFailureCount','navRejectCount','scoutOutcomeCount','independentSamples','idleMirrorCount','respawnMirrorCount','modelObserveWithoutActionCount','verifiedLocalSkillCount','flatRouteChangedCount','witnessHandoffCount','idleMirrorDeferredCount','preparedScoutStartCount','endpointFeedbackCount','confirmedEndpointCount','unverifiedEndpointCount','waypointFailureCount','lastCompletedLocalWaypoints'):
  if v[k] is not None and (type(v[k]) is not int or not 0<=v[k]<=100000000):return None
 for k in ('health','lastNavRejectDistance','serverTravelBetweenPair','lastIdleMirrorDistance','lastLocalTravelEstimate'):
  if v[k] is not None and (type(v[k]) not in (int,float) or not 0<=v[k]<=1000):return None
 for k in ('coreState','independentAgeBand','lastModelTool','lastNavReject','deathRecoveryPhase','lastModelObserveReason','lastWitnessHandoff','lastIdleMirrorDeferred','lastWaypointFailure'):
  if type(v[k]) is not str or len(v[k])>60:return None
 if v['deathRecoveryCycles'] is not None and (type(v['deathRecoveryCycles']) is not int or not 0<=v['deathRecoveryCycles']<=1000000):return None
 j=v['witnessJournalSummary']
 if not isinstance(j,dict) or set(j)!=set(summarize_witness_journal([],None,0)):return None
 if type(j['verifiedTimeRange']) is not bool:return None
 for k in ('witnessHandoffCount','idleMirrorDeferredCount','preparedScoutStartCount','endpointFeedbackCount','confirmedEndpointCount','unverifiedEndpointCount','waypointFailureCount','lastCompletedLocalWaypoints'):
  if j[k] is not None and (type(j[k]) is not int or not 0<=j[k]<=100000000):return None
 for k in ('lastWitnessHandoff','lastIdleMirrorDeferred','lastWaypointFailure'):
  if type(j[k]) is not str or len(j[k])>60:return None
 if j['lastLocalTravelEstimate'] is not None and (type(j['lastLocalTravelEstimate']) not in (int,float) or not 0<=j['lastLocalTravelEstimate']<=32):return None
 delta=v['clientServerAxisDelta']
 if delta is not None and (not isinstance(delta,dict) or set(delta)!={'x','y','z'} or
     any(type(delta[k]) not in (int,float) or abs(delta[k])>30000000 for k in delta)):return None
 return v
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 v=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=45,check=False)
  if p.returncode==0 and len(p.stdout)<3000:v=valid(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 doc={'audit':'ALICE_MODEL_NAVIGATION_READONLY_REPORT','readOnly':True,'observation':v}
 fd=os.open(out/'alice_model_navigation_log.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(doc,f,separators=(',',':'))
 print(json.dumps({'state':v['state'] if v else 'unverified'}))
def selftest():
 compile(REMOTE,'<remote-alice-model-log>','exec')
 assert "'--once'" not in REMOTE and "'/api/chat'" not in REMOTE
 assert "safe-idle BDS-local mirror:" in REMOTE
 assert "lastIdleMirrorDistance" in REMOTE
 assert "lastModelObserveReason" in REMOTE
 print('ALICE_MODEL_NAVIGATION_READONLY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--read':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR')
