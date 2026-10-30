#!/usr/bin/env python3
"""One *interactive* owner-approved v2 lab activation, never production.

Run on Mint under a real TTY. sudo -v authenticates only the existing
read-only root BDS cwd inspection (sudo -n readlink); all Python/lab writes
remain the Mint user. No stdout from BDS or private credentials is printed.
"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
STEPS=(
 ('pack-stage','alice-bds-v2-pack.py','stage','lab_pack_staged_without_beta_or_network'),
 ('beta-check','alice-bds-v2-beta.py','check','ready_for_lab_only_beta_enable'),
 ('beta-enable','alice-bds-v2-beta.py','enable','lab_beta_nbt_enabled_backup_preserved_not_started'),
 ('netns-check','alice-bds-v2-probe.py','netns-check','ready_for_isolated_lab_probe'),
)
REPORTS={'pack-stage':'ALICE_V2_STRICT_PACK',
         'beta-check':'ALICE_V2_BETA_NBT','beta-enable':'ALICE_V2_BETA_NBT',
         'netns-check':'ALICE_BDS_V2_NETNS_PROBE','netns-probe':'ALICE_BDS_V2_NETNS_PROBE'}
def verified_lab():
    spec=importlib.util.spec_from_file_location('v2_interactive_identity',HERE/'alice-bds-v2-pack.py')
    if spec is None or spec.loader is None:raise ValueError('gate_missing')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.strict_v2_lab(Path.home())
def validate_output(step,text,expected=None):
    if not isinstance(text,str) or len(text)>4096:raise ValueError('unexpected_report')
    result=json.loads(text)
    if not isinstance(result,dict) or result.get('audit')!=REPORTS[step] or result.get('v2Only') is not True:
        raise ValueError('unexpected_report')
    if step=='pack-stage':
        safe=('productionModified','oldV1Modified','labBdsStarted','betaNbtModified',
              'secretsInstalled','receiverEnabled')
    elif step.startswith('beta'):
        safe=('productionWorldModified','oldV1LabModified','productionBdsRestarted',
              'labBdsStarted','receiverNetworkEnabled','serverModuleVerified')
    else:
        safe=('productionWorldModified','productionBdsRestarted','productionWitnessUsed',
              'oldV1LabModified')
        if result.get('networkNamespaceRequested') is not True:
            raise ValueError('unexpected_report')
    if any(result.get(k) is not False for k in safe):
        raise ValueError('unexpected_report')
    state=result.get('state')
    if not isinstance(state,str) or not state.isascii() or len(state)>80:
        raise ValueError('unexpected_report')
    if expected is not None and state!=expected:
        return False,state
    return True,state
def run_step(step,filename,argument,expected=None,executor=subprocess.run):
    r=executor([sys.executable,str(HERE/filename),argument],
               capture_output=True,text=True,timeout=90,check=False)
    if r.returncode!=0:raise ValueError('operator_step_failed')
    return validate_output(step,r.stdout.strip(),expected)
def workflow(executor=subprocess.run):
    stages=[]
    for step,filename,arg,expected in STEPS:
        ok,state=run_step(step,filename,arg,expected,executor=executor)
        stages.append({'step':step,'state':state})
        if not ok:return stages,False
    ok,state=run_step('netns-probe','alice-bds-v2-probe.py','netns-probe',
                      executor=executor)
    stages.append({'step':'netns-probe','state':state})
    return stages,ok and state=='lab_module_imports_observed'
def main():
    if sys.argv[1:]!=['activate']:
        raise SystemExit('usage: alice-v2-interactive-activation.py activate')
    if os.geteuid()==0 or not sys.stdin.isatty():
        raise SystemExit('Requires ordinary Mint account with interactive TTY; never root Python')
    lab=verified_lab()
    # A user types their sudo password directly into their own terminal, not
    # into ChatGPT. The ticket is invalidated even on a blocked stage.
    auth=subprocess.run(['sudo','-v'],check=False)
    if auth.returncode!=0:
        raise SystemExit('Authorization not granted; no v2 action executed')
    try:
        # New-only persistent intent. Never allow a second automatic probe
        # after a crash or unknown outcome; read the first artifact instead.
        lock=lab/'.alice-v2-activation-once.lock'
        fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY|
                   getattr(os,'O_NOFOLLOW',0),0o600)
        with os.fdopen(fd,'w',encoding='ascii') as f:
            f.write('one-shot v2 activation intent\n')
        stages=[];passed=False
        try:
            stages,passed=workflow()
        except (OSError,ValueError,TypeError,subprocess.SubprocessError):
            stages.append({'step':'aborted','state':'unverified'})
        report={'audit':'ALICE_V2_INTERACTIVE_ACTIVATION','schemaVersion':1,
          'observedAtUnix':int(time.time()),'v2Only':True,
          'productionModified':False,'oldV1Modified':False,
          'productionBdsRestarted':False,'aliceRestarted':False,
          'credentialStored':False,'state':'imports_observed' if passed else 'not_verified',
          'stages':stages,'doNotRepeat':True}
        artifact=lab/'.alice-v2-activation-result.json'
        fdesc=os.open(artifact,os.O_WRONLY|os.O_CREAT|os.O_EXCL|
                      getattr(os,'O_NOFOLLOW',0),0o600)
        with os.fdopen(fdesc,'w',encoding='utf-8') as f:
            json.dump(report,f,separators=(',',':'));f.write('\n')
        print(json.dumps(report,separators=(',',':')))
    finally:
        subprocess.run(['sudo','-k'],stdin=subprocess.DEVNULL,
                       stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                       check=False,timeout=5)
if __name__=='__main__':
    main()
