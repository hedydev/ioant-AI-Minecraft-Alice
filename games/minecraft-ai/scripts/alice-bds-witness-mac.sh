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
import json, pathlib, sys
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
PY
mv "$tmp" "$out"
trap - EXIT
echo "Saved to Mac Desktop: $out"
echo "Upload this JSON to ChatGPT. No BDS process or world was changed."
