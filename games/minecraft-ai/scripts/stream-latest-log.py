#!/usr/bin/env python3
"""Read-only latest Alice runtime log streamer; stdout carries only bytes."""
from pathlib import Path
import shutil
import sys

def stream(root: Path, output) -> Path:
    root = root.expanduser().resolve(strict=True)
    directory = root / '.alice-project' / 'logs'
    if not directory.is_dir():
        raise RuntimeError('No Alice runtime logs directory yet')
    for candidate in sorted(directory.glob('run-*.log'), key=lambda p: p.name, reverse=True):
        if not candidate.is_file() or candidate.is_symlink():
            continue
        if candidate.resolve(strict=True).parent != directory.resolve(strict=True):
            continue
        with candidate.open('rb') as f:
            shutil.copyfileobj(f, output)
        return candidate
    raise RuntimeError('No Alice runtime log exists yet')

if __name__ == '__main__':
    try:
        if len(sys.argv) > 2:
            raise ValueError('Usage: stream-latest-log.py [MINDCRAFT_DIR]')
        stream(Path(sys.argv[1]) if len(sys.argv)==2 else Path.home() / 'mindcraft-alice',sys.stdout.buffer)
    except (RuntimeError, OSError, ValueError) as err:
        print('ERROR: ' + str(err), file=sys.stderr)
        sys.exit(1)
