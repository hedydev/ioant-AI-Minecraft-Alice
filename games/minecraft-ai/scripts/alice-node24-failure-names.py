#!/usr/bin/env python3
"""Read-only Mint Node24 failing-test names, no BDS or client actions."""
import json,os,re,subprocess,sys
from pathlib import Path
def run(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    report={'audit':'ALICE_MINT_NODE24_FAIL_NAMES','schemaVersion':1,'readOnlyGame':True,
      'state':'unverified','failingTests':[],'failCount':None}
    try:
        cmd=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
             '-o','StrictHostKeyChecking=yes','tedz@192.168.0.104',
             '/usr/bin/python3 /home/tedz/minecraft-ai/scripts/alice-mint.py test']
        p=subprocess.run(cmd,capture_output=True,text=True,timeout=115,check=False)
        raw=(p.stdout+'\n'+p.stderr)
        if len(raw)<=250000:
            hits=re.findall(r'(?m)^not ok \d+ - ([^\r\n]+)',raw)
            cleaned=[]
            for title in hits[:12]:
                title=re.sub(r'[^a-zA-Z0-9 _:-]','',title).strip()[:140]
                if title:cleaned.append(title)
            total=re.findall(r'(?m)^[ℹi] fail (\d+)',raw)
            if total:
                report['state']='observed'
                report['failingTests']=cleaned
                report['failCount']=int(total[-1])
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    fd=os.open(out/'node24_fail_names.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':report['state'],'failCount':report['failCount']}))
def selftest():
    assert re.findall(r'(?m)^not ok \d+ - ([^\r\n]+)','not ok 5 - bed suite')==['bed suite']
    print('ALICE_NODE24_NAMES_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--read':run(sys.argv[2])
    else:raise SystemExit('usage')
