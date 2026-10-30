#!/usr/bin/env python3
"""Compare disposable user+net namespace identity mapping, NEVER execute BDS.

Only the child namespace's loopback is toggled. No host interfaces, existing
BDS processes, world files, secrets, or one-shot locks are touched.
"""
import json,os,re,shlex,subprocess,sys
from pathlib import Path

REMOTE=r"""
import json,os,subprocess,sys
from pathlib import Path
child=r'''
import fcntl,json,os,socket,struct,sys
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
before=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))
f=struct.unpack_from('H',before,16)[0]
if not (f&1):
 fcntl.ioctl(s.fileno(),0x8914,struct.pack('16sH14s',b'lo',f|1,b''))
after=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))
result={'insideUidZero':os.geteuid()==0,
 'loUp':bool(struct.unpack_from('H',after,16)[0]&1),
 'identityPreserved':os.geteuid()==int(sys.argv[1])}
print(json.dumps(result,separators=(',',':')))
'''
out={'state':'observed','hostUidIsRoot':os.geteuid()==0,
 'rootMap':None,'currentMap':None}
for name,flag in (('rootMap','--map-root-user'),('currentMap','--map-current-user')):
 try:
  cmd=['/usr/bin/unshare','--user',flag,'--net','--',
       '/usr/bin/python3','-I','-c',child,str(os.getuid())]
  p=subprocess.run(cmd,capture_output=True,text=True,timeout=10,check=False)
  if p.returncode==0 and len(p.stdout)<500:
   o=json.loads(p.stdout)
   if isinstance(o,dict) and set(o)=={'insideUidZero','loUp','identityPreserved'} and all(type(v) is bool for v in o.values()):
    out[name]={'executable':True,**o}
   else:out[name]={'executable':False}
  else:out[name]={'executable':False}
 except (OSError,ValueError,subprocess.SubprocessError):
  out[name]={'executable':False}
print(json.dumps(out,separators=(',',':')))
"""
def verify(x):
    if not isinstance(x,dict) or set(x)!={'state','hostUidIsRoot','rootMap','currentMap'} or x['state']!='observed' or type(x['hostUidIsRoot']) is not bool:return None
    for k in ('rootMap','currentMap'):
        v=x[k]
        if not isinstance(v,dict) or v.get('executable') not in (True,False):return None
        if v['executable'] and (set(v)!={'executable','insideUidZero','loUp','identityPreserved'} or any(type(v[i]) is not bool for i in ('insideUidZero','loUp','identityPreserved'))):return None
        if not v['executable'] and set(v)!={'executable'}:return None
    return x
def execute(output,target):
    out=Path(output)
    if out.is_symlink() or not out.is_dir() or not re.fullmatch(r'[a-z][a-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('unsafe_target_or_output')
    data=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',target,
            '/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=35,check=False)
        if p.returncode==0 and len(p.stdout)<3000:data=verify(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    result={'audit':'ALICE_NETNS_UID_MAPPING_READONLY','schemaVersion':1,
       'executedBds':False,'hostNetworkModified':False,'labModified':False,
       'sudoUsed':False,'observation':data}
    fd=os.open(out/'alice_netns_uid_mapping.json',os.O_CREAT|os.O_EXCL|
       os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':'observed' if data else 'unavailable'}))
def selftest():
    assert verify({'state':'observed','hostUidIsRoot':False,'rootMap':{
        'executable':True,'insideUidZero':True,'loUp':True,'identityPreserved':False},
        'currentMap':{'executable':True,'insideUidZero':False,'loUp':True,
                      'identityPreserved':True}})
    assert verify({'state':'observed','hostUidIsRoot':'false','rootMap':{'executable':False},
        'currentMap':{'executable':False}}) is None
    print('ALICE_NETNS_UID_MAPPING_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--audit':execute(Path(sys.argv[2]),sys.argv[3])
    else:raise SystemExit('usage: --self-test | --audit OUTPUT_DIR TARGET')
