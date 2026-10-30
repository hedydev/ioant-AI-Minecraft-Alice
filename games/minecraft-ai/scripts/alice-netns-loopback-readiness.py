#!/usr/bin/env python3
"""Probe only disposable user+network namespace loopback, never host networking."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

CHILD=r"""
import fcntl,json,socket,struct
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
def get():
 d=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))
 return struct.unpack_from('H',d,16)[0]
before=get()
raised=False
try:
 if before & 1 == 0:
  fcntl.ioctl(s.fileno(),0x8914,
     struct.pack('16sH14s',b'lo',before|1,b''))
  raised=True
 after=get()
 print(json.dumps({'beforeUp':bool(before&1),
  'afterUp':bool(after&1),'attemptedUp':raised},separators=(',',':')))
finally:
 s.close()
"""
REMOTE=r"""
import json,subprocess
code="""+repr(CHILD)+r"""
try:
 p=subprocess.run(['/usr/bin/unshare','--user','--map-root-user',
  '--net','--','/usr/bin/python3','-c',code],capture_output=True,
  text=True,timeout=9,check=False)
 d=json.loads(p.stdout) if p.returncode==0 else None
 if isinstance(d,dict) and set(d)=={'beforeUp','afterUp','attemptedUp'} and all(type(d[k]) is bool for k in d):
  print(json.dumps({'state':'observed','beforeUp':d['beforeUp'],
   'afterUp':d['afterUp'],'attemptedUp':d['attemptedUp']},separators=(',',':')))
 else:
  print(json.dumps({'state':'unverified'}))
except (OSError,ValueError,subprocess.SubprocessError):
 print(json.dumps({'state':'unverified'}))
"""
def verify(x):
    if not isinstance(x,dict) or x.get('state') not in ('observed','unverified'):
        return None
    if x['state']=='unverified':
        return {'state':'unverified'}
    if set(x)!={'state','beforeUp','afterUp','attemptedUp'} or any(type(x[k]) is not bool for k in ('beforeUp','afterUp','attemptedUp')):
        return None
    return x
def audit(out,target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    if out.is_symlink() or not out.is_dir():
        raise ValueError('invalid_output')
    observation=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
          '-o','ConnectTimeout=8','-o','ConnectionAttempts=1',
          '-o','StrictHostKeyChecking=yes',target,
          '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,
          text=True,timeout=25,check=False)
        if p.returncode==0 and len(p.stdout)<1024:
            observation=verify(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    record={'audit':'ALICE_EPHEMERAL_NETNS_LOOPBACK','schemaVersion':1,
      'hostNetworkModified':False,'bdsStarted':False,
      'productionWorldModified':False,'scope':'new_unshared_process_only',
      'observation':observation}
    fd=os.open(out/'alice_netns_loopback.json',os.O_WRONLY|os.O_CREAT|
         os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        json.dump(record,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'observation':observation},separators=(',',':')))
def selftest():
    assert verify({'state':'observed','beforeUp':False,'afterUp':True,'attemptedUp':True})['afterUp']
    assert verify({'state':'observed','beforeUp':'yes','afterUp':True,'attemptedUp':True}) is None
    assert '0x8914' in CHILD and "'--net'" in REMOTE
    print('ALICE_EPHEMERAL_NETNS_LOOPBACK_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--audit':audit(Path(sys.argv[2]),sys.argv[3])
    else:raise SystemExit('usage: --self-test | --audit OUTPUT_DIR MINT_TARGET')
