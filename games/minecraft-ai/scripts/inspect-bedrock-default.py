#!/usr/bin/env python3
"""Read-only inspection of the known MCManager bedrock-default instance on Mint."""
import argparse
import json
from pathlib import Path
import os

DEFAULT_ROOT = Path.home() / 'minecraft-bedrock'

def inspect(root: Path, proc: Path=Path('/proc')) -> dict:
    root = root.expanduser().resolve(strict=True)
    config = root / 'server.properties'
    if not config.is_file():
        raise ValueError('server.properties missing from selected bedrock-default directory')
    values = {}
    for line in config.read_text(encoding='utf-8', errors='replace').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, val = line.split('=', 1)
            values[key.strip()] = val.strip()
    worlds = []
    world_dir = root / 'worlds'
    if world_dir.is_dir():
        for p in sorted(world_dir.iterdir()):
            if p.is_dir() and not p.is_symlink() and (p/'level.dat').is_file():
                worlds.append({'directory':str(p), 'bytes':sum(
                    f.stat().st_size for f in p.rglob('*') if f.is_file() and not f.is_symlink()
                )})
    instances=[]
    if proc.is_dir():
        for pid in proc.iterdir():
            if not pid.name.isdigit(): continue
            try:
                cwd=(pid/'cwd').resolve(strict=True)
                cmdline=(pid/'cmdline').read_bytes().split(b'\0')
                binary=Path(os.fsdecode(cmdline[0])).name if cmdline and cmdline[0] else ''
                if cwd==root and binary=='bedrock_server':
                    instances.append(int(pid.name))
            except (OSError, ValueError): pass
    return {'instance':'bedrock-default', 'serverDir':str(root),
            'serverPort':values.get('server-port'), 'levelName':values.get('level-name'),
            'onlineMode':values.get('online-mode'), 'worlds':worlds,
            'runningBedrockPids':sorted(instances),
            'readOnly':True}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server-dir',type=Path,default=DEFAULT_ROOT)
    args=parser.parse_args()
    try:
        result=inspect(args.server_dir)
        print(json.dumps(result,indent=2,ensure_ascii=False))
    except (ValueError,OSError) as err:
        parser.exit(1,'ERROR: '+str(err)+'\n')
if __name__=='__main__': main()