#!/usr/bin/env python3
"""Read-only Ollama endpoint/model and Alice 17879 model availability check.
Never sends LLM chat or exports private data, URLs or credentials.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import ipaddress,json,os,re,subprocess,time,urllib.parse,urllib.request,urllib.error\nfrom pathlib import Path\nh=Path.home();control=h/'.alice-bedrock-control'\nout={'audit':'ALICE_MODEL_ENDPOINT_READONLY','schemaVersion':1,'state':'unverified','currentOwner':False,\n 'heartbeatFresh':False,'connected':False,'healthBand':'unknown','coreState':'unknown',\n 'modelConfigured':False,'modelName':'unknown','modelStatus':'unknown',\n 'modelRejectedReason':'unknown','modelPlanningRequests':None,'modelAccepted':None,\n 'endpointScope':'unknown','endpointReachable':False,'modelPresent':False,\n 'jsonMode':'unknown','timeoutMs':None,'logModelFailureCount':None,\n 'logModelSuccessCount':None,'lastLogIssue':'unknown','bdsCommandSent':False,'modelInferenceInvoked':False}\ndef fail(code):raise ValueError(code)\ndef proc_json(args):\n v=subprocess.run(args,capture_output=True,text=True,timeout=13,check=False)\n if v.returncode or len(v.stdout)>30000:fail('status_invalid')\n return json.loads(v.stdout)\ndef enum(s,values):\n return s if s in values else 'unknown'\ntry:\n s=proc_json(['/usr/bin/python3',str(h/'minecraft-ai/scripts/alice-mint.py'),'status'])\n pid=s.get('pid')\n if type(pid) is not int or not (s.get('processAlive') is True and s.get('statusSource')=='current_process'):\n  fail('owner_unverified')\n out['currentOwner']=True\n out['heartbeatFresh']=s.get('heartbeatFresh') is True and isinstance(s.get('heartbeatAgeSeconds'),(int,float)) and s['heartbeatAgeSeconds']<10\n out['connected']=s.get('reportedConnected') is True and s.get('sessionEstablished') is True\n stfile=control/'status.json'\n if stfile.is_symlink() or not stfile.is_file() or stfile.stat().st_uid!=os.getuid() or stfile.stat().st_mode&0o077 or stfile.stat().st_size>8192:fail('unsafe_status')\n d=json.loads(stfile.read_text())\n if d.get('producerPid')!=pid or d.get('serverPort')!=17879 or d.get('world')!='Bedrock level':\n  fail('session_mismatch')\n out['coreState']=enum(d.get('state'),{'IDLE','SURVIVE','COMBAT','FOLLOW','EXPLORE','RECOVER','SLEEP','GATHER','CRAFT'})\n hp=d.get('health');out['healthBand']='critical' if isinstance(hp,(float,int)) and 0<hp<6 else ('low' if isinstance(hp,(float,int)) and 0<hp<14 else ('safe' if isinstance(hp,(float,int)) and hp>=14 else 'unknown'))\n agent=d.get('agent') or {}\n out['modelStatus']=enum(agent.get('modelStatus'),{'disabled','unverified','ready','busy','error'})\n out['modelRejectedReason']=enum(agent.get('rejectedReason'),{'ollama_unavailable_or_timeout','invalid_or_empty_model_proposal','shared_model_busy','cancelled_by_priority','cancelled_by_stop','unsafe_or_blocked_wood_site'})\n for k,target in [('planningRequests','modelPlanningRequests'),('acceptedProposals','modelAccepted')]:\n  val=agent.get(k);out[target]=val if type(val) is int and 0<=val<=1000000 else None\n # /proc/PID/environ is owned by original Alice, no secrets copied or exported.\n path=Path('/proc')/str(pid)/'environ'\n raw=path.read_bytes()\n if len(raw)>250000:fail('oversize_env')\n env={}\n for part in raw.split(b'\\0'):\n  if b'=' not in part:continue\n  key,val=part.split(b'=',1)\n  if key in [b'ALICE_OLLAMA_URL',b'ALICE_OLLAMA_MODEL',b'ALICE_OLLAMA_JSON_MODE',b'ALICE_OLLAMA_TIMEOUT_MS']:\n   env[key.decode()]=val.decode(errors='replace')\n endpoint=env.get('ALICE_OLLAMA_URL','')\n model=env.get('ALICE_OLLAMA_MODEL','gpt-oss:20b')\n out['modelConfigured']=bool(endpoint)\n out['modelName']=model if re.fullmatch(r'[A-Za-z0-9_.:/-]{1,64}',model) else 'invalid'\n out['jsonMode']=enum(env.get('ALICE_OLLAMA_JSON_MODE','strict'),{'strict','prompt'})\n try:\n  timeout=int(env.get('ALICE_OLLAMA_TIMEOUT_MS','12000'))\n  out['timeoutMs']=timeout if 1000<=timeout<=120000 else None\n except ValueError:pass\n if endpoint:\n  uri=urllib.parse.urlparse(endpoint)\n  if uri.scheme not in ('http','https') or not uri.hostname or uri.path or uri.query or uri.username:\n   fail('invalid_url')\n  try:\n   addr=ipaddress.ip_address(uri.hostname)\n   out['endpointScope']='loopback' if addr.is_loopback else ('private_network' if addr.is_private else 'public_network')\n  except ValueError:\n   out['endpointScope']='hostname'\n  try:\n   req=urllib.request.Request(endpoint.rstrip('/')+'/api/tags',method='GET')\n   with urllib.request.urlopen(req,timeout=4) as response:\n    if response.status==200:\n     data=response.read(300000)\n     tags=json.loads(data)\n     out['endpointReachable']=True\n     out['modelPresent']=any(row.get('name')==model or row.get('model')==model for row in tags.get('models',[]) if isinstance(row,dict))\n  except (OSError,ValueError,TypeError,urllib.error.URLError):pass\n # bounded private owner log: report only fixed failure/success counters.\n try:\n  link=Path('/proc')/str(pid)/'fd/1'\n  resolved=link.resolve(strict=True)\n  if resolved.parent==control and resolved.name.startswith('operator-') and not resolved.is_symlink() and resolved.stat().st_uid==os.getuid():\n   with open(resolved,'rb') as f:\n    f.seek(0,2);length=f.tell();f.seek(max(0,length-100000))\n    data=f.read(100000).decode('utf-8','replace')\n   out['logModelFailureCount']=data.count('Ollama plan unavailable:')\n   out['logModelSuccessCount']=data.count('Ollama proposed tool:')\n   for key in ('ollama_unavailable_or_timeout','shared_model_busy','invalid_or_empty_model_proposal'):\n    if key in data:out['lastLogIssue']=key\n except (OSError,ValueError):pass\n out['state']='observed'\nexcept (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):pass\nprint(json.dumps(out,separators=(',',':')))\n"
KEYS={'audit','schemaVersion','state','currentOwner','heartbeatFresh','connected',
'healthBand','coreState','modelConfigured','modelName','modelStatus','modelRejectedReason',
'modelPlanningRequests','modelAccepted','endpointScope','endpointReachable','modelPresent',
'jsonMode','timeoutMs','logModelFailureCount','logModelSuccessCount','lastLogIssue',
'bdsCommandSent','modelInferenceInvoked'}
def checked(x):
 if not isinstance(x,dict) or set(x)!=KEYS or x['audit']!='ALICE_MODEL_ENDPOINT_READONLY' or x['schemaVersion']!=1 or x['state'] not in ('observed','unverified'):return None
 for k in ('currentOwner','heartbeatFresh','connected','modelConfigured','endpointReachable','modelPresent','bdsCommandSent','modelInferenceInvoked'):
  if type(x[k]) is not bool:return None
 if x['bdsCommandSent'] or x['modelInferenceInvoked']:return None
 for k in ('healthBand','coreState','modelName','modelStatus','modelRejectedReason','endpointScope','jsonMode','lastLogIssue'):
  if type(x[k]) is not str or len(x[k])>70:return None
 for k in ('modelPlanningRequests','modelAccepted','timeoutMs','logModelFailureCount','logModelSuccessCount'):
  if x[k] is not None and (type(x[k]) is not int or not 0<=x[k]<=1000000):return None
 return x
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 record=None
 try:
  cmd=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)]
  p=subprocess.run(cmd,capture_output=True,text=True,timeout=60,check=False)
  if p.returncode==0 and len(p.stdout)<1500:record=checked(json.loads(p.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 obj={'audit':'ALICE_MODEL_ENDPOINT_READONLY_RESULT','readOnly':True,
      'networkRequest':'GET /api/tags only, no model inference','observation':record}
 fd=os.open(out/'alice_model_endpoint.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(obj,f,separators=(',',':'))
 print(json.dumps({'state':record['state'] if record else 'unverified'}))
def selftest():
 compile(REMOTE,'<mint-model-readonly>','exec')
 assert "method='GET'" in REMOTE and "'/api/tags'" in REMOTE
 assert "'/api/chat'" not in REMOTE and "'querytarget'" not in REMOTE
 x={'audit':'ALICE_MODEL_ENDPOINT_READONLY','schemaVersion':1,'state':'observed',
   'currentOwner':True,'heartbeatFresh':True,'connected':True,
   'healthBand':'safe','coreState':'IDLE','modelConfigured':True,
   'modelName':'gemma4:26b-a4b','modelStatus':'error','modelRejectedReason':'ollama_unavailable_or_timeout',
   'modelPlanningRequests':3,'modelAccepted':0,'endpointScope':'private_network',
   'endpointReachable':False,'modelPresent':False,'jsonMode':'strict',
   'timeoutMs':12000,'logModelFailureCount':2,'logModelSuccessCount':0,
   'lastLogIssue':'ollama_unavailable_or_timeout','bdsCommandSent':False,'modelInferenceInvoked':False}
 assert checked(x)==x
 assert checked({**x,'modelInferenceInvoked':True}) is None
 print('ALICE_MODEL_ENDPOINT_READONLY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(Path(sys.argv[2]))
 else:raise SystemExit('usage --self-test | --inspect OUTPUT_DIR')
