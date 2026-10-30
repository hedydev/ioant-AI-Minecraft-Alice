#!/usr/bin/env python3
"""Read-only v2 netns compatibility diagnostics; never start BDS or mutate lab.

Runs exact existing namespace probe in a fresh child user+network namespace.
Only fixed booleans/status enums cross SSH; no stdout/stderr from subprocesses.
"""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

REMOTE=r"""
import importlib.util,json,os,stat,subprocess,sys
from pathlib import Path
home=Path.home()
scripts=home/'minecraft-ai'/'scripts'
lab=home/'minecraft-bedrock-alice-lab-v2'
spec=importlib.util.spec_from_file_location('alice_v2_netns_exact_check',scripts/'alice-bds-lab-probe.py')
if spec is None or spec.loader is None:
 print(json.dumps({'state':'module_unavailable'}))
 sys.exit(0)
try:
 m=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(m)
 names={'unshare':Path('/usr/bin/unshare'),'python3':Path('/usr/bin/python3'),'true':Path('/usr/bin/true')}
 info={}
 for name,p in names.items():
  info[name+'Exists']=p.is_file()
  info[name+'Symlink']=p.is_symlink()
  try:
   resolved=p.resolve(strict=True)
   info[name+'ResolvedUnderUsrBin']=resolved.parent==Path('/usr/bin')
   info[name+'TargetOwnerRoot']=resolved.stat().st_uid==0
   info[name+'TargetSafeMode']=(resolved.stat().st_mode&0o022)==0
  except (OSError,ValueError):
   info[name+'ResolvedUnderUsrBin']=False
   info[name+'TargetOwnerRoot']=False
   info[name+'TargetSafeMode']=False
 info['basicNamespacePreflight']=m.namespace_preflight()
 info['v2LoopbackPreflight']=m.namespace_v2_loopback_preflight()
 info['v2IsDirectory']=lab.is_dir() and not lab.is_symlink()
 info['oneShotIntentExists']=(lab/'.alice-v2-activation-once.lock').is_file()
 info['probePrepared']=(lab/'.alice-lab-probe-original-properties').exists()
 # This is an independent PLAIN child test without requiring privileged BDS PID
 # disambiguation. No host interface is changed and no BDS binary is started.
 cmd=[str(m.NETNS_UNSHARE),'--user','--map-root-user','--net','--',
      str(m.NETNS_PYTHON),'-I','-c',m.NETNS_V2_LOOPBACK_SETUP,str(m.NETNS_TRUE)]
 try:
  p=subprocess.run(cmd,capture_output=True,timeout=10,check=False,
    env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
  info['directChildExitCode']=p.returncode if -128<=p.returncode<=255 else None
 except (OSError,subprocess.SubprocessError):
  info['directChildExitCode']=None
 print(json.dumps({'state':'observed','details':info},separators=(',',':')))
except (OSError,ValueError,TypeError,KeyError):
 print(json.dumps({'state':'module_unavailable'}))
"""
KEYS={'unshareExists','unshareSymlink','unshareResolvedUnderUsrBin',
'unshareTargetOwnerRoot','unshareTargetSafeMode','python3Exists','python3Symlink',
'python3ResolvedUnderUsrBin','python3TargetOwnerRoot','python3TargetSafeMode',
'trueExists','trueSymlink','trueResolvedUnderUsrBin','trueTargetOwnerRoot',
'trueTargetSafeMode','basicNamespacePreflight','v2LoopbackPreflight',
'v2IsDirectory','oneShotIntentExists','probePrepared','directChildExitCode'}
def verify(raw):
    if not isinstance(raw,dict) or raw.get('state') not in ('observed','module_unavailable'):
        return None
    if raw['state']=='module_unavailable' and set(raw)=={'state'}:
        return {'state':'module_unavailable'}
    info=raw.get('details')
    if raw['state']!='observed' or not isinstance(info,dict) or set(info)!=KEYS:
        return None
    if any(type(v) is not bool for k,v in info.items() if k!='directChildExitCode'):
        return None
    code=info['directChildExitCode']
    if code is not None and (type(code) is not int or not -128<=code<=255):
        return None
    return raw
def audit(out,target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    observation=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
          '-o','ConnectTimeout=8','-o','ConnectionAttempts=1',
          '-o','StrictHostKeyChecking=yes',target,
          '/usr/bin/python3 -c '+shlex.quote(REMOTE)],
          capture_output=True,text=True,timeout=35,check=False)
        if p.returncode==0 and len(p.stdout)<4096:
            observation=verify(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    report={'audit':'ALICE_V2_NETNS_PRECHECK_DIAGNOSTIC','schemaVersion':1,
            'readOnlyLab':True,'hostNetworkModified':False,
            'bdsStarted':False,'oneShotRetried':False,'observation':observation}
    fd=os.open(out/'v2_netns_diagnostic.json',
         os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':observation.get('state') if observation else 'unavailable'}))
def selftest():
    example={k:False for k in KEYS if k!='directChildExitCode'}
    example['directChildExitCode']=0
    assert verify({'state':'observed','details':example})
    assert verify({'state':'observed','details':{**example,'extra':True}}) is None
    assert 'namespace_v2_loopback_preflight' in REMOTE
    assert 'NETNS_V2_LOOPBACK_SETUP' in REMOTE
    print('ALICE_V2_NETNS_DIAG_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--audit':audit(Path(sys.argv[2]),sys.argv[3])
    else:raise SystemExit('Usage: --self-test | --audit OUTPUT_DIR MINT_TARGET')
