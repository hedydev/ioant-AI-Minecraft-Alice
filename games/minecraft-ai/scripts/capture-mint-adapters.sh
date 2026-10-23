#!/usr/bin/env bash
# Mac-side, read-only exact source capture. Never deploys or changes Mint.
set -Eeuo pipefail
[[ $# -eq 0 ]] || { echo 'Usage: bash games/minecraft-ai/scripts/capture-mint-adapters.sh' >&2; exit 2; }
SSH_TARGET="${ALICE_SSH_TARGET:-tedz@192.168.0.104}"
MINDCRAFT_NAME="${ALICE_MINDCRAFT_NAME:-mindcraft-alice}"
if [[ ! "$MINDCRAFT_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  echo 'Invalid ALICE_MINDCRAFT_NAME' >&2; exit 2
fi
if [[ ! "$SSH_TARGET" =~ ^[[:alnum:]_.-]+@[[:alnum:].-]+$ ]]; then
  echo 'Invalid ALICE_SSH_TARGET; expected user@host' >&2; exit 2
fi
for tool in ssh mktemp tar shasum; do
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }
done
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
OUT_ROOT="${ALICE_ADAPTER_OUTPUT_DIR:-${TMPDIR:-/tmp}}"
[[ -d "$OUT_ROOT" ]] || { echo "Output directory missing: $OUT_ROOT" >&2; exit 1; }
umask 077
CAPTURE_DIR="$(mktemp -d "${OUT_ROOT%/}/alice-mint-adapters.XXXXXXXX")"
cleanup() { rm -rf -- "$CAPTURE_DIR"; }
trap cleanup ERR INT TERM
ARCHIVE="$CAPTURE_DIR/source.tar.gz"
# The script itself streams to Mint stdin; stdout is only archive bytes.
ssh -T "$SSH_TARGET" "python3 - \"\$HOME/$MINDCRAFT_NAME\"" \
  < "$SCRIPT_DIR/export-adapters.py" > "$ARCHIVE"
tar -tzf "$ARCHIVE" >/dev/null
shasum -a 256 "$ARCHIVE" > "$CAPTURE_DIR/source.tar.gz.sha256"
trap - ERR INT TERM
printf 'Read-only Alice adapter snapshot: %s\n' "$ARCHIVE"
printf 'SHA256: '; cat "$CAPTURE_DIR/source.tar.gz.sha256"
printf 'Contains exact adapter source and hashes, not bot memory/world data. Review for secrets before sharing.\n'
