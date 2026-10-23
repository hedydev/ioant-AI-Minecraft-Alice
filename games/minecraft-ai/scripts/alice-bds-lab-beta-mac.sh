#!/usr/bin/env bash
# Mac: explicitly enable Beta APIs ONLY in an already-staged 17880 lab NBT.
# Interactive privileged readlink checks /proc; Python world edits are NEVER root.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Run on Mac.' >&2; exit 2; }
[[ $# -eq 1 && ( "$1" == check || "$1" == enable ) ]] || {
  echo 'Usage: alice-bds-lab-beta-mac.sh check|enable' >&2; exit 2; }
mode="$1"
target="$(printenv ALICE_SSH_TARGET || true)"
[[ "$target" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || {
  echo 'Set ALICE_SSH_TARGET=user@Mint.' >&2; exit 2; }
desktop="$HOME/Desktop"
[[ -d "$desktop" && ! -L "$desktop" ]] || { echo 'Missing safe Desktop.' >&2; exit 2; }
name="AliceAI-BDS-Lab-Beta-$mode-$(date +%Y%m%d-%H%M%S).json"
out="$desktop/$name"
[[ ! -e "$out" ]] || { echo 'Desktop report already exists.' >&2; exit 2; }
tmp="$(mktemp "$desktop/.AliceAI-beta.XXXXXXXX")"
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
echo 'Checking BDS instance identity. Mint sudo password may be requested for read-only /proc inspection.'
# A single session grants cached sudo -n readlink. The stage Python is NOT
# elevated. The 17879 production world and server are never edited/restarted.
ssh -tt -o BatchMode=yes -o ConnectTimeout=10 "$target" \
  "sudo -v && python3 \"\$HOME/minecraft-ai/scripts/alice-bds-lab-beta.py\" $mode" | tee "$tmp"
python3 - "$tmp" "$mode" <<'PY'
import json, pathlib, sys, time
p=pathlib.Path(sys.argv[1])
mode=sys.argv[2]
raw=p.read_bytes()
if len(raw)>8192:
    raise SystemExit("Beta report too large; not saved.")
try:
    lines=raw.decode("utf-8").splitlines()
except UnicodeError:
    raise SystemExit("Invalid interactive output; not saved.")
prefix='{"audit":"ALICE_BDS_LAB_BETA_ONLY"'
found=[line[line.index(prefix):].strip() for line in lines if prefix in line]
if len(found)!=1:
    raise SystemExit("Could not establish one lab-beta result; not saved.")
try:
    o=json.loads(found[0])
except (ValueError,UnicodeError):
    raise SystemExit("Unrecognized lab-beta output; not saved.")
if (not isinstance(o,dict) or o.get("audit")!="ALICE_BDS_LAB_BETA_ONLY"
    or type(o.get("schemaVersion")) is not int or o["schemaVersion"]!=1
    or o.get("mode")!=mode or
    any(o.get(k) is not False for k in (
        "productionWorldModified","productionBdsRestarted","labBdsStarted",
        "labWitnessNetworkEnabled","serverModuleRuntimeVerified"))):
    raise SystemExit("Lab-only safety contract rejected; not saved.")
observed=o.get("observedAtUnix")
if type(observed) is not int or abs(int(time.time())-observed)>900:
    raise SystemExit("Mint timestamp missing or stale; not saved.")
enums={
    "state":{"blocked","ready_for_lab_only_beta_enable",
             "lab_beta_nbt_enabled_backup_preserved_not_started"},
    "reason":{"none","gate_missing","lab_pack_not_staged","invalid_level_nbt",
              "beta_flag_already_declared","duplicate_experiments_compound",
              "lab_level_missing","lab_level_ownership_or_size",
              "lab_level_changed","beta_flag_not_absent",
              "lab_beta_backup_exists","unknown_mode","lab_beta_postcheck_failed",
              "bds_cwd_requires_privileged_read","bds_cwd_unverified",
              "lab_bds_is_running","proc_unavailable","lab_marker_mismatch",
              "lab_server_properties_mismatch","lab_or_production_directory_missing",
              "lab_world_missing","lab_parent_directory_invalid",
              "unreviewed_source_pack","unverified_gate","io_or_schema_error"}}
safe={"audit":"ALICE_BDS_LAB_BETA_ONLY","schemaVersion":1,
      "observedAtUnix":observed,"mode":mode,"productionWorldModified":False,
      "productionBdsRestarted":False,"labBdsStarted":False,
      "labWitnessNetworkEnabled":False,"serverModuleRuntimeVerified":False}
for key,allowed in enums.items():
    if o.get(key) not in allowed:
        raise SystemExit("Unknown or private field in lab-beta status; not saved.")
    safe[key]=o[key]
p.write_text(json.dumps(safe,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
PY
mv "$tmp" "$out"
trap - EXIT
echo "Saved isolated 17880 Beta action report: $out"
echo "No BDS was started or restarted, and production 17879 was never edited."
