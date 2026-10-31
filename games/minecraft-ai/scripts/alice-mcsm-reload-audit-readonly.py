#!/usr/bin/env python3
"""Read only original BDS Alice process restart/loaded-source audit.
No process management, authentication, player location, or Minecraft commands.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="\nimport json,os,subprocess,time\nfrom pathlib import Path\nhome=Path.home()\nout={'audit':'ALICE_MCSM_RELOAD_PASSIVE_AUDIT','schemaVersion':1,\n  'state':'unverified','connected':False,'sessionEstablished':False,\n  'statusSourceCurrent':False,'alive':False,'heartbeatFresh':False,\n  'processAgeBand':'unknown','runtimeSourceLoadedAfterSync':False,\n  'currentSourceOnDisk':False,'witnessDemandPresent':False,'independentSamples':None,\n  'worldVerified':False}\ntry:\n cli=home/'minecraft-ai/scripts/alice-mint.py'\n proc=subprocess.run(['/usr/bin/python3',str(cli),'status'],capture_output=True,text=True,\n       timeout=15,check=False)\n if proc.returncode or len(proc.stdout)>22000:raise ValueError('status_unavailable')\n s=json.loads(proc.stdout);pid=s.get('pid')\n out['alive']=s.get('processAlive') is True\n out['connected']=s.get('reportedConnected') is True\n out['sessionEstablished']=s.get('sessionEstablished') is True\n out['statusSourceCurrent']=s.get('statusSource')=='current_process'\n out['heartbeatFresh']=s.get('heartbeatFresh') is True\n out['worldVerified']=s.get('serverPort') in (None,17879) and s.get('world') in (None,'Bedrock level')\n if type(pid) is not int or pid<=0 or not all((out['alive'],out['statusSourceCurrent'],out['worldVerified'])):\n  raise ValueError('wrong_process')\n status=home/'.alice-bedrock-control/status.json'\n if status.is_symlink() or not status.is_file() or status.stat().st_uid!=os.getuid() or status.stat().st_mode&0o077 or status.stat().st_size>8192:\n  raise ValueError('unsafe_status')\n info=json.loads(status.read_text())\n if info.get('producerPid')!=pid or info.get('world')!='Bedrock level' or info.get('serverPort')!=17879:\n  raise ValueError('wrong_producer')\n mv=info.get('movementEvidence') or {}\n out['witnessDemandPresent']=isinstance(mv.get('witnessDemand'),dict)\n n=mv.get('independentSamples')\n if type(n) is int and 0<=n<100000000:out['independentSamples']=n\n source=home/'minecraft-ai/bedrock-native/experiment/src/main.cjs'\n if not source.is_symlink() and source.is_file():\n  out['currentSourceOnDisk']=True\n  statfile=Path('/proc')/str(pid)/'stat'\n  fields=statfile.read_text().rsplit(')',1)[1].split()\n  birth=float(fields[19])/os.sysconf('SC_CLK_TCK')\n  up=float(Path('/proc/uptime').read_text().split()[0])\n  age=max(0,up-birth)\n  out['processAgeBand']='under_5_minutes' if age<300 else (\n    'under_1_hour' if age<3600 else 'older_than_hour')\n  started=time.time()-age\n  out['runtimeSourceLoadedAfterSync']=started>=source.stat().st_mtime-3\n out['state']='observed'\nexcept (OSError,ValueError,IndexError,TypeError,KeyError,subprocess.SubprocessError):pass\nprint(json.dumps(out,separators=(',',':')))\n"
FIELDS={'audit','schemaVersion','state','connected','sessionEstablished',
'statusSourceCurrent','alive','heartbeatFresh','processAgeBand',
'runtimeSourceLoadedAfterSync','currentSourceOnDisk','witnessDemandPresent',
'independentSamples','worldVerified'}
def valid(v):
 if not isinstance(v,dict) or set(v)!=FIELDS or v['audit']!='ALICE_MCSM_RELOAD_PASSIVE_AUDIT' or v['schemaVersion']!=1:return None
 if v['state'] not in ('observed','unverified') or v['processAgeBand'] not in ('unknown','under_5_minutes','under_1_hour','older_than_hour'):return None
 for k in FIELDS-{'audit','schemaVersion','state','processAgeBand','independentSamples'}:
  if type(v[k]) is not bool:return None
 if v['independentSamples'] is not None and (type(v['independentSamples']) is not int or not 0<=v['independentSamples']<100000000):return None
 return v
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_dir')
 row=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=45,check=False)
  if p.returncode==0 and len(p.stdout)<=1200:row=valid(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 report={'audit':'ALICE_MCSM_RELOAD_READONLY_REPORT','readOnly':True,'bdsCommandSent':False,
 'aliceRestartedByTask':False,'bdsRestarted':False,'observation':row}
 fd=os.open(out/'alice_mcsm_reload_audit.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'))
 print(json.dumps({'state':row['state'] if row else 'unavailable'}))
def selftest():
 compile(REMOTE,'<remote>','exec')
 assert "'status'" in REMOTE and "'restart'" not in REMOTE
 x={'audit':'ALICE_MCSM_RELOAD_PASSIVE_AUDIT','schemaVersion':1,'state':'observed',
   'connected':True,'sessionEstablished':True,'statusSourceCurrent':True,'alive':True,
   'heartbeatFresh':True,'processAgeBand':'under_5_minutes','runtimeSourceLoadedAfterSync':True,
   'currentSourceOnDisk':True,'witnessDemandPresent':True,'independentSamples':0,'worldVerified':True}
 assert valid(x)==x
 assert valid({**x,'independentSamples':-1}) is None
 print('ALICE_MCSM_RELOAD_PASSIVE_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--check':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --check OUTPUT_DIR')
