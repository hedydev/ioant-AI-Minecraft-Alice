#!/usr/bin/env python3
"""Read-only Mint log access, executed over SSH stdin (no files installed on Mint)."""
from pathlib import Path
import json
import re
import sys

LOG_ROOT = Path.home() / "mindcraft-alice" / ".alice-project" / "logs"
SAFE_NAME = re.compile(r"run-\d{8}T\d{6}Z\.log\Z")
INSTANCE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*\Z")
MAX_LOG_SIZE = 16 * 1024 * 1024
TAIL_BYTES = 96 * 1024


def get_log(name, directory=LOG_ROOT):
    if not SAFE_NAME.fullmatch(name):
        raise ValueError("Invalid log name")
    file = directory / name
    if not file.is_file() or file.is_symlink() or file.resolve().parent != directory.resolve():
        raise ValueError("Log not found or unsafe path")
    return file


def handle(action, name=None, directory=LOG_ROOT):
    if action == "list" and name is None:
        entries = []
        if directory.is_dir():
            for p in directory.iterdir():
                if SAFE_NAME.fullmatch(p.name) and p.is_file() and not p.is_symlink():
                    stat = p.stat()
                    entries.append({"name": p.name, "bytes": stat.st_size, "mtime": int(stat.st_mtime)})
        return json.dumps({"logs": sorted(entries, key=lambda x: x["name"], reverse=True)[:30]}).encode()
    if action in ("tail", "download") and name is not None:
        file = get_log(name, directory)
        size = file.stat().st_size
        if action == "download":
            if size > MAX_LOG_SIZE:
                raise ValueError("Log is larger than the 16 MiB download limit")
            return file.read_bytes()
        with file.open("rb") as stream:
            stream.seek(max(0, size - TAIL_BYTES))
            tail = stream.read(TAIL_BYTES).decode("utf-8", "replace")
        return json.dumps({"name": file.name, "text": tail, "bytes": size,
                           "truncated": size > TAIL_BYTES}, ensure_ascii=False).encode()
    raise ValueError("Unsupported log operation")


def main():
    try:
        args = sys.argv[1:]
        if len(args) >= 2 and args[-2] == '--instance':
            instance = args[-1]
            args = args[:-2]
        else:
            instance = 'mindcraft-alice'
        if not INSTANCE_RE.fullmatch(instance):
            raise ValueError('Invalid Alice instance name')
        if len(args) not in (1, 2):
            raise ValueError("Usage: remote_logs.py list|tail|download [run-...log] [--instance NAME]")
        directory = Path.home() / instance / '.alice-project' / 'logs'
        sys.stdout.buffer.write(handle(args[0], args[1] if len(args) == 2 else None, directory))
    except (OSError, ValueError) as err:
        print("ALICE_LOG_ERROR: " + str(err), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()