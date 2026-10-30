#!/usr/bin/env python3
"""Only check Mint v2 lab prerequisites; no world/archive reads or process changes."""
import json,os
from pathlib import Path
import re,shlex,subprocess,sys

REMOTE="""
import json,shutil,subprocess
from pathlib import Path
h=Path.home()
v2=h/'minecraft-bedrock-alice-lab-v2'
answer={'diskFreeGiB':round(shutil.disk_usage(h).free/(1024**3),2),
        'v2Absent':not v2.exists() and not v2.is_symlink(),
        'userNetnsAvailable':False,
        'unshareInstalled':Path('/usr/bin/unshare').is_file()}
if answer['unshareInstalled']:
    try:
        p=subprocess.run(['/usr/bin/unshare','--user','--map-root-user',
          '--net','--','/usr/bin/true'],stdin=subprocess.DEVNULL,
          stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=8)
        answer['userNetnsAvailable']=p.returncode==0
    except (OSError,subprocess.SubprocessError):
        pass
print(json.dumps(answer,separators=(',',':')))
"""
def observe(output,target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    if output.is_symlink() or not output.is_dir():raise ValueError('unsafe_output')
    remote=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
           '-o','ConnectionAttempts=1','-o','StrictHostKeyChecking=yes',target,
           '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,
           text=True,timeout=22,check=False)
        if p.returncode==0 and len(p.stdout)<1024:
            raw=json.loads(p.stdout)
            if (isinstance(raw,dict) and set(raw)=={
                'diskFreeGiB','v2Absent','userNetnsAvailable','unshareInstalled'} and
                type(raw['diskFreeGiB']) in (int,float) and 0<=raw['diskFreeGiB']<100000 and
                all(type(raw[k]) is bool for k in (
                    'v2Absent','userNetnsAvailable','unshareInstalled'))):
                remote=raw
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    result={'audit':'ALICE_V2_HOST_PREREQUISITES','schemaVersion':1,'readOnly':True,
      'noBdsStarted':True,'noWorldModified':True,'noConfigModified':True,
      'state':'observed' if remote else 'unavailable','observation':remote}
    fd=os.open(output/'alice_v2_host_readiness.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|
               getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f);f.write('\n')
    print(json.dumps({'state':result['state'],'prerequisites':remote}))
def selftest():
    assert "--map-root-user" in REMOTE and "'--net'" in REMOTE
    assert "v2Absent" in REMOTE and "diskFreeGiB" in REMOTE
    print('ALICE_V2_HOST_READINESS_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--check':observe(Path(sys.argv[2]),sys.argv[3])
    else:raise SystemExit('usage: --self-test | --check OUTPUT_DIR FIXED_TARGET')
