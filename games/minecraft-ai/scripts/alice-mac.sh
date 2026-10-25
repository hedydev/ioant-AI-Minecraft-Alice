#!/usr/bin/env bash
# Native Bedrock only. Existing deploy-and-run.sh is the separate Paper adapter.
set -euo pipefail
usage() {
  cat <<'HELP'
Usage: ALICE_SSH_TARGET=user@host bash alice-mac.sh ACTION [--dry-run]
Actions: status diagnose witness-diagnose check test start restart logs capture-config sync deploy report witness-preflight witness-lab-check witness-lab-prepare witness-lab-pack-check witness-lab-pack-stage witness-lab-pack-stage-verified witness-lab-beta-check witness-lab-beta-enable witness-lab-startup-check witness-lab-startup-probe witness-lab-netns-check witness-lab-netns-probe witness-lab-netns-postmortem witness-netns-loopback-check witness-lab-port-check witness-lab-port-owner
sync: copy Git-tracked Alice files with backups, then run Mint tests; no restart.
deploy: sync + tests + restart the existing Alice; requires an active client.
witness-diagnose: read-only owner-verified, redacted witness file chronology; does not query BDS.
report: 3-hour read-only sanitized status, diagnose, events and source hashes -> Mac Desktop ZIP.
witness-preflight: inspect BDS 17879 world, packs and beta prerequisites -> Mac Desktop JSON; no BDS writes.
witness-lab-check: verify private existing world backup via isolated restore; no BDS write.
witness-lab-prepare: explicitly create NEW 17880 sandbox from verified backup; never start BDS.
witness-lab-pack-check: inspect 17880-only pack without writes.
witness-lab-pack-stage: stage 17880-only pack WITHOUT Beta NBT, secrets or HTTP.
witness-lab-pack-stage-verified: explicit interactive sudo-v for read-only proc cwd audit; pack writes as unprivileged Mint user.
witness-lab-beta-check: validate an already-staged 17880 lab and exact reversible NBT patch, with no world writes.
witness-lab-beta-enable: explicitly enable gametest ONLY in stopped 17880 lab with preserved original level.dat and no BDS start.
witness-lab-startup-check: read-only 17880 readiness and isolation settings audit, no BDS start.
witness-lab-startup-probe: explicit 17880-only short BDS launch + graceful stop and sanitized module-import evidence.
witness-lab-netns-check: no BDS startup; test whether an unprivileged, network-isolated process can run despite host port 17880 being occupied.
witness-lab-netns-probe: explicit lab-only BDS module-import probe INSIDE a user network namespace; never binds host 17880.
witness-lab-netns-postmortem: read-only one-shot lab artifacts and fresh isolated-loopback flags; no BDS launch or changes.
witness-netns-loopback-check: prove child-only lo can be set UP, then report; no BDS or host-world edits.
witness-lab-port-check: read-only UDP 17880/17881 availability diagnosis, no sudo and no BDS launch.
witness-lab-port-owner: operator-authorized sudo read-only owner identity of just UDP 17880/17881; does not launch/stop BDS.
Other actions call the corresponding Mint CLI. --dry-run does no SSH or writes.
Git is never pulled/reset/stashed automatically. See docs/OPERATIONS.md.
HELP
}
action="${1:-}"
case "$action" in -h|--help|'') usage; exit 0;; status|diagnose|witness-diagnose|check|test|start|restart|logs|capture-config|sync|deploy|report|witness-preflight|witness-lab-check|witness-lab-prepare|witness-lab-pack-check|witness-lab-pack-stage|witness-lab-pack-stage-verified|witness-lab-beta-check|witness-lab-beta-enable|witness-lab-startup-check|witness-lab-startup-probe|witness-lab-netns-check|witness-lab-netns-probe|witness-lab-netns-postmortem|witness-lab-port-check|witness-lab-port-owner) ;; *) usage >&2; exit 2;; esac
[[ $# -le 2 && ( $# -eq 1 || "${2:-}" == --dry-run ) ]] || { usage >&2; exit 2; }
target="${ALICE_SSH_TARGET:-}"
[[ "$target" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*@[a-zA-Z0-9][a-zA-Z0-9.:-]*$ ]] || {
  echo 'Set ALICE_SSH_TARGET to your existing user@host SSH destination.' >&2; exit 2;
}
scripts="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
project="$(cd -- "$scripts/.." && pwd -P)"
repo="$(cd -- "$project/../.." && pwd -P)"
if [[ "${2:-}" == --dry-run ]]; then
  echo "Preview: $action on configured Mint target; no network, files or processes changed."
  if [[ "$action" == sync || "$action" == deploy ]]; then
    echo 'Require clean tracked files on main; Python tests; Git-tracked rsync with backup; Mint Node24 tests.'
  fi
  [[ "$action" != deploy && "$action" != restart ]] || echo 'Validate old Alice, preserve its env, SIGINT only that client, verify BDS logout, start one replacement.'
  exit 0
fi
if [[ "$action" == witness-netns-loopback-check ]]; then
  bash "$scripts/alice-netns-loopback-mac.sh"
  exit $?
fi
# Operator-authorized, read-only elevated owner check on fixed UDP ports only.
# sudo -v authenticates interactively; project Python remains unprivileged.
if [[ "$action" == witness-lab-port-owner ]]; then
  [[ -t 0 ]] || { echo 'Operator terminal required for the read-only owner audit.' >&2; exit 2; }
  echo 'Read-only 17880/17881 owner identity check. Sudo may prompt in this terminal.'
  ssh -tt -o BatchMode=yes -o ConnectTimeout=10 "$target" \
    "sudo -v && python3 \"\$HOME/minecraft-ai/scripts/alice-bds-lab-ports.py\" --owner-audit"
  exit $?
fi
# Read-only, non-privileged diagnosis; never start or stop a BDS process.
if [[ "$action" == witness-lab-port-check ]]; then
  ssh -T -o BatchMode=yes -o ConnectTimeout=10 "$target" \
    "python3 \"\$HOME/minecraft-ai/scripts/alice-bds-lab-ports.py\""
  exit $?
fi
# Report collection is read-only: no Mint deploy, process restart or BDS change.
if [[ "$action" == witness-lab-startup-check || "$action" == witness-lab-startup-probe ||
      "$action" == witness-lab-netns-check || "$action" == witness-lab-netns-probe ||
      "$action" == witness-lab-netns-postmortem ]]; then
  mode=check
  case "$action" in
    witness-lab-startup-probe) mode=probe ;;
    witness-lab-netns-check) mode=netns-check ;;
    witness-lab-netns-probe) mode=netns-probe ;;
    witness-lab-netns-postmortem) mode=netns-postmortem ;;
  esac
  bash "$scripts/alice-bds-lab-probe-mac.sh" "$mode"
  exit $?
