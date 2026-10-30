#!/usr/bin/env python3
"""Prove child netns lo-up then drop ALL effective caps before exec (no BDS)."""
import json,os,re,shlex,subprocess,sys
from pathlib import Path

REMOTE=r"""
import json,os,subprocess
from pathlib import Path
inner=r'''
import os,json
effective=None
for line in open('/proc/self/status'):
 if line.startswith('CapEff:'):
  effective=line.split(':',1)[1].strip()
  break
print(json.dumps({'nonRootUid':os.geteuid()!=0,'capEffZero':bool(effective) and int(effective,16)==0},separators=(',',':')))
'''
setup=r'''
import fcntl,os,socket,struct,sys
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
old=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))
flags=struct.unpack_from('H',old,16)[0]
if not flags&1:fcntl.ioctl(s.fileno(),0x8914,struct.pack('16sH14s',b'lo',flags|1,b''))
if not struct.unpack_from('H',fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo')),16)[0]&1:sys.exit(79)
s.close()
os.execv('/usr/bin/setpriv',['/usr/bin/setpriv','--bounding-set=-all',
  '--inh-caps=-all','--ambient-caps=-all','--',
  '/usr/bin/python3','-I','-c',sys.argv[1]])
'''
out={'state':'observed','setprivPresent':Path('/usr/bin/setpriv').is_file(),
'nonrootPreserved':False,'capsDropped':False,'childCompleted':False}
if out['setprivPresent']:
 try:
  p=subprocess.run(['/usr/bin/unshare','--user','--map-current-user',
     '--keep-caps','--net','--','/usr/bin/python3','-I','-c',setup,inner],
     capture_output=True,text=True,timeout=15,check=False)
  if p.returncode==0 and len(p.stdout)<400:
   d=json.loads(p.stdout)
   if isinstance(d,dict) and set(d)=={'nonRootUid','capEffZero'} and all(type(v) is bool for v in d.values()):
    out['childCompleted']=True
    out['nonrootPreserved']=d['nonRootUid']
    out['capsDropped']=d['capEffZero']
 except (OSError,ValueError,subprocess.SubprocessError):
  pass
print(json.dumps(out,separators=(',',':')))
"""
def verify(x):
    return x if isinstance(x,dict) and set(x)=={'state','setprivPresent','nonrootPreserved','capsDropped','childCompleted'} and x['state']=='observed' and all(type(x[k]) is bool for k in ('setprivPresent','nonrootPreserved','capsDropped','childCompleted')) else None
def run(output):
    out=Path(output)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    obs=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
          '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',
          'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
          capture_output=True,text=True,timeout=30,check=False)
        if p.returncode==0 and len(p.stdout)<1024:obs=verify(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    report={'audit':'ALICE_NETNS_NONROOT_CAP_DROP','schemaVersion':1,
      'hostModified':False,'bdsExecuted':False,'labModified':False,
      'sudoUsed':False,'observation':obs}
    fd=os.open(out/'netns_nonroot_cap_drop.json',os.O_CREAT|os.O_EXCL|
      os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':'observed' if obs else 'unavailable'}))
def selftest():
    x={'state':'observed','setprivPresent':True,'nonrootPreserved':True,
       'capsDropped':True,'childCompleted':True}
    assert verify(x)==x
    assert verify({**x,'capsDropped':'yes'}) is None
    assert 'os.execv' in REMOTE and '--keep-caps' in REMOTE
    print('ALICE_NONROOT_CAP_DROP_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--audit':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --audit OUTPUT_DIR')
