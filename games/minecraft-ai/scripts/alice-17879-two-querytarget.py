#!/usr/bin/env python3
"""Two bounded, operator-approved MCSManager querytarget requests on existing 17879.

Never starts/stops BDS or Alice; never touches 17880; never enables --loop.
Requires verified exact MCSManager instance cwd, already-connected Alice,
and an exclusive private intent. Output has NO credentials or player identity.
"""
import json,os,shlex,subprocess,sys
from pathlib import Path
REMOTE=r"""
import json,os,re,stat,subprocess,sys,time
from pathlib import Path
home=Path.home(); scripts=home/'minecraft-ai/scripts';root=home/'.alice-bedrock-control'
sys.path.insert(0,str(scripts))
import bds_position_witness as w
report={'audit':'ALICE_EXISTING_17879_TWO_QUERYTARGET','schemaVersion':1,
 'state':'preflight_refused','productionOnly':True,'labStarted':False,
 'bdsRestarted':False,'aliceRestarted':False,'loopServiceEnabled':False,
 'queriesAttempted':0,'queriesAccepted':0,'reason':'none',
 'beforeIndependentSamples':None,'afterIndependentSamples':None,
 'afterWitnessStatus':'unavailable','afterPositionTrust':'unavailable'}
def status():
 p=subprocess.run(['/usr/bin/python3',str(scripts/'alice-mint.py'),'status'],
     capture_output=True,text=True,timeout=12,check=False)
 return json.loads(p.stdout) if p.returncode==0 and len(p.stdout)<22000 else {}
try:
 cfg,key=w.validated_config()
 # A verified instance definition must match the exact production BDS cwd.
 f=Path('/opt/mcsmanager/daemon/data/InstanceConfig')/(cfg['instanceId']+'.json')
 if not f.is_file() or f.is_symlink() or f.stat().st_size>65536:raise ValueError('instance_config_unavailable')
 content=json.loads(f.read_text(encoding='utf-8'))
 def findcwd(d):
  if not isinstance(d,dict):return None
  for k in ('cwd','workingDirectory','workingDir'):
   if isinstance(d.get(k),str):return d[k]
  return findcwd(d.get('config'))
 cwd=findcwd(content)
 if not cwd or Path(cwd).resolve(strict=True)!=home/'minecraft-bedrock':
  raise ValueError('instance_not_production')
 s=status()
 if not (s.get('processAlive') is True and
         s.get('reportedConnected') is True and
         s.get('sessionEstablished') is True):
  raise ValueError('alice_not_currently_connected')
 # The client must be in actual production 17879 world, not a lab.
 if s.get('serverPort') not in (None,17879) or s.get('world') not in (None,'Bedrock level'):
  raise ValueError('wrong_runtime_world')
 old=s.get('bdsSamples')
 if type(old) is int and 0<=old<100000000:report['beforeIndependentSamples']=old
 owner=root/'alice-17879-two-querytarget-20261031.intent'
 fd=os.open(owner,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as o:
  o.write('one finite querytarget pair; do not repeat\n');o.flush();os.fsync(o.fileno())
 report['state']='attempted'
 for n in range(2):
  report['queriesAttempted']+=1
  proc=subprocess.run(['/usr/bin/python3',str(scripts/'bds_position_witness.py'),
                       '--once'],capture_output=True,text=True,timeout=32,check=False)
  if proc.returncode==0 and proc.stdout.strip()=='BDS querytarget witness: accepted new independent sample':
   report['queriesAccepted']+=1
  else:
   why=re.search(r'unavailable \(([A-Za-z0-9_]{3,85})\)',proc.stderr)
   reason=why.group(1) if why else 'query_result_unavailable'
   report['reason']=reason if re.fullmatch('[A-Za-z0-9_]{3,85}',reason) else 'query_result_unavailable'
   break
  if n==0:time.sleep(1.1)
 # Give the live observer a brief chance to consume both fresh samples.
 time.sleep(1.1)
 s=status()
 v=s.get('bdsSamples')
 if type(v) is int and 0<=v<100000000:report['afterIndependentSamples']=v
 x=s.get('bdsWitnessStatus')
 if x in ('accepted','stale_or_invalid_witness','duplicate_or_rejected','unavailable','disabled','not_configured'):
  report['afterWitnessStatus']=x
 m=s.get('positionTrust')
 if isinstance(m,str) and re.fullmatch('[a-z_]{3,48}',m):
  report['afterPositionTrust']=m
 report['state']='two_accepted' if report['queriesAccepted']==2 else (
                   'one_accepted' if report['queriesAccepted']==1 else 'none_accepted')
except FileExistsError:
 report['reason']='one_shot_already_claimed'
except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as e:
 code=str(e)
 allowed={'instance_config_unavailable','instance_not_production','alice_not_currently_connected',
          'wrong_runtime_world'}
 report['reason']=code if code in allowed else 'preflight_or_transport_unavailable'
print(json.dumps(report,separators=(',',':')))
"""
FIELDS={'audit','schemaVersion','state','productionOnly','labStarted','bdsRestarted',
'aliceRestarted','loopServiceEnabled','queriesAttempted','queriesAccepted','reason',
'beforeIndependentSamples','afterIndependentSamples','afterWitnessStatus','afterPositionTrust'}
def validate(r):
    if not isinstance(r,dict) or set(r)!=FIELDS:return None
    if r['audit']!='ALICE_EXISTING_17879_TWO_QUERYTARGET' or r['schemaVersion']!=1:return None
    if r['state'] not in ('preflight_refused','attempted','two_accepted','one_accepted','none_accepted'):return None
    if any(r[k] is not v for k,v in [('productionOnly',True),('labStarted',False),('bdsRestarted',False),('aliceRestarted',False),('loopServiceEnabled',False)]):return None
    if type(r['queriesAttempted']) is not int or type(r['queriesAccepted']) is not int or not 0<=r['queriesAccepted']<=r['queriesAttempted']<=2:return None
    if not isinstance(r['reason'],str) or len(r['reason'])>90 or not r['reason'].replace('_','').isalnum():return None
    for k in ('beforeIndependentSamples','afterIndependentSamples'):
        if r[k] is not None and (type(r[k]) is not int or not 0<=r[k]<100000000):return None
    if r['afterWitnessStatus'] not in ('unavailable','accepted','stale_or_invalid_witness','duplicate_or_rejected','disabled','not_configured'):return None
    if not isinstance(r['afterPositionTrust'],str) or len(r['afterPositionTrust'])>48:return None
    return r
