#!/usr/bin/env python3
"""Strict v2-only Beta APIs clone switch; refuses unreadable live BDS cwards.

The existing beta module provides byte-preserving NBT validation, backup and
process identity checks. This wrapper changes ONLY the lab pointer in memory.
"""
import importlib.util
import json
from pathlib import Path
import sys
import time

HERE=Path(__file__).resolve().parent
ALLOWED_REASONS={'v2_lab_missing','v2_generation_mismatch','v2_lab_marker_unavailable',
    'gate_missing','lab_pack_not_staged','invalid_level_nbt',
    'beta_flag_already_declared','duplicate_experiments_compound',
    'lab_level_missing','lab_level_ownership_or_size','lab_level_changed',
    'beta_flag_not_absent','lab_beta_backup_exists','unknown_mode',
    'lab_beta_postcheck_failed','bds_cwd_requires_privileged_read',
    'bds_cwd_unverified','lab_bds_is_running','proc_unavailable',
    'lab_marker_mismatch','lab_server_properties_mismatch',
    'lab_or_production_directory_missing','lab_world_missing',
    'lab_parent_directory_invalid','unreviewed_source_pack','io_or_schema_error'}

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    if spec is None or spec.loader is None:
        raise ValueError('gate_missing')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def action(mode,home=None,beta=None):
    if mode not in ('check','enable'):raise ValueError('unknown_mode')
    # Exact v2 marker + sibling provenance must be checked BEFORE touching NBT.
    v2=load('alice_v2_beta_lab_identity','alice-bds-v2-pack.py')
    lab=v2.strict_v2_lab(Path.home() if home is None else home)
    module=beta if beta is not None else load('alice_v2_beta_nbt','alice-bds-lab-beta.py')
    original=module.pack_guard
    try:
        module.pack_guard=lambda:original(lab=lab)
        return module.action(mode)
    finally:
        module.pack_guard=original

def main(args=None):
    argv=sys.argv[1:] if args is None else args
    if len(argv)!=1 or argv[0] not in ('check','enable'):
        raise SystemExit('usage: alice-bds-v2-beta.py check|enable')
    mode=argv[0]
    reason='none'
    try:
        state=action(mode)
        if state not in ('ready_for_lab_only_beta_enable',
                         'lab_beta_nbt_enabled_backup_preserved_not_started'):
            raise ValueError('unknown_mode')
    except ValueError as exc:
        state='blocked';reason=str(exc) if str(exc) in ALLOWED_REASONS else 'unverified_gate'
    except (OSError,TypeError,KeyError,UnicodeError):
        state='blocked';reason='io_or_schema_error'
    print(json.dumps({'audit':'ALICE_V2_BETA_NBT','schemaVersion':1,
      'observedAtUnix':int(time.time()),'mode':mode,'state':state,'reason':reason,
      'v2Only':True,'productionWorldModified':False,'oldV1LabModified':False,
      'productionBdsRestarted':False,'labBdsStarted':False,
      'receiverNetworkEnabled':False,'serverModuleVerified':False},
      separators=(',',':')))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
