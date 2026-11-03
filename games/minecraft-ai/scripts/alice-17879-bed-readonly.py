#!/usr/bin/env python3
"""Read only owner-verified current 17879 bed/night/witness state; no queries."""
import inspect,json,os,re,shlex,subprocess,sys
from pathlib import Path
def summarize_bed_log(text):
    markers={
      '[Alice bed] explicit witnessed bed task:':'bed_admission',
      '[Alice exploration] doorway approach outcome:':'door_approach',
      '[Alice exploration] doorway approach gated:':'door_approach_gate',
      '[Alice exploration] door interaction outcome:':'door_interaction',
      '[Alice exploration] door interaction gated:':'door_interaction_gate',
      '[Alice exploration] doorway passage outcome:':'door_passage',
      '[Alice exploration] door first-cell BDS endpoint:':'door_endpoint',
      '[Alice exploration] independent BDS door endpoint:':'passage_endpoint',
      '[Alice home] independent bed-step endpoint:':'bed_endpoint',
      '[Alice Bedrock] verified job result:':'job_result'}
    events=[]
    for line in text[-120000:].splitlines():
        line=re.sub(r'^\[[0-9T:.+\-]+ PID=[0-9]+\] ', '', line)
        for marker,kind in markers.items():
            if not line.startswith(marker):continue
            try: value=json.JSONDecoder().raw_decode(line.split(marker,1)[1].strip())[0]
            except (ValueError,TypeError):break
            if not isinstance(value,dict):break
            reason=value.get('reason')
            if isinstance(reason,str):reason=reason.split(':',1)[0]
            reason=reason if isinstance(reason,str) and re.fullmatch('[A-Za-z0-9_]{1,110}',reason) else None
            event={'kind':kind,'reason':reason}
            for key in ('attempted','serverMovementVerified','ok'):
                if type(value.get(key)) is bool:event[key]=value[key]
            if type(value.get('steps')) is int and 0<=value['steps']<=24:event['steps']=value['steps']
            events.append(event)
            break
    return events[-12:]
