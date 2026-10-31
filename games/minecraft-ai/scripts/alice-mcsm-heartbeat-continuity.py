#!/usr/bin/env python3
"""Verify original Alice heartbeat advances twice 8 seconds apart, no commands."""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import json,os,subprocess,time\nfrom pathlib import Path\nh=Path.home();root=h/'.alice-bedrock-control'\nv={'audit':'ALICE_PRIVATE_HEARTBEAT_CONTINUITY','schemaVersion':1,\n 'state':'unverified','ownerSame':False,'initialFresh':False,'finalFresh':False,\n 'mtimeAdvanced':False,'updatedAtAdvanced':False,'statusBelow4KiB':False,\n 'minimalFallbackUsed':False,'clientOnline':False,'sleepSeconds':8,\n 'bdsCommandSent':False,'bdsRestarted':False}\ndef load():\n p=subprocess.run(['/usr/bin/python3',str(h/'minecraft-ai/scripts/alice-mint.py'),'status'],\n   capture_output=True,text=True,timeout=12,check=False)\n if p.returncode or len(p.stdout)>22000:raise ValueError('status_unavailable')\n s=json.loads(p.stdout)\n if s.get('statusSource')!='current_process' or s.get('processAlive') is not True or type(s.get('pid')) is not int:\n  raise ValueError('wrong_process')\n status=root/'status.json'\n if status.is_symlink() or not status.is_file():raise ValueError('unsafe_file')\n st=status.stat()\n if st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>4096 or st.st_size<=0:\n  raise ValueError('unsafe_file')\n row=json.loads(status.read_text())\n at=row.get('updatedAt')\n if row.get('producerPid')!=s['pid'] or not isinstance(row.get('producerStartToken'),str) or type(at) is not int:\n  raise ValueError('wrong_producer')\n now=int(time.time()*1000)\n fresh=(s.get('heartbeatFresh') is True and type(s.get('heartbeatAgeSeconds')) in (float,int)\n   and 0<=s['heartbeatAgeSeconds']<=5 and 0<=now-at<=6000 and 0<=time.time()-st.st_mtime<=5)\n return s,row,st.st_mtime_ns,bool(fresh),st.st_size\ntry:\n s,a,am,first,bytes1=load()\n v['initialFresh']=first\n if not first:raise ValueError('stale_before')\n time.sleep(8)\n t,b,bm,last,bytes2=load()\n v['finalFresh']=last\n v['ownerSame']=t['pid']==s['pid'] and a['producerStartToken']==b['producerStartToken']\n v['mtimeAdvanced']=bm>am\n v['updatedAtAdvanced']=b['updatedAt']>a['updatedAt']\n v['statusBelow4KiB']=bytes1<=4096 and bytes2<=4096\n v['minimalFallbackUsed']=b.get('statusMinimal') is True\n v['clientOnline']=t.get('reportedConnected') is True and t.get('sessionEstablished') is True\n v['state']='continuous' if all((v['ownerSame'],v['initialFresh'],v['finalFresh'],\n   v['mtimeAdvanced'],v['updatedAtAdvanced'],v['statusBelow4KiB'],v['clientOnline'])) else 'not_continuous'\nexcept (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass\nprint(json.dumps(v,separators=(',',':')))\n"
FIELDS={'audit','schemaVersion','state','ownerSame','initialFresh','finalFresh',
'mtimeAdvanced','updatedAtAdvanced','statusBelow4KiB','minimalFallbackUsed',
'clientOnline','sleepSeconds','bdsCommandSent','bdsRestarted'}
def valid(v):
 if not isinstance(v,dict) or set(v)!=FIELDS or v['audit']!='ALICE_PRIVATE_HEARTBEAT_CONTINUITY' or v['schemaVersion']!=1 or v['state'] not in ('unverified','continuous','not_continuous') or v['sleepSeconds']!=8:
  return None
 for k in FIELDS-{'audit','schemaVersion','state','sleepSeconds'}:
  if type(v[k]) is not bool:return None
 if v['bdsCommandSent'] or v['bdsRestarted']:return None
 return v
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 v=None
 try:
  p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
    '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
    'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
     capture_output=True,text=True,timeout=45,check=False)
  if p.returncode==0 and len(p.stdout)<=1200:v=valid(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 report={'audit':'ALICE_PRIVATE_HEARTBEAT_CONTINUITY_RESULT','readOnly':True,'observation':v}
 fd=os.open(out/'alice_heartbeat_continuity.json',
    os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'))
 print(json.dumps({'state':v['state'] if v else 'unavailable'}))
def selftest():
 compile(REMOTE,'<mint-continuity>','exec')
 assert 'time.sleep(8)' in REMOTE and "'restart'" not in REMOTE
 x={'audit':'ALICE_PRIVATE_HEARTBEAT_CONTINUITY','schemaVersion':1,
  'state':'continuous','ownerSame':True,'initialFresh':True,'finalFresh':True,
  'mtimeAdvanced':True,'updatedAtAdvanced':True,'statusBelow4KiB':True,
  'minimalFallbackUsed':True,'clientOnline':True,'sleepSeconds':8,
  'bdsCommandSent':False,'bdsRestarted':False}
 assert valid(x)==x
 assert valid({**x,'bdsRestarted':True}) is None
 print('ALICE_PRIVATE_HEARTBEAT_CONTINUITY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--run':run(Path(sys.argv[2]))
 else:raise SystemExit('usage: --self-test | --run OUTPUT_DIR')
