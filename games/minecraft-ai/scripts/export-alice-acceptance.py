#!/usr/bin/env python3
"""Export only allowlisted Alice acceptance evidence as a zip to stdout.

Run on Linux Mint over an existing SSH connection. Never read Minecraft worlds,
auth/token caches, prompts, raw chat or process environment.
"""
import argparse
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import sys
import time
import zipfile

CONTROL = Path.home() / ".alice-bedrock-control"
JOURNAL = CONTROL / "acceptance"
MAX_LOG_BYTES = 5 * 1024 * 1024
MAX_SNAPSHOT_BYTES = 128 * 1024
ALLOWED_STATUS = frozenset((
    "connected", "updatedAt", "revision", "state", "job", "position",
    "health", "food", "dimension", "movementEvidence", "worldRoutine",
    "agent", "followDiagnostic", "lastFollowEnd", "statusCompacted",
))
ALLOWED_VIEW = frozenset((
    "version", "connected", "observedAt", "origin", "radius", "below", "above",
    "dimension", "alice", "palette", "voxels", "unknown", "unknownCells",
    "scanned", "entities", "terrainAt",
))


def bounded_file(file: Path, limit: int) -> bytes | None:
    if file.is_symlink():
        raise ValueError(f"Refusing symbolic-link evidence: {file.name}")
    if not file.is_file():
        return None
    if file.stat().st_size > limit:
        raise ValueError(f"Oversized evidence: {file.name}")
    return file.read_bytes()


def create_archive(hours: int, root: Path = CONTROL, now: float | None = None) -> bytes:
    if not 1 <= hours <= 24:
        raise ValueError("Hours must be 1..24")
    if now is None:
        now = time.time()
    journal = root / "acceptance"
    if root.is_symlink() or journal.is_symlink():
        raise ValueError("Unsafe Alice journal directory")
    oldest = int((now - hours * 3600) * 1000)
    rows = []
    counters = {}
    seen_bytes = 0
    for name in ("events.4.jsonl", "events.3.jsonl", "events.2.jsonl",
                 "events.1.jsonl", "events.jsonl"):
        data = bounded_file(journal / name, 1024 * 1024 + 4096)
        if data is None:
            continue
        seen_bytes += len(data)
        if seen_bytes > MAX_LOG_BYTES + 8192:
            raise ValueError("Too much acceptance data")
        for raw in data.splitlines():
            if not raw or len(raw) > 4096:
                continue
            try:
                value = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                continue
            if not isinstance(value, dict) or type(value.get("at")) not in (int, float):
                continue
            if not oldest <= value["at"] <= now * 1000 + 60000:
                continue
            # The journal is already schema-filtered on write; exclude any
            # unexpected row kinds, even if a foreign process edited the file.
            kind = value.get("kind")
            if kind != "sample" and not (isinstance(kind, str)
                    and kind.startswith("[Alice ")
                    and len(kind) <= 98
                    and all(x not in kind for x in ("\n", "\r", "token", "auth", "password"))):
                continue
            counters[kind] = counters.get(kind, 0) + 1
            rows.append(value)
    if not rows:
        raise ValueError("No Alice acceptance records for this window. Restart the updated Alice client and let it run.")
    rows.sort(key=lambda x: x["at"])
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", compression=zipfile.ZIP_DEFLATED,
                         compresslevel=6) as z:
        payload = "".join(json.dumps(row, ensure_ascii=False,
                                    separators=(",", ":")) + "\n" for row in rows)
        z.writestr("events.jsonl", payload)
        for filename, allowed, size in (
                ("status.json", ALLOWED_STATUS, 8192),
                ("world-view.json", ALLOWED_VIEW, MAX_SNAPSHOT_BYTES)):
            raw = bounded_file(root / filename, size)
            if raw is None:
                continue
            try:
                value = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                continue
            if isinstance(value, dict):
                z.writestr(filename, json.dumps(
                    {k: v for k, v in value.items() if k in allowed},
                    ensure_ascii=False, separators=(",", ":")))
        manifest = {
            "version": 1,
            "capture": "Alice Bedrock acceptance journal",
            "generatedAtUTC": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
            "requestedHours": hours,
            "firstEventAt": rows[0]["at"],
            "lastEventAt": rows[-1]["at"],
            "records": len(rows),
            "samples": counters.get("sample", 0),
            "events": len(rows) - counters.get("sample", 0),
            "note": "Local Mineflayer position is NOT authoritative Bedrock server movement evidence.",
            "privacy": "No Xbox credentials, chat transcripts, raw packets, or Minecraft world files collected.",
        }
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return result.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=3, choices=range(1, 25),
                        metavar="1..24")
    args = parser.parse_args()
    sys.stdout.buffer.write(create_archive(args.hours))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        print(f"[Alice acceptance] {exc}", file=sys.stderr)
        sys.exit(2)
