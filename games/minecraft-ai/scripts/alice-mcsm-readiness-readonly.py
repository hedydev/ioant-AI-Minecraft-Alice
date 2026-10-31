#!/usr/bin/env python3
"""Read-only MCSManager witness configuration/outputlog health for Mint Alice.
The ONLY possible MCSM API request is the existing --diagnose outputlog GET.
Never invokes --once, --loop, /command, or changes any server or file.
Does not export private MCSManager IDs, tokens, log contents or player position.
"""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
REMOTE = "import json, subprocess\nfrom pathlib import Path\nscript=Path.home()/'minecraft-ai'/'scripts'/'bds_position_witness.py'\ndef command(flag):\n    if script.is_symlink() or not script.is_file():\n        return None\n    try:\n        r=subprocess.run(['/usr/bin/python3',str(script),flag],\n          capture_output=True,text=True,timeout=10,check=False)\n        return (r.returncode,r.stdout.strip()[:400])\n    except (OSError,subprocess.SubprocessError):\n        return None\ncfg=command('--check')\nconfig='valid' if cfg and cfg[0]==0 and cfg[1]=='BDS witness configuration valid; no BDS request sent' else 'invalid_or_unavailable'\nlog=command('--diagnose') if config=='valid' else None\noutputlog='readable' if log and log[0]==0 and log[1].startswith('MCSManager outputlog: readable,') else ('unreadable_or_unavailable' if log else 'skipped')\ntry:\n    unit=subprocess.run(['/usr/bin/systemctl','--user','is-active','alice-bds-position-witness.service'],\n        capture_output=True,text=True,check=False,timeout=4)\n    service='active' if unit.returncode==0 and unit.stdout.strip()=='active' else 'not_active'\nexcept (OSError,subprocess.SubprocessError):\n    service='unknown'\nprint(json.dumps({'config':config,'outputlog':outputlog,'legacyLoopService':service},separators=(',',':')))\n"

def validate(payload):
    if not isinstance(payload,dict) or set(payload)!={'config','outputlog','legacyLoopService'}:
        return None
    if payload['config'] not in ('valid','invalid_or_unavailable'):
        return None
    if payload['outputlog'] not in ('readable','unreadable_or_unavailable','skipped'):
        return None
    if payload['legacyLoopService'] not in ('active','not_active','unknown'):
        return None
    if payload['config']!='valid' and payload['outputlog']!='skipped':
        return None
    return payload

def check(output):
    if output.is_symlink() or not output.is_dir():raise ValueError('unsafe_output')
    observed=None
    try:
        proc=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
            'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=35,check=False)
        if proc.returncode==0 and len(proc.stdout)<=1024:
            observed=validate(json.loads(proc.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    result={'audit':'ALICE_MCSM_POSITION_PROVIDER_READONLY','schemaVersion':1,
        'readOnly':True,'bdsCommandSent':False,'aliceRestarted':False,
        'bdsRestarted':False,'worldChanged':False,
        'instanceIdentityProven':False,'sourceActiveProven':False,
        'state':'observed' if observed else 'unavailable','observation':observed}
    flags=os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0)
    fd=os.open(output/'mcsm_readiness.json',flags,0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'))
    print(json.dumps({'state':result['state'],'readOnly':True,'bdsCommandSent':False}))
def selftest():
    compile(REMOTE,'<mint-inline-readonly>','exec')
    assert "command('--check')" in REMOTE
    assert "command('--diagnose')" in REMOTE
    assert "command('--once')" not in REMOTE and "command('--loop')" not in REMOTE
    sample={'config':'valid','outputlog':'readable','legacyLoopService':'not_active'}
    assert validate(sample)==sample
    assert validate({**sample,'outputlog':'unexpected'}) is None
    assert validate({**sample,'config':'invalid_or_unavailable'}) is None
    print('ALICE_MCSM_READONLY_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--check':check(Path(sys.argv[2]))
    else:raise SystemExit('usage: --self-test | --check OUTPUT_DIR')
