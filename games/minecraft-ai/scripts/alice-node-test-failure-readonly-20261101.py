#!/usr/bin/env python3
"""Bounded read-only Node24 regression diagnosis on existing Mint checkout."""
import json,os,re,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,re,subprocess
from pathlib import Path
home=Path.home()
root=home/'minecraft-ai/bedrock-native/experiment'
node=home/'.local/share/alice-bedrock/node24/current/bin/node'
result={'audit':'ALICE_READONLY_NODE24_TEST_FAILURE',
 'state':'unavailable','testFailureCount':None,'failedTests':[],'errors':[]}
try:
 if not root.is_dir() or root.is_symlink() or not node.is_file():raise ValueError('preflight')
 files=['test/escape_survey.test.cjs','test/home_base.test.cjs',
        'test/runtime.test.cjs','test/live_control.test.cjs']
 proc=subprocess.run([str(node),'--test',*files],cwd=root,
                      capture_output=True,text=True,timeout=85,check=False)
 out=(proc.stdout+'\n'+proc.stderr)
 failures=[]
 for ln in out.splitlines():
  if ln.startswith('not ok '):
   failures.append(re.sub('[^A-Za-z0-9_ :.,()\-/]','',ln)[:170])
 err=[]
 for ln in out.splitlines():
  m=re.search(r'AssertionError|TypeError|ReferenceError|expected|actual:|operator:',ln)
  if m and len(err)<14:
   err.append(re.sub('[^A-Za-z0-9_ :.,()\-/]','',ln).strip()[:150])
 result={'audit':'ALICE_READONLY_NODE24_TEST_FAILURE',
  'state':'observed','testFailureCount':len(failures),
  'failedTests':failures[:6],'errors':err,
  'tail':[re.sub('[^A-Za-z0-9_ :.,()\\-/!?=✖]','',ln).strip()[:160]
    for ln in out.splitlines()[-32:] if ln.strip()][:25],
  'exitCode':proc.returncode}
except (OSError,ValueError,subprocess.TimeoutExpired):pass
print(json.dumps(result,separators=(',',':')))
"""
def run(directory):
 out=Path(directory)
 if not out.is_dir() or out.is_symlink():raise ValueError('output')
 data={'state':'unavailable'}
 try:
  proc=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
   '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes','tedz@192.168.0.104',
   '/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=110)
  if proc.returncode==0 and len(proc.stdout)<3500:
   data=json.loads(proc.stdout)
 except (OSError,ValueError,subprocess.SubprocessError):pass
 content={'schemaVersion':1,'readOnly':True,'worldModified':False,
          'bdsCommandsSent':False,'observation':data}
 fd=os.open(out/'node_diagnosis.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:json.dump(content,f)
 print(json.dumps({'state':data.get('state')}))
def selftest():
 assert 'node' in REMOTE and 'test/escape_survey.test.cjs' in REMOTE
 assert 'querytarget' not in REMOTE and 'bedrock_server' not in REMOTE
 print('ALICE_NODE_READONLY_DIAG_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
 else:raise SystemExit('usage')
