#!/usr/bin/env python3
"""Read-only Mint capacity and UDP socket-table audit for a NEW disposable BDS.
Does not read world contents, open/bind ports, start BDS, or modify services.
'not_observed' means no UDP socket found, never guarantees the port is available.
"""
import json, os, re, shlex, subprocess, sys
from pathlib import Path
REMOTE = "import json, os, shutil\nfrom pathlib import Path\nports = (('testIPv4_17882',17882,Path('/proc/net/udp')),('testIPv6_27882',27882,Path('/proc/net/udp6')))\ndef udp_status(port, file):\n    try:\n        lines=file.read_text(encoding='ascii').splitlines()\n        for line in lines[1:]:\n            columns=line.split()\n            if len(columns)<2 or ':' not in columns[1]:continue\n            try: number=int(columns[1].rsplit(':',1)[1],16)\n            except ValueError:continue\n            if number==port:return 'occupied'\n        return 'not_observed'\n    except (OSError,UnicodeError):\n        return 'unknown'\ndef meminfo():\n    values={}\n    try:\n        for line in Path('/proc/meminfo').read_text(encoding='ascii').splitlines():\n            if line.startswith(('MemTotal:','MemAvailable:','SwapFree:')):\n                parts=line.split()\n                values[parts[0][:-1]]=int(parts[1]) // 1024\n        if not all(x in values for x in ('MemTotal','MemAvailable','SwapFree')):return None\n        return values\n    except (OSError,ValueError,IndexError,UnicodeError):\n        return None\ntry:\n    load=round(os.getloadavg()[0],2)\nexcept OSError:\n    load=None\nh=Path.home()\nresult={'memMiB':meminfo(),'load1':load,'cpuLogical':os.cpu_count(),\n    'diskFreeGiB':round(shutil.disk_usage(h).free/(1024**3),2),\n    'candidateUdp':{name:udp_status(port,file) for name,port,file in ports},\n    'existingLabNames':{name:(h/name).exists() or (h/name).is_symlink() for name in\n        ('minecraft-bedrock-alice-lab-v2','minecraft-bedrock-alice-lab-v3','minecraft-bedrock-alice-lab-v4','minecraft-bedrock-alice-stable-lab')}}\nprint(json.dumps(result,separators=(',',':')))\n"
STATES={'occupied','not_observed','unknown'}
LABS=('minecraft-bedrock-alice-lab-v2','minecraft-bedrock-alice-lab-v3',
      'minecraft-bedrock-alice-lab-v4','minecraft-bedrock-alice-stable-lab')
def validate(v):
    if not isinstance(v,dict) or set(v)!={'memMiB','load1','cpuLogical','diskFreeGiB',
                                          'candidateUdp','existingLabNames'}:
        return None
    m=v['memMiB']
    if m is not None and (not isinstance(m,dict) or set(m)!={
            'MemTotal','MemAvailable','SwapFree'} or
            any(type(m[k]) is not int or m[k]<0 or m[k]>1000000 for k in m)):
        return None
    if type(v['cpuLogical']) is not int or not 1<=v['cpuLogical']<=512:
        return None
    if v['load1'] is not None and (
            type(v['load1']) not in (int,float) or not 0<=v['load1']<=10000):
        return None
    if type(v['diskFreeGiB']) not in (int,float) or not 0<=v['diskFreeGiB']<=100000:
        return None
    if (not isinstance(v['candidateUdp'],dict) or set(v['candidateUdp'])!={
            'testIPv4_17882','testIPv6_27882'} or
            any(x not in STATES for x in v['candidateUdp'].values())):
        return None
    if not isinstance(v['existingLabNames'],dict) or (
            set(v['existingLabNames'])!=set(LABS)) or any(
            type(x) is not bool for x in v['existingLabNames'].values()):
        return None
    return v
def check(out):
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output_dir')
    observed=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
            'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=27,check=False)
        if p.returncode==0 and len(p.stdout)<2048:
            observed=validate(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    report={'audit':'ALICE_ISOLATED_BDS_CAPACITY','schemaVersion':1,
        'readOnly':True,'bdsStarted':False,'worldModified':False,
        'serviceRestarted':False,'observation':observed,
        'state':'observed' if observed else 'unverified',
        'portAvailabilityProven':False}
    flags=os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0)
    fd=os.open(out/'isolated_bds_capacity.json',flags,0o600)
    with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'))
    print(json.dumps({'state':report['state'],'capacityObserved':bool(observed)}))
def selftest():
    compile(REMOTE,'<mint-readonly>', 'exec')
    v={'memMiB':{'MemTotal':15000,'MemAvailable':7000,'SwapFree':0},
       'load1':1.5,'cpuLogical':4,'diskFreeGiB':106.54,
       'candidateUdp':{'testIPv4_17882':'not_observed',
                       'testIPv6_27882':'occupied'},
       'existingLabNames':{k:False for k in LABS}}
    assert validate(v)==v
    assert validate({**v,'candidateUdp':{'testIPv4_17882':'available',
                                         'testIPv6_27882':'occupied'}}) is None
    assert validate({**v,'cpuLogical':True}) is None
    assert 'socket.bind' not in REMOTE and 'unshare' not in REMOTE
    print('ALICE_ISOLATED_BDS_READONLY_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']: selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--check':check(Path(sys.argv[2]))
    else:raise SystemExit('usage: --self-test | --check OUTPUT_DIR')
