#!/usr/bin/env python3
"""Disposable v2 ONLY: short Script API import probe in own user net namespace.

Never starts BDS on host UDP, never connects Xbox, sends querytarget or alters
production. Each actual netns-probe is one-shot and records no private logs.
"""
import importlib.util
import json
from pathlib import Path
import sys
import time

HERE=Path(__file__).resolve().parent
MODES={'netns-check','netns-probe','netns-postmortem'}
REASONS={'missing_lab_beta_tool','lab_beta_not_enabled','lab_process_guard_unavailable',
  'lab_bds_binary_not_executable','refuse_root_python','unsafe_lab_properties',
  'duplicate_lab_property','lab_port_world_or_auth_changed','unsafe_lab_allowlist',
  'lab_probe_already_prepared','lab_probe_already_running','unsafe_lab_config',
  'unsafe_lab_instrumentation','lab_script_drift','lab_script_unexpected_imports',
  'lab_udp_ports_busy','lab_netns_unavailable','lab_netns_loopback_unavailable',
  'invalid_action','lab_pack_not_staged',
  'unsafe_lab_postmortem_file','lab_bds_is_running','bds_cwd_requires_privileged_read',
  'bds_cwd_unverified','proc_unavailable','v2_lab_missing','v2_generation_mismatch',
  'v2_lab_marker_unavailable'}
def load(alias,name):
    s=importlib.util.spec_from_file_location(alias,HERE/name)
    if s is None or s.loader is None:
        raise ValueError('missing_lab_beta_tool')
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def run(mode,*,probe_module=None,home=None):
    if mode not in MODES:raise ValueError('invalid_action')
    lab=load('v2_probe_identity','alice-bds-v2-pack.py').strict_v2_lab(
        Path.home() if home is None else home)
    module=probe_module or load('v2_isolated_bds_probe','alice-bds-lab-probe.py')
    return module.run_action(mode,lab=lab)
def main(args=None):
    args=sys.argv[1:] if args is None else args
    if len(args)!=1 or args[0] not in MODES:
        raise SystemExit('Usage: alice-bds-v2-probe.py netns-check|netns-probe|netns-postmortem')
    mode=args[0]
    m=load('v2_probe_report','alice-bds-lab-probe.py')
    try:
        state, flags=run(mode,probe_module=m)
        result=m.output(mode,state,flags)
    except ValueError as exc:
        code=str(exc)
        result=m.output(mode,'blocked',reason=code if code in REASONS else 'unverified_guard')
    except (OSError,TypeError,KeyError):
        result=m.output(mode,'blocked',reason='io_or_process_error')
    # The v2 label is distinct from v1, while keeping all output fields and
    # their allowlisted booleans consistent with the tested native reporter.
    result['audit']='ALICE_BDS_V2_NETNS_PROBE'
    result['v2Only']=True
    result['oldV1LabModified']=False
    print(json.dumps(result,separators=(',',':')))
    return 0
if __name__=='__main__':raise SystemExit(main())
