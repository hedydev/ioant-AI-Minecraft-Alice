#!/usr/bin/env python3
"""Read-only current Alice-owned log and outbound transport counters (no chat, positions or secrets)."""
import os,json,shlex,subprocess,sys
from pathlib import Path
REMOTE="\nimport json,os,re,subprocess,time\nfrom pathlib import Path\nroot=Path.home()/'.alice-bedrock-control'\nout={'state':'unverified','deathLogs':0,'respawnVerifiedLogs':0,'navigationRejects':0,'latestNavigationReason':None,'latestNavigationDistance':None,'followActiveLogs':0,'pathRepathLogs':0,'latestFollowBlockReason':None,'input':{}}\ntry:\n proc=subprocess.run(['/usr/bin/python3',str(Path.home()/'minecraft-ai/scripts/alice-mint.py'),'status'],capture_output=True,text=True,timeout=12)\n if proc.returncode or len(proc.stdout)>20000:raise ValueError('status')\n op=json.loads(proc.stdout);pid=op.get('pid')\n if op.get('statusSource')!='current_process' or type(pid) is not int or pid<1:raise ValueError('owner')\n link=(Path('/proc')/str(pid)/'fd'/'1')\n log=link.resolve(strict=True)\n if log.parent!=root or not log.name.startswith('operator-') or log.is_symlink():raise ValueError('log')\n st=log.stat()\n if not log.is_file() or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('log_mode')\n with log.open('rb') as f:\n  f.seek(max(0,st.st_size-240000));s=f.read(240000).decode('utf8','replace')\n for line in s.splitlines():\n  if '[Alice life] death observed:' in line:out['deathLogs']+=1\n  if '[Alice life] respawn recovery:' in line and '\"phase\":\"respawn_verified\"' in line:out['respawnVerifiedLogs']+=1\n  if '[Alice follow] active target' in line:out['followActiveLogs']+=1\n  if '[Alice follow] non-destructive re-path' in line:out['pathRepathLogs']+=1\n  if '[Alice navigation] BDS start rejected:' in line:\n   out['navigationRejects']+=1\n   m=re.search(r'\\{[^{}\\r\\n]{2,300}\\}',line)\n   if m:\n    v=json.loads(m.group())\n    reason=v.get('reason')\n    if isinstance(reason,str) and re.fullmatch('[a-z_]{3,75}',reason):out['latestNavigationReason']=reason\n    distance=v.get('distance')\n    if type(distance) in (int,float) and 0<=distance<=100000:out['latestNavigationDistance']=round(distance,2)\n  if '[Alice follow] repeated no progress' in line:out['latestFollowBlockReason']='follow_progress_hold'\n  if '[Alice follow] outside follow radius without valid progress' in line:out['latestFollowBlockReason']='stalled_no_progress'\n audit=root/'outbound-input-audit.json'\n if audit.is_file() and not audit.is_symlink() and audit.stat().st_uid==os.getuid() and audit.stat().st_mode&0o077==0 and audit.stat().st_size<8192:\n  d=json.loads(audit.read_text())\n  for k in ('queued','movingQueued','movingLast10s','serialized','serializationErrors','transportCalls','transportThrows','corrections','lastTickStep','tickVsExpectedWallTick','pendingPacketBuffers','maxConsecutiveMovingTicks','analogCompatCorrected'):\n   v=d.get(k)\n   if type(v) is int and abs(v)<1000000000:out['input'][k]=v\n  for k in ('transportHookState','correctionTickShape','serializedMovingPayloadShape'):\n   v=d.get(k)\n   if isinstance(v,str) and re.fullmatch('[A-Za-z_0-9]{1,55}',v):out['input'][k]=v\n out['state']='observed'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass\nprint(json.dumps(out,separators=(',',':')))\n"
def run(dir):
 p=Path(dir)
 if p.is_symlink() or not p.is_dir():raise ValueError('unsafe dir')
 result=None
 try:
  a=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=45)
  if a.returncode==0 and len(a.stdout)<3500:result=json.loads(a.stdout)
 except (OSError,ValueError,subprocess.SubprocessError):pass
 report={'audit':'ALICE_FOLLOW_TRANSPORT_RECOVERY','schemaVersion':1,'readOnly':True,'noGameCommands':True,'observation':result}
 fd=os.open(p/'transport_recovery.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
 print(json.dumps({'state':result.get('state') if isinstance(result,dict) else 'unavailable'}))
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:
  assert 'navigationRejects' in REMOTE and 'respawnVerifiedLogs' in REMOTE
  print('ALICE_FOLLOW_TRANSPORT_SELFTEST_PASS')
 elif len(sys.argv)==3 and sys.argv[1]=='--read':run(sys.argv[2])
 else:raise SystemExit('usage')
