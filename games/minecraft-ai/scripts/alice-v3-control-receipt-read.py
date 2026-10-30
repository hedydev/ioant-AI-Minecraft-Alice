#!/usr/bin/env python3
"""One-shot v3 control result reader; no BDS execution or private stdout."""
import json,os,re,shlex,subprocess,sys
from pathlib import Path
TARGET='tedz@192.168.0.104'
REMOTE=r"""
import json,os,re,stat
from pathlib import Path
lab=Path.home()/'minecraft-bedrock-alice-lab-v3'
intent=lab/'.alice-v3-control-first-start.lock'
result=lab/'.alice-v3-control-first-start-result.json'
safe={'audit','schemaVersion','observedAtUnix','state','v3Only','doNotRepeat',
'noScriptApiInstalled','hostNetworkChanged','productionWorldModified',
'productionBdsRestarted','v1Modified','v2Modified','aliceRestarted',
'passwordRecorded','result'}
inner={'state','readyObserved','exitedBeforeStop','gracefulStopAcknowledged',
 'exitKind','failureCategory','logDigestSha256','logBytesExamined','durationSeconds'}
out={'state':'v3_unavailable'}
try:
 if lab.is_symlink() or not lab.is_dir():
  out={'state':'v3_unavailable'}
 elif intent.is_symlink() or result.is_symlink():
  out={'state':'unsafe_artifact'}
 elif result.is_file():
  meta=result.stat()
  if not stat.S_ISREG(meta.st_mode) or meta.st_uid!=os.getuid() or meta.st_mode&0o077 or meta.st_size>4096:
   raise ValueError('unsafe')
  x=json.loads(result.read_text(encoding='utf-8'))
  if not isinstance(x,dict) or set(x)!=safe or x['audit']!='ALICE_V3_CONTROL_FIRST_START' or x['schemaVersion']!=1:
   raise ValueError('bad_schema')
  if x['v3Only'] is not True or x['doNotRepeat'] is not True or x['noScriptApiInstalled'] is not True:
   raise ValueError('bad_claim')
  if any(x[k] is not False for k in ('hostNetworkChanged','productionWorldModified',
       'productionBdsRestarted','v1Modified','v2Modified','aliceRestarted','passwordRecorded')):
   raise ValueError('unexpected_effect')
  d=x['result']
  if not isinstance(d,dict) or set(d)!=inner:
   raise ValueError('bad_inner')
  if d['state'] not in ('completed','shutdown_unverified','spawn_unavailable','start_unverified'):
   raise ValueError('bad_state')
  if d['exitKind'] not in ('zero','signal','nonzero','unknown'):
   raise ValueError('bad_exit')
  if d['failureCategory'] not in ('elf_loader_error','permission_denied','running_as_root',
     'network_unreachable','bind_failure','level_database_failure','script_api_error',
     'resource_exhausted','explicit_fatal','unknown'):
   raise ValueError('bad_category')
  if any(type(d[k]) is not bool for k in ('readyObserved','exitedBeforeStop','gracefulStopAcknowledged')):
   raise ValueError('bad_flag')
  digest=d['logDigestSha256']
  if digest is not None and (not isinstance(digest,str) or re.fullmatch('[a-f0-9]{64}',digest) is None):
   raise ValueError('bad_digest')
  if type(d['logBytesExamined']) is not int or not 0<=d['logBytesExamined']<=262144:
   raise ValueError('bad_size')
  if type(d['durationSeconds']) not in (int,float) or not 0<=d['durationSeconds']<=120:
   raise ValueError('bad_duration')
  if not intent.is_file():
   raise ValueError('no_once_lock')
  out={'state':'receipt_verified','result':d}
 elif intent.exists():
  out={'state':'one_shot_inconclusive'}
 else:
  out={'state':'prepared_not_started'}
except (OSError,ValueError,TypeError,KeyError,UnicodeError):
 out={'state':'receipt_unverified'}
print(json.dumps(out,separators=(',',':')))
"""
STATES={'v3_unavailable','unsafe_artifact','receipt_verified','one_shot_inconclusive',
        'prepared_not_started','receipt_unverified'}
def validate(x):
    if not isinstance(x,dict) or x.get('state') not in STATES:return None
    if x['state']!='receipt_verified':
        return x if set(x)=={'state'} else None
    d=x.get('result')
    if not isinstance(d,dict) or d.get('state') not in (
        'completed','shutdown_unverified','spawn_unavailable','start_unverified'):
        return None
    if d.get('exitKind') not in ('zero','signal','nonzero','unknown'):return None
    if d.get('failureCategory') not in ('elf_loader_error','permission_denied',
        'running_as_root','network_unreachable','bind_failure','level_database_failure',
        'script_api_error','resource_exhausted','explicit_fatal','unknown'):return None
    return x
def run(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    obs=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
           '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',TARGET,
           '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,
           text=True,timeout=25,check=False)
        if p.returncode==0 and len(p.stdout)<4096:
            obs=validate(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    report={'audit':'ALICE_V3_CONTROL_RECEIPT_READONLY','schemaVersion':1,
        'readOnly':True,'firstProbeRetried':False,'sudoUsed':False,
        'bdsStartedByTask':False,'observation':obs}
    fd=os.open(out/'alice_v3_control_receipt.json',os.O_CREAT|os.O_EXCL|
       os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':obs['state'] if obs else 'unavailable'}))
def selftest():
    assert validate({'state':'prepared_not_started'})
    assert validate({'state':'receipt_unverified'})
    assert validate({'state':'receipt_verified','result':{'state':'completed','exitKind':'zero',
       'failureCategory':'unknown'}})
    assert validate({'state':'receipt_verified','result':{'state':'completed','exitKind':'invalid',
       'failureCategory':'unknown'}}) is None
    print('ALICE_V3_RECEIPT_READER_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--read':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR')
