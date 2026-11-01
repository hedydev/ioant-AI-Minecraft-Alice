#!/usr/bin/env python3
"""Run the existing three reconciliation regressions on Mint's pinned Node24.
Never starts a client, contacts BDS, or reads raw player coordinates.
"""
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

REMOTE = r'''
import json,os,re,subprocess,sys
from pathlib import Path
root=Path.home()/'minecraft-ai'
sys.path.insert(0,str(root/'scripts'))
from alice_operator.process import AliceProcess
app=AliceProcess()
project=app.project.resolve(strict=True)
files=['movement_prediction_history.test.cjs',
       'client_input_reconciliation.test.cjs',
       'client_input_tick_sync.test.cjs']
tests=[]
for name in files:
 p=project/'test'/name
 if p.is_symlink() or not p.is_file() or p.resolve(strict=True).parent!=project/'test':
  raise ValueError('test_path_unavailable')
 tests.append(str(p))
p=subprocess.run([str(app.node),'--test',*tests],cwd=project,
     capture_output=True,text=True,timeout=100,check=False)
out=p.stdout[-20000:]
def count(name):
 match=re.search(r'^\\s*[ℹ#]\\s*'+re.escape(name)+r'\\s+(\\d+)\\s*$',out,re.M)
 return int(match.group(1)) if match else None
v={'audit':'ALICE_RECONCILE_REAL_NODE',
   'state':'passed' if p.returncode==0 else 'failed',
   'nodeVersion':'unknown','tests':count('tests'),'pass':count('pass'),
   'fail':count('fail'),'skipped':count('skipped'),
   'testFiles':len(tests),'restartedAlice':False,'bdsCommandSent':False,
   'worldModified':False}
version=subprocess.run([str(app.node),'--version'],capture_output=True,text=True,
                       timeout=4,check=False)
if version.returncode==0 and re.fullmatch(r'v[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,4}',version.stdout.strip()):
 v['nodeVersion']=version.stdout.strip()
if v['tests'] is None or v['pass'] is None or v['fail'] is None or v['skipped'] is None:
 v['state']='unverified'
print(json.dumps(v,separators=(',',':')))
'''
FIELDS={'audit','state','nodeVersion','tests','pass','fail','skipped',
        'testFiles','restartedAlice','bdsCommandSent','worldModified'}
def validate(v):
 if not isinstance(v,dict) or set(v)!=FIELDS or v['audit']!='ALICE_RECONCILE_REAL_NODE':return None
 if v['state'] not in ('passed','failed','unverified'):return None
 if v['restartedAlice'] is not False or v['bdsCommandSent'] is not False or v['worldModified'] is not False:return None
 if v['testFiles']!=3:return None
 if type(v['nodeVersion']) is not str or len(v['nodeVersion'])>20:return None
 for key in ('tests','pass','fail','skipped'):
  if v[key] is not None and (type(v[key]) is not int or not 0<=v[key]<2000):return None
 return v
def run(folder):
 if not folder.is_dir() or folder.is_symlink():raise ValueError('output_unavailable')
 observation=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
    '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
    'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=120,check=False)
  if p.returncode==0 and len(p.stdout)<2200:
   observation=validate(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError,json.JSONDecodeError):pass
 result={'audit':'ALICE_RECONCILE_MINT_INDEPENDENT_REPORT','readOnly':True,
   'observation':observation}
 fd=os.open(folder/'alice_reconcile_mint_tests.json',
    os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as fp:json.dump(result,fp,separators=(',',':'))
 print(json.dumps({'result':observation['state'] if observation else 'unverified'}))
def selftest():
 compile(REMOTE,'<alice-reconcile-remote>','exec')
 assert 'alice-mint.py restart' not in REMOTE
 assert "'--test'" in REMOTE
 assert "'tedz@192.168.0.104'" in Path(__file__).read_text()
 print('ALICE_RECONCILE_MINT_VERIFY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--read':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --read OUTPUT_DIRECTORY')
