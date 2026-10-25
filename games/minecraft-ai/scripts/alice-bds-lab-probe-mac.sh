#!/usr/bin/env bash
# Bounded isolated 17880 Bedrock server startup probe, with private logs.
# Only sudo -v and sudo -n readlink use elevation; Python BDS stays unprivileged.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Run on Mac.' >&2; exit 2; }
[[ $# -eq 1 && ( "$1" == check || "$1" == probe || "$1" == netns-check || "$1" == netns-probe || "$1" == netns-postmortem ) ]] || {
  echo 'Usage: alice-bds-lab-probe-mac.sh check|probe|netns-check|netns-probe|netns-postmortem' >&2; exit 2; }
mode="$1"
target="$(printenv ALICE_SSH_TARGET || true)"
[[ "$target" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || {
  echo 'Set ALICE_SSH_TARGET=user@Mint.' >&2; exit 2; }
desktop="$HOME/Desktop"
[[ -d "$desktop" && ! -L "$desktop" ]] || { echo 'Desktop unavailable.' >&2; exit 2; }
out="$desktop/AliceAI-BDS-Lab-Startup-$mode-$(date +%Y%m%d-%H%M%S).json"
[[ ! -e "$out" ]] || { echo 'Report already exists.' >&2; exit 2; }
tmp="$(mktemp "$desktop/.AliceAI-lab-startup.XXXXXXXX")"
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
echo 'Mint sudo may be requested ONLY to read /proc/PID/cwd.'
ssh -tt -o BatchMode=yes -o ConnectTimeout=10 "$target" \
  "sudo -v && python3 \"\$HOME/minecraft-ai/scripts/alice-bds-lab-probe.py\" $mode" | tee "$tmp"
python3 - "$tmp" "$mode" <<'PY'
import json, pathlib, sys, time
p=pathlib.Path(sys.argv[1])
mode=sys.argv[2]
raw=p.read_bytes()
if len(raw)>8192:
    raise SystemExit("Raw interactive output too long; no report saved.")
try:
    lines=raw.decode("utf-8").splitlines()
except UnicodeError:
    raise SystemExit("Unrecognized output; no report saved.")
marker='{"audit":"ALICE_BDS_LAB_STARTUP_PROBE"'
rows=[line[line.index(marker):].strip() for line in lines if marker in line]
if len(rows)!=1:
    raise SystemExit("No unique lab startup report, no Desktop output.")
try:
    o=json.loads(rows[0])
except ValueError:
    raise SystemExit("Invalid lab startup JSON, no Desktop output.")
if (not isinstance(o,dict) or o.get("audit")!="ALICE_BDS_LAB_STARTUP_PROBE"
    or type(o.get("schemaVersion")) is not int or o["schemaVersion"]!=1
    or o.get("mode")!=mode):
    raise SystemExit("Lab startup report contract mismatch.")
at=o.get("observedAtUnix")
if type(at) is not int or abs(int(time.time())-at)>900:
    raise SystemExit("Lab startup report timestamp invalid.")
enums={
    "state":{"blocked","ready_for_isolated_lab_probe",
             "lab_shutdown_unverified","lab_exited_with_error",
             "lab_ready_not_observed","lab_script_load_error_observed",
             "lab_server_ready_module_unverified","lab_module_imports_observed",
             "lab_probe_one_shot_consumed","lab_probe_artifacts_incomplete"},
    "reason":{"none","missing_lab_beta_tool","lab_beta_not_enabled",
              "lab_process_guard_unavailable",
              "lab_bds_binary_not_executable","refuse_root_python",
              "unsafe_lab_properties","duplicate_lab_property",
              "lab_port_world_or_auth_changed","unsafe_lab_allowlist",
              "lab_probe_already_prepared","lab_probe_already_running",
              "unsafe_lab_config",
              "lab_udp_ports_busy","lab_netns_unavailable","invalid_action","lab_pack_not_staged",
              "unsafe_lab_postmortem_file",
              "unsafe_lab_instrumentation","lab_script_drift",
              "lab_script_unexpected_imports","lab_bds_is_running",
              "bds_cwd_requires_privileged_read","bds_cwd_unverified",
              "proc_unavailable","unverified_guard","io_or_process_error"}
}
bools=("isolationConfigReady","serverReadyObserved",
       "scriptModuleMessagesObserved","scriptLoadErrorObserved",
       "verifiedScriptModuleLoaded","isolatedBdsExited",
       "networkNamespaceRequested","networkNamespacePreflightPassed",
       "labProbeOneShotConsumed","originalLaunchStdoutRetained",
       "productionWorldModified",
       "productionBdsRestarted","productionWitnessUsed")
sanitized={"audit":"ALICE_BDS_LAB_STARTUP_PROBE","schemaVersion":1,
           "observedAtUnix":at,"mode":mode}
for k,valid in enums.items():
    if o.get(k) not in valid:
        raise SystemExit("Unknown lab probe enum field; no output.")
    sanitized[k]=o[k]
for k in bools:
    if type(o.get(k)) is not bool:
        raise SystemExit("Unknown lab probe boolean field; no output.")
    sanitized[k]=o[k]
if o.get("isolatedLoopbackState") not in ("up","down","unverified"):
    raise SystemExit("Unknown namespace loopback observation; no output.")
sanitized["isolatedLoopbackState"]=o["isolatedLoopbackState"]
if any(sanitized[k] for k in ("productionWorldModified","productionBdsRestarted",
                             "productionWitnessUsed")):
    raise SystemExit("Probe violates production isolation contract.")
p.write_text(json.dumps(sanitized,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
PY
mv "$tmp" "$out"
trap - EXIT
echo "Saved sanitized 17880 startup result: $out"
echo "No production world/restart/18781 receiver operation was performed."
