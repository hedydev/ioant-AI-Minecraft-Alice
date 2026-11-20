#!/usr/bin/env python3
"""Pinned MCP wrapper: read-only plan, or one specifically authorized activation."""
import importlib.util
import json
from pathlib import Path
import shlex
import subprocess
import sys

HERE=Path(__file__).resolve().parent
def load():
    spec=importlib.util.spec_from_file_location('activation_preflight_wrapper',HERE/'alice-stable-activation-preflight.py')
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def run(mode,out,operation):
    if mode not in ('--plan','--activate','--status','--resume-client','--finish-recovery','--activate-authorized-second'):raise ValueError('invalid_mode')
    if mode=='--activate' and operation!='alice_movement_20261120_stable_activate_013':raise ValueError('operation_not_authorized')
    if mode=='--activate-authorized-second' and operation!='alice_movement_20261120_stable_activate_second_018':raise ValueError('operation_not_authorized')
    # Execute this committed source; imports are the maintained Mint helpers.
    code=(HERE/'alice_stable_witness_activation.py').read_text()
    call={'--plan':'a=Activation();facts,_=a.inspect();print(json.dumps({"state":"ready","facts":facts}))',
        '--activate':'a=Activation();r=a.apply();print(json.dumps(safe_report(r)))',
        '--status':'a=Activation();r,_=a.recovery_status();print(json.dumps(r))',
        '--finish-recovery':'a=Activation();print(json.dumps(a.finish_recovery_settings()))',
        '--activate-authorized-second':"OPERATION='alice_movement_20261120_stable_activate_second_018';a=Activation();r=a.apply();print(json.dumps(safe_report(r)))",
        '--resume-client':'a=Activation();print(json.dumps(a.resume_client_only()))'}[mode]
    remote="import sys;from pathlib import Path;sys.path.insert(0,str(Path.home()/'minecraft-ai/scripts'))\n"+code+'\ntry:\n '+call+'\nexcept Exception as e:\n print(json.dumps({"state":"blocked","failureType":type(e).__name__,"reason":str(e) if type(e) is ValueError and re.fullmatch("[a-z_]{3,80}",str(e)) else "preflight_error"}))\n'
    p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
        '-o','ConnectTimeout=8',load().target(),'/usr/bin/python3 -c '+shlex.quote(remote)],capture_output=True,text=True,
        timeout=260 if mode in ('--activate','--activate-authorized-second') else 120 if mode=='--resume-client' else 30,check=False)
    # Only sanitized JSON is accepted. Backup helpers print private paths; the
    # final single JSON line is the sole exported artifact, never stdout/stderr.
    result={'state':'unverified','reason':'transport_or_preflight_failed','exitCode':p.returncode}
    if len(p.stdout)<65536:
        try:result=json.loads(p.stdout.strip().splitlines()[-1])
        except (ValueError,IndexError):pass
    output=Path(out)
    if output.is_symlink() or not output.is_dir():raise ValueError('unsafe_output')
    with (output/'stable_activation.json').open('x') as f:json.dump(result,f)
    print(json.dumps({'state':result.get('state'),'reason':result.get('reason')}))

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        compile((HERE/'alice_stable_witness_activation.py').read_text(),'<activation>','exec');load().target()
        print('STABLE_ACTIVATION_TASK_PASS')
    elif len(sys.argv)==5:run(sys.argv[1],sys.argv[2],sys.argv[3]) if sys.argv[4]=='--owner-authorized-stable-only' else sys.exit(2)
    else:raise SystemExit('usage: --self-test | --plan/--activate OUTPUT OPERATION --owner-authorized-stable-only')
