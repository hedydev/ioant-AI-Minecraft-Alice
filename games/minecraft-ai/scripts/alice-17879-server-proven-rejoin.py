#!/usr/bin/env python3
"""One verified original-world Alice login after an independent no-player BDS reply."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

REMOTE = r'''
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
sys.path.insert(0,str(Path.home()/'minecraft-ai/scripts'))
from alice_operator.process import AliceProcess
from alice_operator.config import load_environment, private_path, private_json
from alice_operator.diagnostics import alice_processes
import bds_position_witness as w
module=Path.home()/'minecraft-ai/scripts/alice-bds-demand-timer.py'
spec=importlib.util.spec_from_file_location('alice_demand_rejoin',module)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
LIFETIME=45000
PROOF='bds-session-rejoin-absence.json'
def base(operation):
    return {'schemaVersion':1,'operationId':operation,'state':'blocked',
        'reason':'preflight_not_completed','oldPid':None,'newPid':None,
        'querySent':False,'absenceVerified':False,'startAttempted':False,
        'startCount':0,'budgetUsed':None,'processAlive':False,
        'heartbeatFresh':False,'connected':False,'sessionEstablished':False,
        'bdsRestarted':False,'worldChanged':False}
def safe_local_owner(app):
    if app.owner() is not None or alice_processes(app):
        raise ValueError('alice_process_already_running')
def udp_socket_inode():
    matches=[]
    for filename in ('/proc/net/udp','/proc/net/udp6'):
        for line in Path(filename).read_text().splitlines()[1:]:
            cols=line.strip().split()
            if len(cols)>9 and cols[1].split(':')[-1].upper()=='45D7':
                inode=cols[9]
                if not inode.isdigit() or int(inode)<=0:
                    raise ValueError('invalid_socket_inode')
                matches.append(inode)
    if len(matches)!=1:
        raise ValueError('original_port_socket_unverified')
    return matches[0]
def latest_status(app,pid):
    owner=app.owner()
    if owner is None or owner['pid']!=pid:return None
    _,token,_=app.inspect(owner)
    file=app.root/'status.json'
    data=private_json(file,limit=8192)
    if data.get('producerPid')!=pid or data.get('producerStartToken')!=token or (
        not 0<=time.time()-file.stat().st_mtime<=12
    ) or data.get('serverPort')!=17879 or data.get('world')!='Bedrock level':
        return None
    return data
def verify_instance(env):
    m.private_root()
    m.binding_ok()
    cfg,key=w.validated_config()
    logfile=Path(env['ALICE_BEDROCK_BDS_SESSION_LOG'])
    if (cfg['gamertag']!=env['ALICE_BEDROCK_BDS_GAMERTAG'] or
        logfile.parent!=Path('/opt/mcsmanager/daemon/data/InstanceLog') or
        logfile.name!=cfg['instanceId']+'.log' or
        logfile.is_symlink() or not logfile.is_file()):
        raise ValueError('original_instance_binding_mismatch')
    return cfg,key,logfile
def run(operation):
    result=base(operation)
    app=AliceProcess()
    root=app.root/'mcp-client-lifecycle'
    try:
        private_path(app.root,directory=True)
        root.mkdir(mode=0o700,exist_ok=True)
        private_path(root,directory=True)
        lfd=os.open(root/'lifecycle.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
        try:
            private_path(root/'lifecycle.lock')
            try:fcntl.flock(lfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:
                result['reason']='lifecycle_busy';return result
            claim=root/(operation+'.json')
            if claim.exists() or claim.is_symlink():
                previous=private_json(claim,limit=8192)
                if previous.get('operationId')!=operation:raise ValueError('claim_conflict')
                return previous
            safe_local_owner(app)
            env=load_environment(app.root)
            app.check(env)
            cfg,key,logfile=verify_instance(env)
            # This recovery is ONLY for the explicitly proven missing-history
            # case. A known connected/spawned session always blocks it.
            import subprocess as sp
            check=sp.run([str(app.node),'src/main.cjs','--production-check'],
                 cwd=app.project,env=env,capture_output=True,timeout=28,check=False)
            if check.returncode==0:
                result['reason']='normal_login_gate_already_released'
                return result
            if b'BDS session history has no verified prior Alice disconnect' not in check.stderr:
                result['reason']='other_bds_login_gate_failed'
                return result
            # Claim is persisted BEFORE any BDS console query or client spawn.
            initial=dict(result,state='inconclusive',reason='claimed_action_requires_review')
            fd=os.open(claim,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,'w') as out:
                json.dump(initial,out);out.flush();os.fsync(out.fileno())
            wfd=os.open(m.LOCK,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
            try:
                st=os.fstat(wfd)
                if st.st_uid!=os.getuid() or st.st_mode&0o077:
                    result['reason']='unsafe_query_lock'
                    return finish(root,claim,operation,result)
                try:fcntl.flock(wfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
                except BlockingIOError:
                    result['reason']='query_busy'
                    return finish(root,claim,operation,result)
                now=time.time()
                budget=m.budget_value(now,m.private_read(m.BUDGET,512)) if (
                  m.BUDGET.exists() or m.BUDGET.is_symlink()) else m.budget_value(now)
                result['budgetUsed']=budget['used']
                if now-budget['lastBatch']<m.SUSTAINED_BATCH_SECONDS or budget['used']>=m.MAX_HOURLY:
                    result['reason']='cooldown_or_budget'
                    return finish(root,claim,operation,result)
                safe_local_owner(app)
                socket=udp_socket_inode()
                budget['lastBatch']=now
                if not m.consume_budget(now,budget):
                    result['reason']='query_budget_exhausted'
                    return finish(root,claim,operation,result)
                result['budgetUsed']=budget['used']
                result['querySent']=True
                try:
                    w.probe_once(cfg,key,local_log_factory=w.capture_local_log)
                    result['reason']='alice_already_online_on_bds'
                    return finish(root,claim,operation,result)
                except ValueError as e:
                    if str(e)!='querytarget_no_matching_player_reported':
                        result['reason']='server_presence_unverified'
                        return finish(root,claim,operation,result)
                except (OSError,Exception):
                    result['reason']='server_presence_unverified'
                    return finish(root,claim,operation,result)
                result['absenceVerified']=True
                safe_local_owner(app)
                # Bind a 45-second no-match proof to the exact original BDS
                # daemon log inode and active 17879 UDP socket.
                if socket!=udp_socket_inode():
                    result['reason']='bds_socket_changed_after_query'
                    return finish(root,claim,operation,result)
                st=logfile.stat()
                at=int(time.time()*1000)
                proof={'version':1,'source':'bds_querytarget_no_matching_player',
                       'observedAt':at,'expiresAt':at+LIFETIME,
                       'instanceLogDev':st.st_dev,'instanceLogIno':st.st_ino,
                       'instanceId':cfg['instanceId'],'port':17879,
                       'socketInode':socket}
                marker=app.root/PROOF
                if marker.is_symlink():
                    result['reason']='unsafe_proof_file'
                    return finish(root,claim,operation,result)
                if marker.exists():marker.unlink()
                tmp=app.root/(PROOF+'.'+operation+'.tmp')
                tfd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
                with os.fdopen(tfd,'w') as out:
                    json.dump(proof,out);out.flush();os.fsync(out.fileno())
                os.replace(tmp,marker)
                try:
                    result['startAttempted']=True
                    result['startCount']=1
                    launched=app.launch(env,None)
                    pid=launched.get('newPid')
                    if launched.get('oldPid') is not None or type(pid) is not int or pid<=1:
                        result['reason']='unexpected_launch_receipt'
                        result['state']='inconclusive'
                    else:
                        result['newPid']=pid
                        result['state']='inconclusive'
                        result['reason']='login_not_yet_verified'
                        deadline=time.monotonic()+67
                        while time.monotonic()<deadline:
                            time.sleep(2)
                            status=latest_status(app,pid)
                            if status:
                                result['processAlive']=True
                                result['heartbeatFresh']=True
                                result['connected']=status.get('connected') is True
                                result['sessionEstablished']=status.get('sessionEstablished') is True
                                if result['connected'] and result['sessionEstablished']:
                                    result['state']='completed'
                                    result['reason']='none'
                                    break
                            elif app.owner() is None and not alice_processes(app):
                                result['state']='failed'
                                result['reason']='client_exited_before_login'
                                break
                except (OSError,ValueError,subprocess.SubprocessError):
                    result['state']='inconclusive'
                    result['reason']='launch_or_login_requires_review'
                finally:
                    try:
                        if marker.is_file() and not marker.is_symlink():
                            marker.unlink()
                    except OSError:pass
                return finish(root,claim,operation,result)
            finally:os.close(wfd)
        finally:os.close(lfd)
    except (OSError,ValueError,subprocess.SubprocessError,KeyError,TypeError):
        result['reason']='preflight_or_transport_unavailable'
        return result
def finish(root,claim,operation,result):
    tmp=root/(operation+'.result.tmp')
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as out:
        json.dump(result,out);out.flush();os.fsync(out.fileno())
    os.replace(tmp,claim)
    return result
operation=sys.argv[1]
print(json.dumps(run(operation),separators=(',',':')))
'''
FIELDS={'schemaVersion','operationId','state','reason','oldPid','newPid',
        'querySent','absenceVerified','startAttempted','startCount','budgetUsed',
        'processAlive','heartbeatFresh','connected','sessionEstablished',
        'bdsRestarted','worldChanged'}
def perform(output,operation):
    result=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
            '-o','ConnectTimeout=8','tedz@192.168.0.104',
            '/usr/bin/python3 -c '+shlex.quote(REMOTE)+' '+shlex.quote(operation)],
            capture_output=True,text=True,timeout=175)
        if p.returncode==0 and len(p.stdout)<=8192:
            v=json.loads(p.stdout)
            if (isinstance(v,dict) and set(v)==FIELDS and v['operationId']==operation
                and v['bdsRestarted'] is False and v['worldChanged'] is False
                and v['startCount'] in (0,1) and
                (not v['startAttempted'] or v['absenceVerified'])):
                result=v
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    if result is None:
        result={'state':'inconclusive','operationId':operation,
                'reason':'remote_receipt_unavailable','doNotRepeat':True}
    output=Path(output)
    if not output.is_dir() or output.is_symlink():raise ValueError('unsafe_output')
    fd=os.open(output/'alice_live_rejoin.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as out:json.dump(result,out)
    print(json.dumps(result))
def selftest():
    compile(REMOTE,'<approved-bds-rejoin>','exec')
    assert "w.probe_once(cfg,key" in REMOTE and "app.launch(env,None)" in REMOTE
    assert "m.consume_budget" in REMOTE and "socket!=udp_socket_inode()" in REMOTE
    assert "app.stop(" not in REMOTE and "os.unlink(logfile)" not in REMOTE
    assert "LIFETIME=45000" in REMOTE
    print('ALICE_SAFE_REJOIN_CONTRACT_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==4 and sys.argv[1]=='--start':perform(sys.argv[2],sys.argv[3])
    else:raise SystemExit('usage: --self-test | --start OUTPUT OPERATION_ID')
