#!/usr/bin/env python3
"""Continue ONLY the unconsumed first v2 BDS probe after a blocked netns check.

Never repeat the original activation, pack stage, Beta NBT edit, or an
already-attempted BDS probe. Only the disposable v2 lab can be started.
Requires an ordinary Mint TTY + interactive sudo for read-only /proc cwd
disambiguation. No root Python and no host-network fallback.
"""
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
EXPECTED_STAGES=[
    {'step':'pack-stage','state':'lab_pack_staged_without_beta_or_network'},
    {'step':'beta-check','state':'ready_for_lab_only_beta_enable'},
    {'step':'beta-enable','state':'lab_beta_nbt_enabled_backup_preserved_not_started'},
    {'step':'netns-check','state':'blocked'},
]
PROBE_STATES={
 'lab_module_imports_observed','lab_exited_with_error',
 'lab_ready_not_observed','lab_script_load_error_observed',
 'lab_server_ready_module_unverified','lab_shutdown_unverified',
 'blocked','lab_probe_one_shot_consumed','lab_probe_artifacts_incomplete',
}
PROBE_MARKERS=(
 '.alice-lab-probe.lock',
 '.alice-lab-probe-original-properties',
 '.alice-lab-probe-original-allowlist',
 'behavior_packs/alice-silent-bds-witness/scripts/.alice-lab-probe-original-main.js',
)
INTENT='.alice-v2-first-probe-resume-once.lock'
RESULT='.alice-v2-first-probe-resume-result.json'

