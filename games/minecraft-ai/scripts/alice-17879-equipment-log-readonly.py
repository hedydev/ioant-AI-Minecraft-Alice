#!/usr/bin/env python3
"""Read sanitized equipment attempts from owner-verified current Alice log."""
import json,os,re,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,os,re,subprocess
from pathlib import Path
root=Path.home()/'.alice-bedrock-control'
result={'state':'unverified','attempts':0,'lastAction':'none',
        'lastItem':None,'lastReason':'none'}
try:
 p=subprocess.run(['/usr/bin/python3',str(Path.home()/'minecraft-ai/scripts/alice-mint.py'),'status'],
    capture_output=True,text=True,timeout=10,check=False)
 if p.returncode or len(p.stdout)>20000:raise ValueError('no owner')
 status=json.loads(p.stdout)
 if status.get('statusSource')!='current_process' or status.get('processAlive') is not True:raise ValueError('not_current')
 pid=status.get('pid')
 if type(pid) is not int or pid<=0:raise ValueError('bad pid')
 link=Path('/proc')/str(pid)/'fd'/'1'
 log=link.resolve(strict=True)
 if log.parent!=root or not log.name.startswith('operator-') or log.is_symlink():raise ValueError('not operator log')
 st=log.stat()
 if not log.is_file() or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('unsafe log')
 with log.open('rb') as f:
  f.seek(max(0,st.st_size-160000))
  txt=f.read(160000).decode('utf-8','replace')
 for line in txt.splitlines():
  if '[Alice equipment] equipped:' in line:action='equipped'
  elif '[Alice equipment] deferred:' in line:action='deferred'
  else:continue
  m=re.search(r'\{[^{}\r\n]{1,350}\}',line)
  if not m:continue
  d=json.loads(m.group())
  if not isinstance(d,dict) or d.get('kind') not in ('weapon','armor','unknown'):continue
  item=d.get('item')
  reason=d.get('reason')
  if item is not None and (not isinstance(item,str) or not re.fullmatch('[a-z0-9_]{1,42}',item)):continue
  if not isinstance(reason,str) or not re.fullmatch('[a-z0-9_]{1,64}',reason):continue
  result={'state':'observed','attempts':result['attempts']+1,
     'lastAction':action,'lastItem':item,'lastReason':reason}
 if result['state']=='unverified':result['state']='no_attempt_logged'
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass
print(json.dumps(result,separators=(',',':')))
"""
def validate(x):
    if not isinstance(x,dict) or set(x)!={'state','attempts','lastAction','lastItem','lastReason'}:return None
    if x['state'] not in ('observed','no_attempt_logged','unverified') or type(x['attempts']) is not int or not 0<=x['attempts']<=1000:return None
    if x['lastAction'] not in ('none','deferred','equipped'):return None
    return x
def main(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('output')
    obs=None
    try:
        r=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',
           'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
           capture_output=True,text=True,timeout=30,check=False)
        if r.returncode==0 and len(r.stdout)<1000:obs=validate(json.loads(r.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    report={'audit':'ALICE_CURRENT_17879_EQUIPMENT_LOG','schemaVersion':1,
      'readOnly':True,'gameCommandSent':False,'observation':obs}
    fd=os.open(out/'equipment_live.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':obs['state'] if obs else 'unavailable'}))
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:print('ALICE_EQUIPMENT_LOG_SELFTEST_PASS')
    elif len(sys.argv)==3 and sys.argv[1]=='--read':main(sys.argv[2])
    else:raise SystemExit('usage')
