#!/usr/bin/env python3
"""Read-only, bounded Mac-to-Mint Alice Node24/source parity audit.

No server command, BDS action, player data, world reads or repository updates.
The only network action is a single SSH read to the explicitly supplied host.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

FILES = (
    "bedrock-native/experiment/src/scout_start_proof.cjs",
    "bedrock-native/experiment/test/scout_start_proof.test.cjs",
)
REMOTE = r"""
import hashlib,json
from pathlib import Path
import re,subprocess
home=Path.home()
base=home/'minecraft-ai'
node_root=home/'.local/share/alice-bedrock/node24'
node=node_root/'current/bin/node'
paths=('bedrock-native/experiment/src/scout_start_proof.cjs',
       'bedrock-native/experiment/test/scout_start_proof.test.cjs')
def sha(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>250000:
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()
result={'files':{p:sha(base/p) for p in paths},'nodeVersion':None,'node24Verified':False}
try:
    resolved=node.resolve(strict=True)
    if resolved.is_relative_to(node_root.resolve(strict=True)) and resolved.is_file():
        x=subprocess.run([str(node),'--version'],capture_output=True,text=True,timeout=5,check=False)
        if x.returncode==0 and re.fullmatch(r'v24\.\d+\.\d+',x.stdout.strip()):
            result['nodeVersion']=x.stdout.strip()
            result['node24Verified']=True
except (OSError,ValueError,subprocess.SubprocessError):
    pass
print(json.dumps(result,separators=(',',':')))
"""

def sha(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>250000:
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()

def validate_remote(remote):
    if not isinstance(remote,dict) or set(remote)!={'files','nodeVersion','node24Verified'}:
        return None
    files=remote['files']
    if not isinstance(files,dict) or set(files)!=set(FILES):
        return None
    if any(x is not None and (not isinstance(x,str) or
              not re.fullmatch(r'[a-f0-9]{64}',x)) for x in files.values()):
        return None
    version=remote['nodeVersion']
    verified=remote['node24Verified']
    if type(verified) is not bool or (version is not None and
       (not isinstance(version,str) or not re.fullmatch(r'v24\.\d+\.\d+',version))):
        return None
    if verified != (version is not None):
        return None
    return remote

def classify(local,remote):
    valid=validate_remote(remote)
    if valid is None:
        return {'state':'remote_unverified','node24Verified':False,'nodeVersion':None,
                'sourceMatch':False,'testMatch':False}
    source_match=local[FILES[0]] is not None and local[FILES[0]]==valid['files'][FILES[0]]
    test_match=local[FILES[1]] is not None and local[FILES[1]]==valid['files'][FILES[1]]
    state=('verified' if source_match and test_match and valid['node24Verified'] else
           'node24_unavailable' if source_match and test_match else 'source_drift')
    return {'state':state,'node24Verified':valid['node24Verified'],
            'nodeVersion':valid['nodeVersion'],'sourceMatch':source_match,
            'testMatch':test_match}

def audit(output, target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_fixed_target')
    root=Path(__file__).resolve().parents[2]
    local={name:sha(root/name) for name in FILES}
    remote=None
    try:
        command='/usr/bin/python3 -c '+shlex.quote(REMOTE)
        run=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
             '-o','ConnectionAttempts=1','-o','StrictHostKeyChecking=yes',target,command],
             capture_output=True,text=True,timeout=28,check=False)
        if run.returncode==0 and len(run.stdout)<4096:
            remote=json.loads(run.stdout)
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    verdict=classify(local,remote)
    report={'audit':'ALICE_MINT_READONLY_PARITY','schemaVersion':1,'readOnly':True,
            'remoteTestExecuted':False,'bdsCommandSent':False,'repositoryModified':False,
            'aliceRestarted':False,'worldModified':False,**verdict}
    output=Path(output)
    if not output.is_dir() or output.is_symlink():
        raise ValueError('invalid_output_directory')
    flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0)
    fd=os.open(output/'mint_readonly_audit.json',flags,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as file:
        json.dump(report,file,ensure_ascii=True,separators=(',',':'))
        file.write('\n')
    print(json.dumps({'state':verdict['state'],'report':'mint_readonly_audit.json',
                      'node24Verified':verdict['node24Verified'],
                      'sourceMatch':verdict['sourceMatch'],'testMatch':verdict['testMatch']}))
    return 0

def self_test():
    sig='a'*64
    local={name:sig for name in FILES}
    ok={'files':dict(local),'nodeVersion':'v24.22.1','node24Verified':True}
    assert classify(local,ok)['state']=='verified'
    assert classify(local,{**ok,'nodeVersion':None,'node24Verified':False})['state']=='node24_unavailable'
    assert classify(local,{**ok,'files':{**local,FILES[0]:'b'*64}})['state']=='source_drift'
    assert classify(local,{**ok,'nodeVersion':'v20.11.0'})['state']=='remote_unverified'
    assert classify(local,{'unknown':'value'})['state']=='remote_unverified'
    print('ALICE_MINT_PARITY_SELF_TEST_PASS')

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        self_test()
    elif len(sys.argv)==4 and sys.argv[1]=='--audit':
        raise SystemExit(audit(sys.argv[2],sys.argv[3]))
    else:
        raise SystemExit('usage: --self-test | --audit OUTPUT_DIR FIXED_MINT_SSH_TARGET')
