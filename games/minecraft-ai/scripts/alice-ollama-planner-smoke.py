#!/usr/bin/env python3
"""One bounded real local Ollama planner smoke from Mint via SSH tunnel.

Uses no game-world input, returns only result enum and timing. Does invoke the
local model for the explicit Alice AI repair, unlike earlier read-only probes.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE="import json,time,urllib.request,urllib.error,socket\nr={'audit':'ALICE_OLLAMA_PLANNER_SMOKE','schemaVersion':1,'state':'not_run',\n 'status':'unverified','model':'granite4:3b','configuredTimeoutMs':12000,\n 'httpCode':None,'validGoal':False,'completedUnderConfiguredTimeout':False,\n 'elapsedMs':None,'inferenceInvoked':False,'bedrockTouched':False}\nsystem='你是Minecraft基岩版Alice高层决策建议器。只返回JSON对象: {\"tool\":\"observe|gather_wood|craft_wooden_sword|scout_safe|adapt_terrain\",\"reason\":\"简短原因\"}。当无安全地图与可靠坐标时，必须选择observe。'\nbody={'model':'granite4:3b','stream':False,'keep_alive':'0',\n 'format':'json','options':{'temperature':.15,'num_ctx':2048,'num_predict':160},\n 'messages':[{'role':'system','content':system},\n  {'role':'user','content':'{\"observedFacts\":{\"phase\":\"unknown\",\"safeToExplore\":false,\"scoutAvailable\":false,\"health\":2},\"verifiedLearning\":{}}'}]}\nstart=time.monotonic()\ntry:\n req=urllib.request.Request('http://127.0.0.1:11435/api/chat',\n  data=json.dumps(body,separators=(',',':')).encode(),method='POST',\n  headers={'Content-Type':'application/json'})\n r['inferenceInvoked']=True\n with urllib.request.urlopen(req,timeout=14) as resp:\n  r['httpCode']=resp.status\n  obj=json.loads(resp.read(60000))\n  raw=obj.get('message',{}).get('content','')\n  try:\n   x=json.loads(raw) if isinstance(raw,str) and len(raw)<1200 else None\n   r['validGoal']=isinstance(x,dict) and set(x).issubset({'tool','reason'}) and x.get('tool') in (\n     'observe','gather_wood','craft_wooden_sword','scout_safe','adapt_terrain') and isinstance(x.get('reason'),str) and 0<len(x['reason'])<=100\n  except (ValueError,TypeError):pass\n  r['status']='valid_json_goal' if r['validGoal'] else 'invalid_or_empty_goal'\nexcept urllib.error.HTTPError as exc:\n r['httpCode']=exc.code\n r['status']='unsupported_json_mode' if exc.code==501 else 'model_http_error'\nexcept (socket.timeout,TimeoutError):\n r['status']='timeout'\nexcept (OSError,ValueError,TypeError,urllib.error.URLError):\n r['status']='transport_or_json_error'\nfinally:\n elapsed=round((time.monotonic()-start)*1000)\n r['elapsedMs']=min(60000,max(0,elapsed))\n r['completedUnderConfiguredTimeout']=bool(r['validGoal'] and elapsed<12000)\n r['state']='observed'\n print(json.dumps(r,separators=(',',':')))\n"
def validate(x):
 keys={'audit','schemaVersion','state','status','model','configuredTimeoutMs','httpCode',
 'validGoal','completedUnderConfiguredTimeout','elapsedMs','inferenceInvoked','bedrockTouched'}
 if not isinstance(x,dict) or set(x)!=keys or x['audit']!='ALICE_OLLAMA_PLANNER_SMOKE' or x['schemaVersion']!=1 or x['state']!='observed' or x['status'] not in ('valid_json_goal','invalid_or_empty_goal','unsupported_json_mode','model_http_error','timeout','transport_or_json_error'):return None
 if x['model']!='granite4:3b' or x['configuredTimeoutMs']!=12000:return None
 for key in ('validGoal','completedUnderConfiguredTimeout','inferenceInvoked','bedrockTouched'):
  if type(x[key]) is not bool:return None
 if x['bedrockTouched'] or not x['inferenceInvoked']:return None
 if type(x['elapsedMs']) is not int or not 0<=x['elapsedMs']<=60000:return None
 if x['httpCode'] is not None and (type(x['httpCode']) is not int or not 100<=x['httpCode']<=599):return None
 return x
def run(out):
 if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
 row=None
 try:
  proc=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,timeout=45,check=False)
  if proc.returncode==0 and len(proc.stdout)<1200:row=validate(json.loads(proc.stdout))
 except (OSError,ValueError,subprocess.SubprocessError):pass
 report={'audit':'ALICE_OLLAMA_PLANNER_SMOKE_RESULT','singleInferenceAttempt':True,
 'worldModified':False,'observation':row}
 fd=os.open(out/'alice_model_planner_smoke.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'))
 print(json.dumps({'state':row['status'] if row else 'unverified'}))
def selftest():
 compile(REMOTE,'<mint-ollama-smoke>','exec')
 assert "keep_alive':" in REMOTE and "'stream':False" in REMOTE
 assert 'querytarget' not in REMOTE
 print('ALICE_OLLAMA_PLANNER_SMOKE_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--smoke':run(Path(sys.argv[2]))
 else:raise SystemExit('usage --self-test | --smoke OUTPUT_DIR')
