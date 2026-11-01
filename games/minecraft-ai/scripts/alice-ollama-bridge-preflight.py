#!/usr/bin/env python3
"""Read-only Mac Ollama loopback availability + Mint SSH forward destination check.
Does not launch processes, send model inference or disclose network identities.
"""
import json,os,shlex,subprocess,sys,urllib.request,urllib.error
from pathlib import Path
REMOTE="import json,os,socket,subprocess,time,urllib.request,urllib.error\nfrom pathlib import Path\nout={'state':'unverified','mintPort11435':'unknown','mintHasOllamaServer':False,\n'mintHasListeningLoopback11435':False,'sshServerAllowsForwarding':'unknown',\n'bdsCommandSent':False,'changedConfig':False}\ntry:\n import re\n p=subprocess.run(['/usr/bin/ss','-ltn'],capture_output=True,text=True,timeout=6)\n if p.returncode==0:\n  found=[line for line in p.stdout.splitlines() if ':11435' in line and 'LISTEN' in line]\n  out['mintHasListeningLoopback11435']=any(\n    '127.0.0.1:11435' in line or '[::1]:11435' in line for line in found)\n  out['mintPort11435']='occupied' if found else 'available'\n try:\n  with urllib.request.urlopen('http://127.0.0.1:11435/api/tags',timeout=2) as r:\n   if r.status==200:out['mintHasOllamaServer']=True\n except (OSError,ValueError,urllib.error.URLError):pass\n cfg=Path('/etc/ssh/sshd_config')\n if cfg.exists() and cfg.is_file() and cfg.stat().st_size<65000:\n  # reading effective sshd config via sshd -T is not required for preflight.\n  txt=cfg.read_text()\n  a=re.findall(r'(?im)^\\s*AllowTcpForwarding\\s+(\\w+)',txt)\n  out['sshServerAllowsForwarding']=('allowed_by_file' if a and a[-1].lower() in ('yes','all','remote')\n       else 'blocked_by_file' if a and a[-1].lower() in ('no','local') else 'not_specified')\n out['state']='observed'\nexcept (OSError,ValueError,subprocess.SubprocessError):pass\nprint(json.dumps(out,separators=(',',':')))\n"
def tags():
 result={'state':'unavailable','macOllamaReachable':False,
 'configuredModelPresent':False,'gemmaPrimaryPresent':False,'otherModelsCount':None}
 try:
  with urllib.request.urlopen('http://127.0.0.1:11435/api/tags',timeout=5) as r:
   if r.status!=200:return result
   data=json.loads(r.read(400000))
   names=[x.get('name') for x in data.get('models',[]) if isinstance(x,dict)]
   result.update(state='observed',macOllamaReachable=True,
    configuredModelPresent='granite4:3b' in names,
    gemmaPrimaryPresent='gemma4:26b-a4b' in names,
    otherModelsCount=len(names))
 except (OSError,ValueError,TypeError,urllib.error.URLError):pass
 return result
def mint():
 record=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
   '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
   'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
   capture_output=True,text=True,timeout=25,check=False)
  if p.returncode==0 and len(p.stdout)<900:
   x=json.loads(p.stdout)
   if (x.get('state')=='observed' and x.get('mintPort11435') in ('available','occupied') and
       x.get('bdsCommandSent') is False and x.get('changedConfig') is False):
    record=x
 except (OSError,ValueError,subprocess.SubprocessError):pass
 return record
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 result={'audit':'ALICE_OLLAMA_BRIDGE_PREFLIGHT','readOnly':True,
 'mac':tags(),'mint':mint(),'modelInferenceInvoked':False,'serverModified':False}
 fd=os.open(out/'alice_ollama_bridge_preflight.json',
  os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'))
 print(json.dumps({'state':'observed' if result['mac']['macOllamaReachable'] and result['mint'] else 'partial'}))
def selftest():
 compile(REMOTE,'<mint-bridge-preflight>','exec')
 assert "'/api/chat'" not in REMOTE and 'ssh -R' not in REMOTE
 print('ALICE_OLLAMA_BRIDGE_PREFLIGHT_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
