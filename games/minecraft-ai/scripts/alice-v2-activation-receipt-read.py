#!/usr/bin/env python3
"""Read exactly one owned v2 interactive activation receipt, never retry it."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

REMOTE=r"""
import json,os,stat
from pathlib import Path
v2=Path.home()/'minecraft-bedrock-alice-lab-v2'
receipt=v2/'.alice-v2-activation-result.json'
intent=v2/'.alice-v2-activation-once.lock'
state='not_started';report=None
if v2.is_symlink() or not v2.is_dir():
 state='v2_absent_or_unsafe'
elif receipt.is_symlink() or intent.is_symlink():
 state='unsafe_artifact'
elif receipt.exists():
 try:
  info=receipt.stat()
  if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077 or info.st_size>4096:
   raise ValueError('unsafe_receipt')
  x=json.loads(receipt.read_text(encoding='utf-8'))
  fields={'audit','schemaVersion','observedAtUnix','v2Only','productionModified',
      'oldV1Modified','productionBdsRestarted','aliceRestarted','credentialStored',
      'state','stages','doNotRepeat'}
  if not isinstance(x,dict) or set(x)!=fields or x['audit']!='ALICE_V2_INTERACTIVE_ACTIVATION' or (
      x['schemaVersion']!=1 or x['v2Only'] is not True or
      x['doNotRepeat'] is not True or x['state'] not in ('imports_observed','not_verified') or
      any(x[k] is not False for k in (
        'productionModified','oldV1Modified','productionBdsRestarted',
        'aliceRestarted','credentialStored'))):
   raise ValueError('unexpected_receipt')
  stages=x['stages']
  allowed_steps={'pack-stage','beta-check','beta-enable','netns-check','netns-probe','aborted'}
  if not isinstance(stages,list) or len(stages)>6 or any(
     not isinstance(y,dict) or set(y)!={'step','state'} or
     y['step'] not in allowed_steps or not isinstance(y['state'],str) or
     len(y['state'])>80 or not y['state'].isascii() or not y['state'].replace('_','').isalnum()
     for y in stages):
   raise ValueError('unexpected_receipt')
  report={'state':x['state'],'stages':stages}
  state='receipt_validated'
 except (OSError,TypeError,ValueError,UnicodeError):
  state='receipt_unverified'
elif intent.exists():
 state='one_shot_started_without_result'
print(json.dumps({'state':state,'result':report},separators=(',',':')))
"""
STATES={'not_started','v2_absent_or_unsafe','unsafe_artifact','receipt_validated',
        'receipt_unverified','one_shot_started_without_result'}
def accept(x):
    if not isinstance(x,dict) or set(x)!={'state','result'} or x['state'] not in STATES:
        return None
    if x['state']!='receipt_validated':
        return {'state':x['state'],'result':None}
    r=x['result']
    if not isinstance(r,dict) or set(r)!={'state','stages'} or r['state'] not in (
        'imports_observed','not_verified') or not isinstance(r['stages'],list) or len(r['stages'])>6:
        return None
    for item in r['stages']:
        if not isinstance(item,dict) or set(item)!={'step','state'} or (
            item['step'] not in ('pack-stage','beta-check','beta-enable','netns-check',
             'netns-probe','aborted')) or not isinstance(item['state'],str) or
            not re.fullmatch(r'[A-Za-z0-9_]{1,80}',item['state']):
            return None
    return x
def run(output,target):
    if output.is_symlink() or not output.is_dir():raise ValueError('unsafe_output')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    observation=None
    try:
        r=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','ConnectTimeout=8','-o','ConnectionAttempts=1',
            '-o','StrictHostKeyChecking=yes',target,
            '/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=22,check=False)
        if r.returncode==0 and len(r.stdout)<=4096:
            observation=accept(json.loads(r.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    result={'audit':'ALICE_V2_ACTIVATION_RECEIPT_READONLY','schemaVersion':1,
            'readOnly':True,'sudoUsed':False,'labBdsStarted':False,
            'activationInvoked':False,'result':observation}
    fd=os.open(output/'v2_activation_receipt.json',
          os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'observation':observation},separators=(',',':')))
def selftest():
    assert accept({'state':'not_started','result':None})['state']=='not_started'
    assert accept({'state':'receipt_validated','result':{
       'state':'not_verified','stages':[{'step':'pack-stage','state':'preconditions_failed'}]}})
    assert accept({'state':'receipt_validated','result':{
       'state':'not_verified','stages':[{'step':'nope','state':'foo'}]}}) is None
    print('ALICE_V2_RECEIPT_READONLY_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--read':run(Path(sys.argv[2]),sys.argv[3])
    else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR MINT_TARGET')
