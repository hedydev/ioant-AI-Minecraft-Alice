"""One owner-authorized stable witness activation on the original BDS only.

No sudo, kill, retries, Beta/cheat settings, gameplay commands or budget writes.
Stop/open use the official authenticated MCSManager instance API. An atomic
durable claim precedes mutations; re-entry only reads the existing receipt.
"""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

PACK='37ac86b0-11b0-4505-b15d-989d7ff5b10b'
VERSION=[0,1,0]
OPERATION='alice_movement_20261120_stable_activate_013'

def has_stable_pair(raw,now_ms):
    m=raw.get('movementEvidence') or {}
    return (m.get('independentSource')=='bds_stable_actionbar' and m.get('independentSamples',0)>=2
        and 0<=now_ms-m.get('independentAt',0)<=4000
        and type(m.get('independentPreviousAt')) is int
        and 0<m['independentAt']-m['independentPreviousAt']<=4000
        and (raw.get('settings') or {}).get('autonomyEnabled') is False and raw.get('job') is None)

def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj)
    return obj

def atomic(path, data):
    if path.is_symlink():raise ValueError('unsafe_destination')
    fd,tmp=tempfile.mkstemp(prefix='.stable-',dir=path.parent)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'w') as f:
            json.dump(data,f,separators=(',',':'));f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def pong():
    magic=bytes.fromhex('00ffff00fefefefefdfdfdfd12345678')
    with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
        s.settimeout(2);s.connect(('127.0.0.1',17879))
        s.send(b'\x01'+struct.pack('>q',int(time.time()*1000))+magic+struct.pack('>q',1))
        b=s.recv(2048)
    if len(b)<35 or b[0]!=28 or b[17:33]!=magic:raise ValueError('invalid_pong')
    f=b[35:35+struct.unpack('>H',b[33:35])[0]].decode().split(';')
    if f[0]!='MCPE' or f[2]!='2193' or f[3]!='1.26.52':raise ValueError('unverified_engine_version')
    return f[3]

def instance_detail(cfg,key):
    from bds_position_witness import NoRedirect
    q=urllib.parse.urlencode({'uuid':cfg['instanceId'],'daemonId':cfg['daemonId'],'apikey':key})
    url=cfg['baseUrl'].rstrip('/')+'/api/instance?'+q
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    with opener.open(urllib.request.Request(url,headers={'X-Requested-With':'XMLHttpRequest'}),timeout=4) as r:
        data=json.loads(r.read(70000))
    if data.get('status')!=200:raise ValueError('instance_detail_rejected')
    d=data.get('data')
    if not isinstance(d,dict) or d.get('instanceUuid')!=cfg['instanceId']:raise ValueError('instance_identity_mismatch')
    return d

def proc_birth(pid):
    p=Path('/proc')/str(pid)
    try:
        f=(p/'stat').read_text().rsplit(')',1)[1].split()
        if f[0]=='Z':return None
        return f[19]
    except FileNotFoundError:return None

def descendants_of(pid):
    result=[]
    for p in Path('/proc').iterdir():
        if not p.name.isdigit():continue
        try:
            if (p/'comm').read_text().strip()!='bedrock_server':continue
            current=int(p.name);seen=set()
            for _ in range(12):
                if current==pid:result.append(int(p.name));break
                if current<=1 or current in seen:break
                seen.add(current)
                current=int((Path('/proc')/str(current)/'stat').read_text().rsplit(')',1)[1].split()[1])
        except (OSError,ValueError):continue
    return result

