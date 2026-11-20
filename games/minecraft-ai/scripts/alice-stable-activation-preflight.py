#!/usr/bin/env python3
"""Read-only compatibility and ownership facts for the approved stable witness.

No console command, lifecycle operation, configuration or world write.
Private values stay on Mint; only fixed fields and numeric versions are returned.
"""
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys

REMOTE = r'''
import json,os,re,shutil,socket,struct,sys,time
from pathlib import Path
h=Path.home(); scripts=h/'minecraft-ai/scripts';sys.path.insert(0,str(scripts))
from bds_position_witness import validated_config,DAEMON_LOG_DIR
from alice_bds_level_metadata import beta_api_experiment
from alice_operator.process import AliceProcess
r={'readOnly':True,'originalInstance':False,'bdsProcessCount':None,
   'bdsCwdVerified':False,'binaryMatchesRunning':False,'versions':[],
   'betaExperiment':'unverified','cheats':None,'stopCommandVerified':False,
   'privateConfigValid':False,'worldWritable':False,'packParentsWritable':False,
   'freeBytes':None,'worldBytes':None,'backupCount':0,'pendingActions':None,
   'moduleVersionHints':[],'udpVersion':None,'udpProtocol':None,'bdsCommandKinds':[],
   'logBytes':None,'usesDynamicLoader':False}
try:
 root=h/'minecraft-bedrock';world=root/'worlds/Bedrock level'
 cfg,key=validated_config();r['privateConfigValid']=True
 config=Path('/opt/mcsmanager/daemon/data/InstanceConfig')/(cfg['instanceId']+'.json')
 m=json.loads(config.read_text());c=m.get('config',m)
 cwd=c.get('cwd',c.get('workingDirectory',c.get('workingDir')))
 props={}
 for line in (root/'server.properties').read_text().splitlines():
  if '=' in line and not line.lstrip().startswith('#'):
   k,v=line.split('=',1);props[k.strip()]=v.strip()
 r['originalInstance']=(Path(cwd).resolve()==root.resolve() and props.get('server-port')=='17879'
  and props.get('level-name')=='Bedrock level' and props.get('online-mode')=='true'
  and not root.is_symlink() and not world.is_symlink())
 r['cheats']=props.get('allow-cheats')=='true'
 r['stopCommandVerified']=c.get('stopCommand')=='stop'
 pids=[];unknown=False
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   command=(p/'comm').read_text().strip()
   args=(p/'cmdline').read_bytes().split(b'\0')
   if not any(Path(os.fsdecode(a)).name=='bedrock_server' for a in args if a):continue
   r['bdsCommandKinds'].append(command if command in ('bedrock_server','ld-linux-x86-64','ld-linux-x86-6') else 'other')
   r['usesDynamicLoader']=r['usesDynamicLoader'] or command.startswith('ld-linux')
   try:
    if (p/'cwd').resolve(strict=True)==root.resolve():pids.append(p)
   except OSError:unknown=True
  except (OSError,ValueError):continue
 r['bdsProcessCount']=len(pids);r['bdsCwdVerified']=len(pids)==1 and not unknown
 if r['bdsCwdVerified']:
  a=(pids[0]/'exe').stat();b=(root/'bedrock_server').stat()
  r['binaryMatchesRunning']=(a.st_dev,a.st_ino)==(b.st_dev,b.st_ino)
 log=DAEMON_LOG_DIR/(cfg['instanceId']+'.log')
 r['logBytes']=log.stat().st_size
 with log.open('rb') as f:
  prefix=f.read(262144);f.seek(max(0,log.stat().st_size-1048576));tail=f.read(1048576)
 r['versions']=sorted(set(re.findall(r'\bVersion:\s*([0-9]+(?:\.[0-9]+){2,3})',
  (prefix+tail).decode('utf-8','replace'))))[-8:]
 # RakNet unconnected ping: no player login, game command or querytarget budget.
 magic=bytes.fromhex('00ffff00fefefefefdfdfdfd12345678')
 with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
  s.settimeout(3);s.connect(('127.0.0.1',17879))
  s.send(b'\x01'+struct.pack('>q',int(time.time()*1000))+magic+struct.pack('>q',1))
  pong=s.recv(2048)
 if len(pong)>=35 and pong[0]==0x1c and pong[17:33]==magic:
  n=struct.unpack('>H',pong[33:35])[0];fields=pong[35:35+n].decode().split(';')
  if fields[0]=='MCPE' and re.fullmatch(r'[0-9]{2,5}',fields[2]) and re.fullmatch(r'[0-9]+(?:\.[0-9]+){2,3}',fields[3]):
   r['udpProtocol']=int(fields[2]);r['udpVersion']=fields[3]
 r['betaExperiment']=beta_api_experiment(world/'level.dat')
 r['worldWritable']=os.access(world,os.W_OK) and os.access(world/'level.dat',os.R_OK)
 r['packParentsWritable']=os.access(root/'behavior_packs',os.W_OK)
 r['freeBytes']=shutil.disk_usage(root).free
 r['worldBytes']=sum(p.stat().st_size for p in world.rglob('*') if p.is_file() and not p.is_symlink())
 backups=h/'minecraft-world-backups/bedrock-default'
 r['backupCount']=sum(1 for p in backups.glob('minecraft-bedrock-*.json') if p.is_file())
 app=AliceProcess();o=app.owner()
 if o:
  _,token,env=app.inspect(o)
  status=json.loads((app.root/'status.json').read_text())
  r['pendingActions']=sum(bool(status.get(k)) for k in
   ('job','pendingScoutStep','pendingBedStep','pendingDoorAction','pendingPassageAction'))
 # Package-supplied API metadata, if present. Only public module/version facts.
 for parent in ('config','definitions','behavior_packs'):
  folder=root/parent
  for p in list(folder.glob('**/*minecraft*server*.json'))[:40]:
   if p.is_file() and not p.is_symlink() and p.stat().st_size<65536:
    r['moduleVersionHints']+=re.findall(r'"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"',p.read_text())[:4]
 r['moduleVersionHints']=sorted(set(r['moduleVersionHints']))[:8]
except Exception as e:r['failureType']=type(e).__name__
print(json.dumps(r,separators=(',',':')))
'''

def target():
    task = Path(__file__).resolve().parents[3]/'.openclaw/tasks/alice_mint_nonrestart_sync.json'
    value=json.loads(task.read_text())['steps'][1]['args'][-1]
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}@[0-9]{1,3}(?:\.[0-9]{1,3}){3}',value):
        raise ValueError('invalid_enrolled_target')
    return value

def inspect(output):
    out=Path(output)
    if not out.is_dir() or out.is_symlink():raise ValueError('unsafe_output')
    p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
      '-o','ConnectTimeout=8',target(),'/usr/bin/python3 -c '+shlex.quote(REMOTE)],
      capture_output=True,text=True,timeout=50,check=False)
    result=json.loads(p.stdout) if p.returncode==0 and len(p.stdout)<4096 else {'readOnly':True,'unavailable':True}
    with (out/'stable_activation_preflight.json').open('x') as f:json.dump(result,f)
    print(json.dumps({'readOnly':True,'received':p.returncode==0}))

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        compile(REMOTE,'<readonly>','exec');target()
        assert 'protected_instance/stop' not in REMOTE and 'api(' not in REMOTE
        print('STABLE_ACTIVATION_PREFLIGHT_PASS')
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':inspect(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