REMOTE=r"""
import json,os,re,subprocess,time
from pathlib import Path
root=Path.home()/'.alice-bedrock-control'
status_tool=Path.home()/'minecraft-ai/scripts/alice-mint.py'
out={'state':'unverified','connected':False,'health':None,
 'phase':'unknown','canSleep':None,'rememberedBeds':None,
 'bedLogicVersion':None,'producerPid':None,'isSleeping':None,'personalBedStatus':'unknown',
 'sleepOpportunity':'unknown','lastBedFailure':'unknown',
 'nightSurvival':'unknown','idleGate':'unknown',
 'hasFollowTarget':False,'jobActive':False,'bedLogRead':False,'bedEvents':[],
 'interactionStatus':None}
try:
 p=subprocess.run(['/usr/bin/python3',str(status_tool),'status'],capture_output=True,text=True,timeout=12,check=False)
 if p.returncode!=0 or len(p.stdout)>20000:raise ValueError('status')
 t=json.loads(p.stdout)
 f=root/'status.json'
 if f.is_symlink() or not f.is_file() or f.stat().st_uid!=os.getuid() or f.stat().st_mode&0o077 or f.stat().st_size>8192:raise ValueError('status_file')
 d=json.loads(f.read_text())
 if (t.get('statusSource')!='current_process' or t.get('heartbeatFresh') is not True or
     d.get('producerPid')!=t.get('pid') or not 0<=time.time()-f.stat().st_mtime<=10 or
     d.get('world')!='Bedrock level' or d.get('serverPort')!=17879):raise ValueError('owner')
 w=d.get('worldRoutine') or {}
 out['state']='observed'
 out['producerPid']=t['pid']
 if type(w.get('bedLogicVersion')) is int:out['bedLogicVersion']=w['bedLogicVersion']
 if type(d.get('isSleeping')) is bool:out['isSleeping']=d['isSleeping']
 personal=(w.get('homeBed') or {}).get('status')
 if isinstance(personal,str) and re.fullmatch('[a-z_]{1,60}',personal):out['personalBedStatus']=personal
 out['connected']=d.get('connected') is True and d.get('sessionEstablished') is True
 x=d.get('health')
 if type(x) in (float,int) and 0<=x<=20:out['health']=round(x,1)
 if w.get('phase') in ('day','dusk','night','dawn','unknown'):out['phase']=w['phase']
 if type(w.get('canSleep')) is bool:out['canSleep']=w['canSleep']
 n=(w.get('rememberedBeds') or {}).get('knownBeds')
 if type(n) is int and 0<=n<=32:out['rememberedBeds']=n
 for key,field in [('sleepOpportunity','sleepOpportunity'),('lastBedFailure','lastBedFailure'),
                   ('nightSurvival','nightSurvival')]:
  a=w.get(field)
  if isinstance(a,dict):
   v=a.get('status') or a.get('reason')
   if isinstance(v,str) and re.fullmatch('[A-Za-z0-9_]{1,75}',v):out[key]=v
  elif a is None:out[key]='none'
 a=w.get('idleGate')
 if isinstance(a,str) and re.fullmatch('[A-Za-z0-9_]{1,75}',a):out['idleGate']=a
 out['hasFollowTarget']=bool(d.get('followTarget'))
 out['jobActive']=bool(d.get('job'))
 audit=d.get('interactionStatus')
 if isinstance(audit,dict) and audit.get('version')==1:out['interactionStatus']=audit
 location=(Path('/proc')/str(t['pid'])/'fd/1').resolve(strict=True)
 if (location.parent!=root or not location.name.startswith('operator-') or
     not location.is_file() or location.stat().st_uid!=os.getuid() or
     location.stat().st_mode&0o077):raise ValueError('unsafe_log')
 with open(location,'rb') as stream:
  stream.seek(0,2);size=stream.tell();stream.seek(max(0,size-120000))
  out['bedEvents']=summarize_bed_log(stream.read(120000).decode('utf-8','replace'))
  out['bedLogRead']=True
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):pass
print(json.dumps(out,separators=(',',':')))
"""
REMOTE=inspect.getsource(summarize_bed_log)+'\n'+REMOTE
def validate(x):
    keys={'interactionStatus','bedLogRead','bedEvents','bedLogicVersion','producerPid','isSleeping','personalBedStatus','state','connected','health','phase','canSleep','rememberedBeds','sleepOpportunity','lastBedFailure','nightSurvival','idleGate','hasFollowTarget','jobActive'}
    if not isinstance(x,dict) or set(x)!=keys or x['state'] not in ('observed','unverified'):return None
    if type(x['bedLogRead']) is not bool or not isinstance(x['bedEvents'],list) or len(x['bedEvents'])>12:return None
    a=x['interactionStatus']
    if a is not None:
        if not isinstance(a,dict) or set(a)!={'version','queueOnlyNotNetworkProof','serverPolicy','permissions','sneaking','usingItem','blockClicksSerialized','blockClickErrors','lastClick'}:return None
        if a['version']!=1 or a['queueOnlyNotNetworkProof'] is not True:return None
        p=a['permissions']
        if not isinstance(p,dict) or set(p)!={'source','role','doorsAndSwitches','openContainers'}:return None
        if p['source'] not in ('unobserved','start_game_self','self_update_abilities') or p['role'] not in ('unknown','visitor','member','operator','custom'):return None
        s=a['serverPolicy']
        if not isinstance(s,dict) or set(s)!={'blockNetworkIdsHashed','authoritativeInventory'} or any(v is not None and type(v) is not bool for v in s.values()):return None
        if any(v is not None and type(v) is not bool for v in (p['doorsAndSwitches'],p['openContainers'],a['sneaking'],a['usingItem'])):return None
        if any(type(a[k]) is not int or not 0<=a[k]<=1000000 for k in ('blockClicksSerialized','blockClickErrors')):return None
        q=a['lastClick']
        if q is not None:
            if not isinstance(q,dict) or set(q)!={'face','blockRuntimeId','localBlockStateId','registryStateNetworkId','hotbarMatchesLocal','heldEmpty','hasStackId','eyePositionMatchesLocal'}:return None
            if q['face'] is not None and (type(q['face']) is not int or not 0<=q['face']<=5):return None
            ids={'blockRuntimeId','localBlockStateId','registryStateNetworkId'}
            if any(v is not None and (type(v) is not int or not 0<=v<=4294967295) for k,v in q.items() if k in ids):return None
            if any(v is not None and type(v) is not bool for k,v in q.items() if k not in ids|{'face'}):return None
    for event in x['bedEvents']:
        if not isinstance(event,dict) or set(event)-{'kind','reason','attempted','serverMovementVerified','ok','steps'}:return None
        if event.get('kind') not in ('bed_admission','door_approach','door_approach_gate','door_interaction','door_interaction_gate','door_passage','door_endpoint','passage_endpoint','bed_endpoint','job_result'):return None
        if event.get('reason') is not None and not re.fullmatch('[A-Za-z0-9_]{1,110}',event['reason']):return None
        for field in ('attempted','serverMovementVerified','ok'):
            if field in event and type(event[field]) is not bool:return None
        if 'steps' in event and (type(event['steps']) is not int or not 0<=event['steps']<=24):return None
    return x
def run(out):
    d=Path(out)
    if d.is_symlink() or not d.is_dir():raise ValueError('out')
    obs=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=32,check=False)
        if p.returncode==0 and len(p.stdout)<=6000:obs=validate(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    data={'audit':'ALICE_EXISTING17879_SLEEP_READONLY','schemaVersion':1,'readOnly':True,'worldModified':False,'querytargetSent':False,'observation':obs}
    fd=os.open(d/'alice_current_sleep.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(data,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':obs['state'] if obs else 'unavailable'}))
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        compile(REMOTE,'<bed-log-readonly>','exec')
        print('ALICE_SLEEP_READONLY_SELFTEST_PASS')
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
