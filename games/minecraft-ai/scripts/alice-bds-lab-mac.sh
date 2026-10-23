#!/usr/bin/env bash
# Explicit operator-controlled backed-up-world lab workflow. Mac only.
# check verifies the archived backup in a Mint isolated temporary restore.
# prepare creates a NEW disposable 17880 directory; never runs a BDS.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Run this command on Mac.' >&2; exit 2; }
mode="$1"
[[ "$mode" == check || "$mode" == prepare ]] || { echo 'Usage: ... check|prepare' >&2; exit 2; }
target="$(printenv ALICE_SSH_TARGET || true)"
[[ "$target" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || {
  echo 'Set ALICE_SSH_TARGET=user@host' >&2; exit 2;
}
desktop="$HOME/Desktop"
[[ -d "$desktop" && ! -L "$desktop" ]] || { echo 'Missing safe Mac Desktop.' >&2; exit 2; }
stamp="$(date +%Y%m%d-%H%M%S)"
out="$desktop/AliceAI-BDS-Lab-$mode-$stamp.json"
[[ ! -e "$out" ]] || { echo 'Report already exists; nothing overwritten.' >&2; exit 1; }
tmp="$(mktemp "$desktop/.alice-bds-lab.XXXXXXXX")"
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
# Only explicit prepare constructs one isolated directory from an offline archive.
ssh -o BatchMode=yes -o ConnectTimeout=10 "$target" \
    "python3 \"\$HOME/minecraft-ai/scripts/alice-bds-archived-lab.py\" $mode" > "$tmp"
python3 - "$tmp" "$mode" <<'PY'
import json, pathlib, sys, time
p=pathlib.Path(sys.argv[1])
requested=sys.argv[2]
raw=p.read_bytes()
if len(raw)>8192:
    raise SystemExit("Lab report oversized; no Desktop output saved.")
try:
    obj=json.loads(raw)
except (ValueError, UnicodeError):
    raise SystemExit("Lab result was not JSON; no Desktop output saved.")
if (not isinstance(obj,dict) or obj.get("audit")!="ALICE_BDS_ARCHIVED_LAB"
    or type(obj.get("schemaVersion")) is not int or obj["schemaVersion"]!=1
    or obj.get("mode")!=requested or obj.get("productionWorldModified") is not False
    or obj.get("productionBdsRestarted") is not False
    or obj.get("safeToChangeProductionWorld") is not False):
    raise SystemExit("Unexpected lab result contract; no Desktop output saved.")
t=obj.get("observedAtUnix")
if type(t) is not int or abs(int(time.time())-t)>900:
    raise SystemExit("Mint/Mac clocks disagree or old result; no Desktop report.")
allowed={
 "backupRestore":{"not_verified","archive_sha256_isolated_restore_verified"},
 "labState":{"absent","unknown","already_exists","new_disposable_copy_created_not_started"},
 "reason":{"none","production_target_mismatch","lab_exists_do_not_overwrite",
           "configured_manifest_unavailable","backup_restore_not_verified",
           "wrong_backup_world","backup_restore_failed","invalid_mode",
           "prepared_lab_contract_failed","isolated_lab_prepare_failed",
           "ready_for_explicit_lab_prepare","lab_ready_for_future_beta_test",
           "internal_error"}}
clean={"audit":"ALICE_BDS_ARCHIVED_LAB","schemaVersion":1,"observedAtUnix":t,
       "mode":requested,"productionWorldModified":False,
       "productionBdsRestarted":False,"safeToChangeProductionWorld":False}
for key, choices in allowed.items():
    if obj.get(key) not in choices:
        raise SystemExit("Unexpected lab status field; report discarded.")
    clean[key]=obj[key]
p.write_text(json.dumps(clean,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
PY
mv "$tmp" "$out"
trap - EXIT
echo "Saved sanitized lab $mode result to Mac Desktop: $out"
echo "Upload this JSON. Neither Alice nor the production BDS was restarted."
