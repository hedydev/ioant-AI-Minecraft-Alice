#!/usr/bin/env python3
"""One-shot BDS-only v4 CONTROL in private child netns; sanitized exit evidence.

No Script API pack, Beta switch, receiver or production process changes.
The old v2 startup is forever consumed and NEVER retried.
Run only as ordinary Mint user with an interactive sudo -v authorization,
used exclusively for the existing read-only /proc BDS cwd safety gate.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time

HERE=Path(__file__).resolve().parent
LAB=Path.home()/'minecraft-bedrock-alice-lab-v4'
INTENT='.alice-v4-control-first-start.lock'
RESULT='.alice-v4-control-first-start-result.json'
MAX_SECONDS=55
MAX_LOG=262144
CATEGORIES=('elf_loader_error','permission_denied','running_as_root',
 'network_unreachable','bind_failure','level_database_failure',
 'script_api_error','resource_exhausted','explicit_fatal','unknown')

def load(name):
    spec=importlib.util.spec_from_file_location('v4_'+name,
                                               HERE/('alice-bds-'+name+'.py'))
    if spec is None or spec.loader is None:
        raise ValueError('fixed_utility_missing')
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

def lab_guard(*,privileged=False):
    if LAB.is_symlink() or not LAB.is_dir() or LAB.parent!=Path.home():
        raise ValueError('unsafe_v4_lab')
    marker=LAB/'.alice-sandbox.json'
    if marker.is_symlink() or not marker.is_file() or marker.stat().st_size>16384:
        raise ValueError('v4_marker_invalid')
    x=json.loads(marker.read_text(encoding='utf-8'))
    if (not isinstance(x,dict) or x.get('labGeneration')!='fresh-isolated-v4'
        or x.get('kind')!='alice-disposable-bedrock-lab'
        or x.get('port')!=17880 or x.get('world')!='Bedrock level'):
        raise ValueError('v4_marker_invalid')
    b=LAB/'bedrock_server'
    if b.is_symlink() or not b.is_file() or not os.access(b,os.X_OK):
        raise ValueError('v4_binary_invalid')
    p=load('lab-probe')
    contents,props=p.properties(LAB/'server.properties')
    # The control is deliberately uninstrumented: content-log-file-enabled
    # is a probe-only setting and must not be required on this fresh clone.
    for key in ('server-port','server-portv6','level-name','online-mode',
                'enable-lan-visibility','allow-list',
                'allow-inbound-script-debugging','allow-outbound-script-debugging',
                'script-debugger-auto-attach'):
        if props.get(key)!=p.SAFE_PROPS[key]:
            raise ValueError('v4_config_invalid')
    allowed=LAB/'allowlist.json'
    if allowed.is_symlink() or not allowed.is_file() or allowed.read_bytes().strip()!=b'[]':
        raise ValueError('v4_allowlist_invalid')
    if any((LAB/name).exists() or (LAB/name).is_symlink()
        for name in ('behavior_packs','config','permissions.json')):
        raise ValueError('control_is_not_uninstrumented')
    world=LAB/'worlds'/'Bedrock level'
    if not world.is_dir() or (world/'world_behavior_packs.json').exists():
        raise ValueError('v4_world_pack_present')
    for name in (INTENT,RESULT):
        path=LAB/name
        if path.exists() or path.is_symlink():
            raise ValueError('control_already_consumed')
    if not p.namespace_preflight() or not nonroot_netns_preflight():
        raise ValueError('network_namespace_unavailable')
    if privileged:
        gate=load('lab-pack')
        gate.LAB=LAB
        gate.require_lab_stopped()
    return p

def classify_error(raw):
    text=raw.decode('utf-8','replace').lower()
    rules=(
      ('elf_loader_error',('error while loading shared libraries','cannot open shared object file','symbol lookup error','no such file or directory: ./bedrock_server')),
      ('permission_denied',('permission denied','operation not permitted')),
      ('running_as_root',('running as root','run as root','root user','root privileges')),
      ('bind_failure',('failed to bind','address already in use','bind failed')),
      ('network_unreachable',('network is unreachable','no route to host','dns resolution failed','could not resolve host')),
      ('level_database_failure',('leveldb corruption','failed to load level','corrupt world','database corruption')),
      ('script_api_error',('[scripting][error]','cannot resolve module','script error')),
      ('resource_exhausted',('out of memory','cannot allocate memory','resource temporarily unavailable')),
      ('explicit_fatal',('fatal error','segmentation fault','terminate called')))
    for category,markers in rules:
        if any(x in text for x in markers):
            return category
    return 'unknown'

V4_NONROOT_LO_SETUP = (
    "import fcntl,os,socket,struct,sys\\n"
    "if os.geteuid()==0:sys.exit(77)\\n"
    "s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)\\n"
    "bits=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))\\n"
    "flags=struct.unpack_from('H',bits,16)[0]\\n"
    "if not flags&1:fcntl.ioctl(s.fileno(),0x8914,struct.pack('16sH14s',b'lo',flags|1,b''))\\n"
    "bits=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))\\n"
    "if not struct.unpack_from('H',bits,16)[0]&1:sys.exit(78)\\n"
    "s.close()\\n"
    "os.execv('/usr/bin/setpriv',['/usr/bin/setpriv','--bounding-set=-all',"
    "'--inh-caps=-all','--ambient-caps=-all','--',sys.argv[1]])\\n"
)

def nonroot_netns_preflight(run=subprocess.run):
    """Execute /usr/bin/true through actual child isolation and cap drop.

    Do not consume one-shot marker on any refused preflight; never launch
    BDS, alter host networking, or inherit parent namespace credentials.
    """
    helper=Path('/usr/bin/setpriv')
    if (helper.is_symlink() or not helper.is_file()
            or helper.stat().st_uid!=0 or helper.stat().st_mode&0o022):
        return False
    cmd=[str(Path('/usr/bin/unshare')),'--user','--map-current-user',
         '--keep-caps','--net','--',str(Path('/usr/bin/python3')),
         '-I','-c',V4_NONROOT_LO_SETUP,'/usr/bin/true']
    try:
        ret=run(cmd,capture_output=True,timeout=9,check=False,
                env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
        return ret.returncode==0
    except (OSError,ValueError,subprocess.SubprocessError):
        return False


def run_isolated(p,*,popen=subprocess.Popen,monotonic=time.monotonic,sleep=time.sleep):
    env={'HOME':str(Path.home()),'PATH':'/usr/local/bin:/usr/bin:/bin',
         'LANG':'C.UTF-8','LD_LIBRARY_PATH':str(LAB)}
    args=[str(p.NETNS_UNSHARE),'--user','--map-current-user','--keep-caps',
          '--net','--',str(p.NETNS_PYTHON),'-I','-c',V4_NONROOT_LO_SETUP,
          './bedrock_server']
    start=monotonic()
    cmd=None
    state='spawn_unavailable'
    ready=False
    before_stop=False
    graceful=False
    code=None
    raw=b''
    with tempfile.TemporaryFile('w+b') as output:
        try:
            cmd=popen(args,cwd=LAB,env=env,stdin=subprocess.PIPE,
                      stdout=output,stderr=subprocess.STDOUT,
                      start_new_session=True)
            deadline=start+MAX_SECONDS
            while monotonic()<deadline:
                code=cmd.poll()
                raw=os.pread(output.fileno(),MAX_LOG,0)
                text=raw.lower()
                if b'server started' in text or b'server is ready' in text:
                    ready=True
                    break
                if code is not None:
                    before_stop=True
                    break
                sleep(0.5)
            if cmd.poll() is None:
                try:
                    cmd.communicate(input=b'stop\n',timeout=18)
                    graceful=True
                except (OSError,subprocess.TimeoutExpired):
                    cmd.send_signal(signal.SIGINT)
                    try:cmd.wait(timeout=7)
                    except subprocess.TimeoutExpired:pass
            code=cmd.poll()
            raw=os.pread(output.fileno(),MAX_LOG,0)
            state='completed' if code is not None else 'shutdown_unverified'
        finally:
            if cmd is not None and cmd.poll() is None:
                cmd.send_signal(signal.SIGINT)
                try:cmd.wait(timeout=7)
                except subprocess.TimeoutExpired:
                    cmd.kill()
                    try:cmd.wait(timeout=3)
                    except subprocess.TimeoutExpired:pass
    # No log contents or private diagnostics leave this function.
    exit_kind=('signal' if code is not None and code<0 else
        'zero' if code==0 else 'nonzero' if code is not None else 'unknown')
    return {'state':state,'readyObserved':ready,'exitedBeforeStop':before_stop,
        'gracefulStopAcknowledged':graceful,'exitKind':exit_kind,
        'failureCategory':classify_error(raw),'logDigestSha256':hashlib.sha256(raw).hexdigest(),
        'logBytesExamined':len(raw),'durationSeconds':round(max(0,min(monotonic()-start,120)),1)}

def save_exclusive(path,contents):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|
               getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        f.write(contents);f.flush();os.fsync(f.fileno())

def main():
    args=sys.argv[1:]
    if args not in (['audit'],['first-start']):
        raise SystemExit('usage: alice-v4-control-first-start.py audit|first-start')
    if os.geteuid()==0:
        raise SystemExit('Root Python forbidden')
    try:
        lab_guard()
    except (OSError,ValueError,TypeError,KeyError):
        raise SystemExit('V4 CONTROL PREFLIGHT BLOCKED')
    if args==['audit']:
        print(json.dumps({'audit':'ALICE_V4_CONTROL_FIRST_START','state':'ready_for_privileged_preflight',
          'readOnly':True,'firstStartConsumed':False}))
        return 0
    if not sys.stdin.isatty():
        raise SystemExit('Interactive Mint TTY required')
    if subprocess.run(['sudo','-v'],check=False).returncode!=0:
        raise SystemExit('Authentication unavailable')
    try:
        try:
            p=lab_guard(privileged=True)
        except (OSError,ValueError,TypeError,KeyError):
            raise SystemExit('V4 privileged process or lab guard blocked; nothing started')
        save_exclusive(LAB/INTENT,'V4 first control BDS launch intent; do not retry\n')
        record={'state':'start_unverified','readyObserved':False,
            'exitedBeforeStop':False,'gracefulStopAcknowledged':False,
            'exitKind':'unknown','failureCategory':'unknown',
            'logDigestSha256':None,'logBytesExamined':0,'durationSeconds':0.0}
        try:
            record=run_isolated(p)
        except (OSError,ValueError,TypeError,subprocess.SubprocessError):
            pass
        report={'audit':'ALICE_V4_CONTROL_FIRST_START','schemaVersion':1,
            'observedAtUnix':int(time.time()),'state':record['state'],
            'v4Only':True,'doNotRepeat':True,'noScriptApiInstalled':True,
            'hostNetworkChanged':False,'productionWorldModified':False,
            'productionBdsRestarted':False,'v1Modified':False,'v2Modified':False,
            'aliceRestarted':False,'passwordRecorded':False,'result':record}
        save_exclusive(LAB/RESULT,json.dumps(report,separators=(',',':'))+'\n')
        # Only enumerated, nonsensitive fields are printed.
        print(json.dumps(report,separators=(',',':')))
        return 0
    finally:
        subprocess.run(['sudo','-k'],stdin=subprocess.DEVNULL,
             stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
             timeout=5,check=False)
if __name__=='__main__':
    main()
