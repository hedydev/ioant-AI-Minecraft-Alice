#!/usr/bin/env python3
"""Prepare/check a NEW v4 BDS-only control from verified archived world.

Unlike v2, this control has NO Script API behavior pack, module registration,
Beta NBT mutation or receiver. Never starts BDS or edits other Alice worlds.
"""
import importlib.util
import json
from pathlib import Path
import sys
import time

HERE=Path(__file__).resolve().parent
V4_NAME='minecraft-bedrock-alice-lab-v4'

def archive():
    spec=importlib.util.spec_from_file_location(
        'alice_v4_verified_archive', HERE/'alice-bds-archived-lab.py')
    if spec is None or spec.loader is None:
        raise ValueError('archive_utility_missing')
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

def operate(mode, *, archive_module=None,home=None):
    if mode not in ('check','prepare'):raise ValueError('invalid_mode')
    root=Path.home() if home is None else Path(home)
    lab=root/V4_NAME
    if lab.is_symlink():
        raise ValueError('v4_target_unsafe')
    m=archive_module if archive_module is not None else archive()
    m.LAB=lab
    result=m.operate(mode)
    if (not isinstance(result,dict) or result.get('audit')!='ALICE_BDS_ARCHIVED_LAB'
        or result.get('mode')!=mode or result.get('productionWorldModified') is not False
        or result.get('productionBdsRestarted') is not False
        or result.get('safeToChangeProductionWorld') is not False
        or result.get('labState') not in (
            'absent','unknown','already_exists','new_disposable_copy_created_not_started')
        or result.get('backupRestore') not in (
            'not_verified','archive_sha256_isolated_restore_verified')):
        raise ValueError('unverified_archive_contract')
    if result['labState']=='new_disposable_copy_created_not_started':
        marker=lab/'.alice-sandbox.json'
        if marker.is_symlink() or not marker.is_file() or marker.stat().st_size>16384:
            raise ValueError('v4_marker_missing')
        data=json.loads(marker.read_text(encoding='utf-8'))
        if data.get('labGeneration')!='fresh-isolated-v4':
            raise ValueError('v4_marker_invalid')
    return {'audit':'ALICE_V4_BDS_CONTROL_ARCHIVE','schemaVersion':1,
       'mode':mode,'state':result['labState'],
       'backupRestore':result['backupRestore'],'reason':result['reason'],
       'v4Only':True,'productionWorldModified':False,
       'productionBdsRestarted':False,'oldV1Modified':False,
       'v2Modified':False,'bdsStarted':False,'scriptApiInstalled':False,
       'betaNbtModified':False}

def main(argv=None):
    args=sys.argv[1:] if argv is None else argv
    if len(args)!=1 or args[0] not in ('check','prepare'):
        raise SystemExit('usage: alice-bds-v4-control.py check|prepare')
    try:
        result=operate(args[0])
    except (OSError,ValueError,TypeError,KeyError,UnicodeError):
        result={'audit':'ALICE_V4_BDS_CONTROL_ARCHIVE','schemaVersion':1,
         'mode':args[0],'state':'unknown','backupRestore':'not_verified',
         'reason':'failed_closed','v4Only':True,'productionWorldModified':False,
         'productionBdsRestarted':False,'oldV1Modified':False,
         'v2Modified':False,'bdsStarted':False,'scriptApiInstalled':False,
         'betaNbtModified':False}
    print(json.dumps(result,separators=(',',':')))
    return 0
if __name__=='__main__':raise SystemExit(main())
