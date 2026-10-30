#!/usr/bin/env python3
"""Read-only original 17879 Alice BDS/witness readiness. No new labs or commands."""
import json,os,re,shlex,subprocess,sys
from pathlib import Path
TARGET='tedz@192.168.0.104'
REMOTE=r"""
import importlib.util,json,os,subprocess,sys
from pathlib import Path
home=Path.home()
scripts=home/'minecraft-ai'/'scripts'
def fixed_call(args,timeout):
 try:
  p=subprocess.run(args,capture_output=True,text=True,timeout=timeout,check=False)
  return p.returncode,p.stdout,p.stderr
 except (OSError,subprocess.SubprocessError):return None,'',''
state={'state':'observed','bdsLabProcesses':{},'productionBdsObserved':False,
 'zombieBdsObserved':False,'aliceProcessLive':False,'aliceConnected':False,
 'aliceSessionEstablished':False,'witnessServiceActive':False,
 'witnessConfigValid':False,'witnessOutputlogReadable':False,
 'witnessPrivateFileStatus':'unverified','serverPort17879Bound':False,
 'serverPort17880Bound':False,'unknownBdsProcessCount':0,
 'mcsInstanceDirectory':'unverified'}
# Only exact BDS process executable and verified cwd, read process metadata,
# never kill, signal, read memory, auth, world files or environment.
labdirs=['minecraft-bedrock-alice-lab','minecraft-bedrock-alice-lab-v2',
         'minecraft-bedrock-alice-lab-v3','minecraft-bedrock-alice-lab-v4']
for name in labdirs:state['bdsLabProcesses'][name]='none_observed'
for proc in Path('/proc').iterdir():
 if not proc.name.isdecimal():continue
 try:
  exe=(proc/'exe').resolve(strict=True)
  if exe.name!='bedrock_server':continue
  try:cwd=(proc/'cwd').resolve(strict=True)
  except (OSError,PermissionError):
   state['unknownBdsProcessCount']+=1;continue
  if cwd==home/'minecraft-bedrock':state['productionBdsObserved']=True
  elif cwd==home/'minecraft-bedrock-zombie-apocalypse':state['zombieBdsObserved']=True
  elif cwd.parent==home and cwd.name in state['bdsLabProcesses']:
   state['bdsLabProcesses'][cwd.name]='verified_running'
  else:state['unknownBdsProcessCount']+=1
 except (OSError,PermissionError,ValueError):continue
r,s,e=fixed_call(['/usr/bin/ss','-H','-uln'],5)
if r==0:
 state['serverPort17879Bound']=any(':17879 ' in (' '+x+' ') for x in s.splitlines())
 state['serverPort17880Bound']=any(':17880 ' in (' '+x+' ') for x in s.splitlines())
r,s,e=fixed_call(['/usr/bin/systemctl','--user','is-active','alice-bds-position-witness.service'],5)
state['witnessServiceActive']=r==0 and s.strip()=='active'
r,s,e=fixed_call(['/usr/bin/python3',str(scripts/'bds_position_witness.py'),'--check'],9)
state['witnessConfigValid']=r==0 and s.strip()=='BDS witness configuration valid; no BDS request sent'
if state['witnessConfigValid']:
 r,s,e=fixed_call(['/usr/bin/python3',str(scripts/'bds_position_witness.py'),'--diagnose'],14)
 state['witnessOutputlogReadable']=r==0 and s.startswith('MCSManager outputlog: readable')
r,s,e=fixed_call(['/usr/bin/python3',str(scripts/'alice-mint.py'),'status'],12)
if r==0 and len(s)<25000:
 try:
  d=json.loads(s)
  state['aliceProcessLive']=d.get('processAlive') is True
  state['aliceConnected']=d.get('reportedConnected') is True
  state['aliceSessionEstablished']=d.get('sessionEstablished') is True
 except (ValueError,TypeError):pass
# Existing private witness file diagnosis reads status only, sends no query.
r,s,e=fixed_call(['/usr/bin/python3',str(scripts/'alice-mint.py'),'witness-diagnose'],10)
if r==0 and len(s)<16000:
 try:
  d=json.loads(s)
  state['witnessPrivateFileStatus']=d.get('state') if d.get('state') in (
    'accepted','stale','not_present','invalid_witness_shape','not_configured',
    'unavailable','disabled','readable','fresh','sample_predates_current_login') else 'other'
 except (ValueError,TypeError):pass
# Verify private config's instanceId maps to the EXACT production cwd when
# MCSManager daemon exposes a JSON definition file. We do NOT log the ID.
if state['witnessConfigValid']:
 try:
  sys.path.insert(0,str(scripts))
  import bds_position_witness as w
  c,_=w.validated_config()
  f=Path('/opt/mcsmanager/daemon/data/InstanceConfig')/(c['instanceId']+'.json')
  if f.is_file() and not f.is_symlink() and f.stat().st_size<65536:
   body=json.loads(f.read_text(encoding='utf-8'))
   def expected(obj):
    if not isinstance(obj,dict):return None
    for field in ('cwd','workingDirectory','workingDir'):
     x=obj.get(field)
     if isinstance(x,str):return x
    return expected(obj.get('config')) if isinstance(obj.get('config'),dict) else None
   cwd=expected(body)
   if cwd is not None:
    state['mcsInstanceDirectory']='production_verified' if Path(cwd).resolve()==home/'minecraft-bedrock' else 'wrong_instance'
   else:state['mcsInstanceDirectory']='schema_unknown'
  else:state['mcsInstanceDirectory']='definition_inaccessible'
 except (OSError,ValueError,TypeError,KeyError):
  state['mcsInstanceDirectory']='definition_inaccessible'
print(json.dumps(state,separators=(',',':')))
"""
LABNAMES=('minecraft-bedrock-alice-lab','minecraft-bedrock-alice-lab-v2','minecraft-bedrock-alice-lab-v3','minecraft-bedrock-alice-lab-v4')
def sanitize(x):
    if not isinstance(x,dict) or x.get('state')!='observed':return None
    keys={'state','bdsLabProcesses','productionBdsObserved','zombieBdsObserved',
     'aliceProcessLive','aliceConnected','aliceSessionEstablished','witnessServiceActive',
     'witnessConfigValid','witnessOutputlogReadable','witnessPrivateFileStatus',
     'serverPort17879Bound','serverPort17880Bound','unknownBdsProcessCount',
     'mcsInstanceDirectory'}
    if set(x)!=keys:return None
    if set(x['bdsLabProcesses'])!=set(LABNAMES) or any(z not in ('none_observed','verified_running') for z in x['bdsLabProcesses'].values()):return None
    for k in keys-{'state','bdsLabProcesses','witnessPrivateFileStatus','mcsInstanceDirectory','unknownBdsProcessCount'}:
        if type(x[k]) is not bool:return None
    if type(x['unknownBdsProcessCount']) is not int or not 0<=x['unknownBdsProcessCount']<=64:return None
    if x['mcsInstanceDirectory'] not in ('unverified','production_verified','wrong_instance','schema_unknown','definition_inaccessible'):return None
    if x['witnessPrivateFileStatus'] not in ('unverified','accepted','stale','not_present','invalid_witness_shape','not_configured','unavailable','disabled','readable','fresh','sample_predates_current_login','other'):return None
    return x
def main(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    state=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
          '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
          TARGET,'/usr/bin/python3 -c '+shlex.quote(REMOTE)],
          capture_output=True,text=True,timeout=58,check=False)
        if p.returncode==0 and len(p.stdout)<=6000:state=sanitize(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    report={'audit':'ALICE_PRODUCTION_17879_READONLY_PREFLIGHT','schemaVersion':1,
        'readOnly':True,'querytargetSent':False,'processSignaled':False,
        'labStarted':False,'worldModified':False,'observation':state}
    fd=os.open(out/'alice_production_preflight.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:
        json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':'observed' if state else 'unavailable'}))
def selftest():
    assert "['/usr/bin/systemctl','--user','is-active'" in REMOTE
    assert "'--diagnose'" in REMOTE
    assert "'--once'" not in REMOTE and "'--loop'" not in REMOTE
    print('ALICE_17879_PREFLIGHT_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':main(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
