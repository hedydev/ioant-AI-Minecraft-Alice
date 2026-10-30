#!/usr/bin/env python3
"""Deterministic Alice non-restart sync with bounded, redacted test summary.

Runs only the maintained alice-mac.sh sync workflow on an explicitly pinned
SSH target. This writes Git-tracked source with rsync backups, then runs Mint
Node24 tests. It never starts/stops Alice or BDS, modifies worlds or queries
the Minecraft console.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

TARGET=re.compile(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}\Z')
FIELDS=('tests','pass','fail','skipped')

def parse_node_summary(output):
    found={}
    for name,value in re.findall(r'(?m)^[ \t]*[ℹi]\s+(tests|pass|fail|skipped)\s+(\d+)\s*$',output):
        found[name]=int(value)
    if set(found)!=set(FIELDS) or found['tests']<1:
        return None
    if found['pass']+found['fail']+found['skipped']!=found['tests']:
        return None
    return found

def parse_python_summary(output):
    matches=re.findall(r'Ran (\d+) tests? in [0-9.]+s',output)
    if not matches:
        return None
    return int(matches[-1])

def emit(output,report):
    if output.is_symlink() or not output.is_dir():
        raise ValueError('unsafe_output_directory')
    fd=os.open(output/'mint_sync_result.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|
               getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as file:
        json.dump(report,file,separators=(',',':'))
        file.write('\n')
    print(json.dumps({'state':report['state'],'node24':report['mintNode24'],
                      'localPythonTests':report['macPythonTests']}))

def selftest():
    data='\nℹ tests 652\nℹ pass 650\nℹ fail 0\nℹ skipped 2\n'
    assert parse_node_summary(data)==dict(tests=652,**{'pass':650,'fail':0,'skipped':2})
    assert parse_node_summary('ℹ tests 2\nℹ pass 1\nℹ fail 1\nℹ skipped 0\n')['fail']==1
    assert parse_node_summary('tests unclear') is None
    assert parse_python_summary('Ran 227 tests in 19.1s\n\nOK (skipped=3)')==227
    print('ALICE_SYNC_REPORT_SELFTEST_PASS')

def sync(output,target):
    if not TARGET.fullmatch(target):
        raise ValueError('invalid_explicit_mint_target')
    project=Path(__file__).resolve().parents[1]
    repo=project.parents[1]
    wrapper=project/'scripts/alice-mac.sh'
    def git(*args):
        result=subprocess.run(['/usr/bin/git',*args],cwd=repo,
                              capture_output=True,text=True,timeout=10,check=False)
        if result.returncode!=0:
            return None
        return result.stdout.strip()
    if (git('branch','--show-current')!='main' or
        git('status','--porcelain','--untracked-files=no')!= '' or
        not wrapper.is_file() or wrapper.is_symlink()):
        raise ValueError('source_preflight_failed')
    report={'audit':'ALICE_MINT_NONRESTART_SYNC','schemaVersion':1,
            'action':'alice-mac.sh sync','state':'unknown',
            'aliceRestarted':False,'bdsRestarted':False,
            'worldModifiedByTask':False,'consoleCommandSent':False,
            'macPythonTests':None,'mintNode24':None,'syncExitCode':None}
    env={**os.environ,'ALICE_SSH_TARGET':target}
    try:
        proc=subprocess.run(['/bin/bash',str(wrapper),'sync'],cwd=repo,
                            env=env,capture_output=True,text=True,
                            timeout=420,check=False)
        all_output=proc.stdout+'\n'+proc.stderr
        report['syncExitCode']=proc.returncode
        report['macPythonTests']=parse_python_summary(all_output)
        report['mintNode24']=parse_node_summary(all_output)
        report['state']=('passed' if proc.returncode==0 and
                         report['mintNode24'] is not None and
                         report['mintNode24']['fail']==0 else
                         'failed_or_unverified')
    except subprocess.TimeoutExpired:
        report['state']='timeout_unverified'
    except (OSError,ValueError):
        report['state']='launch_unavailable'
    emit(output,report)
    return 0 if report['state']=='passed' else 1

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--sync':
        raise SystemExit(sync(Path(sys.argv[2]),sys.argv[3]))
    else:
        raise SystemExit('usage: --self-test | --sync OUTPUT_DIR FIXED_MINT_TARGET')
