#!/usr/bin/env bash
set -Eeuo pipefail
NO_START=0
if [[ "${1:-}" == --no-start && "$#" == 1 ]]; then
  NO_START=1
elif (( $# > 0 )); then
  echo 'Usage: bash install-and-run.sh [--no-start]' >&2; exit 2
fi
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
MINDCRAFT_NAME="${ALICE_MINDCRAFT_NAME:-mindcraft-alice}"
if [[ ! "$MINDCRAFT_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  echo 'Invalid ALICE_MINDCRAFT_NAME' >&2; exit 2
fi
MINDCRAFT_DIR="$HOME/$MINDCRAFT_NAME"
INSTALLER="$PROJECT_DIR/scripts/install.py"
for cmd in python3 node; do
  command -v "$cmd" >/dev/null || { echo "Missing dependency: $cmd" >&2; exit 1; }
done
[[ -f "$INSTALLER" && -f "$MINDCRAFT_DIR/main.js" ]] || {
  echo 'Missing Alice installer or Mindcraft main.js' >&2; exit 1;
}
python3 - "$MINDCRAFT_DIR" <<'PY'
import os
from pathlib import Path
import sys
target = Path(sys.argv[1]).resolve()
for proc in Path('/proc').iterdir():
    if not proc.name.isdigit() or int(proc.name) == os.getpid():
        continue
    try:
        argv = (proc / 'cmdline').read_bytes().split(b'\0')
        if len(argv) < 2: continue
        if Path(os.fsdecode(argv[0])).name not in ('node','nodejs'): continue
        if Path(os.fsdecode(argv[1])).name != 'main.js': continue
        if (proc / 'cwd').resolve(strict=True) == target:
            print('Alice running (PID '+proc.name+'); stop it first.',file=sys.stderr)
            sys.exit(1)
    except (PermissionError, FileNotFoundError, ProcessLookupError):
        continue
PY
echo "==> Selected Mindcraft: $MINDCRAFT_DIR"
echo '==> Mindcraft adapter preflight'
python3 "$INSTALLER" --target "$MINDCRAFT_DIR" --check
echo '==> Running deployment regression tests'
python3 -m unittest discover -s "$PROJECT_DIR/tests" -v
echo '==> Running behavior-policy unit tests'
node --experimental-default-type=module --test "$PROJECT_DIR/tests"/*.test.mjs
echo '==> Installing with backup'
python3 "$INSTALLER" --target "$MINDCRAFT_DIR" --install
if (( NO_START )); then echo 'Installed; start skipped.'; exit 0; fi
# Plan/reasoning requests need Ollama separately from the Alice realtime movement core.
if command -v curl >/dev/null; then
  if ! curl --silent --fail --max-time 3 http://127.0.0.1:11435/api/tags >/dev/null 2>&1; then
    echo 'WARNING: Ollama endpoint 127.0.0.1:11435 not reachable; LLM-driven commands will fail.' >&2
    echo 'Check Mac Ollama and SSH forwarding. Alice movement and local skills may still work.' >&2
  fi
fi
echo '==> Starting Alice; Ctrl+C stops foreground bot'
cd "$MINDCRAFT_DIR"
# Keep timestamps and full stdout/stderr for each foreground session, without changing bots/ or Paper.
umask 077
LOG_DIR="$MINDCRAFT_DIR/.alice-project/logs"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/run-$RUN_ID.log"
echo "==> Alice log: $LOG_FILE (private; may include chat/coordinates)"
node main.js 2>&1 | tee -a "$LOG_FILE"
