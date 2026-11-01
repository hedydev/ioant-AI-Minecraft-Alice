#!/usr/bin/env python3
"""Read-only private Alice 17879 mirror success and bounded reason counters.

Never sends BDS commands or model requests. No coordinates or personal data.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import json,os,subprocess,re\nfrom pathlib import Path\nh=Path.home();root=h/'.alice-bedrock-control'\nout={'audit':'ALICE_IDLE_MIRROR_REASONS','schemaVersion':1,\n'state':'unverified','ownerVerified':False,'clientConnected':False,\n'freshHeartbeat':False,'statusIndependentSamples':None,\n'logReadable':False,'deferredEvents':0,'acceptedMirrors':0,\n'lastDeferredReason':'unknown','lastDeferredState':'unknown',\n'modelPlannerProposals':0,'bdsCommandSent':False,'aliceRestarted':False}\nreasons={'idle_mirror_missing_state','idle_mirror_safety_gate','idle_mirror_cooldown',\n 'already_aligned','scout_bds_position_unavailable','scout_client_position_unavailable',\n 'scout_client_server_position_diverged','idle_mirror_not_stationary_same_life',\n 'idle_mirror_no_server_position','idle_mirror_delta_out_of_bound'}\nstates={'IDLE','SURVIVE','COMBAT','FOLLOW','EXPLORE','RECOVER','SLEEP','other'}\ntry:\n p=subprocess.run(['/usr/bin/python3',str(h/'minecraft-ai/scripts/alice-mint.py'),'status'],\n  capture_output=True,text=True,timeout=15,check=False)\n if p.returncode or len(p.stdout)>22000:raise ValueError('status unavailable')\n s=json.loads(p.stdout)\n if (s.get('statusSource')!='current_process' or s.get('processAlive') is not True or\n     type(s.get('pid')) is not int or s.get('world') not in (None,'Bedrock level') or\n     s.get('serverPort') not in (None,17879)):\n  raise ValueError('unverified process')\n out['freshHeartbeat']=s.get('heartbeatFresh') is True\n out['clientConnected']=s.get('reportedConnected') is True and s.get('sessionEstablished') is True\n status=root/'status.json'\n if status.is_symlink() or not status.is_file() or status.stat().st_uid!=os.getuid() or status.stat().st_mode&0o077 or status.stat().st_size>8192:\n  raise ValueError('unverified status')\n d=json.loads(status.read_text())\n if d.get('producerPid')!=s['pid'] or d.get('serverPort')!=17879 or d.get('world')!='Bedrock level':\n  raise ValueError('unverified status producer')\n out['ownerVerified']=True\n n=(d.get('movementEvidence') or {}).get('independentSamples')\n if type(n) is int and 0<=n<=100000000:out['statusIndependentSamples']=n\n link=Path('/proc')/str(s['pid'])/'fd/1'\n resolved=link.resolve(strict=True)\n if resolved.parent!=root or not resolved.name.startswith('operator-') or resolved.is_symlink() or resolved.stat().st_uid!=os.getuid():\n  raise ValueError('unverified private log')\n with resolved.open('rb') as f:\n  f.seek(0,2);size=f.tell();f.seek(max(0,size-250000))\n  tail=f.read(250000).decode('utf-8','replace')\n out['logReadable']=True\n marker='[Alice movement] safe-idle BDS-local mirror deferred:'\n success='[Alice movement] safe-idle BDS-local mirror:'\n out['acceptedMirrors']=min(100000,tail.count(success))\n out['modelPlannerProposals']=min(100000,tail.count('[Alice agent] Ollama proposed tool:'))\n events=tail.splitlines()\n for line in events:\n  if marker not in line:continue\n  out['deferredEvents']=min(100000,out['deferredEvents']+1)\n  try:\n   row=json.loads(line.split(marker,1)[1])\n   reason=row.get('reason');state=row.get('state')\n   if reason in reasons and state in states and row.get('correctionApplied') is False:\n    out['lastDeferredReason']=reason;out['lastDeferredState']=state\n  except (ValueError,TypeError,AttributeError):pass\n out['state']='observed'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass\nprint(json.dumps(out,separators=(',',':')))\n"
KEYS={'audit','schemaVersion','state','ownerVerified','clientConnected',
'freshHeartbeat','statusIndependentSamples','logReadable','deferredEvents',
'acceptedMirrors','lastDeferredReason','lastDeferredState',
'modelPlannerProposals','bdsCommandSent','aliceRestarted'}
def validate(x):
 if not isinstance(x,dict) or set(x)!=KEYS or x.get('audit')!='ALICE_IDLE_MIRROR_REASONS' or x.get('schemaVersion')!=1 or x.get('state') not in ('observed','unverified'):
  return None
 for k in ('ownerVerified','clientConnected','freshHeartbeat','logReadable','bdsCommandSent','aliceRestarted'):
  if type(x[k]) is not bool:return None
 if x['bdsCommandSent'] or x['aliceRestarted']:return None
 for k in ('deferredEvents','acceptedMirrors','modelPlannerProposals','statusIndependentSamples'):
  if x[k] is not None and (type(x[k]) is not int or not 0<=x[k]<=100000000):return None
 for k in ('lastDeferredReason','lastDeferredState'):
  if type(x[k]) is not str or len(x[k])>70:return None
 return x
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 observation=None
 try:
  cmd=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104',
    '/usr/bin/python3 -c '+shlex.quote(REMOTE)]
  p=subprocess.run(cmd,capture_output=True,text=True,timeout=50,check=False)
  if p.returncode==0 and len(p.stdout)<=1200:
   observation=validate(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 row={'audit':'ALICE_IDLE_MIRROR_REASONS_READONLY','schemaVersion':1,
      'readOnly':True,'observation':observation}
 fd=os.open(out/'alice_idle_mirror_reasons.json',
   os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(row,f,separators=(',',':'))
 print(json.dumps({'state':observation['state'] if observation else 'unavailable'}))
def selftest():
 compile(REMOTE,'<mint-verified-idle-mirror-audit>','exec')
 assert 'safe-idle BDS-local mirror deferred:' in REMOTE
 assert "'--once'" not in REMOTE and "'--restart'" not in REMOTE
 sample={'audit':'ALICE_IDLE_MIRROR_REASONS','schemaVersion':1,'state':'observed',
 'ownerVerified':True,'clientConnected':True,'freshHeartbeat':True,
 'statusIndependentSamples':2,'logReadable':True,'deferredEvents':2,
 'acceptedMirrors':0,'lastDeferredReason':'idle_mirror_safety_gate',
 'lastDeferredState':'COMBAT','modelPlannerProposals':1,
 'bdsCommandSent':False,'aliceRestarted':False}
 assert validate(sample)==sample
 assert validate({**sample,'bdsCommandSent':True}) is None
 print('ALICE_IDLE_MIRROR_READONLY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--read':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR')
