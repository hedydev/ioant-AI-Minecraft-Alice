#!/usr/bin/env python3
"""Owner-verified read-only snapshot of existing 17879 Alice autonomy gate."""
import json,os,re,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,os,subprocess,time,re
from pathlib import Path
home=Path.home();root=home/'.alice-bedrock-control';script=home/'minecraft-ai/scripts/alice-mint.py'
out={'state':'unverified','aliceConnected':False,'sessionEstablished':False,
 'autonomyEnabled':None,'agentMode':'unknown','coreState':'unknown','health':None,
 'food':None,'hasCurrentJob':None,'idleHoldReason':'unavailable',
 'worldRoutineIdleGate':'unavailable','lastDecisionAction':'unavailable',
 'lastDecisionReason':'unavailable','nightSurvivalReason':'unavailable',
 'independentSamples':None,'independentFreshPair':False,
 'independentPairTravelBlocks':None,'movingQueued':None}
def safe(s):
 return s if isinstance(s,str) and re.fullmatch('[A-Za-z0-9_ -]{1,64}',s) else 'unavailable'
try:
 proc=subprocess.run(['/usr/bin/python3',str(script),'status'],
     capture_output=True,text=True,timeout=12,check=False)
 if proc.returncode!=0:raise ValueError('no_status')
 s=json.loads(proc.stdout)
 if s.get('statusSource')!='current_process':raise ValueError('wrong_status_owner')
 p=root/'status.json'
 if p.is_symlink() or not p.is_file() or p.stat().st_uid!=os.getuid() or p.stat().st_mode&0o077 or p.stat().st_size>8192:
  raise ValueError('unsafe_status')
 d=json.loads(p.read_text(encoding='utf-8'))
 if d.get('producerPid')!=s.get('pid') or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879:
  raise ValueError('not_production_session')
 out['state']='observed'
 out['aliceConnected']=d.get('connected') is True
 out['sessionEstablished']=d.get('sessionEstablished') is True
 settings=d.get('settings') or {}
 out['autonomyEnabled']=settings.get('autonomyEnabled') if type(settings.get('autonomyEnabled')) is bool else None
 out['agentMode']=safe(settings.get('agentMode'))
 out['coreState']=safe(d.get('state'))
 for k in ('health','food'):
  v=d.get(k)
  if type(v) in (int,float) and 0<=v<=20:out[k]=round(v,1)
 out['hasCurrentJob']=type(d.get('job')) is str if d.get('job') is not None else False
 wr=d.get('worldRoutine') or {}
 h=wr.get('idleHold') or {}
 out['idleHoldReason']=safe(h.get('reason'))
 out['worldRoutineIdleGate']=safe(wr.get('idleGate'))
 dec=wr.get('decision') or {}
 out['lastDecisionAction']=safe(dec.get('action'))
 out['lastDecisionReason']=safe(dec.get('reason'))
 night=wr.get('nightSurvival') or {}
 out['nightSurvivalReason']=safe(night.get('reason'))
 m=d.get('movementEvidence') or {}
 n=m.get('independentSamples')
 if type(n) is int and 0<=n<100000000:out['independentSamples']=n
 now=int(time.time()*1000)
 a,b=m.get('independentAt'),m.get('independentPreviousAt')
 out['independentFreshPair']=(type(a) is int and type(b) is int and 0<b<a<=now and now-b<=4000)
 t=m.get('independentPairTravelBlocks')
 if type(t) in (int,float) and 0<=t<32:out['independentPairTravelBlocks']=t
 audit=root/'outbound-input-audit.json'
 if audit.is_file() and not audit.is_symlink() and audit.stat().st_uid==os.getuid() and audit.stat().st_mode&0o077==0 and audit.stat().st_size<8192:
  a=json.loads(audit.read_text())
  v=a.get('movingQueued')
  if type(v) is int and 0<=v<1000000000:out['movingQueued']=v
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass
print(json.dumps(out,separators=(',',':')))
"""
def run(output):
    out=Path(output)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    obs=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',
          'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=40,check=False)
        if p.returncode==0 and len(p.stdout)<1600:obs=json.loads(p.stdout)
    except (OSError,ValueError,subprocess.SubprocessError):pass
    valid=obs if isinstance(obs,dict) and obs.get('state') in ('observed','unverified') and len(obs)==18 else None
    result={'audit':'ALICE_17879_RUNTIME_GATE_DIAG','schemaVersion':1,'readOnly':True,
      'bdsCommandSent':False,'aliceRestarted':False,'observation':valid}
    fd=os.open(out/'alice_gate_diag.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':valid['state'] if valid else 'unavailable'}))
def selftest():
    assert "d.get('serverPort')!=17879" in REMOTE
    assert "m.get('independentSamples')" in REMOTE
    print('ALICE_RUNTIME_GATE_DIAG_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
