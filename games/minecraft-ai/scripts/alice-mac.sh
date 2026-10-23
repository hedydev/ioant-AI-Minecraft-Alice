#!/usr/bin/env bash
# Native Bedrock only. Existing deploy-and-run.sh is the separate Paper adapter.
set -euo pipefail
usage() {
  cat <<'HELP'
Usage: ALICE_SSH_TARGET=user@host bash alice-mac.sh ACTION [--dry-run]
Actions: status diagnose check test start restart logs capture-config sync deploy report witness-preflight witness-lab-check witness-lab-prepare
sync: copy Git-tracked Alice files with backups, then run Mint tests; no restart.
deploy: sync + tests + restart the existing Alice; requires an active client.
report: 3-hour read-only sanitized status, diagnose, events and source hashes -> Mac Desktop ZIP.
witness-preflight: inspect BDS 17879 world, packs and beta prerequisites -> Mac Desktop JSON; no BDS writes.
witness-lab-check: verify private existing world backup via isolated restore; no BDS write.
witness-lab-prepare: explicitly create NEW 17880 sandbox from verified backup; never start BDS.
Other actions call the corresponding Mint CLI. --dry-run does no SSH or writes.
Git is never pulled/reset/stashed automatically. See docs/OPERATIONS.md.
HELP
}
action="${1:-}"
case "$action" in -h|--help|'') usage; exit 0;; status|diagnose|check|test|start|restart|logs|capture-config|sync|deploy|report|witness-preflight|witness-lab-check|witness-lab-prepare) ;; *) usage >&2; exit 2;; esac
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
# Report collection is read-only: no Mint deploy, process restart or BDS change.
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
