#!/usr/bin/env bash
# Explicit lab-only behavior pack stage; never touches production BDS.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Run on Mac.' >&2; exit 2; }
mode="$1"
[[ "$mode" == check || "$mode" == stage ]] || { echo 'Usage: ... check|stage' >&2; exit 2; }
target="$(printenv ALICE_SSH_TARGET || true)"
[[ "$target" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || {
  echo 'Set ALICE_SSH_TARGET=user@your-Mint.' >&2; exit 2; }
desktop="$HOME/Desktop"
[[ -d "$desktop" && ! -L "$desktop" ]] || { echo 'Missing safe Mac Desktop.' >&2; exit 2; }
stamp="$(date +%Y%m%d-%H%M%S)"
out="$desktop/AliceAI-BDS-Lab-Pack-$mode-$stamp.json"
[[ ! -e "$out" ]] || { echo 'Refusing existing report.' >&2; exit 2; }
temp="$(mktemp "$desktop/.alice-bds-lab-pack.XXXXXXXX")"
chmod 600 "$temp"
trap 'rm -f "$temp"' EXIT
ssh -o BatchMode=yes -o ConnectTimeout=10 "$target" \
  "python3 \"\$HOME/minecraft-ai/scripts/alice-bds-lab-pack.py\" $mode" > "$temp"
python3 - "$temp" "$mode" <<'PY'
import json, pathlib, sys, time
p=pathlib.Path(sys.argv[1])
mode=sys.argv[2]
raw=p.read_bytes()
if len(raw)>8192:
    raise SystemExit("Oversized lab pack report, not exported.")
try:
    obj=json.loads(raw)
except (UnicodeError, ValueError):
    raise SystemExit("Invalid Mint lab pack report, not exported.")
if (not isinstance(obj,dict) or obj.get("audit")!="ALICE_BDS_LAB_PACK_ONLY" or
    obj.get("schemaVersion")!=1 or obj.get("mode")!=mode or
    any(obj.get(k) is not False for k in
        ("betaNbtModified","secretsInstalled","networkEnabled",
         "productionModified","productionBdsRestarted","labBdsStartedByThisAction",
         "serverModuleRuntimeVerified")) or obj.get("labOnly") is not True):
    raise SystemExit("Unexpected lab-only safety contract; no export.")
observed=obj.get("observedAtUnix")
if type(observed) is not int or abs(int(time.time())-observed)>900:
    raise SystemExit("Missing or stale Mint timestamp; no export.")
allowed={
    "state":{"preconditions_failed","ready_for_new_lab_only_pack",
             "blocked_existing_pack_or_world_registration",
             "lab_pack_staged_without_beta_or_network"},
    "betaApisExperiment":{"enabled_in_level_dat","disabled_in_level_dat",
                          "not_declared_in_level_dat","unverified"}}
safe={"audit":"ALICE_BDS_LAB_PACK_ONLY","schemaVersion":1,
      "observedAtUnix":observed,"mode":mode,"labOnly":True,
      "betaNbtModified":False,"secretsInstalled":False,"networkEnabled":False,
      "productionModified":False,"productionBdsRestarted":False,
      "labBdsStartedByThisAction":False,"serverModuleRuntimeVerified":False}
for key, values in allowed.items():
    if obj.get(key) not in values:
        raise SystemExit("Unexpected lab status, no export.")
    safe[key]=obj[key]
p.write_text(json.dumps(safe,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
PY
mv "$temp" "$out"
trap - EXIT
echo "Saved lab-only pack stage to Mac Desktop: $out"
echo "The lab BDS is NOT started; Beta API setting and all production files remain unchanged."
