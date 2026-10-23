#!/usr/bin/env python3
"""Read-only export of the actual Mint Mindcraft/Alice bridge for source review.

Emits ONLY a gzip tar archive to stdout; status and failures go to stderr.
No bot memory, world, credentials, or settings files are included.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile

REQUIRED = (
    "src/agent/agent.js",
    "src/agent/action_manager.js",
    "src/agent/modes.js",
    "src/agent/commands/actions.js",
    "src/agent/library/skills.js",
)
OPTIONAL = (
    "node_modules/mineflayer-collectblock/index.js",
    "node_modules/mineflayer-collectblock/lib/CollectBlock.js",
    "node_modules/mineflayer-collectblock/lib/collectBlock.js",
)
MAX_FILE_BYTES = 2 * 1024 * 1024


def safe_read(target: Path, relative: str, required: bool) -> bytes | None:
    path = target / relative
    if not path.is_file():
        if required:
            raise RuntimeError("Missing required adapter: " + relative)
        return None
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(target):
        raise RuntimeError("Adapter resolves outside Mindcraft checkout: " + relative)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise RuntimeError("Adapter exceeds safe size limit: " + relative)
    data = path.read_bytes()
    if len(data) > MAX_FILE_BYTES:
        raise RuntimeError("Adapter changed or exceeds safe size limit: " + relative)
    return data


def add_bytes(archive: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = 0o600
    info.mtime = 0
    archive.addfile(info, io.BytesIO(data))


def export(target: Path, out) -> dict:
    target = target.expanduser().resolve(strict=True)
    if not (target / "package.json").is_file():
        raise RuntimeError("Not a Mindcraft checkout: package.json missing")
    # Read and validate all source files before writing any archive bytes.
    contents = {}
    optional_missing = []
    for rel in REQUIRED + OPTIONAL:
        data = safe_read(target, rel, rel in REQUIRED)
        if data is None:
            optional_missing.append(rel)
        else:
            contents[rel] = data
    manifest = {
        "schema": 1,
        "purpose": "Read-only review of local Alice/Mindcraft integration",
        "files": {rel: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
                  for rel, data in contents.items()},
        "optional_missing": optional_missing,
        "excluded": ["bots/", "worlds/", "settings.js", "keys.json", "*.log"],
    }
    with tarfile.open(fileobj=out, mode="w|gz") as archive:
        for rel, data in contents.items():
            add_bytes(archive, rel, data)
        add_bytes(archive, "adapter-manifest.json",
                  (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode())
    return manifest


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 export-adapters.py MINDCRAFT_DIR", file=sys.stderr)
        return 2
    try:
        manifest = export(Path(sys.argv[1]), sys.stdout.buffer)
        print(f"Alice adapter capture: {len(manifest['files'])} source files; "
              "no bot/world/settings data", file=sys.stderr)
        return 0
    except (RuntimeError, OSError, ValueError) as err:
        print("ERROR: " + str(err), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
