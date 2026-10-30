#!/usr/bin/env python3
"""Read the v2 first-BDS-probe resume state; never repeat or start the probe."""
import json,os
from pathlib import Path
import re,shlex,subprocess,sys

REMOTE=r"""
import importlib.util,json,os,re,sys
from pathlib import Path
s=Path.home()/'minecraft-ai/scripts'
spec=importlib.util.spec_from_file_location('alice_v2_resume_receipt',s/'alice-v2-resume-first-probe.py')
try:
 if spec is None or spec.loader is None:raise ValueError('missing_resume_tool')
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 lab=m.lab_identity()
 m.verify_prior(lab)
 intent=lab/m.INTENT
 result=lab/m.RESULT
 if result.is_symlink() or intent.is_symlink():
  print(json.dumps({'state':'unsafe_probe_artifact'}))
 elif result.is_file():
  data=m.owned_json(result)
  fields={'audit','schemaVersion','observedAtUnix','v2Only','doNotRepeat',
   'priorActivationRepeated','packRestaged','betaNbtModified','productionModified',
   'oldV1Modified','aliceRestarted','hostNetworkModified','state','reason','flags'}
  if not isinstance(data,dict) or set(data)!=fields or data['audit']!='ALICE_V2_FIRST_PROBE_RESUME':
   raise ValueError('unexpected_receipt')
  if data['schemaVersion']!=1 or data['v2Only'] is not True or data['doNotRepeat'] is not True:
   raise ValueError('unexpected_receipt')
  if any(data[k] is not False for k in (
   'priorActivationRepeated','packRestaged','betaNbtModified',
   'productionModified','oldV1Modified','aliceRestarted','hostNetworkModified')):
   raise ValueError('unexpected_receipt')
  if (not intent.is_file() or data['state'] not in (m.PROBE_STATES|{'unverified'})
      or not isinstance(data['reason'],str) or
      re.fullmatch('[A-Za-z0-9_]{1,80}',data['reason']) is None):
   raise ValueError('unexpected_receipt')
  flags=data['flags']
  allowed={'serverReadyObserved','scriptModuleMessagesObserved','scriptLoadErrorObserved',
   'verifiedScriptModuleLoaded','isolatedBdsExited','networkNamespacePreflightPassed'}
  if not isinstance(flags,dict) or not set(flags)<=allowed or any(type(v) is not bool for v in flags.values()):
   raise ValueError('unexpected_receipt')
  print(json.dumps({'state':'receipt_verified','probeState':data['state'],
         'reason':data['reason'],'flags':flags},separators=(',',':')))
 elif intent.exists():
  print(json.dumps({'state':'one_shot_started_result_unknown'}))
 else:
  try:
   m.verify_unconsumed(lab)
   print(json.dumps({'state':'eligible_for_privileged_preflight'}))
  except ValueError:
   print(json.dumps({'state':'other_probe_marker_present'}))
except (OSError,ValueError,TypeError,KeyError,UnicodeError):
 print(json.dumps({'state':'unverified'}))
"""
SIMPLE={'unsafe_probe_artifact','one_shot_started_result_unknown',
        'eligible_for_privileged_preflight','other_probe_marker_present','unverified'}
STATES={'lab_module_imports_observed','lab_exited_with_error','lab_ready_not_observed',
 'lab_script_load_error_observed','lab_server_ready_module_unverified',
 'lab_shutdown_unverified','blocked','lab_probe_one_shot_consumed',
 'lab_probe_artifacts_incomplete','unverified'}
FLAGS={'serverReadyObserved','scriptModuleMessagesObserved','scriptLoadErrorObserved',
       'verifiedScriptModuleLoaded','isolatedBdsExited','networkNamespacePreflightPassed'}
def sanitize(raw):
    if not isinstance(raw,dict):return None
    if raw.get('state') in SIMPLE and set(raw)=={'state'}:
        return raw
    if (raw.get('state')!='receipt_verified' or set(raw)!={'state','probeState','reason','flags'}
        or raw['probeState'] not in STATES
        or not isinstance(raw['reason'],str) or
        re.fullmatch(r'[A-Za-z0-9_]{1,80}',raw['reason']) is None
        or not isinstance(raw['flags'],dict) or not set(raw['flags'])<=FLAGS or
        any(type(v) is not bool for v in raw['flags'].values())):
        return None
    return raw
def run(output,target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',target):
        raise ValueError('invalid_target')
    if output.is_symlink() or not output.is_dir():raise ValueError('unsafe_output')
    status=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
            '-o','ConnectTimeout=8','-o','ConnectionAttempts=1',
            '-o','StrictHostKeyChecking=yes',target,
            '/usr/bin/python3 -c '+shlex.quote(REMOTE)],
            capture_output=True,text=True,timeout=22,check=False)
        if p.returncode==0 and len(p.stdout)<4096:
            status=sanitize(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    summary={'audit':'ALICE_V2_FIRST_PROBE_RESUME_READONLY',
            'schemaVersion':1,'readOnly':True,'sudoUsed':False,
            'labBdsStarted':False,'probeRepeated':False,'observation':status}
    fd=os.open(output/'v2_first_probe_state.json',
        os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        json.dump(summary,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'observation':status},separators=(',',':')))
def selftest():
    assert sanitize({'state':'eligible_for_privileged_preflight'})
    assert sanitize({'state':'receipt_verified','probeState':'blocked',
         'reason':'lab_netns_unavailable','flags':{'serverReadyObserved':False}})
    assert sanitize({'state':'receipt_verified','probeState':'success','reason':'none','flags':{}}) is None
    assert sanitize({'state':'receipt_verified','probeState':'blocked','reason':'none',
                     'flags':{'hostModified':True}}) is None
    print('ALICE_V2_RESUME_READER_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--read':run(Path(sys.argv[2]),sys.argv[3])
    else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR MINT_TARGET')
