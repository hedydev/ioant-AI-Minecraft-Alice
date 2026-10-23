#!/usr/bin/env python3
"""Verify Alice/Minecraft backup integrity and restore files in an isolated temp tree.

Only uses a locally generated manifest/archive; never writes inside the live server.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import tempfile

HASH = re.compile(r'[0-9a-f]{64}\Z')

def sha256(path: Path):
    digest=hashlib.sha256()
    with path.open('rb') as file:
        for part in iter(lambda:file.read(1024*1024),b''):
            digest.update(part)
    return digest.hexdigest()

def safe_member(name):
    p=PurePosixPath(name)
    return bool(name) and not p.is_absolute() and p.as_posix() == name and all(s not in ('','..','.') for s in p.parts) and '\\' not in name

def verify(manifest_path: Path, expected_server=None, *, temp_root=None):
    manifest_path=manifest_path.expanduser().resolve(strict=True)
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('kind')!='bedrock' or manifest.get('verified') is not True:
        raise ValueError('Manifest is not a verified Bedrock snapshot')
    if expected_server and Path(manifest.get('source','')).resolve()!=Path(expected_server).resolve():
        raise ValueError('Backup source differs from selected bedrock-default server')
    archive_name=manifest.get('archive')
    if not isinstance(archive_name,str) or Path(archive_name).name!=archive_name or not archive_name.endswith('.tar.gz'):
        raise ValueError('Invalid archive filename')
    archive=manifest_path.parent/archive_name
    if not archive.is_file() or archive.is_symlink():
        raise ValueError('Archive missing')
    sumfile=archive.with_suffix('').with_suffix('.sha256')
    record=sumfile.read_text(encoding='ascii').strip()
    if not re.fullmatch(r'[a-f0-9]{64}  '+re.escape(archive.name),record):
        raise ValueError('Malformed sidecar SHA256')
    expected_sum=record.split('  ')[0]
    actual_sum=sha256(archive)
    if actual_sum!=expected_sum:
        raise ValueError('Archive SHA256 mismatch')
    hashes=manifest.get('files')
    if not isinstance(hashes,dict) or not hashes or not all(
        isinstance(k,str) and safe_member(k) and isinstance(v,str) and HASH.fullmatch(v)
        for k,v in hashes.items()
    ):
        raise ValueError('Invalid per-file checksum manifest')
    worlds=manifest.get('worlds')
    if not isinstance(worlds,list) or not worlds or not all(
        isinstance(w,str) and safe_member(w) and w.startswith('worlds/') and
        w+'/level.dat' in hashes for w in worlds
    ):
        raise ValueError('Unverified world paths')
    temp_kwargs={'prefix':'alice-world-restore-check-'}
    if temp_root is not None:
        temp_kwargs['dir']=str(temp_root)
    restored=0
    with tempfile.TemporaryDirectory(**temp_kwargs) as dirname:
        dest=Path(dirname)
        with tarfile.open(archive,'r:gz') as tf:
            seen=set()
            for member in tf:
                if not member.isfile() or not safe_member(member.name) or member.name in seen:
                    raise ValueError('Unsafe or duplicate archive member')
                seen.add(member.name)
                if member.name not in hashes:
                    raise ValueError('Unexpected archive file: '+member.name)
                target=dest.joinpath(*PurePosixPath(member.name).parts)
                target.parent.mkdir(parents=True,exist_ok=True)
                h=hashlib.sha256()
                data=tf.extractfile(member)
                if data is None: raise ValueError('Missing file content')
                with data,target.open('xb') as out:
                    while True:
                        chunk=data.read(1024*1024)
                        if not chunk:break
                        h.update(chunk)
                        out.write(chunk)
                if h.hexdigest()!=hashes[member.name]:
                    raise ValueError('File checksum mismatch: '+member.name)
                restored+=1
            if seen!=set(hashes): raise ValueError('Archive files missing from manifest')
        for w in worlds:
            if not (dest.joinpath(*PurePosixPath(w).parts)/'level.dat').is_file():
                raise ValueError('Restored world missing level.dat: '+w)
    return {'archive':str(archive),'sha256':actual_sum,'files':restored,'worlds':worlds,
            'temporaryRestore':True,'verified':True}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',required=True,type=Path)
    p.add_argument('--expected-server',type=Path,required=True)
    args=p.parse_args()
    try:
        print(json.dumps(verify(args.manifest,args.expected_server),indent=2,ensure_ascii=False))
    except (ValueError,OSError,tarfile.TarError,KeyError,TypeError) as err:
        p.exit(1,'ERROR: '+str(err)+'\n')
if __name__=='__main__': main()