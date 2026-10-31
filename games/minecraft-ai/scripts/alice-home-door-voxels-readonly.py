#!/usr/bin/env python3
"""Read one current 17879 Alice voxel snapshot to diagnose observed door visibility.

Never runs BDS commands, movement, console, model inference or raw world DB reads.
Only returns limited counts/distances, never absolute coordinates or entities.
"""
import json,math,os,re,shlex,subprocess,sys
from pathlib import Path

def summarize(view):
    palette=view.get('palette')
    voxels=view.get('voxels')
    if not isinstance(palette,list) or len(palette)>256 or not isinstance(voxels,list) or len(voxels)>12000:
        raise ValueError('invalid_view')
    if view.get('radius')!=15 or view.get('scanned',0)>11532:
        raise ValueError('unexpected_scope')
    doors=[];beds=[]
    for v in voxels:
        if not isinstance(v,list) or len(v)!=4 or not all(type(n) is int for n in v):
            raise ValueError('invalid_voxel')
        dx,dy,dz,ix=v
        if not (-15<=dx<=15 and -6<=dy<=5 and -15<=dz<=15 and 0<=ix<len(palette)):
            raise ValueError('invalid_voxel_range')
        label=palette[ix]
        if not isinstance(label,str) or not re.fullmatch(r'[a-z0-9_:.-]{1,64}',label):
            raise ValueError('invalid_block_name')
        label=label.removeprefix('minecraft:')
        horizontal=math.hypot(dx,dz)
        entry={'dist':round(horizontal,1),'dy':dy,'dx':dx,'dz':dz,'type':label}
        if re.fullmatch(r'(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door',label):
            doors.append(entry)
        if label=='bed' or label.endswith('_bed'):
            beds.append(entry)
    columns=[]
    for e in sorted(doors,key=lambda x:(x['dist'],x['dx'],x['dz'],x['dy'])):
        if e['dist']>7.5:continue
        if any(c['dx']==e['dx'] and c['dz']==e['dz'] for c in columns):continue
        levels=sorted({x['dy'] for x in doors if x['dx']==e['dx'] and x['dz']==e['dz']})
        columns.append({'dx':e['dx'],'dz':e['dz'],'dyLevels':levels,
                        'type':e['type']})
        if len(columns)>=4:break
    nearest=lambda a: min((e['dist'] for e in a),default=None)
    return {'state':'observed','source':'client_chunk_cache_not_bds',
        'doorVoxelCount':len(doors),'doorWithinSurvey7':sum(e['dist']<=7.5 and abs(e['dy'])<=2 for e in doors),
        'nearestDoorHorizontal':nearest(doors),'relativeDoorColumns':columns,
        'bedVoxelCount':len(beds),'bedWithin12':sum(e['dist']<=12.5 for e in beds),
        'nearestBedHorizontal':nearest(beds),
        'unknownCells':view.get('unknown') if type(view.get('unknown')) is int else None}

REMOTE=r"""
import json,math,os,re,subprocess,sys,time
from pathlib import Path
root=Path.home()/'.alice-bedrock-control'
tool=Path.home()/'minecraft-ai/scripts/alice-mint.py'
result={'state':'unverified','reason':'world_view_not_current_or_owner_not_verified'}
try:
  p=subprocess.run(['/usr/bin/python3',str(tool),'status'],capture_output=True,text=True,timeout=12,check=False)
  if p.returncode or len(p.stdout)>20000:raise ValueError('operator_status')
  t=json.loads(p.stdout)
  f=root/'status.json';v=root/'world-view.json'
  for x,limit in [(f,8192),(v,524288)]:
    if root.is_symlink() or x.is_symlink() or not x.is_file():raise ValueError('unsafe_path')
    s=x.stat()
    if s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_size>limit:raise ValueError('unsafe_file')
  d=json.loads(f.read_text())
  if t.get('statusSource')!='current_process' or d.get('producerPid')!=t.get('pid') or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879 or d.get('connected') is not True or d.get('sessionEstablished') is not True:raise ValueError('wrong_process')
  view=json.loads(v.read_text())
  age=int(time.time()*1000)-view.get('observedAt',0)
  if view.get('version')!=1 or view.get('connected') is not True or not 0<=age<=12000 or view.get('dimension')!='overworld':raise ValueError('stale_view')
  # A bounded redacted summary only; relative voxel coordinates never leave Mint.
  __SUMMARIZER__
  result=summarize(view)
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
  pass
print(json.dumps(result,separators=(',',':')))
"""
# Inject the fixed reviewed local function source into remote code only at construction
# by storing it as a static Python string, never accepting external commands.
def build_remote():
    import inspect
    body=inspect.getsource(summarize)
    return REMOTE.replace('__SUMMARIZER__',body)

def selftest():
    v={'palette':['air','oak_door','red_bed'],'voxels':[[3,0,0,1],[1,0,0,2]],'radius':15,'scanned':10,'unknown':0}
    x=summarize(v)
    assert x['doorVoxelCount']==1 and x['doorWithinSurvey7']==1
    assert x['bedVoxelCount']==1 and x['nearestDoorHorizontal']==3.0
    assert x['relativeDoorColumns']==[{'dx':3,'dz':0,'dyLevels':[0],'type':'oak_door'}]
    assert 'def summarize(view):' in build_remote()
    assert 'import json,math,os,re,subprocess,sys,time' in build_remote()
    compile(build_remote(),'<reviewed-remote-readonly>','exec')
    assert 'querytarget' not in REMOTE and 'restart' not in REMOTE
    print('ALICE_DOOR_VOXEL_READONLY_SELFTEST_PASS')

def run(folder):
    folder=Path(folder)
    if folder.is_symlink() or not folder.is_dir():raise ValueError('unsafe_output')
    obs=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
          'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(build_remote())],
          capture_output=True,text=True,timeout=35,check=False)
        if p.returncode==0 and len(p.stdout)<1800:
            x=json.loads(p.stdout)
            if x.get('state') in ('observed','unverified') and set(x)<={
                'state','reason','source','doorVoxelCount','doorWithinSurvey7','nearestDoorHorizontal',
                'bedVoxelCount','bedWithin12','nearestBedHorizontal','unknownCells'}:obs=x
    except (OSError,ValueError,subprocess.SubprocessError):pass
    report={'audit':'ALICE_HOME_DOOR_VOXEL_READONLY','schemaVersion':1,
      'bdsCommandsSent':False,'movementAttempted':False,'observation':obs}
    fd=os.open(folder/'home_door_voxels.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':obs.get('state') if obs else 'unavailable'}))

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':run(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT_DIR')
