#!/usr/bin/env python3
"""Single fixed SSH, read-only Alice runtime and v2 directory status audit."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

REMOTE = """
import json,os,sys
from pathlib import Path
p=Path.home()/'minecraft-ai/scripts'
sys.path.insert(0,str(p))
from alice_mint import status
from alice_operator.process import AliceProcess
s=status(AliceProcess())
allow={'processAlive','statusSource','heartbeatFresh','reportedConnected',
 'sessionEstablished','state','bdsWitnessStatus','bdsIndependentSource',
 'bdsLastIndependentAgeSeconds','bdsSamples'}
state={k:s.get(k) for k in allow}
hold=s.get('idleHold')
if isinstance(hold,dict):
    reason=hold.get('reason')
    state['idleHoldReason']=reason if isinstance(reason,str) and reason in {
     'scout_bds_position_unavailable','scout_client_server_position_diverged',
     'startup_terrain_sync_pending','navigation_bds_position_unavailable',
     'navigation_bds_position_diverged','daylight_required'} else 'other_or_unavailable'
else:state['idleHoldReason']=None
home=Path.home()
v2=home/'minecraft-bedrock-alice-lab-v2'
state['v2Directory'] = ('symlink_refused' if v2.is_symlink() else
                       'present' if v2.is_dir() else
                       'unexpected_type' if v2.exists() else 'absent')
print(json.dumps(state,separators=(',',':')))
"""
STATES={'IDLE','SURVIVE','COMBAT','FOLLOW','GATHER','EXPLORE','LEARN_WEAPON',
        'SECURE_SHELTER','RECOVER','SLEEP','PLAN','CRAFT','NONE'}
WITNESS={'accepted','duplicate_or_rejected','stale_or_invalid_witness','not_configured',
         'unsafe_witness_file','unavailable','disabled'}
ALLOWED_HOLDS={'scout_bds_position_unavailable','scout_client_server_position_diverged',
               'startup_terrain_sync_pending','navigation_bds_position_unavailable',
               'navigation_bds_position_diverged','daylight_required','other_or_unavailable'}
def sanitize(raw):
    if not isinstance(raw,dict):
        return None
    required={'processAlive','statusSource','heartbeatFresh','reportedConnected',
       'sessionEstablished','state','bdsWitnessStatus','bdsIndependentSource',
       'bdsLastIndependentAgeSeconds','bdsSamples','idleHoldReason','v2Directory'}
    if set(raw)!=required:
        return None
    if type(raw['processAlive']) is not bool or raw['heartbeatFresh'] not in (True,False):
        return None
    status=raw['bdsWitnessStatus']
    if status is not None and status not in WITNESS:
        status='unknown'
    state=raw['state']
    if not isinstance(state,str) or state not in STATES:
        state='unknown'
    hold=raw['idleHoldReason']
    if hold is not None and hold not in ALLOWED_HOLDS:
        hold='other_or_unavailable'
    age=raw['bdsLastIndependentAgeSeconds']
    if type(age) not in (float,int) or not 0<=age<=366*86400:
        age=None
    samples=raw['bdsSamples']
    if type(samples) is not int or not 0<=samples<=1000000000:
        samples=None
    src=raw['bdsIndependentSource'] if raw['bdsIndependentSource'] in (None,'bds_querytarget','bds_script_api') else None
    return {'processAlive':raw['processAlive'],'heartbeatFresh':bool(raw['heartbeatFresh']),
      'connected':raw['reportedConnected'] is True,'sessionEstablished':raw['sessionEstablished'] is True,
      'state':state,'witnessStatus':status,'independentSource':src,
      'independentAgeSeconds':age,'independentSamples':samples,
      'idleHoldReason':hold,'v2Directory':raw['v2Directory'] if raw['v2Directory'] in (
       'present','absent','symlink_refused','unexpected_type') else 'unverified'}
def selftest():
    data=dict(processAlive=True,statusSource='current_process',heartbeatFresh=True,
       reportedConnected=True,sessionEstablished=True,state='IDLE',
       bdsWitnessStatus='stale_or_invalid_witness',bdsIndependentSource=None,
       bdsLastIndependentAgeSeconds=None,bdsSamples=0,idleHoldReason='scout_bds_position_unavailable',
       v2Directory='absent')
    assert sanitize(data)['v2Directory']=='absent'
    assert sanitize({**data,'state':'SECRET'})['state']=='unknown'
    assert sanitize({**data,'bdsSamples':'12'})['independentSamples'] is None
    assert sanitize({**data,'extra':'no'}) is None
    print('ALICE_RUNTIME_STATUS_READONLY_SELFTEST_PASS')
def audit(output,target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    if output.is_symlink() or not output.is_dir():
        raise ValueError('unsafe_output')
    state='transport_unavailable';record=None
    try:
        cmd='/usr/bin/python3 -c '+shlex.quote(REMOTE)
        r=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
          '-o','ConnectTimeout=8','-o','ConnectionAttempts=1',
          '-o','StrictHostKeyChecking=yes',target,cmd],
          capture_output=True,text=True,timeout=27,check=False)
        if r.returncode==0 and len(r.stdout)<4096:
            record=sanitize(json.loads(r.stdout))
            state='observed' if record is not None else 'remote_output_unverified'
        elif r.returncode==0:
            state='remote_output_unverified'
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    report={'audit':'ALICE_RUNTIME_V2_READONLY','schemaVersion':1,'readOnly':True,
            'bdsCommandSent':False,'worldModified':False,'aliceRestarted':False,
            'v2PrepareInvoked':False,'state':state,'observation':record}
    fd=os.open(output/'alice_runtime_readonly.json',
       os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':state,'runtime':record},separators=(',',':')))
    return 0
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--audit':
        raise SystemExit(audit(Path(sys.argv[2]),sys.argv[3]))
    else:
        raise SystemExit('usage: --self-test | --audit OUTPUT_DIR MINT_TARGET')
