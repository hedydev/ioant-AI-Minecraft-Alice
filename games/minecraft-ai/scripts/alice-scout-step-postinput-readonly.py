#!/usr/bin/env python3
"""Bounded current-life read-only scout endpoint diagnosis; no game actions."""
import json,os,shlex,subprocess,sys
from pathlib import Path

MARKERS={
 '[Alice exploration] one waypoint locally reached:':'local_step',
 '[Alice exploration] scout step awaits independent BDS:':'await_bds',
 '[Alice exploration] post-input scout step BDS witness:':'bds_endpoint',
 '[Alice exploration] delayed BDS scout step result:':'bds_settlement',
 '[Alice exploration] scout step witness expired:':'expired',
 '[Alice exploration] endpoint feedback:':'route_feedback',
 '[Alice movement] A* waypoint failure:':'path_failure',
}
REASONS={
 'scout_step_awaiting_new_bds_pair','scout_step_new_independent_pair_missing',
 'scout_step_new_independent_endpoint_confirmed','scout_step_bds_endpoint_unconfirmed',
 'scout_step_independent_owner_mismatch','scout_step_endpoint_position_unavailable',
 'scout_step_context_or_deadline_invalid','scout_step_context_or_deadline_changed',
 'scout_step_independent_timeout','scout_step_server_verified_full_route',
 'scout_step_server_verified_partial_route','scout_first_waypoint_not_adjacent',
 'scout_start_witness_context_invalid','scout_timeout','scout_conditions_changed',
 'scout_waypoint_not_reached','navigation_scout_client_server_position_diverged',
 'navigation_scout_bds_position_unavailable','pathfinder_no_path'
}
def extract(events,since,now):
 counts={name:0 for name in MARKERS.values()};latest=[];last_reasons={}
 if type(since)!=int or type(now)!=int or since<=0 or now<since:
  return dict(state='unverified_time_context',counts=counts,lastReasons={},recent=[])
 rows=[]
 for ev in events:
  if (not isinstance(ev,dict) or type(ev.get('at'))!=int or
      not since<=ev['at']<=now or ev.get('kind') not in MARKERS or
      not isinstance(ev.get('detail'),dict)):
   continue
  rows.append(ev)
 rows.sort(key=lambda item:item['at'])
 for ev in rows:
  k=MARKERS[ev['kind']];d=ev['detail'];counts[k]+=1
  reason=d.get('reason')
  reason=reason if isinstance(reason,str) and reason in REASONS else 'unknown'
  if reason!='unknown':last_reasons[k]=reason
  result={'kind':k,'ageSeconds':round((now-ev['at'])/1000,1),
          'reason':reason,
          'serverVerified':d.get('serverMovementVerified') is True}
  for field,limit in [('localEstimateBlocks',32),('serverMovedBlocks',32)]:
   v=d.get(field)
   if type(v) in (int,float) and 0<=v<=limit:result[field]=round(v,2)
  if k=='route_feedback':
   result['outcome']=d.get('outcome') if d.get('outcome') in ('confirmed','unverified','blocked','attempted') else 'unknown'
  latest.append(result)
 return dict(state='observed',counts=counts,lastReasons=last_reasons,recent=latest[-16:])

