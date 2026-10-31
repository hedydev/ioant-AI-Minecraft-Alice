#!/usr/bin/env python3
"""Read-only 17879 stable Script API witness eligibility. No BDS console,
world file mutation, service restart, credential access or network publisher."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,os
from pathlib import Path
import sys
home=Path.home();scripts=home/'minecraft-ai/scripts'
sys.path.insert(0,str(scripts))
from alice_bds_level_metadata import beta_api_experiment
root=home/'minecraft-bedrock';world=root/'worlds/Bedrock level'
stage=home/'minecraft-ai/bds-stable-witness-pack'
cfg=home/'.alice-bedrock-control/bds-stable-actionbar-enabled.json'
expected='37ac86b0-11b0-4505-b15d-989d7ff5b10b'
r={'audit':'ALICE_STABLE_BDS_PREFLIGHT','schemaVersion':1,'readOnly':True,
   'original17879':False,'sourceStableOnly':False,'worldAttached':False,
   'installedPackPresent':False,'operatorOptInConfigured':False,
   'worldPackList':'unverified','betaExperiment':'unverified',
   'safeToModifyProduction':False}
try:
 p=root/'server.properties'
 if p.is_symlink() or not p.is_file() or p.stat().st_size>65536:raise ValueError('bad_properties')
 props={}
 for x in p.read_text().splitlines():
  if '=' in x and not x.lstrip().startswith('#'):
   k,v=x.split('=',1)
   props[k.strip()]=v.strip()
 r['original17879']=(props.get('server-port')=='17879'
   and props.get('level-name')=='Bedrock level' and props.get('online-mode')=='true'
   and not root.is_symlink() and world.is_dir() and not world.is_symlink()
   and (world/'db').is_dir() and (world/'level.dat').is_file())
 if not r['original17879']:raise ValueError('wrong_world')
 manifest=stage/'manifest.json'
 if manifest.is_file() and not manifest.is_symlink() and manifest.stat().st_size<8192:
  m=json.loads(manifest.read_text())
  r['sourceStableOnly']=(m.get('header',{}).get('uuid')==expected
    and m.get('dependencies')==[{'module_name':'@minecraft/server','version':'2.10.0'}])
 attached=world/'world_behavior_packs.json'
 if not attached.exists():r['worldPackList']='absent'
 elif attached.is_file() and not attached.is_symlink() and attached.stat().st_size<32768:
  x=json.loads(attached.read_text())
  if isinstance(x,list):
   r['worldPackList']='valid'
   r['worldAttached']=any(isinstance(t,dict) and t.get('pack_id')==expected for t in x)
  else:r['worldPackList']='invalid'
 else:r['worldPackList']='unverified'
 r['installedPackPresent']=((root/'behavior_packs/alice-stable-bds-witness').is_dir()
   and not (root/'behavior_packs/alice-stable-bds-witness').is_symlink())
 r['operatorOptInConfigured']=(cfg.is_file() and not cfg.is_symlink()
   and cfg.stat().st_uid==os.getuid() and cfg.stat().st_mode&0o077==0)
 r['betaExperiment']=beta_api_experiment(world/'level.dat')
except (OSError,ValueError,TypeError,KeyError):pass
print(json.dumps(r,separators=(',',':')))
"""
KEYS={'audit','schemaVersion','readOnly','original17879','sourceStableOnly',
'worldAttached','installedPackPresent','operatorOptInConfigured','worldPackList',
'betaExperiment','safeToModifyProduction'}
def sanitize(r):
 if not isinstance(r,dict) or set(r)!=KEYS or r.get('audit')!='ALICE_STABLE_BDS_PREFLIGHT' or r.get('schemaVersion')!=1:return None
 if r.get('readOnly') is not True or r.get('safeToModifyProduction') is not False:return None
 for k in ('original17879','sourceStableOnly','worldAttached','installedPackPresent','operatorOptInConfigured'):
  if type(r[k]) is not bool:return None
 if r['worldPackList'] not in ('unverified','absent','valid','invalid'):return None
 if r['betaExperiment'] not in ('unverified','enabled_in_level_dat','disabled_in_level_dat','not_declared_in_level_dat'):return None
 return r
def run(output):
 out=Path(output)
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 obs=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8',
   '-o','StrictHostKeyChecking=yes','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
   capture_output=True,text=True,timeout=35,check=False)
  if p.returncode==0 and len(p.stdout)<1700:obs=sanitize(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 with (out/'stable_witness_preflight.json').open('x',encoding='utf-8') as f:
  json.dump({'audit':'ALICE_STABLE_PREFLIGHT_RESULT','readOnly':True,
   'worldModified':False,'bdsCommandSent':False,'observation':obs},f,separators=(',',':'))
  f.write('\n')
 print(json.dumps({'state':'observed' if obs else 'unverified'}))
def selftest():
 compile(REMOTE,'<read-only-Mint>','exec')
 x={k:False for k in KEYS}
 x.update({'audit':'ALICE_STABLE_BDS_PREFLIGHT','schemaVersion':1,'readOnly':True,
  'safeToModifyProduction':False,'worldPackList':'absent','betaExperiment':'not_declared_in_level_dat'})
 assert sanitize(x)==x
 assert sanitize({**x,'safeToModifyProduction':True}) is None
 assert 'querytarget' not in REMOTE and 'restart' not in REMOTE and 'runCommand' not in REMOTE
 print('ALICE_STABLE_BDS_PREFLIGHT_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
 else:raise SystemExit('usage --self-test | --inspect OUTPUT_DIR')
