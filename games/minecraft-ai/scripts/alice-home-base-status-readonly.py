#!/usr/bin/env python3
"""Read owner-verified current 17879 HOME candidate, door and bed evidence; no queries."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,os,re,subprocess,time
from pathlib import Path
root=Path.home()/'.alice-bedrock-control'
status_tool=Path.home()/'minecraft-ai/scripts/alice-mint.py'
out={'state':'unverified','connected':False,'health':None,
 'phase':'unknown','canSleep':None,'rememberedBeds':None,
 'sleepOpportunity':'unknown','lastBedFailure':'unknown',
 'nightSurvival':'unknown','idleGate':'unknown',
 'hasFollowTarget':False,'jobActive':False,
 'homeStatus':'unknown','homeLastSurvey':'unknown','homeLastReason':'unknown',
 'doorKnown':False,'exitVerified':False,'returnVerified':False,
 'personalBedStatus':'unknown','lastSpawnpointReason':'unknown',
 'homeCandidateFresh':False,'homeLastAgeSeconds':None,
 'lastBedReach':'unknown','lastPositionGate':'unknown',
 'homeAgenda':'unknown','homeAgendaReason':'unknown',
 'bedApproachStatus':'unknown','bedApproachSteps':None,
 'bedStepStatus':'unknown','bedStepReason':'unknown',
 'bedStepAttempted':False,'bedStepBdsVerified':False}
try:
 p=subprocess.run(['/usr/bin/python3',str(status_tool),'status'],capture_output=True,text=True,timeout=12,check=False)
 if p.returncode!=0 or len(p.stdout)>20000:raise ValueError('status')
 t=json.loads(p.stdout)
 f=root/'status.json'
 if f.is_symlink() or not f.is_file() or f.stat().st_uid!=os.getuid() or f.stat().st_mode&0o077 or f.stat().st_size>8192:raise ValueError('status_file')
 d=json.loads(f.read_text())
 if d.get('producerPid')!=t.get('pid') or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879:raise ValueError('owner')
 w=d.get('worldRoutine') or {}
 out['state']='observed'
 out['connected']=d.get('connected') is True and d.get('sessionEstablished') is True
 x=d.get('health')
 if type(x) in (float,int) and 0<=x<=20:out['health']=round(x,1)
 if w.get('phase') in ('day','dusk','night','dawn','unknown'):out['phase']=w['phase']
 if type(w.get('canSleep')) is bool:out['canSleep']=w['canSleep']
 n=(w.get('rememberedBeds') or {}).get('knownBeds')
 if type(n) is int and 0<=n<=32:out['rememberedBeds']=n
 for key,field in [('sleepOpportunity','sleepOpportunity'),('lastBedFailure','lastBedFailure'),
                   ('nightSurvival','nightSurvival')]:
  a=w.get(field)
  if isinstance(a,dict):
   v=a.get('status') or a.get('reason')
   if isinstance(v,str) and re.fullmatch('[A-Za-z0-9_]{1,75}',v):out[key]=v
  elif a is None:out[key]='none'
 a=w.get('idleGate')
 if isinstance(a,str) and re.fullmatch('[A-Za-z0-9_]{1,75}',a):out['idleGate']=a
 for src,target in [((w.get('homeBase') or {}).get('status'),'homeStatus'),
                    ((w.get('homeBase') or {}).get('lastSurvey'),'homeLastSurvey'),
                    ((w.get('homeBase') or {}).get('lastReason'),'homeLastReason'),
                    ((w.get('homeBed') or {}).get('status'),'personalBedStatus'),
                    ((w.get('lastSpawnpointAttempt') or {}).get('reason'),'lastSpawnpointReason'),
                    ((w.get('lastSpawnpointAttempt') or {}).get('bedReach'),'lastBedReach'),
                    ((w.get('lastSpawnpointAttempt') or {}).get('positionGate'),'lastPositionGate'),
                    ((w.get('homeAgenda') or {}).get('objective'),'homeAgenda'),
                    ((w.get('homeAgenda') or {}).get('reason'),'homeAgendaReason')]:
  if isinstance(src,str) and re.fullmatch('[a-z0-9_]{2,75}',src):out[target]=src
 a=w.get('bedApproach') or {}
 if a.get('status') in ('observed_route_candidate','already_in_reach','blocked'):
  out['bedApproachStatus']=a['status']
 if type(a.get('steps')) is int and 0<=a['steps']<=160:
  out['bedApproachSteps']=a['steps']
 action=w.get('bedApproachAction') or {}
 if action.get('status') in ('starting','blocked','unverified','verified'):
  out['bedStepStatus']=action['status']
 if isinstance(action.get('reason'),str) and re.fullmatch('[a-z0-9_]{2,75}',action['reason']):
  out['bedStepReason']=action['reason']
 out['bedStepAttempted']=action.get('attempted') is True
 out['bedStepBdsVerified']=action.get('serverMovementVerified') is True
 a=w.get('homeBase') or {}
 at=a.get('lastObservedAt')
 if type(at) is int and at>0:
  elapsed=int(time.time()*1000)-at
  if 0<=elapsed<=86400000:
   out['homeLastAgeSeconds']=elapsed//1000
   out['homeCandidateFresh']=elapsed<=45000 and a.get('lastSurvey')=='observed_indoor_home_candidate'
 out['doorKnown']=isinstance(a.get('door'),dict) and all(type(a['door'].get(k)) is int for k in ('x','y','z'))
 out['exitVerified']=a.get('exitVerified') is True
 out['returnVerified']=a.get('returnVerified') is True
 out['hasFollowTarget']=bool(d.get('followTarget'))
 out['jobActive']=bool(d.get('job'))
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass
print(json.dumps(out,separators=(',',':')))
"""
def validate(x):
    keys={'state','connected','health','phase','canSleep','rememberedBeds','sleepOpportunity','lastBedFailure','nightSurvival','idleGate','hasFollowTarget','jobActive','homeStatus','homeLastSurvey','homeLastReason',
          'doorKnown','exitVerified','returnVerified','personalBedStatus',
          'lastSpawnpointReason','homeAgenda','homeAgendaReason',
          'homeCandidateFresh','homeLastAgeSeconds','lastBedReach','lastPositionGate',
          'bedApproachStatus','bedApproachSteps','bedStepStatus','bedStepReason','bedStepAttempted','bedStepBdsVerified'}
    if not isinstance(x,dict) or set(x)!=keys or x['state'] not in ('observed','unverified'):return None
    return x
def run(out):
    d=Path(out)
    if d.is_symlink() or not d.is_dir():raise ValueError('out')
    obs=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=32,check=False)
        if p.returncode==0 and len(p.stdout)<=1800:obs=validate(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    data={'audit':'ALICE_EXISTING17879_HOME_READONLY','schemaVersion':1,'readOnly':True,'worldModified':False,'querytargetSent':False,'observation':obs}
    fd=os.open(d/'alice_home_current.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(data,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':obs['state'] if obs else 'unavailable'}))
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        assert 'homeCandidateFresh' in REMOTE and 'lastBedReach' in REMOTE
        assert 'lastPositionGate' in REMOTE and 'querytarget(' not in REMOTE
        assert 'bedApproachStatus' in REMOTE and 'bedApproachSteps' in REMOTE
        assert 'bedStepBdsVerified' in REMOTE and 'bedStepStatus' in REMOTE
        print('ALICE_HOME_READONLY_SELFTEST_PASS')
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