fi
if [[ "$action" == witness-lab-beta-check || "$action" == witness-lab-beta-enable ]]; then
  mode=check
  [[ "$action" != witness-lab-beta-enable ]] || mode=enable
  bash "$scripts/alice-bds-lab-beta-mac.sh" "$mode"
  exit $?
fi
if [[ "$action" == witness-lab-pack-stage-verified ]]; then
  bash "$scripts/alice-bds-lab-pack-mac.sh" stage --sudo-process-audit
  exit $?
fi
if [[ "$action" == witness-lab-pack-check || "$action" == witness-lab-pack-stage ]]; then
  mode=check
  [[ "$action" != witness-lab-pack-stage ]] || mode=stage
  bash "$scripts/alice-bds-lab-pack-mac.sh" "$mode"
  exit $?
fi
if [[ "$action" == witness-lab-check || "$action" == witness-lab-prepare ]]; then
  mode=check
  [[ "$action" != witness-lab-prepare ]] || mode=prepare
  bash "$scripts/alice-bds-lab-mac.sh" "$mode"
  exit $?
fi
if [[ "$action" == witness-preflight ]]; then
  bash "$scripts/alice-bds-witness-mac.sh"
  exit $?
fi
if [[ "$action" == report ]]; then
  ALICE_MINT_SSH="$target" bash "$scripts/collect-alice-acceptance-mac.sh"
  exit $?
fi
for cmd in ssh git rsync python3; do command -v "$cmd" >/dev/null; done
remote() { ssh -o BatchMode=yes "$target" "python3 \"\$HOME/minecraft-ai/scripts/alice-mint.py\" $1"; }
if [[ "$action" == sync || "$action" == deploy ]]; then
  [[ "$(git -C "$repo" branch --show-current)" == main ]] || { echo 'Use the approved main checkout; no branch switch performed.' >&2; exit 1; }
  [[ -z "$(git -C "$repo" status --porcelain --untracked-files=no)" ]] || { echo 'Commit reviewed tracked changes before sync.' >&2; exit 1; }
  git -C "$repo" log -1 --oneline
  python3 -m unittest discover -s "$project/tests" -v
  manifest=$(mktemp)
  trap 'rm -f "$manifest"' EXIT
  git -C "$project" ls-files -z -- . > "$manifest"
  [[ -s "$manifest" ]] || { echo 'No tracked Alice files.' >&2; exit 1; }
  suffix=".before-alice-$(date +%Y%m%dT%H%M%S)-$$"
  ssh -o BatchMode=yes "$target" 'test -d "$HOME/minecraft-ai/bedrock-native/experiment" && test ! -L "$HOME/minecraft-ai"'
  rsync -avc --from0 --files-from="$manifest" --backup --suffix="$suffix" \
    "$project/" "$target:~/minecraft-ai/"
  remote test
  [[ "$action" != deploy ]] || remote restart
else
  remote "$action"
fi
