#!/usr/bin/env python3
"""Pack check/stage for ONLY the new disposable v2 Bedrock snapshot.

This deliberately reuses the existing strict pack eligibility and root-BDS
process inspection. It never grants sudo or weakens ambiguous PID refusal.
"""
import importlib.util
import json
from pathlib import Path
import sys
import time

HERE=Path(__file__).resolve().parent
V2='minecraft-bedrock-alice-lab-v2'
REASONS={
 'v2_lab_missing','v2_generation_mismatch','v2_lab_marker_unavailable',
 'proc_unavailable','bds_cwd_unverified','bds_cwd_requires_privileged_read',
 'lab_bds_is_running','lab_or_production_directory_missing','lab_world_missing',
 'invalid_json_file','lab_marker_mismatch','lab_properties_missing',
 'lab_server_properties_mismatch','lab_level_missing','unreviewed_source_pack',
 'lab_parent_directory_invalid','io_or_schema_error','unknown_precondition'}
STATES={'ready_for_new_lab_only_pack','lab_pack_staged_without_beta_or_network',
 'blocked_existing_pack_or_world_registration','preconditions_failed'}

def strict_v2_lab(home):
    home=Path(home)
    lab=home/V2
    if lab.is_symlink() or not lab.is_dir():
        raise ValueError('v2_lab_missing')
    marker=lab/'.alice-sandbox.json'
    if marker.is_symlink() or not marker.is_file() or marker.stat().st_size>16384:
        raise ValueError('v2_lab_marker_unavailable')
    try: value=json.loads(marker.read_text(encoding='utf-8'))
    except (ValueError,UnicodeError,OSError):
        raise ValueError('v2_lab_marker_unavailable')
    if not isinstance(value,dict) or value.get('labGeneration')!='fresh-isolated-v2':
        raise ValueError('v2_generation_mismatch')
    return lab

def existing_pack_module():
    spec=importlib.util.spec_from_file_location('alice_v2_strict_pack',HERE/'alice-bds-lab-pack.py')
    if spec is None or spec.loader is None:
        raise ValueError('unknown_precondition')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def action(mode,home=None,loader=existing_pack_module):
    if mode not in ('check','stage'):raise ValueError('invalid_mode')
    lab=strict_v2_lab(Path.home() if home is None else home)
    module=loader()
    # Existing require_eligible/require_lab_stopped remains the only admission.
    # Only the exact sibling is substituted; no mocked process or sudo bypass.
    module.LAB=lab
    state=module.inspect() if mode=='check' else module.stage()
    if state not in STATES or state=='preconditions_failed':
        raise ValueError('unknown_precondition')
    return state

def main(args=None):
    argv=sys.argv[1:] if args is None else args
    if len(argv)!=1 or argv[0] not in ('check','stage'):
        raise SystemExit('Usage: alice-bds-v2-pack.py check|stage')
    mode=argv[0];reason='none'
    try:
        state=action(mode)
    except ValueError as exc:
        state='preconditions_failed'
        reason=str(exc) if str(exc) in REASONS else 'unknown_precondition'
    except (OSError,TypeError,KeyError,UnicodeError):
        state='preconditions_failed'
        reason='io_or_schema_error'
    result={'audit':'ALICE_V2_STRICT_PACK','schemaVersion':1,
            'observedAtUnix':int(time.time()),'mode':mode,
            'state':state,'reason':reason,'v2Only':True,
            'productionModified':False,'oldV1Modified':False,
            'labBdsStarted':False,'betaNbtModified':False,
            'secretsInstalled':False,'receiverEnabled':False}
    print(json.dumps(result,separators=(',',':')))
    return 0
if __name__=='__main__':raise SystemExit(main())
