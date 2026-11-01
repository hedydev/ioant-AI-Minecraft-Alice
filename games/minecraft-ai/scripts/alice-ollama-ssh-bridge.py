#!/usr/bin/env python3
"""LaunchAgent for a localhost-only Mac Ollama -> Mint SSH reverse bridge.

No passwords, LAN Ollama listener, BDS changes, model inference, or modifications
to other LaunchAgents. Fail closed, verify from Mint's own localhost endpoint.
"""
import json,os,plistlib,shlex,subprocess,sys,time,urllib.request
from pathlib import Path
HOME=Path.home()
LABEL='com.ioant.alice.ollama-reverse-ssh'
DEST='tedz@192.168.0.104'
LOCAL='http://127.0.0.1:11435'
PLIST=HOME/'Library/LaunchAgents'/f'{LABEL}.plist'
REMOTE=r"""
import json,urllib.request,urllib.error
v={'endpointReachable':False,'configuredModelPresent':False,'gemmaModelPresent':False}
try:
 with urllib.request.urlopen('http://127.0.0.1:11435/api/tags',timeout=4) as response:
  if response.status==200:
   data=json.loads(response.read(300000))
   names={r.get('name') for r in data.get('models',[]) if isinstance(r,dict)}
   v['endpointReachable']=True
   v['configuredModelPresent']='granite4:3b' in names
   v['gemmaModelPresent']='gemma4:26b-a4b' in names
except (OSError,ValueError,TypeError,urllib.error.URLError):pass
print(json.dumps(v,separators=(',',':')))
"""
ARGV=['/usr/bin/ssh','-N','-T','-o','BatchMode=yes',
 '-o','StrictHostKeyChecking=yes','-o','ExitOnForwardFailure=yes',
 '-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3',
 '-o','ConnectTimeout=8','-R','127.0.0.1:11435:127.0.0.1:11435',DEST]
def definition():
 return {'Label':LABEL,'ProgramArguments':ARGV,'RunAtLoad':True,
   'KeepAlive':True,'ThrottleInterval':20,'ProcessType':'Background'}
def local_check():
 try:
  with urllib.request.urlopen(LOCAL+'/api/tags',timeout=4) as r:
   if r.status!=200:return False
   names={m.get('name') for m in json.loads(r.read(300000)).get('models',[]) if isinstance(m,dict)}
   return 'granite4:3b' in names and 'gemma4:26b-a4b' in names
 except (OSError,TypeError,ValueError):return False
def remote_check():
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
     '-o','ConnectTimeout=8',DEST,'/usr/bin/python3 -c '+shlex.quote(REMOTE)],
     capture_output=True,text=True,timeout=19,check=False)
  if p.returncode==0 and len(p.stdout)<400:
   v=json.loads(p.stdout)
   return (v.get('endpointReachable') is True and
     v.get('configuredModelPresent') is True and
     v.get('gemmaModelPresent') is True)
 except (OSError,TypeError,ValueError,subprocess.SubprocessError):pass
 return False
def launchctl(*args,timeout=15):
 return subprocess.run(['/bin/launchctl',*args],capture_output=True,
        text=True,timeout=timeout,check=False).returncode==0
def install():
 result={'audit':'ALICE_OLLAMA_SSH_BRIDGE_INSTALL','schemaVersion':1,
  'state':'blocked','macOllamaReady':False,'mintBridgeVerified':False,
  'launchAgentInstalled':False,'launchAgentEnabled':False,
  'rolledBackOnFailure':False,'bdsRestarted':False,'aliceRestarted':False,
  'worldModified':False,'modelInferenceInvoked':False}
 created=False; bootstrapped=False
 try:
  if sys.platform!='darwin':raise ValueError('wrong_host')
  result['macOllamaReady']=local_check()
  if not result['macOllamaReady']:raise ValueError('mac_ollama_not_ready')
  parent=PLIST.parent
  if parent.is_symlink() or not parent.is_dir() or parent.stat().st_uid!=os.getuid():
   raise ValueError('unsafe_launchagent_directory')
  if PLIST.is_symlink():raise ValueError('unsafe_plist')
  if PLIST.exists():
   if PLIST.stat().st_uid!=os.getuid() or plistlib.loads(PLIST.read_bytes())!=definition():
    raise ValueError('existing_agent_conflict')
   result['launchAgentInstalled']=True
   # Do not bootstrap duplicate instances if a matching agent was present.
   result['mintBridgeVerified']=remote_check()
   result['state']='already_verified' if result['mintBridgeVerified'] else 'existing_unverified'
   return result
  # Avoid taking over a different service bound to Mint's loopback port.
  if remote_check():raise ValueError('remote_listener_already_present')
  domain=f'gui/{os.getuid()}'
  os.umask(0o077)
  fd=os.open(PLIST,os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
  created=True
  with os.fdopen(fd,'wb') as f:
   plistlib.dump(definition(),f)
   f.flush();os.fsync(f.fileno())
  result['launchAgentInstalled']=True
  if not launchctl('bootstrap',domain,str(PLIST),timeout=20):
   raise ValueError('launchd_bootstrap_failed')
  bootstrapped=True
  result['launchAgentEnabled']=True
  # Bounded readiness check: no inference, remote localhost GET /api/tags.
  for _ in range(7):
   if remote_check():
    result['mintBridgeVerified']=True;result['state']='installed_verified'
    break
   time.sleep(1.5)
  if not result['mintBridgeVerified']:raise ValueError('bridge_not_reachable')
 except (OSError,ValueError,TypeError,subprocess.SubprocessError,KeyError):
  if created:
   if bootstrapped:launchctl('bootout',f'gui/{os.getuid()}/{LABEL}',timeout=12)
   try:PLIST.unlink()
   except OSError:pass
   result['rolledBackOnFailure']=True
   result['launchAgentInstalled']=False;result['launchAgentEnabled']=False
 return result
def selftest():
 compile(REMOTE,'<mint-api-tags>','exec')
 assert ARGV[ARGV.index('-R')+1]=='127.0.0.1:11435:127.0.0.1:11435'
 assert 'StrictHostKeyChecking=yes' in ARGV and 'ExitOnForwardFailure=yes' in ARGV
 assert 'PasswordAuthentication=no' not in ARGV
 assert definition()['KeepAlive'] is True
 print('ALICE_OLLAMA_BRIDGE_INSTALL_SELFTEST_PASS')
def main(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 result=install()
 fd=os.open(out/'alice_ollama_ssh_bridge.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'))
 print(json.dumps({'state':result['state'],'mintBridgeVerified':result['mintBridgeVerified']}))
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--install':main(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --install OUTPUT_DIR')
