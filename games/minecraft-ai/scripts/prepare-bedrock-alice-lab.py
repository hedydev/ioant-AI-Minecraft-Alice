#!/usr/bin/env python3
"""Create a NEW disposable BDS copy from verified offline backup, never modify bedrock-default."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('alice_backup_verify',HERE/'verify-world-backup.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Missing backup verifier')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
PORT=17880
WORLD='Bedrock level'
MARKER='.alice-sandbox.json'

def prepare(source, manifest_file, destination, *, run_verify=mod.verify):
    source=Path(source).expanduser().resolve(strict=True)
    manifest_file=Path(manifest_file).expanduser().resolve(strict=True)
    destination=Path(destination).expanduser().absolute()
    if not source.is_dir() or not (source/'bedrock_server').is_file():
        raise ValueError('Not an installed BDS server directory')
    if destination.exists() or destination.is_symlink():
        raise ValueError('Sandbox destination already exists; will not overwrite it')
    if destination==source or source in destination.parents or destination in source.parents:
        raise ValueError('Sandbox must be a separate sibling, not inside production server')
    if destination.name not in ('minecraft-bedrock-alice-lab',
                               'minecraft-bedrock-alice-lab-v2'):
        raise ValueError('Only explicitly named Alice lab directories are allowed')
    is_v2 = destination.name == 'minecraft-bedrock-alice-lab-v2'
    if is_v2 and destination.parent.resolve(strict=True) != source.parent:
        raise ValueError('v2 lab must be the exact production sibling')
    result=run_verify(manifest_file,source)
    if result['worlds']!=['worlds/'+WORLD]:
        raise ValueError('Manifest must contain ONLY the selected Bedrock level world')
    info=json.loads(manifest_file.read_text())
    archive=manifest_file.parent/info['archive']
    tmp=Path(tempfile.mkdtemp(prefix='.alice-bedrock-lab-staging-',dir=destination.parent))
    try:
        # Never follow nested symlinks into private files or a different world
        # while copying a LIVE BDS installation's non-world runtime assets.
        for entry in source.iterdir():
            excluded = ('worlds','logs',MARKER)
            if is_v2:
                # Fresh fixture must not inherit real server player records,
                # scripts, per-module secrets or operator permissions.
                excluded += ('config','behavior_packs','allowlist.json',
                             'permissions.json','whitelist.json')
            if entry.name in excluded:continue
            if entry.is_symlink():raise ValueError('Refusing to copy server symlink: '+entry.name)
            target=tmp/entry.name
            if entry.is_dir():
                for base, dirs, files in os.walk(entry, followlinks=False):
                    parent=Path(base)
                    if parent.is_symlink() or any((parent/name).is_symlink()
                                                  for name in dirs+files):
                        raise ValueError('Refusing nested server symlink')
                shutil.copytree(entry,target,symlinks=False)
            elif entry.is_file():shutil.copy2(entry,target)
        with tarfile.open(archive,'r:gz') as tar:
            members=tar.getmembers()
            if {m.name for m in members}!=set(info['files']):
                raise ValueError('Unexpected backup members')
            for member in members:
                if not member.isfile() or not mod.safe_member(member.name):
                    raise ValueError('Unsafe world member')
                rel=PurePosixPath(member.name)
                if rel.parts[:2]!=('worlds',WORLD):raise ValueError('Other world in archive')
                dest=tmp.joinpath(*rel.parts)
                dest.parent.mkdir(parents=True,exist_ok=True)
                with tar.extractfile(member) as src,dest.open('xb') as out:
                    digest=hashlib.sha256()
                    while part:=src.read(1024*1024):
                        digest.update(part);out.write(part)
                    if digest.hexdigest()!=info['files'][member.name]:raise ValueError('Backup file hash mismatch')
        props=tmp/'server.properties'
        before=props.read_text()
        update={'server-port':str(PORT),'server-portv6':str(PORT+1),'server-name':'AliceAI Lab (disposable)','level-name':WORLD,'allow-list':'false','online-mode':'true'}
        if is_v2:
            update.update({'server-name':'AliceAI v2 Lab (network-isolated)',
                           'allow-list':'true','enable-lan-visibility':'false',
                           'allow-inbound-script-debugging':'false',
                           'allow-outbound-script-debugging':'false',
                           'script-debugger-auto-attach':'disabled'})
        output=[]
        seen_v2=set()
        for line in before.splitlines():
            key=line.split('=',1)[0].strip() if '=' in line and not line.startswith('#') else ''
            if key in update:
                if is_v2:
                    # Every forced v2 setting must occur exactly once; a stale
                    # later duplicate could otherwise override the safe value.
                    if key in seen_v2:
                        continue
                    seen_v2.add(key)
                    output.append(key+'='+update[key])
                else:
                    output.append(key+'='+update.pop(key))
            else:output.append(line)
        output.extend(k+'='+v for k,v in update.items()
                      if not is_v2 or k not in seen_v2)
        props.write_text('\n'.join(output)+'\n')
        if is_v2:
            # Explicit empty player allowlist; never reuse production's.
            (tmp/'allowlist.json').write_text('[]\n')
        marker={'version':1,'kind':'alice-disposable-bedrock-lab',
                'source':str(source),'port':PORT,'world':WORLD,
                'backupSha256':result['sha256']}
        if is_v2:
            marker['labGeneration']='fresh-isolated-v2'
        (tmp/MARKER).write_text(json.dumps(marker,indent=2)+'\n')
        tmp.rename(destination)
    finally:
        if tmp.exists():shutil.rmtree(tmp)
    return {'lab':str(destination),'port':PORT,'world':WORLD,'backupSha256':result['sha256']}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',required=True)
    args=p.parse_args()
    home=Path.home()
    try:
        outcome=prepare(home/'minecraft-bedrock',args.manifest,home/'minecraft-bedrock-alice-lab')
    except (OSError,ValueError,KeyError,tarfile.TarError) as exc:
        p.exit(1,'ERROR: '+str(exc)+'\n')
    print(json.dumps(outcome,ensure_ascii=False,indent=2))
    print('LAB PREPARED. Start this copy manually, never start an additional production instance.')
if __name__=='__main__':main()