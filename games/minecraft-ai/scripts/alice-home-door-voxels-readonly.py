#!/usr/bin/env python3
"""Read one current 17879 Alice voxel snapshot to diagnose observed door visibility.

Never runs BDS commands, movement, console, model inference or raw world DB reads.
Only returns bounded counts, relative door offsets and distances; never absolute coordinates or entities.
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
    # Relative loaded bed cells only; no absolute server/player location.
    closest_bed=sorted(beds,key=lambda e:(e['dist'],abs(e['dy']),e['dx'],e['dz']))
    bed_columns=[]
    for e in closest_bed:
        if any(c['dx']==e['dx'] and c['dz']==e['dz'] for c in bed_columns):continue
        bed_columns.append({'dx':e['dx'],'dz':e['dz'],'dy':e['dy'],'type':e['type']})
        if len(bed_columns)>=3:break
    result={'state':'observed','source':'client_chunk_cache_not_bds',
        'doorVoxelCount':len(doors),'doorWithinSurvey7':sum(e['dist']<=7.5 and abs(e['dy'])<=2 for e in doors),
        'nearestDoorHorizontal':nearest(doors),'relativeDoorColumns':columns,
        'bedVoxelCount':len(beds),'bedWithin12':sum(e['dist']<=12.5 for e in beds),
        'nearestBedHorizontal':nearest(beds),
        'relativeBedColumns':bed_columns,
        'unknownCells':view.get('unknown') if type(view.get('unknown')) is int else None}
    # Read-only, names-only map. This does NOT claim collision-box, door
    # open-bit, BDS endpoint, or any movement authority.
    # A full dense scan and zero unknowns are required before inferring air.
    if view.get('scanned')==11532 and view.get('unknown')==0:
        cells={(dx,dy,dz):palette[ix].removeprefix('minecraft:')
               for dx,dy,dz,ix in voxels}
        air={'air','cave_air','void_air'}
        def name(x,y,z):return cells.get((x,y,z),'air')
        def role(x,z):
            floor,feet,head,above,top=[name(x,y,z) for y in (-1,0,1,2,3)]
            blocks=(feet,head)
            if any('_door' in b for b in blocks):return 'D'
            if any(b=='bed' or b.endswith('_bed') for b in blocks):return 'B'
            if any(any(q in b for q in ('lava','water','fire','cactus','magma','powder_snow','campfire')) for b in (floor,feet,head)):return '!'
            if feet in air and head in air:
                if floor in air:return '.'
                if any(q in floor for q in ('slab','stairs','trapdoor','carpet','fence','wall','glass_pane','leaves')):return ':'
                return '+'
            if feet not in air and head in air and above in air and top in air:return '^'
            return '#'
        xmin,xmax,zmin,zmax=-12,3,-14,3
        result['terrainGrid']={'xRange':[xmin,xmax],'zRange':[zmin,zmax],
           'rows':[{'z':z,'cells':''.join('A' if x==0 and z==0 else role(x,z)
                    for x in range(xmin,xmax+1))}
                   for z in range(zmin,zmax+1)],
           'legend':{'A':'Alice floor-cell','+':'nominal clear flat',
             ':':'non-full support requires collision inspection',
             '.':'no floor','^':'raised block candidate (not approved)',
             '#':'occupied or insufficient headroom','D':'door, state unknown',
             'B':'bed','!':'hazard'}}
        # Bounded exact names near feet, door and bed to investigate support
        # / ceiling; do not expose absolute locations.
        columns=[(0,0),(-1,0),(1,0),(0,-1),(0,1),
                 (-3,-5),(-3,-4),(-3,-6),(-2,-5),(-4,-5),
                 (-9,-11),(-10,-11)]
        result['terrainColumns']=[{'dx':x,'dz':z,
             'blocks':[[y,name(x,y,z)] for y in (-2,-1,0,1,2,3)
                       if name(x,y,z) not in air]}
             for x,z in columns]
    return result

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
  # Bounded door-column offsets only; absolute world coordinates never leave Mint.
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
    assert x['relativeBedColumns']==[{'dx':1,'dz':0,'dy':0,'type':'red_bed'}]
    assert x['relativeDoorColumns']==[{'dx':3,'dz':0,'dyLevels':[0],'type':'oak_door'}]\n    assert 'terrainGrid' not in x\n    v['scanned']=11532\n    t=summarize(v)\n    assert len(t['terrainGrid']['rows'])==18\n    assert t['terrainGrid']['rows'][14]['cells'][12]=='A'\n    assert t['terrainGrid']['rows'][14]['cells'][13]=='B'
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
        if p.returncode==0 and len(p.stdout)<12000:
            x=json.loads(p.stdout)
            if x.get('state') in ('observed','unverified') and set(x)<={
                'state','reason','source','doorVoxelCount','doorWithinSurvey7','nearestDoorHorizontal',
                'bedVoxelCount','bedWithin12','nearestBedHorizontal','relativeBedColumns','unknownCells','relativeDoorColumns','terrainGrid','terrainColumns'}:obs=x
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
