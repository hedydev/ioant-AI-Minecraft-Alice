#!/usr/bin/env bash
set -Eeuo pipefail
usage() {
  cat <<'HELP'
Usage: bash games/minecraft-ai/scripts/deploy-and-run.sh [--dry-run] [--no-pull] [--no-start]
Update Hero Skills main, sync Alice to Mint, verify + install and start Alice.
--dry-run  Preview without network or writes
--no-pull  Use current main checkout without pulling
--no-start Install without launching Alice
ALICE_SSH_TARGET=user@host overrides tedz@192.168.0.104.
ALICE_MINDCRAFT_NAME=Mint directory under HOME (default mindcraft-alice).
HELP
}
DRY_RUN=0; NO_PULL=0; NO_START=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-pull) NO_PULL=1 ;;
    --no-start) NO_START=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done
SSH_TARGET="${ALICE_SSH_TARGET:-tedz@192.168.0.104}"
MINDCRAFT_NAME="${ALICE_MINDCRAFT_NAME:-mindcraft-alice}"
if [[ ! "$MINDCRAFT_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  echo 'Invalid ALICE_MINDCRAFT_NAME; expected one directory name under Mint home' >&2; exit 2
fi
if [[ ! "$SSH_TARGET" =~ ^[[:alnum:]_.-]+@[[:alnum:].-]+$ ]]; then
  echo 'Invalid ALICE_SSH_TARGET; expected user@host' >&2; exit 2
fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_DIR="$(cd -- "$PROJECT_DIR/../.." && pwd -P)"
[[ -f "$REPO_DIR/AGENTS.md" && -f "$PROJECT_DIR/scripts/install.py" ]] || {
  echo 'Not a hero-skills Alice checkout' >&2; exit 1;
}
if (( DRY_RUN )); then
  echo '[dry-run] check Git main, pull --ff-only unless --no-pull'
  echo '[dry-run] rsync Alice project to Mint without --delete'
  echo "[dry-run] Mint target: ~/$MINDCRAFT_NAME"
  echo '[dry-run] Mint preflight, tests, installer backup, install'
  (( NO_START )) || echo '[dry-run] foreground node main.js and live logs'
  exit 0
fi
for cmd in git ssh rsync; do
  command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }
done
[[ "$(git -C "$REPO_DIR" branch --show-current)" == main ]] || {
  echo 'Require hero-skills main (will not switch branch)' >&2; exit 1;
}
[[ -z "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]] || {
  echo 'Tracked Hero Skills changes present; aborting automatic pull' >&2; exit 1;
}
if (( ! NO_PULL )); then
  echo '==> [1/4] Updating Hero Skills'
  git -C "$REPO_DIR" pull --ff-only origin main
else
  echo '==> [1/4] Using existing main'
fi
[[ -d "$PROJECT_DIR/runtime/alice_modules" ]] || {
  echo 'Missing Alice runtime modules' >&2; exit 1;
}
echo '==> [2/4] Preparing remote mirror'
ssh "$SSH_TARGET" 'mkdir -p "$HOME/minecraft-ai"'
echo '==> [3/4] Syncing Alice (no --delete)'
rsync -av "$PROJECT_DIR/" "$SSH_TARGET:~/minecraft-ai/"
echo '==> [4/4] Checking, installing and starting Alice'
if (( NO_START )); then
  ssh -T "$SSH_TARGET" "ALICE_MINDCRAFT_NAME=$MINDCRAFT_NAME bash \"\$HOME/minecraft-ai/scripts/install-and-run.sh\" --no-start"
else
  [[ -t 0 && -t 1 ]] || { echo 'Foreground Alice needs a terminal; use --no-start for CI' >&2; exit 1; }
  # The planning model is commonly on the Mac at 11434, while Mint expects 11435.
  # Forward *only over this existing SSH session*, and only if Mint's endpoint is down.
  # Binding 127.0.0.1 keeps Ollama private; failure is explicit, not silently ignored.
  # macOS ships Bash 3.2: under set -u, expanding an EMPTY array aborts launch.
  # Keep explicit SSH branches; do not rely on "${tunnel[@]}" being safe.
  reverse_tunnel=0
  if [[ "${ALICE_OLLAMA_TUNNEL:-auto}" != off ]] && command -v curl >/dev/null &&
     curl --silent --show-error --fail --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    if ! ssh -T "$SSH_TARGET" 'command -v curl >/dev/null && curl --silent --fail --max-time 2 http://127.0.0.1:11435/api/tags >/dev/null 2>&1'; then
      echo '==> Ollama detected on Mac; enabling SSH reverse tunnel Mac:11434 -> Mint:11435'
      reverse_tunnel=1
    fi
  fi
  if (( reverse_tunnel )); then
    ssh -tt -o ExitOnForwardFailure=yes -R 127.0.0.1:11435:127.0.0.1:11434 \
      "$SSH_TARGET" "ALICE_MINDCRAFT_NAME=$MINDCRAFT_NAME bash \"\$HOME/minecraft-ai/scripts/install-and-run.sh\""
  else
    ssh -tt "$SSH_TARGET" "ALICE_MINDCRAFT_NAME=$MINDCRAFT_NAME bash \"\$HOME/minecraft-ai/scripts/install-and-run.sh\""
  fi
fi
