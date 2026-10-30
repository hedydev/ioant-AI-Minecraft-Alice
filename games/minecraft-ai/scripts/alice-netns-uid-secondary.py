#!/usr/bin/env python3
"""No-BDS root-vs-current UID map diagnosis. Output only bounded enums."""
import json,os,re,shlex,subprocess,sys
from pathlib import Path

REMOTE=r"""
import json,os,re,subprocess
child=r'''
import fcntl,json,os,socket,struct,sys
x={'euidIsZero':os.geteuid()==0,'uidPreserved':os.geteuid()==int(sys.argv[1]),'loSet':'not_attempted'}
try:
 s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
 old=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))
 flags=struct.unpack_from('H',old,16)[0]
 if not flags&1:fcntl.ioctl(s.fileno(),0x8914,struct.pack('16sH14s',b'lo',flags|1,b''))
 new=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))
 x['loSet']='up' if struct.unpack_from('H',new,16)[0]&1 else 'down'
except OSError as exc:
 x['loSet']='permission_denied' if exc.errno in (1,13) else 'other_error'
print(json.dumps(x,separators=(',',':')))
'''
out={}
for name,mode in (('root','--map-root-user'),('current','--map-current-user'),('currentWithCaps','--map-current-user')):
 try:
  p=subprocess.run(['/usr/bin/unshare','--user',mode,*(['--keep-caps'] if name=='currentWithCaps' else []),'--net','--',
     '/usr/bin/python3','-I','-c',child,str(os.getuid())],
     capture_output=True,text=True,timeout=9,check=False)
  if p.returncode==0 and len(p.stdout)<450:
   value=json.loads(p.stdout)
   if isinstance(value,dict) and set(value)=={'euidIsZero','uidPreserved','loSet'} and (
      all(type(value[k]) is bool for k in ('euidIsZero','uidPreserved')) and
      value['loSet'] in ('up','down','permission_denied','other_error')):
    out[name]={'state':'entered',**value}
   else:out[name]={'state':'invalid_result'}
  else:
   text=p.stderr.lower()[:512]
   reason=('option_not_recognized' if 'unrecognized option' in text else
      'permission_denied' if 'operation not permitted' in text or 'permission denied' in text else
      'other_failure')
   out[name]={'state':'failed','reason':reason}
 except (OSError,ValueError,subprocess.SubprocessError):
  out[name]={'state':'unavailable'}
print(json.dumps({'state':'observed','root':out['root'],'current':out['current'],'currentWithCaps':out['currentWithCaps']},separators=(',',':')))
"""
def validate(x):
    if not isinstance(x,dict) or set(x)!={'state','root','current','currentWithCaps'} or x['state']!='observed':return None
    for k in ('root','current','currentWithCaps'):
        v=x[k]
        if not isinstance(v,dict) or v.get('state') not in ('entered','failed','invalid_result','unavailable'):return None
        if v['state']=='entered':
            if set(v)!={'state','euidIsZero','uidPreserved','loSet'} or any(type(v[a]) is not bool for a in ('euidIsZero','uidPreserved')) or v['loSet'] not in ('up','down','permission_denied','other_error'):return None
        elif v['state']=='failed':
            if set(v)!={'state','reason'} or v['reason'] not in ('option_not_recognized','permission_denied','other_failure'):return None
        elif set(v)!={'state'}:return None
    return x
def run(output):
    out=Path(output)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    value=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
           '-o','StrictHostKeyChecking=yes','tedz@192.168.0.104',
           '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,
           text=True,timeout=36,check=False)
        if p.returncode==0 and len(p.stdout)<1500:value=validate(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    report={'audit':'ALICE_NETNS_UID_SECONDARY','schemaVersion':1,'readOnlyHost':True,
         'bdsExecuted':False,'labWorldsModified':False,'observation':value}
    fd=os.open(out/'alice_uid_secondary.json',os.O_CREAT|os.O_EXCL|
       os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':'observed' if value else 'unavailable'}))
def selftest():
    a={'state':'observed','root':{'state':'entered','euidIsZero':True,'uidPreserved':False,'loSet':'up'},
       'current':{'state':'entered','euidIsZero':False,'uidPreserved':True,'loSet':'permission_denied'},'currentWithCaps':{'state':'entered','euidIsZero':False,'uidPreserved':True,'loSet':'up'}}
    assert validate(a) and validate({**a,'current':{'state':'failed','reason':'permission_denied'}})
    print('ALICE_NETNS_SECONDARY_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--audit':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --audit OUTPUT_DIR')
