#!/usr/bin/env python3
"""Bounded read-only Mint Node24 failure classification; no sync or gameplay."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

NODE_FIELDS=('tests','pass','fail','skipped')
def summarize(text):
    stats={}
    for key,value in re.findall(r'(?m)^[ \t]*[ℹi]\s+(tests|pass|fail|skipped)\s+(\d+)\s*$',text):
        stats[key]=int(value)
    labels=[]
    for name in re.findall(r'(?m)^✖\s+([^\r\n]{1,190})\s*$',text):
        if name.startswith('failing tests:'):
            continue
        if any(x in name for x in ('/', '\\', 'apikey=', 'token=')):
            continue
        clean=re.sub(r'\s*\(\d+(?:\.\d+)?ms\)$','',name).strip()
        if clean and clean not in labels:
            labels.append(clean)
    return {'node24':stats if set(stats)==set(NODE_FIELDS) else None,
            'failureNames':labels[:20]}

def extract_home_failures(text):
    # Permit only our source-free fixture assertion's reason/value token;
    # never emit traceback, cwd, player data or arbitrary test log lines.
    found=[]
    for block in re.split(r'(?m)^✖\\s+',text):
        if not block.startswith(('recognize roof, loaded enclosure', 'do not persist an unconfirmed bed')):
            continue
        name=block.splitlines()[0].split(' (')[0][:90]
        reasons=re.findall(r'reason["\']?\\s*[:=]\\s*["\']([a-z_]{3,65})',block)
        words=re.findall(r'(?m)^\\s*(?:actual|expected):\\s*[\'\"]?([a-z_]{3,65})',block)
        found.append({'test':name,'reasonTokens':reasons[:4],'assertionTokens':words[:4]})
    tokens=['enclosure_or_loaded_blocks_unverified','wooden_door_or_approach_unverified',
      'roof_or_room_height_unverified','bed_out_of_loaded_observation_range',
      'bed_block_not_loaded','observed_indoor_home_candidate',
      'unverified','not_established','observed_candidate_not_route_verified']
    observed=re.findall(r'ALICE_HOME_FIXTURE_FIRST_REASON=([a-z_]{3,64})',text)
    return [{'homeFixtureReason':observed[-1] if observed else 'not_reported',
             'homeFixtureReasons':[token for token in tokens if token in text][:9]}]

def selftest():
    sample='✖ path-finder respects confirmed witness (2.0ms)\nℹ tests 3\nℹ pass 2\nℹ fail 1\nℹ skipped 0\n'
    x=summarize(sample)
    assert x['node24']=={'tests':3,'pass':2,'fail':1,'skipped':0}
    assert x['failureNames']==['path-finder respects confirmed witness']
    print('ALICE_MINT_NODE_DIAG_SELFTEST_PASS')

def run(out,target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    if out.is_symlink() or not out.is_dir():
        raise ValueError('invalid_output_dir')
    project=Path(__file__).resolve().parents[1]
    wrapper=project/'scripts/alice-mac.sh'
    result={'audit':'ALICE_MINT_NODE24_FAILURE_DIAG','schemaVersion':1,
            'readOnly':True,'sourceSynced':False,'bdsCommandSent':False,
            'aliceRestarted':False,'worldModified':False,
            'state':'unavailable','exitCode':None,'node24':None,'failureNames':[],
            'homeFailureDetails':[]}
    try:
        env={**os.environ,'ALICE_SSH_TARGET':target}
        p=subprocess.run(['/bin/bash',str(wrapper),'test'],env=env,cwd=project,
                         capture_output=True,text=True,timeout=160,check=False)
        result['exitCode']=p.returncode
        result.update(summarize(p.stdout+'\n'+p.stderr))
        result['homeFailureDetails']=extract_home_failures(p.stdout+'\n'+p.stderr)
        result['state']='passed' if p.returncode==0 else 'tests_failed'
    except subprocess.TimeoutExpired:
        result['state']='timeout_unverified'
    except (OSError,ValueError):
        result['state']='transport_unavailable'
    fd=os.open(out/'mint_node_failure_diag.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|
               getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as file:
        json.dump(result,file,separators=(',',':'))
        file.write('\n')
    print(json.dumps({'state':result['state'],'node24':result['node24'],
                      'failureNames':result['failureNames'],
                      'homeFailureDetails':result['homeFailureDetails']}))

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--diagnose':
        run(Path(sys.argv[2]),sys.argv[3])
    else:
        raise SystemExit('usage: --self-test | --diagnose OUTPUT_DIR FIXED_MINT_TARGET')
