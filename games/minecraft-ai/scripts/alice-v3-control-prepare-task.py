#!/usr/bin/env python3
"""One-shot, non-starting v3 CONTROL archived world preparation on fixed Mint."""
import json,os,subprocess,shlex,sys
from pathlib import Path

TARGET="tedz@192.168.0.104"
REMOTE=r"""
import json,shutil,subprocess
from pathlib import Path
home=Path.home()
v3=home/'minecraft-bedrock-alice-lab-v3'
result={'state':'preflight_blocked','backupRestore':'not_verified',
        'labCreated':False,'reason':'unknown'}
if v3.exists() or v3.is_symlink():
 result['reason']='v3_already_exists_do_not_repeat'
elif shutil.disk_usage(home).free<20*1024**3:
 result['reason']='insufficient_space'
else:
 tool=home/'minecraft-ai/scripts/alice-bds-v3-control.py'
 if tool.is_symlink() or not tool.is_file():
  result['reason']='tool_not_synced'
 else:
  # Verify archive first, then create a NEW exclusive directory.
  def call(mode):
   p=subprocess.run(['/usr/bin/python3',str(tool),mode],
      capture_output=True,text=True,timeout=230,check=False)
   return json.loads(p.stdout) if p.returncode==0 and len(p.stdout)<4096 else None
  try:
   checked=call('check')
   if not checked or checked.get('state')!='absent' or checked.get('reason')!='ready_for_explicit_lab_prepare' or checked.get('backupRestore')!='archive_sha256_isolated_restore_verified':
    result['reason']='archive_preflight_unverified'
   else:
    prepared=call('prepare')
    if (isinstance(prepared,dict) and prepared.get('state')=='new_disposable_copy_created_not_started'
      and prepared.get('backupRestore')=='archive_sha256_isolated_restore_verified'
      and prepared.get('v3Only') is True and prepared.get('bdsStarted') is False
      and prepared.get('productionWorldModified') is False and prepared.get('v2Modified') is False
      and prepared.get('scriptApiInstalled') is False and prepared.get('betaNbtModified') is False):
     result={'state':'prepared','backupRestore':'archive_sha256_isolated_restore_verified',
         'labCreated':True,'reason':'new_control_without_script_api'}
    else:
     result['reason']='prepare_result_unverified'
  except (OSError,ValueError,TypeError,subprocess.SubprocessError):
   result['reason']='tool_or_transport_error'
print(json.dumps(result,separators=(',',':')))
"""
STATES={'prepared','preflight_blocked'}
REASONS={'new_control_without_script_api','unknown','v3_already_exists_do_not_repeat',
 'insufficient_space','tool_not_synced','archive_preflight_unverified',
 'prepare_result_unverified','tool_or_transport_error'}
def validate(d):
    if not isinstance(d,dict) or set(d)!={'state','backupRestore','labCreated','reason'}:return None
    if d['state'] not in STATES or d['reason'] not in REASONS:return None
    if d['backupRestore'] not in ('not_verified','archive_sha256_isolated_restore_verified'):
        return None
    if type(d['labCreated']) is not bool:return None
    if d['state']=='prepared' and (d['labCreated'] is not True or
        d['reason']!='new_control_without_script_api' or
        d['backupRestore']!='archive_sha256_isolated_restore_verified'):
        return None
    if d['state']=='preflight_blocked' and d['labCreated']:
        return None
    return d
def run(output):
    out=Path(output)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    observation=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
           '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',TARGET,
           '/usr/bin/python3 -c '+shlex.quote(REMOTE)],
           capture_output=True,text=True,timeout=380,check=False)
        if p.returncode==0 and len(p.stdout)<1024:
            observation=validate(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    report={'audit':'ALICE_V3_CONTROL_ARCHIVE_PREPARATION','schemaVersion':1,
      'scriptApiInstalled':False,'bdsStarted':False,'worldProductionModified':False,
      'v1OrV2Modified':False,'readOnly':False,
      'state':observation['state'] if observation else 'unverified','observation':observation}
    fd=os.open(out/'alice_v3_prepare.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|
       getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':report['state'],'result':observation},separators=(',',':')))
def selftest():
    assert validate({'state':'prepared','backupRestore':'archive_sha256_isolated_restore_verified',
          'labCreated':True,'reason':'new_control_without_script_api'})
    assert validate({'state':'prepared','backupRestore':'not_verified',
          'labCreated':False,'reason':'unknown'}) is None
    assert "alice-bds-v3-control.py" in REMOTE
    assert "v3.exists() or v3.is_symlink()" in REMOTE
    print('ALICE_V3_ARCHIVE_TASK_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--prepare':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --prepare OUTPUT_DIR')
