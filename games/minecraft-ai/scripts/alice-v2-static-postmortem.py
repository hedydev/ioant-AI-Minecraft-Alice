#!/usr/bin/env python3
"""Read-only bounded static failure diagnosis of the CONSUMED disposable v2 lab.

No command or subprocess that executes bedrock_server, no network changes,
no repeat probe, no world reads; scans only fixed paths and ELF metadata.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path

TARGET='tedz@192.168.0.104'
REMOTE=r"""
import importlib.util,json,os,re,stat,subprocess
from pathlib import Path
h=Path.home(); lab=h/'minecraft-bedrock-alice-lab-v2'
out={'state':'unverified','onceOnlyConsumed':False,'binaryPresent':False,
     'binaryElf64':False,'binaryExecutable':False,'binaryArch':None,
     'binarySizeMiB':None,'elfInterpreterPresent':False,
     'elfInterpreterSafe':False,'neededCount':None,
     'neededUnavailableInLab':[],
     'labConfigSafe':False,'worldLevelPresent':False,
     'probeScriptInstrumented':False,'probeBackupCount':0,
     'preexistingCrashLogNames':[],
     'readelfAvailable':False,'mountNoexec':None}
try:
 scripts=h/'minecraft-ai'/'scripts'
 sp=importlib.util.spec_from_file_location('v2read',scripts/'alice-v2-resume-first-probe.py')
 mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)
 mod.verify_prior(lab)
 try:mod.verify_unconsumed(lab)
 except ValueError:out['onceOnlyConsumed']=True
 if not out['onceOnlyConsumed']:raise ValueError('no consumed probe')
 binary=lab/'bedrock_server'
 if binary.is_symlink() or not binary.is_file():raise ValueError('missing binary')
 st=binary.stat()
 out['binaryPresent']=True
 out['binaryExecutable']=bool(st.st_mode & stat.S_IXUSR) and os.access(binary,os.X_OK)
 out['binarySizeMiB']=round(st.st_size/(1024*1024),1)
 with binary.open('rb') as f:hdr=f.read(64)
 out['binaryElf64']=hdr[:5]==b'\x7fELF\x02'
 out['binaryArch']='x86_64' if hdr[18:20]==b'\x3e\x00' else ('aarch64' if hdr[18:20]==b'\xb7\x00' else 'other')
 readelf=Path('/usr/bin/readelf')
 if readelf.is_file() and not readelf.is_symlink():
  out['readelfAvailable']=True
  cmd=subprocess.run([str(readelf),'-lW','-dW',str(binary)],
      capture_output=True,text=True,timeout=12,check=False)
  if cmd.returncode==0 and len(cmd.stdout)<200000:
   match=re.search(r'Requesting program interpreter:\s*([^]\s]+)',cmd.stdout)
   if match:
    interpreter=Path(match.group(1))
    out['elfInterpreterPresent']=interpreter.is_file()
    out['elfInterpreterSafe']=(str(interpreter).startswith('/lib/') or
                              str(interpreter).startswith('/lib64/'))
   needed=re.findall(r'\(NEEDED\).*Shared library: \[([^\]]+)\]',cmd.stdout)
   if len(needed)<100 and all(re.fullmatch(r'[a-zA-Z0-9._+-]{1,90}',n) for n in needed):
    out['neededCount']=len(needed)
    out['neededUnavailableInLab']=[n for n in needed
      if not (lab/n).is_file()][:25]
 # Detect only fixed nonsecret config keys; do not print values.
 props=lab/'server.properties'
 if props.is_file() and not props.is_symlink() and props.stat().st_size<=32768:
  cfg=dict(line.strip().split('=',1) for line in props.read_text(errors='replace').splitlines()
           if '=' in line and not line.lstrip().startswith('#'))
  out['labConfigSafe']=(cfg.get('server-port')=='17880'
      and cfg.get('server-portv6')=='17881'
      and cfg.get('online-mode')=='false')
  name=cfg.get('level-name','')
  if re.fullmatch(r'[A-Za-z0-9 _-]{1,64}',name):
   level=lab/'worlds'/name/'level.dat'
   out['worldLevelPresent']=level.is_file() and not level.is_symlink()
 originals=[lab/'.alice-lab-probe-original-properties',
  lab/'.alice-lab-probe-original-allowlist',
  lab/'behavior_packs/alice-silent-bds-witness/scripts/.alice-lab-probe-original-main.js']
 out['probeBackupCount']=sum(p.is_file() and not p.is_symlink() for p in originals)
 script=lab/'behavior_packs/alice-silent-bds-witness/scripts/main.js'
 if script.is_file() and not script.is_symlink() and script.stat().st_size<10000:
  out['probeScriptInstrumented']=b'ALICE_LAB_IMPORTS_READY_17880' in script.read_bytes()
 for name in ('bedrock_server.log','server.log','crash.log'):
  p=lab/name
  if p.is_file() and not p.is_symlink():out['preexistingCrashLogNames'].append(name)
 # Mount's noexec is a static OS property, not a request to remount.
 try:
  out['mountNoexec']=bool(os.statvfs(lab).f_flag & getattr(os,'ST_NOEXEC',8))
 except OSError:pass
 out['state']='observed'
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
 out['state']='unverified'