class Activation:
    def __init__(self,home=None):
        from alice_operator.process import AliceProcess
        from bds_position_witness import validated_config
        self.home=Path(home or Path.home());self.scripts=self.home/'minecraft-ai/scripts'
        self.root=self.home/'minecraft-bedrock';self.world=self.root/'worlds/Bedrock level'
        self.app=AliceProcess(self.home);self.cfg,self.key=validated_config()
        self.mint=module('stable_mint_status',self.scripts/'alice-mint.py')
        self.gated=module('stable_gated_checks',self.scripts/'alice-17879-client-restart-gated.py')
        self.control=module('stable_control',self.home/'minecraft-ai/dashboard/remote_control.py')
        self.backup=module('stable_backup',self.scripts/'backup-world.py')
        self.verify=module('stable_backup_verify',self.scripts/'verify-world-backup.py')
        self.pack=self.home/'minecraft-ai/bds-stable-witness-pack'
        self.installed=self.root/'behavior_packs/alice-stable-bds-witness'
        self.optin=self.app.root/'bds-stable-actionbar-enabled.json'
        self.registration=self.world/'world_behavior_packs.json'
        self.receipt={'operationId':OPERATION,'state':'preflight','phase':'preflight',
            'bdsStopSent':False,'bdsOpenSent':False,'aliceStopped':False,
            'backupVerified':False,'packInstalled':False,'worldRegistrationWritten':False,
            'clientStartSent':False,'clientStarted':False,'freshStablePair':False,'autonomyRestored':False,
            'betaChanged':False,'cheatsChanged':False,'queryBudgetChanged':False}

    def detail(self):return instance_detail(self.cfg,self.key)

    def recovery_status(self):
        from alice_operator.config import private_json
        claim=self.app.root/(OPERATION+'.json');saved=private_json(claim)
        d=self.detail();self.binding(d)
        pid=(d.get('processInfo') or {}).get('pid')
        children=descendants_of(pid) if type(pid) is int else []
        running=False
        if d.get('status')==3 and len(children)==1:
            try:running=pong()=='1.26.52'
            except (OSError,ValueError):pass
        result={'receipt':safe_report(saved),'bdsRunningVerified':running,
            'currentBdsPid':children[0] if len(children)==1 else None,
            'aliceOwnerPresent':self.app.owner() is not None}
        owner=self.app.owner()
        if owner:
            from alice_operator.diagnostics import current_log,recent_lifecycle
            raw=json.loads((self.app.root/'status.json').read_text())
            st=(self.app.root/'status.json').stat()
            result['client']={'pid':owner['pid'],'heartbeatAgeSeconds':round(time.time()-st.st_mtime,1),
                'connected':raw.get('connected') is True,'sessionEstablished':raw.get('sessionEstablished') is True,
                'state':raw.get('state') if raw.get('state') in ('IDLE','FOLLOW','WORK','FIGHT') else 'other',
                'autonomyEnabled':(raw.get('settings') or {}).get('autonomyEnabled'),
                'health':raw.get('health'),'sessionExitKind':(raw.get('sessionExit') or {}).get('kind')}
            log=current_log(self.app,owner)
            if log:
                p=Path(log)
                with p.open('rb') as f:f.seek(max(0,p.stat().st_size-65536));text=f.read(65536).decode('utf-8','replace')
                patterns=('spawn confirmed','server_disconnect','session_closed','connection ended:',
                    'TypeError:','ReferenceError:','ECONNREFUSED','ETIMEDOUT','AuthenticationError',
                    'device code','microsoft.com/link','RequestNetworkSettings','start_game','play_status',
                    'login_success','logged in','resource_pack','network_settings','handshake')
                result['clientLogFacts']={k:text.lower().count(k.lower()) for k in patterns}
                result['exceptionTypes']=sorted(set(re.findall(r'\b([A-Za-z]+Error):',text)))[:10]
                result['sourceFrames']=sorted(set(re.findall(r'(?:src/[a-z_/]+\.cjs:[0-9]+:[0-9]+)',text)))[:12]
                result['lifecycle']=recent_lifecycle([{'path':str(p)}],max_events=6)
        # Inspect only public decoder metadata in the installed Node24 package.
        js="const d=require('minecraft-data')('bedrock_1.26.50');const t=d.protocol.types;console.log(JSON.stringify(Object.fromEntries(Object.entries(t).filter(([k])=>k.includes('set_title')))))"
        p=subprocess.run([str(self.app.node),'-e',js],cwd=self.app.project,capture_output=True,text=True,timeout=10)
        if p.returncode==0 and len(p.stdout)<12000:
            result['setTitleSchema']=json.loads(p.stdout)
        return result,saved

    def finish_recovery_settings(self):
        """After private owner authentication, restore only the saved preference."""
        from alice_operator.config import private_json
        self.claim=self.app.root/(OPERATION+'.json');self.receipt=private_json(self.claim)
        owner,_,_,_,raw=self.gated.read_live(self.app,self.mint.status)
        if (owner['pid']!=self.receipt.get('newAlicePid') or self.receipt.get('autonomyRestored')
            or self.receipt.get('packInstalled') or raw.get('job') is not None):
            raise ValueError('recovery_settings_not_admissible')
        current=self.control.config(self.app.root);original=self.receipt.get('originalSettings')
        if not isinstance(original,dict) or current['settings']!={**original['settings'],'autonomyEnabled':False}:
            raise ValueError('operator_settings_changed')
        if current['revision']!=original['revision']+int(original['settings']['autonomyEnabled']):
            raise ValueError('operator_revision_changed')
        self.save('recovery_settings_restore_intent')
        self.control.patch_settings({'autonomyEnabled':original['settings']['autonomyEnabled']},self.app.root)
        self.receipt.update(autonomyRestored=True,recovery='original_service_and_alice_restored_pack_not_installed')
        self.save('original_service_recovered_activation_incomplete')
        return safe_report(self.receipt)

    def resume_client_only(self):
        """Finish the existing failed transaction's client recovery, no BDS request."""
        from alice_operator.config import load_environment
        self.claim=self.app.root/(OPERATION+'.json')
        lock=self.app.root/'stable-witness-activation.lock'
        if lock.is_symlink():raise ValueError('unsafe_operation_lock')
        fd=os.open(lock,os.O_WRONLY|getattr(os,'O_NOFOLLOW',0))
        with os.fdopen(fd,'w') as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            status,saved=self.recovery_status();self.receipt=saved
            if (not status['bdsRunningVerified'] or status['currentBdsPid']==saved.get('oldBdsPid')
                or status['aliceOwnerPresent'] or saved.get('clientStartSent')
                or saved.get('packInstalled') or saved.get('worldRegistrationWritten')
                or not saved.get('aliceStopped') or not saved.get('bdsOpenSent')):
                raise ValueError('client_recovery_not_admissible')
            current=self.control.config(self.app.root)
            original=saved.get('originalSettings')
            if (not isinstance(original,dict) or current['settings']!={**original['settings'],'autonomyEnabled':False}):
                raise ValueError('operator_settings_changed')
            env=load_environment(self.app.root);self.app.check(env)
            self.receipt['clientStartSent']=True;self.save('recovery_client_start_intent')
            new=self.app.launch(env)
            self.receipt.update(clientStarted=True,newAlicePid=new['newPid']);self.save('recovery_client_started')
            def connected():
                try:
                    owner,_,_,_,raw=self.gated.read_live(self.app,self.mint.status)
                    return owner['pid']==new['newPid'] and raw.get('health',0)>0
                except (OSError,ValueError):return False
            self.wait(connected,50,'client_login_not_verified')
            if self.control.config(self.app.root)!=current:raise ValueError('operator_settings_changed')
            self.control.patch_settings({'autonomyEnabled':original['settings']['autonomyEnabled']},self.app.root)
            self.receipt.update(autonomyRestored=True,recovery='original_service_and_alice_restored_pack_not_installed')
            self.save('original_service_recovered_activation_incomplete')
            return safe_report(self.receipt)

    def binding(self,d):
        c=d.get('config') or {}
        if (c.get('processType')!='general' or c.get('stopCommand')!='stop'
            or Path(c.get('cwd','')).resolve()!=self.root.resolve()):raise ValueError('instance_binding_changed')
        if self.root.is_symlink() or self.world.is_symlink():raise ValueError('unsafe_world_path')
        props=self.backup.properties(self.root)
        if any(props.get(k)!=v for k,v in {'server-port':'17879','level-name':'Bedrock level',
             'online-mode':'true','allow-cheats':'false'}.items()):raise ValueError('world_properties_changed')
        from alice_bds_level_metadata import beta_api_experiment
        beta=beta_api_experiment(self.world/'level.dat')
        if beta not in ('not_declared_in_level_dat','disabled_in_level_dat'):raise ValueError('beta_state_unverified')
        return beta

    def inspect(self):
        d=self.detail();beta=self.binding(d)
        pid=(d.get('processInfo') or {}).get('pid')
        if d.get('status')!=3 or type(pid) is not int or pid<=1:raise ValueError('instance_not_running')
        children=descendants_of(pid)
        if len(children)!=1:raise ValueError('bds_process_ancestry_unverified')
        # The existing backup helper is deliberately fail-closed on ANY unreadable
        # game process. Prove before stopping that no unrelated root-owned Java/
        # BDS process would make the offline backup impossible.
        for p in Path('/proc').iterdir():
            if not p.name.isdigit() or int(p.name) in children:continue
            try:
                if (p/'comm').read_text().strip() not in ('java','bedrock_server'):continue
                (p/'cwd').resolve(strict=True)
            except FileNotFoundError:
                if p.exists():raise ValueError('other_game_process_backup_unverified')
            except OSError:raise ValueError('other_game_process_backup_unverified')
        version=pong()
        o,token,env,_,raw=self.gated.read_live(self.app,self.mint.status)
        self.gated.verify_safe_state(raw)
        wr=raw.get('worldRoutine') or {}
        if (raw.get('followTarget') or wr.get('bedRequest') or wr.get('bedWitness')
            or any(raw.get(k) for k in ('pendingScoutStep','pendingDoorAction','pendingPassageAction'))):
            raise ValueError('pending_action')
        if self.cfg['gamertag']!=env.get('ALICE_BEDROCK_BDS_GAMERTAG'):raise ValueError('player_identity_mismatch')
        for p in (self.installed,self.optin):
            if p.exists() or p.is_symlink():raise ValueError('activation_already_present')
        attachments=[]
        if self.registration.exists() or self.registration.is_symlink():
            if self.registration.is_symlink() or self.registration.stat().st_size>32768:raise ValueError('unsafe_registration')
            attachments=json.loads(self.registration.read_text())
            if not isinstance(attachments,list) or any(not isinstance(p,dict) or p.get('pack_id')==PACK for p in attachments):
                raise ValueError('invalid_registration')
        manifest=json.loads((self.pack/'manifest.json').read_text())
        if manifest.get('header',{}).get('uuid')!=PACK or manifest.get('dependencies')!=[
            {'module_name':'@minecraft/server','version':'2.10.0'}]:raise ValueError('pack_changed')
        source=(self.pack/'scripts/main.js').read_text()
        if source.count('"__OWNER_SELECTED_ALICE_GAMERTAG__"')!=1:raise ValueError('invalid_template')
        paths=self.backup.list_files([self.world],self.root)
        if not all(os.access(p,os.R_OK) for p,_ in paths):raise ValueError('world_backup_unreadable')
        size=sum(p.stat().st_size for p,_ in paths)
        if shutil.disk_usage(self.root).free<max(size*4,1024**3):raise ValueError('insufficient_backup_space')
        for p in (self.world,self.root/'behavior_packs'):
            if p.is_symlink() or not p.is_dir() or not os.access(p,os.W_OK):raise ValueError('installation_not_writable')
        return {'instanceVerified':True,'version':version,'protocol':2193,'beta':beta,
            'safeClient':True,'backupFilesReadable':True,'worldBytes':size,
            'bdsPid':children[0],'bdsBirth':proc_birth(children[0]),'managerPid':pid},(o,token,env,attachments,source)

    def save(self,phase):
        self.receipt['phase']=phase;self.receipt['updatedAt']=int(time.time())
        atomic(self.claim,self.receipt)

    def request(self,action):
        from bds_position_witness import api,is_confirmed_command_ack,ack_kind
        field={'stop':'bdsStopSent','open':'bdsOpenSent'}[action]
        if self.receipt[field]:raise ValueError('lifecycle_already_sent')
        self.receipt[field]=True;self.save(action+'_intent')
        # A documentation-shaped acknowledgment is not the lifecycle effect.
        # Even an unknown 200 response or a lost acknowledgment may have acted.
        # Never repeat; the caller MUST prove the target PID/state independently
        # before backup/installation or client login can follow.
        try:
            value=api(self.cfg,self.key,action)
            self.receipt[action+'AckKind']=ack_kind(value)
            self.receipt[action+'AckKnown']=is_confirmed_command_ack(value,self.cfg['instanceId'])
        except Exception:
            self.receipt[action+'AckKind']='transport_unverified'
            self.receipt[action+'AckKnown']=False
        self.save(action+'_awaiting_observed_effect')

    def wait(self,predicate,seconds,reason):
        until=time.monotonic()+seconds
        while True:
            if predicate():return
            if time.monotonic()>=until:raise ValueError(reason)
            time.sleep(1)

    def offline(self):
        d=self.detail();self.binding(d)
        if d.get('status')!=0:return False
        if proc_birth(self.old_bds)==self.old_birth:return False
        return self.backup.active_game_process(self.root) is None

    def start_original(self):
        self.request('open')
        def running():
            d=self.detail();self.binding(d)
            if d.get('status')!=3:return False
            pid=(d.get('processInfo') or {}).get('pid')
            if type(pid) is not int or len(descendants_of(pid))!=1:return False
            if descendants_of(pid)[0]==self.old_bds and proc_birth(self.old_bds)==self.old_birth:return False
            try:pong()
            except (OSError,ValueError):return False
            return True
        self.wait(running,45,'bds_start_not_verified');self.save('bds_running')

    def apply(self):
        from alice_operator.config import private_path
        private_path(self.app.root,directory=True)
        self.claim=self.app.root/(OPERATION+'.json')
        if self.claim.exists():
            private_path(self.claim);return json.loads(self.claim.read_text())
        lock=self.app.root/'stable-witness-activation.lock'
        if lock.is_symlink():raise ValueError('unsafe_operation_lock')
        fd=os.open(lock,os.O_WRONLY|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
        with os.fdopen(fd,'w') as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            if self.claim.exists():raise ValueError('operation_already_claimed')
            claimfd=os.open(self.claim,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.close(claimfd)
            try:self.perform()
            except Exception as e:
                # Never expose exception text (transport errors can contain API keys).
                self.receipt['state']='blocked';self.receipt['failureType']=type(e).__name__
                self.receipt['reason']=str(e) if type(e) is ValueError and re.fullmatch('[a-z_]{3,80}',str(e)) else 'operator_error'
                self.save('blocked_at_'+self.receipt['phase'])
                self.recover_service()
            return self.receipt

    def recover_service(self):
        """Restore availability with the ONE open, never replay uncertain work.

        Registration is published only after both complete pack files exist, so
        an earlier backup/install failure leaves either the old world registration
        or the complete specified pack. Autonomy stays paused on any failure.
        """
        if not self.receipt['aliceStopped']:return
        try:
            if self.receipt['bdsStopSent'] and not self.receipt['bdsOpenSent']:
                self.wait(self.offline,15,'recovery_offline_unverified')
                self.start_original()
            d=self.detail();self.binding(d)
            if d.get('status')!=3:raise ValueError('recovery_server_unverified')
            pong()
            if not self.receipt['clientStartSent'] and not self.app.owner():
                self.receipt['clientStartSent']=True;self.save('recovery_client_start_intent')
                new=self.app.launch(self.environment)
                self.receipt.update(clientStarted=True,newAlicePid=new['newPid'])
            self.receipt['recovery']='service_running_autonomy_held'
        except Exception:
            self.receipt['recovery']='unverified_no_lifecycle_retry'
        self.save('blocked_recovery_observed')

    def perform(self):
        facts,values=self.inspect();o,token,env,attachments,source=values
        self.environment=env
        self.old_bds=facts['bdsPid'];self.old_birth=facts['bdsBirth']
        self.receipt.update(oldBdsPid=self.old_bds,oldAlicePid=o['pid'],version=facts['version'])
        self.app.check(env)
        current,birth,_,_,raw=self.gated.read_live(self.app,self.mint.status)
        if current!=o or birth!=token:raise ValueError('alice_owner_changed')
        self.gated.verify_safe_state(raw)
        self.inspect() # full immediate recheck before stopping the original client
        self.original_settings=self.control.config(self.app.root)
        self.receipt['originalSettings']=self.original_settings
        self.save('alice_stop_intent');self.app.stop(o,token)
        self.receipt['aliceStopped']=True;self.save('alice_stopped')
        self.paused=self.control.patch_settings({'autonomyEnabled':False},self.app.root)
        # Bind again before the one authorized graceful BDS stop.
        d=self.detail();self.binding(d)
        if d.get('status')!=3 or descendants_of(d['processInfo']['pid'])!=[self.old_bds]:raise ValueError('bds_owner_changed')
        self.request('stop');self.wait(self.offline,35,'bds_shutdown_not_verified')
        self.save('offline_backup')
        archive=self.backup.write_backup(self.root,self.home/'minecraft-world-backups/bedrock-default','bedrock',[self.world])
        manifest=archive.with_suffix('').with_suffix('.json')
        verified=self.verify.verify(manifest,self.root)
        if verified.get('verified') is not True or verified.get('temporaryRestore') is not True:raise ValueError('backup_not_verified')
        self.receipt.update(backupVerified=True,backupManifest=str(manifest),backupSha256=verified['sha256'])
        self.save('backup_verified')
        if not self.offline():raise ValueError('server_started_during_backup')
        self.installed.mkdir(mode=0o700);(self.installed/'scripts').mkdir(mode=0o700)
        shutil.copyfile(self.pack/'manifest.json',self.installed/'manifest.json')
        rendered=source.replace('"__OWNER_SELECTED_ALICE_GAMERTAG__"',json.dumps(self.cfg['gamertag']))
        (self.installed/'scripts/main.js').write_text(rendered)
        os.chmod(self.installed/'scripts/main.js',0o600);os.chmod(self.installed/'manifest.json',0o600)
        self.receipt['packInstalled']=True;self.save('pack_installed')
        atomic(self.registration,attachments+[{'pack_id':PACK,'version':VERSION}])
        self.receipt['worldRegistrationWritten']=True;self.save('world_registered')
        atomic(self.optin,{'version':1,'enabled':True,'gamertag':self.cfg['gamertag'],'packUuid':PACK})
        self.start_original()
        # Original client lifecycle validates logout and world backup again; no
        # session absence/query budget bypass, auth cleanup or second login.
        self.receipt['clientStartSent']=True;self.save('alice_start_intent');new=self.app.launch(env)
        self.receipt.update(clientStarted=True,newAlicePid=new['newPid']);self.save('client_started_paused')
        stable_stamps=set()
        def pair():
            owner=self.app.owner()
            if not owner or owner['pid']!=new['newPid']:return False
            _,_,_,_,raw=self.gated.read_live(self.app,self.mint.status)
            if not has_stable_pair(raw,int(time.time()*1000)):return False
            stable_stamps.add(raw['movementEvidence']['independentAt'])
            # Two distinct heartbeat observations each naming the stable source;
            # a querytarget sample cannot stand in for either action-bar event.
            return len(stable_stamps)>=2
        # Startup/login is asynchronous; read_live is fail-closed while awaiting it.
        def ready_pair():
            try:return pair()
            except (OSError,ValueError):return False
        self.wait(ready_pair,55,'stable_pair_not_observed')
        self.receipt['freshStablePair']=True;self.save('fresh_pair_paused')
        if self.control.config(self.app.root)!=self.paused:raise ValueError('operator_settings_changed')
        self.control.patch_settings({'autonomyEnabled':self.original_settings['settings']['autonomyEnabled']},self.app.root)
        self.receipt.update(autonomyRestored=True,state='activated')
        self.save('activated_requires_gameplay_acceptance')

def safe_report(data):
    # Private backup paths and settings remain in the durable Mint receipt.
    keys=('operationId','state','phase','reason','failureType','oldBdsPid','oldAlicePid','newAlicePid','version',
        'bdsStopSent','bdsOpenSent','aliceStopped','backupVerified','packInstalled','worldRegistrationWritten',
        'clientStartSent','clientStarted','freshStablePair','autonomyRestored','betaChanged','cheatsChanged','queryBudgetChanged','recovery')
    return {k:data[k] for k in keys if k in data}
