#!/usr/bin/env python3
"""Read-only Mac -> original Mint tailnet MCSManager HTTP connectivity diagnosis."""
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import subprocess
import sys

PORT=23333
SSH_TARGET='tedz@192.168.0.104'
def command(argv,timeout=8):
    try:
        p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout,check=False)
        return p.returncode,p.stdout[:100000],p.stderr[:100000]
    except (OSError,subprocess.SubprocessError):
        return None,'',''
def valid(ip):
    try:
        a=ipaddress.IPv4Address(ip)
        return a in ipaddress.IPv4Network('100.64.0.0/10')
    except (ValueError,TypeError):
        return False
def target():
    p=shutil.which('ssh') or '/usr/bin/ssh'
    rc,out,err=command([p,'-T','-o','BatchMode=yes',
        '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=5',
        SSH_TARGET,'/usr/bin/tailscale ip -4'],timeout=10)
    ips=[word for word in out.split() if valid(word)]
    return ips[0] if rc==0 and len(ips)==1 else None
def http(ip):
    if not ip:
        return {'state':'target_unavailable','status':None}
    try:
        with socket.create_connection((ip,PORT),timeout=5) as sock:
            sock.settimeout(4)
            sock.sendall(b'GET / HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n')
            first=bytearray()
            while len(first)<100:
                ch=sock.recv(1)
                if not ch or ch==b'\n':break
                first.extend(ch)
            m=re.search(rb'^HTTP/\d(?:\.\d)?\s+(\d\d\d)',bytes(first))
            return {'state':'connected','status':int(m.group(1)) if m else None}
    except ConnectionRefusedError:
        return {'state':'refused','status':None}
    except socket.timeout:
        return {'state':'timeout','status':None}
    except OSError:
        return {'state':'network_error','status':None}
def local_route(ip):
    if not ip:return None
    rc,out,_=command(['/sbin/route','-n','get',ip],6)
    if rc!=0:return {'state':'unavailable'}
    def field(key):
        m=re.search(r'^\s*'+re.escape(key)+r':\s*(\S+)',out,re.M)
        return m.group(1) if m else None
    iface=field('interface')
    flags=field('flags')
    gw=field('gateway') or ''
    if gw.startswith('100.'):kind='tailnet'
    elif gw.startswith('192.168.') or gw.startswith('10.'):kind='private_lan'
    elif gw.startswith('127.'):kind='loopback'
    elif not gw:kind='none'
    else:kind='other'
    return {'state':'ok','interface':iface if iface and len(iface)<32 else None,
            'flags':flags if flags and len(flags)<100 else None,'gatewayKind':kind}
def mac_tailscale():
    paths=['/opt/homebrew/bin/tailscale','/usr/local/bin/tailscale',
       '/Applications/Tailscale.app/Contents/MacOS/Tailscale','/usr/bin/tailscale']
    cli=shutil.which('tailscale') or next(
        (p for p in paths if os.path.isfile(p) and os.access(p,os.X_OK)),None)
    if not cli:return {'cli':'missing','selfIp':None,'backend':'unknown','statusJson':'missing'}
    rc,out,err=command([cli,'status','--json'],8)
    backend='unknown'
    jsonstate='nonjson'
    ip=None
    if rc==0:
        try:
            body=json.loads(out)
            backend=str(body.get('BackendState','unknown'))[:40]
            ips=(body.get('Self') or {}).get('TailscaleIPs') or []
            ip=next((p for p in ips if valid(p)),None)
            jsonstate='ok'
        except (ValueError,TypeError,AttributeError):
            jsonstate='nonjson'
    else:
        jsonstate='cli_failed'
    iprc,ipout,_=command([cli,'ip','-4'],8)
    ipv=next((v for v in ipout.split() if valid(v)),None) if iprc==0 else None
    # Do not return raw CLI stdout/stderr (may include machine/peer identifiers).
    issue='unknown'
    marker=(err+' '+out[:300]).lower()
    if 'not running' in marker:issue='not_running'
    elif 'not logged in' in marker or 'logged out' in marker:issue='logged_out'
    elif 'permission denied' in marker:issue='permissions'
    elif 'failed to connect' in marker:issue='backend_unavailable'
    return {'cli':'available','selfIp':ip or ipv,'backend':backend,
        'statusJson':jsonstate,'ipExitOk':iprc==0,'issue':issue}
def mac_proxy():
    rc,out,_=command(['/usr/sbin/scutil','--proxy'],7)
    if rc!=0:return {'state':'unavailable'}
    fields={}
    for key in ('HTTPEnable','HTTPSEnable','SOCKSEnable','ProxyAutoConfigEnable',
                'ProxyAutoDiscoveryEnable'):
        m=re.search(r'^\s*'+key+r'\s*:\s*(\d+)',out,re.M)
        fields[key]=int(m.group(1))==1 if m else False
    return {'state':'ok',**fields}
def path_get(ip,bypass):
    curl=shutil.which('curl') or '/usr/bin/curl'
    args=[curl,'-sS','-o','/dev/null','-w','%{http_code}','--connect-timeout','4',
          '--max-time','8']
    if bypass:args+=['--noproxy','*']
    args+=['http://'+ip+':'+str(PORT)+'/']
    rc,out,_=command(args,10)
    return {'state':'ok' if rc==0 else 'failed',
            'httpStatus':int(out) if out.isdigit() and len(out)==3 else None}
def run(output):
    dst=target()
    result={'audit':'MCSMANAGER_MAC_TO_TAILSCALE','schemaVersion':1,'readOnly':True,
            'targetFromMint':bool(dst),'macTailscale':mac_tailscale(),
            'macRoute':local_route(dst),'macProxy':mac_proxy(),
            'tcpDirect':http(dst),'macLanDirect':http('192.168.0.104'),
            'curlProxy':path_get(dst,False) if dst else None,
            'curlBypass':path_get(dst,True) if dst else None,
            'macClashProcesses':None}
    rc,out,_=command(['/usr/bin/pgrep','-if','clash|mihomo'],4)
    result['macClashProcesses']=len(out.splitlines()) if rc==0 else 0
    output=Path(output)
    if not output.is_dir() or output.is_symlink():raise ValueError('unsafe_output')
    fd=os.open(output/'mac_mcsm_tailnet.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as fp:json.dump(result,fp)
    print(json.dumps({'state':'observed','targetFromMint':bool(dst),'readOnly':True}))
def selftest():
    assert valid('100.68.150.18') and not valid('100.0.0.1')
    assert not valid('192.168.0.104')
    assert 'timeout' in http(None)['state'] or http(None)['state']=='target_unavailable'
    print('MCSMANAGER_MAC_TO_TAILNET_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUT')
