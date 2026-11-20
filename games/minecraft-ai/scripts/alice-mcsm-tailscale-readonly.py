#!/usr/bin/env python3
"""Read-only Mac/Mint Tailscale and MCSManager port 23333 diagnostic.

Never logs Tailscale auth state, user IDs, peer names or private configuration.
"""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

REMOTE = r'''
import json,os,shutil,socket,subprocess,sys,time
from pathlib import Path
PORT=23333
def call(argv,secs=5):
 try:
  p=subprocess.run(argv,capture_output=True,text=True,timeout=secs,check=False)
  return (p.returncode,p.stdout[:300000])
 except (OSError,subprocess.SubprocessError):
  return (None,'')
def tailscale():
 binary=shutil.which('tailscale')
 if not binary:
  for name in ('/opt/homebrew/bin/tailscale','/usr/local/bin/tailscale',
   '/Applications/Tailscale.app/Contents/MacOS/Tailscale','/usr/bin/tailscale'):
   if Path(name).is_file() and os.access(name,os.X_OK):
    binary=name;break
 if not binary:return {'available':False,'backend':'unknown','selfIPv4':[],
                        'peerCount':None,'peerIPv4':[]}
 rc,s=call([binary,'status','--json'],6)
 if rc!=0:return {'available':True,'backend':'unavailable','selfIPv4':[],
                   'peerCount':None,'peerIPv4':[]}
 try:
  d=json.loads(s);v=d.get('Self') or {}
  peers=list((d.get('Peer') or {}).values())
  def valid_ips(z):
   return [ip for ip in z if isinstance(ip,str) and ip.startswith('100.')
           and len(ip)<18 and len(ip.split('.'))==4]
  return {'available':True,'backend':str(d.get('BackendState','unknown'))[:30],
          'selfIPv4':valid_ips(v.get('TailscaleIPs') or []),
          'peerCount':len(peers),
          'peerIPv4':sorted(set(ip for peer in peers for ip in
                               valid_ips(peer.get('TailscaleIPs') or [])))[:25]}
 except (ValueError,TypeError,AttributeError):
  return {'available':True,'backend':'unparseable','selfIPv4':[],
          'peerCount':None,'peerIPv4':[]}
def tcp(host):
 try:
  s=socket.create_connection((host,PORT),timeout=3)
  s.settimeout(3)
  s.sendall(b'GET / HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n')
  line=b''
  while len(line)<160:
   c=s.recv(1)
   if not c or c==b'\n':break
   line+=c
  s.close()
  status=line.decode('ascii','replace').strip().split()
  return {'connected':True,'httpStatus':int(status[1]) if (
      len(status)>=2 and status[0].startswith('HTTP/') and status[1].isdigit()) else None,
      'error':'none'}
 except ConnectionRefusedError:
  return {'connected':False,'httpStatus':None,'error':'connection_refused'}
 except socket.timeout:
  return {'connected':False,'httpStatus':None,'error':'timeout'}
 except (socket.gaierror,OSError):
  return {'connected':False,'httpStatus':None,'error':'network_unreachable_or_other'}
def listener():
 rc,s=call(['ss','-H','-ltn'],5)
 if rc!=0:return {'available':False,'bindings':[]}
 found=[]
 for ln in s.splitlines():
  parts=ln.split()
  if len(parts)<5:continue
  local=parts[3]
  if local.endswith(':'+str(PORT)) and len(local)<100:
   found.append(local)
 return {'available':True,'bindings':sorted(set(found))[:12]}
def sysstate(name):
 rc,s=call(['systemctl','is-active',name],4)
 if rc is None:return 'unknown'
 v=s.strip()
 return v if v in ('active','inactive','failed','activating','deactivating') else 'other'
def route():
 if sys.platform=='linux':
  rc,s=call(['ip','route','get','100.64.0.1'],3)
  if rc==0 and ' dev ' in s:
   return s.split(' dev ',1)[1].split()[0][:32]
 return None
ts=tailscale()
local={'loopback':tcp('127.0.0.1')}
for ip in ts['selfIPv4'][:2]:local['tailSelf_'+ip]=tcp(ip)
if sys.platform=='darwin':local['mintLan']=tcp('192.168.0.104')
report={'node':'mint' if sys.platform=='linux' else 'mac',
 'tailscale':ts,'port23333':local,'listeners':listener() if sys.platform=='linux' else None,
 'services':{x:sysstate(x) for x in ('tailscaled','mcsm-web','mcsmanager-web',
    'mcsm-daemon','mcsmanager-daemon')} if sys.platform=='linux' else {},
 'routeDevice':route(),'readOnly':True}
print(json.dumps(report,separators=(',',':')))
'''
def run(out):
    output=Path(out)
    if not output.is_dir() or output.is_symlink():
        raise ValueError("unsafe_output")
    result={'audit':'MCSMANAGER_23333_TAILSCALE_READONLY',
            'schemaVersion':1,'readOnly':True,
            'mac':None,'mint':None,'sshMint':'unavailable'}
    try:
        p=subprocess.run([sys.executable,'-c',REMOTE],capture_output=True,
            text=True,timeout=36,check=False)
        if p.returncode==0 and len(p.stdout)<=20000:
            d=json.loads(p.stdout)
            if d.get('node')=='mac' and d.get('readOnly') is True:
                result['mac']=d
    except (OSError,ValueError,subprocess.SubprocessError):pass
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
            'tedz@192.168.0.104',
            '/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=35,check=False)
        result['sshMint']='reachable' if p.returncode==0 else 'unavailable'
        if p.returncode==0 and len(p.stdout)<=20000:
            d=json.loads(p.stdout)
            if d.get('node')=='mint' and d.get('readOnly') is True:
                result['mint']=d
    except (OSError,ValueError,subprocess.SubprocessError):pass
    fd=os.open(output/'mcsmanager_23333_tailscale.json',
        os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'))
    print(json.dumps({'state':'observed' if result['mac'] or result['mint'] else 'unavailable',
         'macObserved':bool(result['mac']),'mintObserved':bool(result['mint'])}))
def selftest():
    compile(REMOTE,'<mcsmanager readonly>','exec')
    assert 'GET / HTTP/1.0' in REMOTE
    assert "['ss','-H','-ltn']" in REMOTE
    assert "['tailscaled','mcsm-web'" not in REMOTE
    assert "systemctl','is-active'" in REMOTE
    assert not any(x in REMOTE for x in ("'restart'","'stop'","'start'","'enable'","'daemon-reload'"))
    print("MCSMANAGER_TAILSCALE_READONLY_SELFTEST_PASS")
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT')
