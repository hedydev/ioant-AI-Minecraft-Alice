#!/usr/bin/env bash
# Test a fresh disposable user+network namespace; no BDS or host edits.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Run on Mac.' >&2; exit 2; }
[[ $# -eq 0 ]] || { echo 'Usage: alice-netns-loopback-mac.sh' >&2; exit 2; }
target="$(printenv ALICE_SSH_TARGET || true)"
[[ "$target" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || {
  echo 'Set ALICE_SSH_TARGET=user@Mint.' >&2; exit 2; }
desktop="$HOME/Desktop"
[[ -d "$desktop" && ! -L "$desktop" ]] || { echo 'Desktop unavailable.' >&2; exit 2; }
out="$desktop/AliceAI-Netns-Loopback-Check-$(date +%Y%m%d-%H%M%S).json"
[[ ! -e "$out" ]] || { echo 'Refusing to overwrite report.' >&2; exit 2; }
tmp="$(mktemp "$desktop/.AliceAI-netns-lo.XXXXXXXX")"
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
ssh -T -o BatchMode=yes -o ConnectTimeout=10 "$target" \
  'python3 "$HOME/minecraft-ai/scripts/alice-netns-loopback-check.py"' > "$tmp"
python3 - "$tmp" <<'PY'
import json, pathlib, sys, time
file = pathlib.Path(sys.argv[1])
raw = file.read_bytes()
if len(raw) > 2048:
    raise SystemExit("Unexpected report size.")
try:
    data = json.loads(raw)
except (ValueError, UnicodeError):
    raise SystemExit("Invalid JSON result.")
expected = {"audit", "schemaVersion", "observedAtUnix", "state",
            "loopbackBefore", "loopbackAfter", "ephemeralNamespaceOnly",
            "readOnlyHostAndWorlds", "labBdsStarted", "productionBdsRestarted",
            "productionWorldModified", "hostNetworkModified",
            "originalBdsExitCauseVerified"}
if not isinstance(data, dict) or set(data) != expected:
    raise SystemExit("Unrecognized result schema.")
if data["audit"] != "ALICE_NETNS_LOOPBACK_ACTIVATION" or \
        type(data["schemaVersion"]) is not int or data["schemaVersion"] != 1:
    raise SystemExit("Unexpected audit identity.")
if data["state"] not in ("activation_verified", "already_up",
                         "activation_not_verified", "activation_unavailable"):
    raise SystemExit("Unexpected result state.")
if data["loopbackBefore"] not in ("up", "down", "unverified") or \
        data["loopbackAfter"] not in ("up", "down", "unverified"):
    raise SystemExit("Unexpected interface state.")
if type(data["observedAtUnix"]) is not int or \
        abs(int(time.time()) - data["observedAtUnix"]) > 900:
    raise SystemExit("Invalid time.")
if data["ephemeralNamespaceOnly"] is not True or \
        data["readOnlyHostAndWorlds"] is not True:
    raise SystemExit("Invalid isolation result.")
for k in ("labBdsStarted", "productionBdsRestarted",
          "productionWorldModified", "hostNetworkModified",
          "originalBdsExitCauseVerified"):
    if data[k] is not False:
        raise SystemExit("Unexpected host/production mutation.")
file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8")
PY
mv "$tmp" "$out"
trap - EXIT
echo "Saved child-netns loopback capability result: $out"
echo 'No BDS/world/client/service/host-network change.'
