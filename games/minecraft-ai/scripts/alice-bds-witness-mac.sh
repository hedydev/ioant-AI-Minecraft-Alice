#!/usr/bin/env bash
# Read-only Mint production BDS witness preflight; only local Desktop JSON output.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo "Run on Mac." >&2; exit 2; }
target="$(printenv ALICE_SSH_TARGET || true)"
[[ "$target" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || {
  echo "Set ALICE_SSH_TARGET=user@your-own-Mint." >&2; exit 2;
}
desktop="$HOME/Desktop"
[[ -d "$desktop" && ! -L "$desktop" ]] || { echo "Missing safe Desktop." >&2; exit 2; }
datepart="$(date +%Y%m%d-%H%M%S)"
out="$desktop/AliceAI-BDS-Witness-Preflight-$datepart.json"
[[ ! -e "$out" ]] || { echo "Report already exists; nothing overwritten." >&2; exit 1; }
tmp="$(mktemp "$desktop/.AliceAI-witness-preflight.XXXXXXXX")"
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
# No shell environment, world files, process details or credentials are copied.
ssh -o BatchMode=no -o ConnectTimeout=10 "$target" \
  'python3 "$HOME/minecraft-ai/scripts/alice-bds-witness-preflight.py"' > "$tmp"
python3 - "$tmp" <<'PY'
import json, pathlib, sys, time
p = pathlib.Path(sys.argv[1])
raw = p.read_bytes()
if len(raw) > 16384:
    raise SystemExit("Preflight rejected oversized output.")
try:
    obj = json.loads(raw)
except (ValueError, UnicodeError):
    raise SystemExit("Preflight output not valid JSON.")
if (not isinstance(obj, dict) or
    obj.get("audit") != "ALICE_BDS_SILENT_WITNESS_READ_ONLY" or
    obj.get("readOnly") is not True or
    obj.get("safeToApplyWorldChanges") is not False):
    raise SystemExit("Preflight could not establish the read-only contract.")
if (type(obj.get("schemaVersion")) is not int or obj["schemaVersion"] != 2 or
    obj.get("betaApisExperiment") not in (
        "enabled_in_level_dat", "disabled_in_level_dat",
        "not_declared_in_level_dat", "unverified") or
    obj.get("betaModulesLoaded") != "not_verified_without_bds_log_or_runtime_witness"):
    raise SystemExit("Mint returned OLD witness preflight format; first update and sync current main. No Desktop report saved.")
seen = obj.get("observedAtUnix")
if type(seen) is not int or abs(int(time.time()) - seen) > 900:
    raise SystemExit("Mint witness preflight timestamp missing or stale; check Mac/Mint clocks. No Desktop report saved.")
# Prevent unrecognized Mint output (including private paths, usernames or
# credentials) from being copied into a desktop report, even after a bad sync.
bool_fields = (
    "bdsRootMatchesExpected", "propertiesMatchProduction17879BedrockLevel",
    "targetWorldStructurallyPresent", "alreadyAttached",
    "packSourceAndRestrictedHttpPolicyValid", "modulePermissionsAlreadyPresent",
    "targetPackDirectoryExists", "receiverPrivateConfigExists",
    "receiverPrivateTokenExists", "receiverLoopbackPortConfigured")
enums = {
    "targetWorldPackListState": {"valid", "missing", "unreadable_or_unexpected"},
    "betaApisExperiment": {"enabled_in_level_dat", "disabled_in_level_dat", "not_declared_in_level_dat", "unverified"},
    "betaModulesLoaded": {"not_verified_without_bds_log_or_runtime_witness"},
    "verifiedOfflineWorldBackup": {"not_verified_requires_backup_and_restore_test"}
}
clean = {"audit": "ALICE_BDS_SILENT_WITNESS_READ_ONLY",
         "schemaVersion": 2, "observedAtUnix": seen,
         "readOnly": True, "safeToApplyWorldChanges": False}
for key in bool_fields:
    if type(obj.get(key)) is bool:
        clean[key] = obj[key]
for key, choices in enums.items():
    if isinstance(obj.get(key), str) and obj[key] in choices:
        clean[key] = obj[key]
proc = obj.get("processes")
if isinstance(proc, dict):
    if (proc.get("state") in {"unknown", "found_running", "not_found_not_offline_proof"}
            and (proc.get("count") is None or
                 type(proc.get("count")) is int and 0 <= proc["count"] <= 10000)):
        clean["processes"] = {"state": proc["state"], "count": proc["count"]}
p.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
mv "$tmp" "$out"
trap - EXIT
echo "Saved to Mac Desktop: $out"
echo "NEW version-2 report, generated now. Upload this exact Desktop JSON (not any filename ending in (1))."
echo "No BDS process or world was changed."
