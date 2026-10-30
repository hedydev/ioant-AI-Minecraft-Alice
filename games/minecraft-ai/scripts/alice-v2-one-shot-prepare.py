#!/usr/bin/env python3
"""One-shot isolated v2 archived BDS clone, never starts a server.

Only exact sibling v2 destination, archived restore verified inside maintained
project utility. Guard disk and netns; no production world writes.
"""
import json,os
from pathlib import Path
import re,shlex,subprocess,sys

REMOTE=r"""
import json,shutil,subprocess,sys
from pathlib import Path
home=Path.home()
v2=home/'minecraft-bedrock-alice-lab-v2'
free=shutil.disk_usage(home).free
if v2.exists() or v2.is_symlink():
 print(json.dumps({'decision':'blocked_existing_destination'}))
 sys.exit(0)
if free<20*1024**3:
 print(json.dumps({'decision':'blocked_insufficient_disk'}))
 sys.exit(0)
try:
 namespace=subprocess.run(['/usr/bin/unshare','--user','--map-root-user',
       '--net','--','/usr/bin/true'],stdout=subprocess.DEVNULL,
       stderr=subprocess.DEVNULL,stdin=subprocess.DEVNULL,timeout=8)
 if namespace.returncode!=0:
  print(json.dumps({'decision':'blocked_no_network_namespace'}))
  sys.exit(0)
except (OSError,subprocess.SubprocessError):
 print(json.dumps({'decision':'blocked_no_network_namespace'}))
 sys.exit(0)
tool=home/'minecraft-ai/scripts/alice-bds-lab-v2.py'
if tool.is_symlink() or not tool.is_file():
 print(json.dumps({'decision':'missing_verified_utility'}))
 sys.exit(0)
result=subprocess.run(['/usr/bin/python3',str(tool),'prepare'],
                      capture_output=True,text=True,timeout=330,check=False)
if result.returncode!=0 or len(result.stdout)>4096:
 print(json.dumps({'decision':'prepare_exec_unverified'}))
else:
 try:
  obj=json.loads(result.stdout)
  safe={k:obj.get(k) for k in (
    'audit','schemaVersion','mode','state','backupRestore','reason',
    'v2DirectoryOnly','oldV1LabModified','labBdsStarted',
    'productionWorldModified','productionBdsRestarted','productionWitnessUsed')}
  print(json.dumps({'decision':'utility_returned','report':safe}))
 except (TypeError,ValueError):
  print(json.dumps({'decision':'prepare_output_unverified'}))
"""
KEYS={'audit','schemaVersion','mode','state','backupRestore','reason',
     'v2DirectoryOnly','oldV1LabModified','labBdsStarted',
     'productionWorldModified','productionBdsRestarted','productionWitnessUsed'}
def verify(x):
    if not isinstance(x,dict) or x.get('decision') not in {
        'blocked_existing_destination','blocked_insufficient_disk',
        'blocked_no_network_namespace','missing_verified_utility',
        'prepare_exec_unverified','prepare_output_unverified','utility_returned'}:
        return None
    if x['decision']!='utility_returned':
        return {'state':x['decision'],'prepared':False}
    v=x.get('report')
    if not isinstance(v,dict) or set(v)!=KEYS or v['audit']!='ALICE_BDS_ARCHIVED_LAB_V2' or (
        v['schemaVersion']!=1 or v['mode']!='prepare' or
        v['state'] not in ('absent','unknown','already_exists','new_disposable_copy_created_not_started') or
        v['backupRestore'] not in ('not_verified','archive_sha256_isolated_restore_verified') or
        not isinstance(v['reason'],str) or
        v['reason'] not in ('none','production_target_mismatch','lab_exists_do_not_overwrite',
          'configured_manifest_unavailable','backup_restore_not_verified','wrong_backup_world',
          'backup_restore_failed','invalid_mode','prepared_lab_contract_failed',
          'isolated_lab_prepare_failed','ready_for_explicit_lab_prepare',
          'lab_ready_for_future_beta_test','internal_error') or
        v['v2DirectoryOnly'] is not True or
        any(v[k] is not False for k in (
            'oldV1LabModified','labBdsStarted','productionWorldModified',
            'productionBdsRestarted','productionWitnessUsed'))):
        return None
    success=(v['state']=='new_disposable_copy_created_not_started' and
        v['backupRestore']=='archive_sha256_isolated_restore_verified' and
        v['reason']=='lab_ready_for_future_beta_test')
    return {'state':v['state'],'prepared':success,'archiveRestore':v['backupRestore'],
            'reason':v['reason']}
def selftest():
    sample={'decision':'utility_returned','report':{
      'audit':'ALICE_BDS_ARCHIVED_LAB_V2','schemaVersion':1,'mode':'prepare',
      'state':'new_disposable_copy_created_not_started',
      'backupRestore':'archive_sha256_isolated_restore_verified',
      'reason':'lab_ready_for_future_beta_test',
      'v2DirectoryOnly':True,'oldV1LabModified':False,
      'labBdsStarted':False,'productionWorldModified':False,
      'productionBdsRestarted':False,'productionWitnessUsed':False}}
    assert verify(sample)['prepared'] is True
    assert verify({**sample,'report':{**sample['report'],'labBdsStarted':True}}) is None
    assert verify({'decision':'blocked_existing_destination'})['prepared'] is False
    print('ALICE_V2_ONE_SHOT_PREPARE_SELFTEST_PASS')
def run(output,target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    if output.is_symlink() or not output.is_dir():raise ValueError('unsafe_output')
    parsed=None;transport='unknown'
    try:
        r=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=10',
          '-o','ConnectionAttempts=1','-o','StrictHostKeyChecking=yes',target,
          '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,
          text=True,timeout=365,check=False)
        transport='returned' if r.returncode==0 else 'ssh_failure'
        if r.returncode==0 and len(r.stdout)<4096:
            parsed=verify(json.loads(r.stdout))
    except subprocess.TimeoutExpired:
        transport='timeout_unverified'
    except (OSError,ValueError,subprocess.SubprocessError):
        transport='unavailable'
    report={'audit':'ALICE_V2_ONE_SHOT_PREPARE','schemaVersion':1,'labOnly':True,
        'productionBdsRestartRequested':False,'aliceRestartRequested':False,
        'consoleCommandSent':False,'worldProductionWritesRequested':False,
        'transport':transport,'result':parsed}
    fd=os.open(output/'alice_v2_prepare_result.json',os.O_WRONLY|os.O_CREAT|
         os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'transport':transport,'result':parsed}))
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--prepare':
        run(Path(sys.argv[2]),sys.argv[3])
    else:raise SystemExit('usage: --self-test | --prepare OUTPUT_DIR FIXED_MINT_TARGET')