def run(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('invalid_output')
    record=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
          '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',
          'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
          capture_output=True,text=True,timeout=120,check=False)
        if p.returncode==0 and len(p.stdout)<2200:record=validate(json.loads(p.stdout))
    except (OSError,ValueError,subprocess.SubprocessError):pass
    result={'audit':'ALICE_EXISTING_WORLD_WITNESS_PROBE_RESULT','schemaVersion':1,
      'originalServerOnly':True,'restartersInvoked':False,'querytargetMayHaveBeenSent':True,
      'observation':record}
    fd=os.open(out/'alice_17879_two_query.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|
       getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':record['state'] if record else 'unverified'},separators=(',',':')))
def selftest():
    a={'audit':'ALICE_EXISTING_17879_TWO_QUERYTARGET','schemaVersion':1,
      'state':'two_accepted','productionOnly':True,'labStarted':False,
      'bdsRestarted':False,'aliceRestarted':False,'loopServiceEnabled':False,
      'queriesAttempted':2,'queriesAccepted':2,'reason':'none',
      'beforeIndependentSamples':0,'afterIndependentSamples':2,
      'afterWitnessStatus':'accepted','afterPositionTrust':'unavailable'}
    assert validate(a)==a
    assert validate({**a,'queriesAccepted':3}) is None
    assert "owner=root/'alice-17879-two-querytarget-20261031.intent'" in REMOTE
    assert "'--loop'" not in REMOTE
    print('ALICE_17879_TWO_QUERY_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--run':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --run OUTPUT_DIR')
