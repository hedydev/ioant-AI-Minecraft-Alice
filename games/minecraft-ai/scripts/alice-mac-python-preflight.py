#!/usr/bin/env python3
"""Read-only Mac Python preflight diagnosis with a bounded JSON report.

Runs only the existing unittest discovery stage used by alice-mac.sh sync.
No SSH, rsync, server action, source modification or model inference.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

def parse(text):
    tests=re.findall(r'(?m)^Ran (\d+) tests? in [0-9.]+s\s*$',text)
    skipped=re.findall(r'(?m)^OK \(skipped=(\d+)\)',text)
    names=re.findall(r'(?m)^(FAIL|ERROR): ([^\r\n]{1,160})$',text)
    return {'tests':int(tests[-1]) if tests else None,
            'skipped':int(skipped[-1]) if skipped else 0,
            'failures':[{'kind':k,'test':n} for k,n in names[:12]],
            'reportedFailureCount':len(names)}

def selftest():
    ok=parse('Ran 227 tests in 9.1s\n\nOK (skipped=3)\n')
    assert ok['tests']==227 and ok['skipped']==3 and not ok['failures']
    failed=parse('FAIL: test_name (suite.Test)\nRan 2 tests in 0.3s\nFAILED (failures=1)\n')
    assert failed['tests']==2 and failed['failures'][0]['test']=='test_name (suite.Test)'
    print('ALICE_MAC_PYTHON_PREFLIGHT_SELFTEST_PASS')

def run(output):
    if output.is_symlink() or not output.is_dir():
        raise ValueError('unsafe_output_dir')
    project=Path(__file__).resolve().parents[1]
    repo=project.parents[1]
    python=shutil.which('python3')
    result={'audit':'ALICE_MAC_PYTHON_PREFLIGHT','schemaVersion':1,
            'readOnly':True,'remoteInvoked':False,'filesSynced':False,
            'aliceOrBdsRestarted':False,'state':'unavailable',
            'pythonVersion':None,'exitCode':None,'tests':None,
            'skipped':None,'failures':[],'reportedFailureCount':0}
    if python:
        try:
            version=subprocess.run([python,'--version'],capture_output=True,
                                   text=True,timeout=4,check=False)
            if version.returncode==0 and re.fullmatch(r'Python \d+\.\d+\.\d+',version.stdout.strip()):
                result['pythonVersion']=version.stdout.strip()
            run=subprocess.run([python,'-m','unittest','discover','-s',
                              str(project/'tests'),'-v'],cwd=repo,
                              capture_output=True,text=True,timeout=120,check=False)
            parsed=parse(run.stderr+'\n'+run.stdout)
            result.update(parsed)
            result['exitCode']=run.returncode
            result['state']='passed' if run.returncode==0 else 'tests_failed'
        except subprocess.TimeoutExpired:
            result['state']='timeout_unverified'
        except (OSError,ValueError):
            result['state']='unavailable'
    fd=os.open(output/'mac_python_preflight.json',
               os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as file:
        json.dump(result,file,separators=(',',':'))
        file.write('\n')
    print(json.dumps({'state':result['state'],'tests':result['tests'],
                      'failureCount':result['reportedFailureCount']}))

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--diagnose':
        run(Path(sys.argv[2]))
    else:
        raise SystemExit('usage: --self-test | --diagnose OUTPUT_DIR')
