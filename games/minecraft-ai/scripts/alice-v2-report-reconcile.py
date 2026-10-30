#!/usr/bin/env python3
"""Reconcile existing Mac v2 archived-lab reports without rerunning the check.

Reads only owner-only files matching the exact maintained v2-check report name
within the operator's stated time window. Never invokes SSH, BDS or a model.
"""
import json
import os
from pathlib import Path
import re
import stat
import sys

FILENAME = re.compile(r'AliceAI-BDS-Lab-v2-check-\d{8}-\d{6}\.json\Z')
KEYS = {'audit','schemaVersion','observedAtUnix','mode','state','backupRestore',
        'reason','v2DirectoryOnly','oldV1LabModified','labBdsStarted',
        'productionWorldModified','productionBdsRestarted','productionWitnessUsed'}
STATES = {'absent','unknown','already_exists','new_disposable_copy_created_not_started'}
BACKUPS = {'not_verified','archive_sha256_isolated_restore_verified'}
REASONS = {'none','production_target_mismatch','lab_exists_do_not_overwrite',
           'configured_manifest_unavailable','backup_restore_not_verified',
           'wrong_backup_world','backup_restore_failed','invalid_mode',
           'prepared_lab_contract_failed','isolated_lab_prepare_failed',
           'ready_for_explicit_lab_prepare','lab_ready_for_future_beta_test',
           'internal_error'}

def validate(raw):
    if not isinstance(raw,dict) or set(raw)!=KEYS:
        return None
    if (raw['audit']!='ALICE_BDS_ARCHIVED_LAB_V2' or
        type(raw['schemaVersion']) is not int or raw['schemaVersion']!=1 or
        raw['mode']!='check' or type(raw['observedAtUnix']) is not int or
        raw['state'] not in STATES or raw['backupRestore'] not in BACKUPS or
        raw['reason'] not in REASONS or raw['v2DirectoryOnly'] is not True or
        any(raw[k] is not False for k in
            ('oldV1LabModified','labBdsStarted','productionWorldModified',
             'productionBdsRestarted','productionWitnessUsed'))):
        return None
    return {k:raw[k] for k in ('observedAtUnix','state','backupRestore','reason')}

def inspect(desktop,after,before):
    found=[]
    if not desktop.is_dir() or desktop.is_symlink():
        return {'state':'desktop_unavailable','candidates':0,'validReports':0}
    for path in desktop.glob('AliceAI-BDS-Lab-v2-check-*.json'):
        if not FILENAME.fullmatch(path.name):
            continue
        try:
            fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
            try:
                info=os.fstat(fd)
                if (not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or
                    info.st_mode & 0o077 or info.st_size>4096 or info.st_size<2 or
                    not after<=info.st_mtime<=before):
                    continue
                raw=os.read(fd,4097)
            finally:
                os.close(fd)
            item=validate(json.loads(raw))
            if item is None or not after-900<=item['observedAtUnix']<=before+900:
                continue
            found.append(item)
        except (OSError,ValueError,UnicodeError,TypeError):
            continue
    found.sort(key=lambda x:x['observedAtUnix'],reverse=True)
    return {'state':'candidate_report_found' if found else 'no_matching_report',
            'candidates':len(found),'validReports':len(found),
            'latest':found[0] if found else None,
            'operationAttributionVerified':False}

def selftest():
    item={'audit':'ALICE_BDS_ARCHIVED_LAB_V2','schemaVersion':1,
          'observedAtUnix':1234567890,'mode':'check','state':'absent',
          'backupRestore':'archive_sha256_isolated_restore_verified',
          'reason':'ready_for_explicit_lab_prepare','v2DirectoryOnly':True,
          'oldV1LabModified':False,'labBdsStarted':False,
          'productionWorldModified':False,'productionBdsRestarted':False,
          'productionWitnessUsed':False}
    assert validate(item)['state']=='absent'
    assert validate({**item,'labBdsStarted':True}) is None
    assert validate({**item,'mode':'prepare'}) is None
    assert validate({**item,'reason':'some private error'}) is None
    assert validate({**item,'extra':'value'}) is None
    print('ALICE_V2_REPORT_RECONCILE_SELFTEST_PASS')

def main():
    if sys.argv[1:]==['--self-test']:
        selftest()
        return 0
    if len(sys.argv)!=5 or sys.argv[1]!='--inspect':
        raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR AFTER_EPOCH BEFORE_EPOCH')
    output=Path(sys.argv[2])
    after=int(sys.argv[3]);before=int(sys.argv[4])
    if after<=0 or before<after or before-after>86400:
        raise ValueError('invalid_window')
    if output.is_symlink() or not output.is_dir():
        raise ValueError('invalid_output_dir')
    result={'audit':'ALICE_V2_EXISTING_REPORT_RECONCILE','schemaVersion':1,
            'readOnly':True,'v2CheckInvoked':False,'bdsCommandSent':False,
            'worldModified':False,'safetyActionsInvoked':False,
            **inspect(Path.home()/'Desktop',after,before)}
    name=output/'v2_existing_report_audit.json'
    fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as file:
        json.dump(result,file,ensure_ascii=True,separators=(',',':'))
        file.write('\n')
    print(json.dumps({'state':result['state'],'reports':result['validReports']}))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
