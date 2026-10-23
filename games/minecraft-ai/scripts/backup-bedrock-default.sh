#!/usr/bin/env bash
# Linux Mint only. Back up the exact MCManager bedrock-default world, never the other instances.
set -Eeuo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$HOME/minecraft-bedrock"
BACKUPS="$HOME/minecraft-world-backups/bedrock-default"
case "${1:---inspect}" in
  --inspect)
    [[ $# -eq 0 || $# -eq 1 ]] || { echo 'Usage: bash backup-bedrock-default.sh --inspect' >&2; exit 2; }
    python3 "$HERE/inspect-bedrock-default.py" --server-dir "$ROOT"
    ;;
  --backup)
    [[ $# -eq 3 && "${2:-}" == --world-dir ]] || {
      echo 'Usage: bash backup-bedrock-default.sh --backup --world-dir "REAL_WORLD_DIRECTORY_NAME"' >&2
      echo 'First stop bedrock-default gracefully in MCManager. Never stop the other instances.' >&2
      exit 2
    }
    NAME="$3"
    [[ -n "$NAME" && "$NAME" != '.' && "$NAME" != '..' && "$NAME" != *'/'* ]] || {
      echo 'World name must be a single actual directory name under bedrock-default/worlds' >&2; exit 2;
    }
    WORLD="$ROOT/worlds/$NAME"
    [[ -f "$WORLD/level.dat" && ! -L "$WORLD" ]] || {
      echo "Cannot verify world level.dat: $WORLD" >&2; exit 1;
    }
    # Python checks for a running bedrock_server in this instance and will
    # abort before writing any archive. No automatic stop/start or replacement.
    RESULT="$(python3 "$HERE/backup-world.py" --server-dir "$ROOT" --kind bedrock \
      --world-dir "$WORLD" --output-dir "$BACKUPS")"
    printf '%s\n' "$RESULT"
    MANIFEST="$(printf '%s\n' "$RESULT" | sed -n 's/^MANIFEST: //p')"
    [[ -n "$MANIFEST" ]] || { echo 'Backup returned no manifest; verify manually' >&2; exit 1; }
    python3 "$HERE/verify-world-backup.py" --manifest "$MANIFEST" --expected-server "$ROOT"
    echo "BACKUP GATE PASSED for bedrock-default / $NAME"
    echo "World untouched. You may restart only bedrock-default via MCManager."
    ;;
  *) echo 'Usage: bash backup-bedrock-default.sh --inspect | --backup --world-dir NAME' >&2; exit 2;;
esac