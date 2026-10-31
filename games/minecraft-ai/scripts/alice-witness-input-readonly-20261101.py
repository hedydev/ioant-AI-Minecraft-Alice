#!/usr/bin/env python3
"""Owner-pinned read-only witness-file freshness and session epoch audit."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,os,time,subprocess
from pathlib import Path
root=Path.home()/'.alice-bedrock-control'
out={'audit':'ALICE_WITNESS_INPUT_READONLY','state':'unverified',
 'worldVerified':False,'witnessFile':'unverified',
 'fileAgeBand':'unknown','sampleAgeBand':'unknown',
 'sampleAfterCurrentLogin':None,'source':'unknown',
 'fresh4Seconds':False,'schemaValid':False}
def band(seconds):
 if not isinstance(seconds,(int,float)) or seconds<0:return 'invalid_or_future'
 if seconds<=4:return 'under_4_seconds'
 if seconds<=60:return 'under_1_minute'
 if seconds<=3600:return 'under_1_hour'
 if seconds<=86400:return 'under_1_day'
 return 'over_1_day'
try:
 tool=Path.home()/'minecraft-ai/scripts/alice-mint.py'
 p=subprocess.run(['/usr/bin/python3',str(tool),'status'],
  capture_output=True,text=True,timeout=12,check=False)
 if p.returncode!=0 or len(p.stdout)>20000:raise ValueError('status_unavailable')
 live=json.loads(p.stdout)
 if live.get('statusSource')!='current_process':raise ValueError('wrong_owner')
 status=root/'status.json'
 if status.is_symlink() or not status.is_file() or status.stat().st_uid!=os.getuid() or status.stat().st_mode&0o077:
  raise ValueError('status_unsafe')
 statusRow=json.loads(status.read_text())
 if statusRow.get('producerPid')!=live.get('pid') or statusRow.get('world')!='Bedrock level' or statusRow.get('serverPort')!=17879:
  raise ValueError('wrong_world')
 out['worldVerified']=True
 file=root/'bds-position-witness.json'
 if not file.exists():
  out['state']='observed';out['witnessFile']='absent'
 else:
  st=file.lstat()
  if file.is_symlink() or not file.is_file() or st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>1024 or st.st_size==0:
   out['state']='observed';out['witnessFile']='unsafe_or_invalid'
  else:
   out['state']='observed';out['witnessFile']='owner_private_file'
   now=int(time.time()*1000)
   out['fileAgeBand']=band(now/1000-st.st_mtime)
   row=json.loads(file.read_text())
   at=row.get('observedAt')
   if type(at) is int:
    out['sampleAgeBand']=band((now-at)/1000)
    out['fresh4Seconds']=0<=now-at<=4000
   origin=(statusRow.get('movementEvidence') or {}).get('loginAt')
   if type(at) is int and type(origin) is int:
    out['sampleAfterCurrentLogin']=at>origin
   if row.get('source') in ('mcsm_querytarget','bds_script_api'):
    out['source']=row['source']
   out['schemaValid']=row.get('version')==1 and type(at) is int and isinstance(row.get('gamertag'),str) and isinstance(row.get('serial'),str) and isinstance(row.get('uniqueId'),str) and isinstance(row.get('feet'),dict)
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass
print(json.dumps(out,separators=(',',':')))
"""
def check(x):
 keys={'audit','state','worldVerified','witnessFile','fileAgeBand',
       'sampleAgeBand','sampleAfterCurrentLogin','source','fresh4Seconds','schemaValid'}
 return x if isinstance(x,dict) and set(x)==keys and x.get('audit')=='ALICE_WITNESS_INPUT_READONLY' else None
def run(output):
 out=Path(output)
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 found=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
    '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',
    'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=35,check=False)
  if p.returncode==0 and len(p.stdout)<1900:found=check(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 result={'readOnly':True,'bdsCommandSent':False,'worldModified':False,'observation':found}
 fd=os.open(out/'witness_input_readonly.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
 print(json.dumps({'state':found['state'] if found else 'unverified'}))
def selftest():
 assert "'bds-position-witness.json'" in REMOTE
 assert 'querytarget' not in REMOTE and 'bedrock_server' not in REMOTE
 assert check({'audit':'ALICE_WITNESS_INPUT_READONLY','state':'observed',
 'worldVerified':True,'witnessFile':'absent','fileAgeBand':'unknown',
 'sampleAgeBand':'unknown','sampleAfterCurrentLogin':None,'source':'unknown',
 'fresh4Seconds':False,'schemaValid':False}) is not None
 print('ALICE_WITNESS_INPUT_READONLY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
 else:raise SystemExit('usage')
