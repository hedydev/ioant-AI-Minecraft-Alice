#!/usr/bin/env python3
"""Offline, non-destructive, integrity-checked Paper or Bedrock world snapshot.

Requires an explicitly identified server directory. Refuses to snapshot while
Java/Bedrock server processes run in that directory. Does not edit source data.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import tarfile


def properties(root):
    values = {}
    file = root / 'server.properties'
    if not file.is_file():
        raise ValueError('server.properties missing; server directory is unverified')
    for line in file.read_text(encoding='utf8', errors='replace').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip()
    return values


def active_game_process(root, proc=Path('/proc')):
    """Refuse offline snapshots when any potentially relevant game process
    cannot be positively identified. /proc/<pid>/cwd may be unreadable when
    MCSManager launches a root-owned BDS process under a normal Mint account.
    An unreadable game process is UNKNOWN, never proof that BDS is stopped.
    """
    root = Path(root).expanduser().resolve(strict=True)
    if not proc.is_dir():
        raise ValueError('/proc required for checking live server state')
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            # Linux /proc/<pid>/comm is typically readable even when the
            # root-owned process cwd/cmdline is inaccessible to this user.
            command = (entry / 'comm').read_text(encoding='ascii').strip()
        except FileNotFoundError:
            if entry.exists():
                raise RuntimeError('Cannot verify process identity: ' + entry.name)
            continue  # PID exited during inspection
        except OSError as exc:
            raise RuntimeError('Cannot verify process identity: ' + entry.name) from exc
        if command not in ('java', 'bedrock_server'):
            continue
        try:
            cwd = (entry / 'cwd').resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            if not entry.exists():
                continue  # exited while resolving the cwd
            raise RuntimeError(
                'Game process ' + entry.name + ' (' + command +
                ') has an unverified cwd; offline backup blocked. '
                'Verify server shutdown with sufficient /proc permissions.'
            ) from exc
        if cwd == root:
            return int(entry.name), command
    return None

def find_worlds(root, kind, explicit=()):
    # macOS /var is an alias of /private/var. World candidates are resolved
    # below, so canonicalize their containment root too before comparison.
    # Keep strict resolution and refuse worlds outside the actual server root.
    root = Path(root).expanduser().resolve(strict=True)
    if kind not in ('paper', 'bedrock'):
        raise ValueError('kind must be paper or bedrock')
    config = properties(root)
    level = config.get('level-name', '').strip()
    if not level:
        raise ValueError('level-name missing from server.properties')
    if explicit:
        candidates = [Path(path).expanduser().resolve(strict=True) for path in explicit]
    elif kind == 'paper':
        candidates = [root / level, root / (level + '_nether'), root / (level + '_the_end')]
        candidates = [p for p in candidates if p.is_dir()]
    else:
        candidates = [root / 'worlds' / level]
    if not candidates:
        raise ValueError('No worlds discovered; provide --world-dir explicitly')
    checked = []
    for world in candidates:
        world = world.resolve(strict=True)
        if not world.is_dir() or not world.is_relative_to(root):
            raise ValueError('World must be an actual directory inside the server directory')
        if not (world / 'level.dat').is_file():
            raise ValueError('Not a verified Minecraft world (level.dat missing): ' + str(world))
        if world in checked:
            raise ValueError('Duplicate world path')
        checked.append(world)
    return checked


def list_files(worlds, root):
    paths=[]
    for world in worlds:
        for base, dirs, files in os.walk(world, followlinks=False):
            parent=Path(base)
            if parent.is_symlink() or any((parent / name).is_symlink() for name in dirs+files):
                raise ValueError('Refusing symlinks in world directory')
            for name in files:
                file=parent / name
                if not file.is_file():
                    raise ValueError('Non-regular file in world directory')
                paths.append((file, file.relative_to(root).as_posix()))
    return sorted(paths, key=lambda pair:pair[1])


def write_backup(root, outdir, kind, worlds):
    root = root.expanduser().resolve(strict=True)
    outdir = outdir.expanduser().resolve(strict=False)
    if outdir.is_relative_to(root):
        raise ValueError('Backup destination must not be inside server directory')
    if active_game_process(root):
        raise RuntimeError('Minecraft server is running; stop it cleanly before backup')
    paths = list_files(worlds, root)
    if not paths:
        raise ValueError('World has no files')
    outdir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(outdir, 0o700)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    name = 'minecraft-' + kind + '-' + stamp
    target = outdir / (name + '.tar.gz')
    manifest_path = outdir / (name + '.json')
    checksums = outdir / (name + '.sha256')
    archive_hashes = {}
    try:
        with tarfile.open(target, 'x:gz') as tf:
            for source, rel in paths:
                initial = source.stat()
                with source.open('rb') as input_file:
                    content = input_file.read()
                if source.stat().st_size != initial.st_size or source.stat().st_mtime_ns != initial.st_mtime_ns:
                    raise RuntimeError('World file changed during backup: ' + rel)
                info = tarfile.TarInfo(rel)
                info.size = len(content)
                info.mtime = int(initial.st_mtime)
                info.mode = 0o600
                tf.addfile(info, io.BytesIO(content))
                archive_hashes[rel] = hashlib.sha256(content).hexdigest()
        if active_game_process(root):
            raise RuntimeError('Server started during backup; discard this snapshot')
        with tarfile.open(target, 'r:gz') as tf:
            members = [m for m in tf if m.isfile()]
            if set(m.name for m in members) != set(archive_hashes):
                raise RuntimeError('Archive manifest mismatch')
            for member in members:
                with tf.extractfile(member) as data:
                    if hashlib.sha256(data.read()).hexdigest() != archive_hashes[member.name]:
                        raise RuntimeError('Archive verification failed: ' + member.name)
        manifest = {'kind':kind,'source':str(root),'worlds':[str(w.relative_to(root)) for w in worlds],
                    'files': archive_hashes, 'verified':True, 'archive':target.name}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
        h = hashlib.sha256()
        with target.open('rb') as source:
            for part in iter(lambda: source.read(1024 * 1024), b''):
                h.update(part)
        checksums.write_text(h.hexdigest()+'  '+target.name+'\n')
        print('WORLD BACKUP VERIFIED: '+str(target))
        print('MANIFEST: '+str(manifest_path))
        print('SHA256: '+str(checksums))
        return target
    except BaseException:
        for created in (target, manifest_path, checksums):
            if created.exists():
                created.unlink()
        raise


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server-dir',type=Path,required=True)
    parser.add_argument('--kind',required=True,choices=['paper','bedrock'])
    parser.add_argument('--output-dir',type=Path,required=True)
    parser.add_argument('--world-dir',type=Path,action='append',default=[],help='Exact world directory; repeat as needed')
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    try:
        root=args.server_dir.expanduser().resolve(strict=True)
        worlds=find_worlds(root,args.kind,args.world_dir)
        if active_game_process(root):
            raise RuntimeError('Game server is running; offline world backup required')
        if args.dry_run:
            print('OFFLINE WORLD BACKUP PREVIEW:')
            for world in worlds: print('  world:',world)
            print('  destination:',args.output_dir)
        else:
            write_backup(root,args.output_dir,args.kind,worlds)
    except (ValueError,RuntimeError,OSError) as err:
        print('ERROR: '+str(err),file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':
    sys.exit(main())