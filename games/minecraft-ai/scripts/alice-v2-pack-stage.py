#!/usr/bin/env python3
"""v2-only Script API witness pack inspection/stage, no BDS startup."""
import json,os
from pathlib import Path
import re,shlex,subprocess,sys

REMOTE=r"""
import importlib.util,json,sys
from pathlib import Path
scripts=Path.home()/'minecraft-ai/scripts'
sys.path.insert(0,str(scripts))
lab=Path.home()/'minecraft-bedrock-alice-lab-v2'
if lab.is_symlink() or not lab.is_dir():
 print(json.dumps({'state':'v2_absent_or_unsafe','reason':'lab_missing'}))
 sys.exit(0)
try:
 marker=json.loads((lab/'.alice-sandbox.json').read_text())
 if marker.get('labGeneration')!='fresh-isolated-v2':
  raise ValueError('v2_marker_invalid')
 spec=importlib.util.spec_from_file_location('alice_v2_pack_only',scripts/'alice-bds-lab-pack.py')
 module=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(module)
 module.LAB=lab
 mode=sys.argv[1]
 if mode=='check': state=module.inspect()
 elif mode=='stage': state=module.stage()
 else:raise ValueError('invalid_mode')
 print(json.dumps({'state':state,'reason':'none'}))
except ValueError as exc:
 reason=str(exc)
 allowed={'proc_unavailable','bds_cwd_unverified','bds_cwd_requires_privileged_read',
  'lab_bds_is_running','lab_or_production_directory_missing','lab_world_missing',
  'invalid_json_file','lab_marker_mismatch','lab_properties_missing',
  'lab_server_properties_mismatch','lab_level_missing','unreviewed_source_pack',
  'lab_parent_directory_invalid','v2_marker_invalid'}
 print(json.dumps({'state':'blocked','reason':reason if reason in allowed else 'other_gate'}))
except (OSError,TypeError,KeyError,UnicodeError):
 print(json.dumps({'state':'blocked','reason':'io_or_schema_error'}))
"""
STATES={'ready_for_new_lab_only_pack','lab_pack_staged_without_beta_or_network',
        'blocked_existing_pack_or_world_registration','v2_absent_or_unsafe','blocked'}
REASONS={'none','lab_missing','proc_unavailable','bds_cwd_unverified',
         'bds_cwd_requires_privileged_read','lab_bds_is_running',
         'lab_or_production_directory_missing','lab_world_missing',
         'invalid_json_file','lab_marker_mismatch','lab_properties_missing',
         'lab_server_properties_mismatch','lab_level_missing','unreviewed_source_pack',
         'lab_parent_directory_invalid','v2_marker_invalid','other_gate','io_or_schema_error'}
def validate(x):
    if not isinstance(x,dict) or set(x)!={'state','reason'} or x['state'] not in STATES or x['reason'] not in REASONS:
        return None
    return x
def run(output,target,mode):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    if mode not in ('check','stage'):raise ValueError('invalid_mode')
    if output.is_symlink() or not output.is_dir():raise ValueError('unsafe_output')
    data=None;transport='unavailable'
    try:
        cmd='/usr/bin/python3 -c '+shlex.quote(REMOTE)+' '+shlex.quote(mode)
        r=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
            '-o','ConnectionAttempts=1','-o','StrictHostKeyChecking=yes',target,cmd],
            capture_output=True,text=True,timeout=35,check=False)
        transport='returned' if r.returncode==0 else 'ssh_failed'
        if r.returncode==0 and len(r.stdout)<1024:
            data=validate(json.loads(r.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    res={'audit':'ALICE_V2_PACK_STAGE','schemaVersion':1,'mode':mode,
         'v2Only':True,'bdsStarted':False,'productionModified':False,
         'worldExperimentsModified':False,'receiverTokenCreated':False,
         'transport':transport,'result':data}
    fd=os.open(output/'alice_v2_pack_result.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|
               getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(res,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'transport':transport,'mode':mode,'result':data}))
def selftest():
    assert validate({'state':'ready_for_new_lab_only_pack','reason':'none'})
    assert validate({'state':'blocked','reason':'bds_cwd_requires_privileged_read'})
    assert validate({'state':'unknown','reason':'none'}) is None
    assert "module.LAB=lab" in REMOTE and "fresh-isolated-v2" in REMOTE
    print('ALICE_V2_PACK_CONTRACT_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==5 and sys.argv[1]=='--run':
        run(Path(sys.argv[2]),sys.argv[3],sys.argv[4])
    else:raise SystemExit('usage: --self-test | --run OUTPUT_DIR MINT_TARGET check|stage')
