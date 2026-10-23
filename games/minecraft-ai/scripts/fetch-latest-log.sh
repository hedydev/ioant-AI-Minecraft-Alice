#!/usr/bin/env bash
# Read-only fetch of the latest Alice log to a private Mac folder.
set -Eeuo pipefail
[[ $# -eq 0 ]] || { echo 'Usage: bash games/minecraft-ai/scripts/fetch-latest-log.sh' >&2; exit 2; }
SSH_TARGET="${ALICE_SSH_TARGET:-tedz@192.168.0.104}"
MINDCRAFT_NAME="${ALICE_MINDCRAFT_NAME:-mindcraft-alice}"
if [[ ! "$MINDCRAFT_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  echo 'Invalid ALICE_MINDCRAFT_NAME' >&2; exit 2
fi
if [[ ! "$SSH_TARGET" =~ ^[[:alnum:]_.-]+@[[:alnum:].-]+$ ]]; then
  echo 'Invalid ALICE_SSH_TARGET; expected user@host' >&2; exit 2
fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="${ALICE_LOG_OUTPUT_DIR:-${TMPDIR:-/tmp}}"
[[ -d "$ROOT" ]] || { echo "Missing output directory: $ROOT" >&2; exit 1; }
umask 077
DEST="$(mktemp -d "${ROOT%/}/alice-run-log.XXXXXXXX")"
cleanup(){ rm -rf -- "$DEST"; }
trap cleanup ERR INT TERM
ssh -T "$SSH_TARGET" "python3 - \"\$HOME/$MINDCRAFT_NAME\"" < "$SCRIPT_DIR/stream-latest-log.py" > "$DEST/alice-run.log"
[[ -s "$DEST/alice-run.log" ]] || { echo 'Empty Alice log' >&2; exit 1; }
shasum -a 256 "$DEST/alice-run.log" > "$DEST/alice-run.log.sha256"
trap - ERR INT TERM
printf 'Latest Alice run log (private): %s\n' "$DEST/alice-run.log"
printf 'Review personal chat, IPs and secrets before sharing this log.\n'