REMOTE=r"""
import json,os,subprocess,time
from pathlib import Path
def diagnostic():
 root=Path.home()/'.alice-bedrock-control'
 script=Path.home()/'minecraft-ai/scripts/alice-mint.py'
 status=subprocess.run(['/usr/bin/python3',str(script),'status'],capture_output=True,text=True,timeout=12,check=False)
 if status.returncode!=0 or len(status.stdout)>20000:raise ValueError('status_unavailable')
 s=json.loads(status.stdout)
 pid=s.get('pid')
 if type(pid)!=int or s.get('statusSource')!='current_process' or s.get('heartbeatFresh') is not True:raise ValueError('invalid_owner')
 file=root/'status.json'
 st=file.lstat()
 if not st.is_file() or file.is_symlink() or st.st_uid!=os.getuid() or (st.st_mode&0o077) or st.st_size>8192:raise ValueError('unsafe_status')
 d=json.loads(file.read_text())
 if d.get('producerPid')!=pid or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879 or d.get('sessionEstablished') is not True:raise ValueError('owner_or_world_unverified')
 mv=d.get('movementEvidence') or {}
 times=[s.get('processStartAtUnixMs'),mv.get('loginAt'),mv.get('lifeEpochAt')]
 if type(times[0])!=int:raise ValueError('process_epoch_unverified')
 since=max(t for t in times if type(t)==int)
 now=int(time.time()*1000)
 home=root/'acceptance'
 st=home.lstat()
 if not st.is_dir() or home.is_symlink() or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('unsafe_journal_dir')
 records=[]
 for name in ('events.4.jsonl','events.3.jsonl','events.2.jsonl','events.1.jsonl','events.jsonl'):
  p=home/name
  if not p.exists():continue
  st=p.lstat()
  if not st.is_file() or p.is_symlink() or st.st_uid!=os.getuid() or (st.st_mode&0o077) or st.st_size>1048576:continue
  for line in p.read_text().splitlines():
   if len(line)>4096:continue
   try:records.append(json.loads(line))
   except (ValueError,TypeError):continue
 report=extract(records,since,now)
 world=d.get('worldRoutine') or {}
 scout=world.get('scouting') or {}
 def known(v):return v if isinstance(v,str) and v in REASONS else 'unknown'
 report.update(audit='ALICE_SCOUT_POSTINPUT_READONLY',schemaVersion=1,readOnly=True,
    bdsCommandSent=False,worldModified=False,aliceRestarted=False,
    ownerPid=pid,sessionEstablished=True,heartbeatFresh=True,
    independentSamples=mv.get('independentSamples'),
    currentScoutReason=known(scout.get('reason')),
    currentScoutVerified=scout.get('confirmed') is True,
    bdsLastSampleAgeSeconds=round((now-mv['independentAt'])/1000,1) if type(mv.get('independentAt'))==int and now>=mv['independentAt'] else None,
    eventCount=len(records))
 return report
try:out=diagnostic()
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
 out=dict(audit='ALICE_SCOUT_POSTINPUT_READONLY',schemaVersion=1,readOnly=True,
          bdsCommandSent=False,worldModified=False,aliceRestarted=False,state='unavailable')
print(json.dumps(out,separators=(',',':')))
"""
def run(output):
 out=Path(output)
 if not out.is_dir() or out.is_symlink():raise ValueError('unsafe_output')
 remote=extract.__code__
 # Pure parser is inserted before the statically audited read-only command.
 import inspect
 source='MARKERS='+repr(MARKERS)+'\nREASONS='+repr(REASONS)+'\n'+inspect.getsource(extract)+'\n'+REMOTE
 process=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
   '-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',
   'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(source)],
   capture_output=True,text=True,timeout=55,check=False)
 if process.returncode or len(process.stdout)>7000:
  errors=('SyntaxError','NameError','ImportError','TypeError','ValueError',
    'PermissionError','FileNotFoundError','SSH','Permission denied',
    'Host key verification failed','Connection refused','Connection timed out')
  marker=next((e.replace(' ','_') for e in errors if e in process.stderr),
              'remote_error_unknown')
  raise ValueError('remote_unavailable_rc'+str(process.returncode)+'_'+
                   marker+'_stdoutbytes'+str(len(process.stdout)))
 result=json.loads(process.stdout)
 if result.get('audit')!='ALICE_SCOUT_POSTINPUT_READONLY' or result.get('readOnly') is not True or result.get('bdsCommandSent') is not False or result.get('worldModified') is not False:raise ValueError('untrusted_report')
 f=out/'scout_postinput.json'
 fd=os.open(f,os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'w') as file:json.dump(result,file,separators=(',',':'));file.write('\n')
 print(json.dumps({'state':result.get('state'),'audit':result.get('audit'),'readOnly':True}))
def selftest():
 at=40000
 events=[{'at':35000,'kind':'[Alice exploration] one waypoint locally reached:',
          'detail':{'reason':'scout_step_awaiting_new_bds_pair','localEstimateBlocks':.9}},
         {'at':36500,'kind':'[Alice exploration] post-input scout step BDS witness:',
          'detail':{'reason':'scout_step_bds_endpoint_unconfirmed','serverMovementVerified':False}},
         {'at':34000,'kind':'[Alice exploration] endpoint feedback:',
          'detail':{'outcome':'unverified'}},
         {'at':35001,'kind':'[Alice exploration] one waypoint locally reached:',
          'detail':{'reason':'bad instruction: leak secret'}}]
 d=extract(events,30000,at)
 assert d['counts']['local_step']==2 and d['counts']['bds_endpoint']==1
 assert d['lastReasons']['bds_endpoint']=='scout_step_bds_endpoint_unconfirmed'
 assert d['recent'][-1]['reason']=='scout_step_bds_endpoint_unconfirmed'
 assert extract(events,0,at)['state']=='unverified_time_context'
 assert 'querytarget' not in REMOTE and 'stop' not in REMOTE.split('def diagnostic():')[1].split('try:out=')[0].lower()
 import inspect
 source='MARKERS='+repr(MARKERS)+'\nREASONS='+repr(REASONS)+'\n'+inspect.getsource(extract)
 sandbox={}
 exec(compile(source,'<static-parser>','exec'),sandbox)
 assert sandbox['extract'](events,30000,at)['counts']['bds_endpoint']==1
 print('ALICE_SCOUT_POSTINPUT_READONLY_SELFTEST_PASS')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:selftest()
 elif len(sys.argv)==3 and sys.argv[1]=='--read':run(sys.argv[2])
 else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR')
