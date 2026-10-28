#!/usr/bin/env bash
# Validate archive and explicitly prepare fresh v2 lab only when requested.
# Never starts a BDS or touches existing v1, production, or host network.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Run on Mac.' >&2; exit 2; }
[[ $# -eq 1 && ( "$1" == check || "$1" == prepare ) ]] || {
  echo 'Usage: alice-bds-lab-v2-mac.sh check|prepare' >&2; exit 2; }
mode="$1"
target="$(printenv ALICE_SSH_TARGET || true)"
[[ "$target" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || {
  echo 'Set ALICE_SSH_TARGET=user@Mint.' >&2; exit 2; }
desktop="$HOME/Desktop"
[[ -d "$desktop" && ! -L "$desktop" ]] || {
  echo 'Desktop not available.' >&2; exit 2; }
out="$desktop/AliceAI-BDS-Lab-v2-$mode-$(date +%Y%m%d-%H%M%S).json"
[[ ! -e "$out" ]] || { echo 'Refusing to overwrite report.' >&2; exit 2; }
tmp="$(mktemp "$desktop/.AliceAI-bds-v2.XXXXXXXX")"
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
ssh -T -o BatchMode=yes -o ConnectTimeout=10 "$target" \
  "python3 \"\$HOME/minecraft-ai/scripts/alice-bds-lab-v2.py\" $mode" > "$tmp"
python3 - "$tmp" "$mode" <<'PY'
import json, pathlib, sys, time
p=pathlib.Path(sys.argv[1])
requested=sys.argv[2]
raw=p.read_bytes()
if len(raw)>4096:
    raise SystemExit("Unexpected report length.")
try:
    x=json.loads(raw)
except (UnicodeError, ValueError):
    raise SystemExit("Invalid JSON report.")
keys={"audit","schemaVersion","observedAtUnix","mode","state",
      "backupRestore","reason","v2DirectoryOnly","oldV1LabModified",
      "labBdsStarted","productionWorldModified","productionBdsRestarted",
      "productionWitnessUsed"}
if not isinstance(x,dict) or set(x)!=keys:
    raise SystemExit("Unexpected report schema.")
if x["audit"]!="ALICE_BDS_ARCHIVED_LAB_V2" or \
        type(x["schemaVersion"]) is not int or x["schemaVersion"]!=1 \
        or x["mode"]!=requested:
    raise SystemExit("Invalid audit metadata.")
if type(x["observedAtUnix"]) is not int or \
        abs(x["observedAtUnix"]-int(time.time()))>900:
    raise SystemExit("Invalid report timestamp.")
if x["state"] not in ("absent","unknown","already_exists",
                      "new_disposable_copy_created_not_started"):
    raise SystemExit("Unrecognized state.")
if x["backupRestore"] not in (
        "not_verified","archive_sha256_isolated_restore_verified"):
    raise SystemExit("Unrecognized backup status.")
if x["reason"] not in (
        "none","production_target_mismatch","lab_exists_do_not_overwrite",
        "configured_manifest_unavailable","backup_restore_not_verified",
        "wrong_backup_world","backup_restore_failed","invalid_mode",
        "prepared_lab_contract_failed","isolated_lab_prepare_failed",
        "ready_for_explicit_lab_prepare","lab_ready_for_future_beta_test",
        "internal_error"):
    raise SystemExit("Unrecognized reason.")
if x["v2DirectoryOnly"] is not True or any(x[k] is not False for k in (
        "oldV1LabModified","labBdsStarted","productionWorldModified",
        "productionBdsRestarted","productionWitnessUsed")):
    raise SystemExit("Unsafe report flags.")
p.write_text(json.dumps(x,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
PY
mv "$tmp" "$out"
trap - EXIT
echo "Saved v2 archived-lab report: $out"
echo 'No BDS start or production/old-lab changes by this action.'
