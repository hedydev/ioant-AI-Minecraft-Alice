#!/usr/bin/env python3
"""Deterministic v3 CONTROL preflight; no sudo, BDS start, or file mutation."""
import json,os,subprocess,sys
from pathlib import Path

TARGET='tedz@192.168.0.104'
EXPECTED={'audit':'ALICE_V3_CONTROL_FIRST_START',
          'state':'ready_for_privileged_preflight',
          'readOnly':True,'firstStartConsumed':False}
def check(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    status='unverified'
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
             '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
             '-o','ConnectionAttempts=1',TARGET,
             '/usr/bin/python3 /home/tedz/minecraft-ai/scripts/alice-v3-control-first-start.py audit'],
             capture_output=True,text=True,timeout=25,check=False)
        if p.returncode==0 and len(p.stdout)<1024 and json.loads(p.stdout)==EXPECTED:
            status='ready_for_privileged_preflight'
        elif p.returncode!=0:
            status='blocked_or_unavailable'
    except (OSError,ValueError,subprocess.SubprocessError):pass
    result={'audit':'ALICE_V3_CONTROL_READONLY_AUDIT','schemaVersion':1,
            'readOnly':True,'sudoUsed':False,'worldModified':False,
            'bdsStarted':False,'status':status}
    fd=os.open(out/'alice_v3_control_audit.json',os.O_CREAT|os.O_EXCL|
               os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps(result,separators=(',',':')))
def selftest():
    assert set(EXPECTED)=={'audit','state','readOnly','firstStartConsumed'}
    print('ALICE_V3_CONTROL_READONLY_PREFLIGHT_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--check':check(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --check OUTPUT_DIR')
