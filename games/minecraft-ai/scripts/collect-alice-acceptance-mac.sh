#!/bin/bash
# macOS one-command Alice Bedrock acceptance exporter. SSH read-only on Mint.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo "Run this exporter on the Mac." >&2; exit 2
fi
hours=3
if (( $# > 0 )); then hours="$1"; fi
if [[ ! "$hours" =~ ^([1-9]|1[0-9]|2[0-4])$ ]]; then
  echo "Usage: ALICE_MINT_SSH=user@mint-host $0 [hours: 1..24]" >&2; exit 2
fi
remote="$(printenv ALICE_MINT_SSH || true)"
if [[ ! "$remote" =~ ^[a-zA-Z_][a-zA-Z0-9_.-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]; then
  echo "Specify ALICE_MINT_SSH=user@host (no credentials stored in repository)." >&2
  exit 2
fi
desktop="$HOME/Desktop"
if [[ ! -d "$desktop" || -L "$desktop" ]]; then
  echo "Missing or unsafe Mac Desktop directory: $desktop" >&2; exit 2
fi
stamp="$(date +%Y%m%d-%H%M%S)"
dest="$desktop/AliceAI-Acceptance-$stamp.zip"
if [[ -e "$dest" ]]; then
  echo "Destination already exists: $dest" >&2; exit 2
fi
tmp="$(mktemp "$desktop/.AliceAI-acceptance.XXXXXXXX")"
remote_info="$(mktemp "$desktop/.AliceAI-deployment.XXXXXXXX")"
cleanup(){ rm -f "$tmp" "$remote_info"; }
trap cleanup EXIT
source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../bedrock-native/experiment" && pwd)"
# One read-only SSH operation checks the actual Mint sources on disk.
# This cannot by itself prove a running Node process has reloaded those files.
ssh -o BatchMode=no -o ConnectTimeout=10 "$remote" \
  "cd minecraft-ai/bedrock-native/experiment && sha256sum src/runtime.cjs src/direct_flat_step.cjs src/escape_crossing.cjs src/acceptance_log.cjs && stat -c 'mtime %n %Y' src/runtime.cjs" > "$remote_info"
echo "[Alice acceptance] Exporting last $hours hour(s) from $remote ..."
ssh -o BatchMode=no -o ConnectTimeout=10 "$remote" \
  "python3 minecraft-ai/scripts/export-alice-acceptance.py --hours $hours" > "$tmp"
python3 - "$tmp" "$source_root" "$remote_info" <<'PY'
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

archive, local_root, remote_info = sys.argv[1:]
filenames = ("runtime.cjs", "direct_flat_step.cjs",
             "escape_crossing.cjs", "acceptance_log.cjs")
remote_hashes = {}
runtime_mtime = None
for line in Path(remote_info).read_text().splitlines():
    match = re.fullmatch(r"([a-f0-9]{64})  src/([a-z_]+\.cjs)", line)
    if match and match.group(2) in filenames:
        remote_hashes[match.group(2)] = match.group(1)
    stamp = re.fullmatch(r"mtime src/runtime\.cjs (\d+)", line)
    if stamp:
        runtime_mtime = int(stamp.group(1))
if len(remote_hashes) != len(filenames) or runtime_mtime is None:
    raise SystemExit("Mint source checksums unavailable; cannot verify deployment")
versions = {}
for name in filenames:
    local = Path(local_root) / "src" / name
    if local.is_symlink() or not local.is_file():
        raise SystemExit("Missing or unsafe local source: " + name)
    local_hash = hashlib.sha256(local.read_bytes()).hexdigest()
    versions[name] = {
        "macSha256": local_hash, "mintSha256": remote_hashes[name],
        "matches": local_hash == remote_hashes[name],
    }
with zipfile.ZipFile(archive) as z:
    bad = z.testzip()
    if bad:
        raise SystemExit("Invalid acceptance archive member: " + bad)
    names = set(z.namelist())
    if not {"manifest.json", "events.jsonl"}.issubset(names):
        raise SystemExit("Missing acceptance manifest / events")
    info = json.loads(z.read("manifest.json"))
    if not info.get("samples"):
        raise SystemExit("No status samples; updated Alice may not be running")
    spawn_times = []
    for raw in z.read("events.jsonl").splitlines():
        try:
            row = json.loads(raw)
        except ValueError:
            continue
        if row.get("kind") == "[Alice Bedrock] spawn confirmed" and isinstance(row.get("at"), int):
            spawn_times.append(row["at"])
    last_spawn = max(spawn_times) if spawn_times else None
    print("[Alice acceptance] {} records, {} status samples".format(
        info["records"], info["samples"]))
match_all = all(item["matches"] for item in versions.values())
freshness = "unknown_no_spawn_event"
if last_spawn is not None:
    freshness = ("source_changed_after_last_spawn"
                 if runtime_mtime * 1000 > last_spawn + 1000
                 else "source_not_newer_than_last_spawn")
identity = {
    "checkedAtUTC": datetime.now(timezone.utc).isoformat(),
    "files": versions, "diskFilesMatchMac": match_all,
    "latestSpawnAt": last_spawn, "runtimeFileMtime": runtime_mtime,
    "runtimeProcessFreshness": freshness,
    "note": "On-disk hashes are not proof of loaded Node modules; last spawn is a heuristic.",
}
with zipfile.ZipFile(archive, "a", compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr("deployment.json", json.dumps(identity, indent=2))
if not match_all:
    print("[Alice acceptance] WARNING: Mint files differ from Mac. Update/sync before testing.")
if freshness == "source_changed_after_last_spawn":
    print("[Alice acceptance] WARNING: Runtime source changed after Alice last spawned. Restart Alice after tests.")
if match_all and freshness == "source_not_newer_than_last_spawn":
    print("[Alice acceptance] Disk source hashes match; runtime restart order looks consistent.")
PY
mv "$tmp" "$dest"
trap - EXIT
echo "Saved: $dest"
echo "Attach this ZIP directly to ChatGPT. No manual copy/paste required."
