#!/usr/bin/env python3
"""Read currently verified Alice day/weather before any new physical operation."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="\nimport json,os,time,subprocess,re\nfrom pathlib import Path\nroot=Path.home()/'.alice-bedrock-control'\na={'state':'unavailable','phase':None,'tick':None,'weather':None,'health':None,'food':None,\n 'serverPortCorrect':False,'coreState':None,'connected':False,'hasFollowIntent':False,\n 'lastProbeReason':None,'nearbyHostileCount':None}\ntry:\n p=subprocess.run(['/usr/bin/python3',str(Path.home()/'minecraft-ai/scripts/alice-mint.py'),'status'],capture_output=True,text=True,timeout=12)\n if p.returncode or len(p.stdout)>20000:raise ValueError('operator')\n op=json.loads(p.stdout)\n if op.get('statusSource')!='current_process':raise ValueError('owner')\n f=root/'status.json';st=f.stat()\n if f.is_symlink() or st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>8192:raise ValueError('file')\n d=json.loads(f.read_text())\n if d.get('producerPid')!=op.get('pid') or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879:raise ValueError('wrong_world')\n a['state']='observed';a['serverPortCorrect']=True\n a['connected']=d.get('connected') is True;a['hasFollowIntent']=d.get('followTarget') is not None\n a['coreState']=d.get('state') if d.get('state') in ('IDLE','SURVIVE','FOLLOW','EXPLORE') else 'other'\n e=d.get('worldRoutine') or {}\n a['phase']=e.get('phase') if e.get('phase') in ('day','night','dawn','dusk','unknown') else 'unknown'\n a['weather']=e.get('weather') if e.get('weather') in ('clear','rain','thunder') else 'unknown'\n if type(e.get('tick')) in (int,float) and 0<=e['tick']<=24000:a['tick']=round(e['tick'])\n for x in ('health','food'):\n  v=d.get(x)\n  if type(v) in (int,float) and 0<=v<=20:a[x]=v\n r=root/'command-result.json'\n if r.is_file() and not r.is_symlink() and r.stat().st_uid==os.getuid() and r.stat().st_mode&0o077==0 and r.stat().st_size<4096:\n  v=json.loads(r.read_text())\n  if v.get('action')=='probe_step' and isinstance(v.get('reason'),str) and re.fullmatch('[a-z][a-z0-9_]{0,70}',v['reason']):\n   a['lastProbeReason']=v['reason']\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass\nprint(json.dumps(a,separators=(',',':')))\n"
def main(directory):
 out=Path(directory)
 if out.is_symlink() or not out.is_dir():raise ValueError('output')
 result=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=45)
  if p.returncode==0 and len(p.stdout)<1800:result=json.loads(p.stdout)
 except (OSError,ValueError,subprocess.SubprocessError):pass
 fd=os.open(out/'probe_env.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump({'audit':'ALICE_PROBE_ENV_READONLY','readOnly':True,'noGameCommands':True,'observation':result},f,separators=(',',':'));f.write('\n')
 print(json.dumps({'state':result.get('state') if isinstance(result,dict) else 'unavailable'}))
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:
  assert 'worldRoutine' in REMOTE
  print('ALICE_PROBE_ENV_SELFTEST_PASS')
 elif len(sys.argv)==3 and sys.argv[1]=='--read':main(sys.argv[2])
 else:raise SystemExit('usage')