def owned_json(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('prior_receipt_missing_or_unsafe')
    st=path.stat()
    if (not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid()
        or st.st_mode & 0o077 or st.st_size>4096):
        raise ValueError('prior_receipt_missing_or_unsafe')
    try:return json.loads(path.read_text(encoding='utf-8'))
    except (OSError,ValueError,UnicodeError):
        raise ValueError('prior_receipt_missing_or_unsafe')

def verify_prior(lab):
    intent=lab/'.alice-v2-activation-once.lock'
    if (intent.is_symlink() or not intent.is_file()
        or intent.stat().st_uid!=os.getuid()
        or intent.stat().st_mode & 0o077
        or intent.stat().st_size>128
        or intent.read_bytes()!=b'one-shot v2 activation intent\n'):
        raise ValueError('prior_intent_unverified')
    prior=owned_json(lab/'.alice-v2-activation-result.json')
    if (not isinstance(prior,dict)
        or set(prior)!={'audit','schemaVersion','observedAtUnix','v2Only',
            'productionModified','oldV1Modified','productionBdsRestarted',
            'aliceRestarted','credentialStored','state','stages','doNotRepeat'}
        or prior['audit']!='ALICE_V2_INTERACTIVE_ACTIVATION'
        or prior['schemaVersion']!=1
        or type(prior['observedAtUnix']) is not int or prior['observedAtUnix']<=0
        or prior['state']!='not_verified' or prior['stages']!=EXPECTED_STAGES
        or prior['v2Only'] is not True or prior['doNotRepeat'] is not True
        or any(prior[k] is not False for k in (
           'productionModified','oldV1Modified','productionBdsRestarted',
           'aliceRestarted','credentialStored'))):
        raise ValueError('prior_stages_not_exact')
    return True

def verify_unconsumed(lab):
    for rel in (*PROBE_MARKERS,INTENT,RESULT):
        p=lab/rel
        if p.exists() or p.is_symlink():
            raise ValueError('probe_already_attempted_or_ambiguous')
    return True

def lab_identity():
    spec=importlib.util.spec_from_file_location(
        'alice_v2_resume_identity',HERE/'alice-bds-v2-pack.py')
    if spec is None or spec.loader is None:
        raise ValueError('identity_tool_missing')
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.strict_v2_lab(Path.home())

def external_probe(mode):
    if mode not in ('netns-check','netns-probe'):
        raise ValueError('invalid_mode')
    r=subprocess.run([sys.executable,str(HERE/'alice-bds-v2-probe.py'),mode],
             capture_output=True,text=True,timeout=90,check=False)
    if r.returncode!=0 or len(r.stdout)>4096:
        raise ValueError('probe_step_unverified')
    try:x=json.loads(r.stdout)
    except ValueError:raise ValueError('probe_step_unverified')
    if (not isinstance(x,dict) or x.get('audit')!='ALICE_BDS_V2_NETNS_PROBE'
        or x.get('mode')!=mode or x.get('v2Only') is not True
        or x.get('oldV1LabModified') is not False
        or x.get('networkNamespaceRequested') is not True
        or any(x.get(k) is not False for k in (
             'productionWorldModified','productionBdsRestarted','productionWitnessUsed'))):
        raise ValueError('probe_step_unverified')
    state=x.get('state')
    if state not in (PROBE_STATES|{'ready_for_isolated_lab_probe'}):
        raise ValueError('probe_step_unverified')
    reason=x.get('reason')
    if not isinstance(reason,str) or not reason.isascii() or len(reason)>80:
        raise ValueError('probe_step_unverified')
    flags={k:x.get(k) is True for k in (
        'serverReadyObserved','scriptModuleMessagesObserved','scriptLoadErrorObserved',
        'verifiedScriptModuleLoaded','isolatedBdsExited','networkNamespacePreflightPassed')}
    return {'state':state,'reason':reason,'flags':flags}

def exclusive(path,content):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        f.write(content);f.flush();os.fsync(f.fileno())

def main(argv=None):
    args=sys.argv[1:] if argv is None else argv
    if args not in (['audit'],['resume-probe']):
        raise SystemExit('Usage: alice-v2-resume-first-probe.py audit|resume-probe')
    lab=lab_identity()
    verify_prior(lab)
    verify_unconsumed(lab)
    if args==['audit']:
        print(json.dumps({'audit':'ALICE_V2_FIRST_PROBE_RESUME_AUDIT',
           'schemaVersion':1,'readOnly':True,'priorIncompleteVerified':True,
           'probeNotConsumed':True,'state':'eligible_for_privileged_preflight'}))
        return 0
    if os.geteuid()==0 or not sys.stdin.isatty():
        raise SystemExit('Only ordinary Mint user and interactive TTY allowed')
    auth=subprocess.run(['sudo','-v'],check=False)
    if auth.returncode!=0:
        raise SystemExit('Authorization unavailable; no probe started')
    try:
        # Test the exact reviewed pack, persisted Beta flag, BDS ownership,
        # isolated lo and network gates BEFORE any new one-shot probe marker.
        checked=external_probe('netns-check')
        if checked['state']!='ready_for_isolated_lab_probe' or not checked['flags']['networkNamespacePreflightPassed']:
            print(json.dumps({'audit':'ALICE_V2_FIRST_PROBE_RESUME',
              'state':'preflight_blocked','reason':checked['reason'],
              'probeRequested':False,'doNotRepeat':False}))
            return 0
        verify_prior(lab)
        verify_unconsumed(lab)
        exclusive(lab/INTENT,'first v2 BDS probe resume intent; never retry\n')
        result={'state':'unverified','reason':'probe_result_unavailable','flags':{}}
        try:result=external_probe('netns-probe')
        except (OSError,ValueError,TypeError,subprocess.SubprocessError):
            pass
        record={'audit':'ALICE_V2_FIRST_PROBE_RESUME','schemaVersion':1,
          'observedAtUnix':int(time.time()),'v2Only':True,'doNotRepeat':True,
          'priorActivationRepeated':False,'packRestaged':False,
          'betaNbtModified':False,'productionModified':False,
          'oldV1Modified':False,'aliceRestarted':False,
          'hostNetworkModified':False,'state':result['state'],
          'reason':result['reason'],'flags':result['flags']}
        exclusive(lab/RESULT,json.dumps(record,separators=(',',':'))+'\n')
        print(json.dumps(record,separators=(',',':')))
        return 0
    finally:
        subprocess.run(['sudo','-k'],stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                check=False,timeout=5)

if __name__=='__main__':
    try:raise SystemExit(main())
    except (OSError,ValueError,TypeError,KeyError):
        print('Alice v2 resume: refused by a safety gate; no retry',file=sys.stderr)
        raise SystemExit(1)