print(json.dumps(out,separators=(',',':')))
"""
def sanitize(raw):
    keys={'state','onceOnlyConsumed','binaryPresent','binaryElf64','binaryExecutable',
          'binaryArch','binarySizeMiB','elfInterpreterPresent','elfInterpreterSafe',
          'neededCount','neededUnavailableInLab','labConfigSafe','worldLevelPresent',
          'probeScriptInstrumented','probeBackupCount','preexistingCrashLogNames',
          'readelfAvailable','mountNoexec'}
    if not isinstance(raw,dict) or set(raw)!=keys or raw['state'] not in ('observed','unverified'):
        return None
    if any(type(raw[k]) is not bool for k in (
       'onceOnlyConsumed','binaryPresent','binaryElf64','binaryExecutable',
       'elfInterpreterPresent','elfInterpreterSafe','labConfigSafe','worldLevelPresent',
       'probeScriptInstrumented','readelfAvailable')):
        return None
    if raw['binaryArch'] not in (None,'x86_64','aarch64','other'):
        return None
    if type(raw['probeBackupCount']) is not int or not 0<=raw['probeBackupCount']<=3:return None
    if raw['mountNoexec'] is not None and type(raw['mountNoexec']) is not bool:return None
    if raw['neededCount'] is not None and (type(raw['neededCount']) is not int or not 0<=raw['neededCount']<=100):return None
    if not isinstance(raw['neededUnavailableInLab'],list) or len(raw['neededUnavailableInLab'])>25:return None
    if any(not isinstance(x,str) or len(x)>90 or '/' in x for x in raw['neededUnavailableInLab']):return None
    if not isinstance(raw['preexistingCrashLogNames'],list) or set(raw['preexistingCrashLogNames'])-{'bedrock_server.log','server.log','crash.log'}:return None
    return raw
def run(output):
    out=Path(output)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    observed=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
           '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',TARGET,
           '/usr/bin/python3 -c '+shlex.quote(REMOTE)],
           capture_output=True,text=True,timeout=35,check=False)
        if p.returncode==0 and len(p.stdout)<4096:
            observed=sanitize(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    result={'audit':'ALICE_V2_BDS_STATIC_POSTMORTEM','schemaVersion':1,
        'readOnly':True,'bdsExecuted':False,'labModified':False,
        'probeRetried':False,'productionServerTouched':False,'observation':observed}
    fd=os.open(out/'alice_v2_static_postmortem.json',
        os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':observed['state'] if observed else 'unavailable'}))
def selftest():
    example=dict(state='observed',onceOnlyConsumed=True,binaryPresent=True,
        binaryElf64=True,binaryExecutable=True,binaryArch='x86_64',
        binarySizeMiB=194.0,elfInterpreterPresent=True,elfInterpreterSafe=True,
        neededCount=2,neededUnavailableInLab=['libFoo.so'],labConfigSafe=True,
        worldLevelPresent=True,probeScriptInstrumented=True,
        probeBackupCount=3,preexistingCrashLogNames=[],
        readelfAvailable=True,mountNoexec=False)
    assert sanitize(example)['onceOnlyConsumed']
    assert sanitize({**example,'probeBackupCount':10}) is None
    assert sanitize({**example,'neededUnavailableInLab':['../../secret']}) is None
    print('ALICE_V2_STATIC_POSTMORTEM_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
