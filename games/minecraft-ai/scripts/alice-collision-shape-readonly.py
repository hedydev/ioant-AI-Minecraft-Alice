#!/usr/bin/env python3
"""Read current Alice collision/door bits from its OWN private world-view only.
No game commands, remote code mutation, movement, chunk loads or BDS access.
"""
import json,os,re,shlex,subprocess,sys,inspect
from pathlib import Path

def summarize(view):
    c=view.get('collisionSurvey')
    pal=view.get('palette')
    if not isinstance(c,dict) or c.get('radius')!=7 or c.get('below')!=2 or c.get('above')!=3 or c.get('source')!='client_chunk_cache_not_bds':
        return {'state':'not_published'}
    if not isinstance(pal,list) or len(pal)>256 or not isinstance(c.get('cells'),list) or len(c['cells'])!=1350 or not isinstance(c.get('shapes'),list) or len(c['shapes'])>128:
        return {'state':'malformed'}
    shapes=c['shapes']
    if not all(isinstance(p,dict) and p.get('boundingBox') in ('empty','block','unverified') and
               (p.get('shapes') is None or isinstance(p['shapes'],list) and len(p['shapes'])<=12) for p in shapes):
        return {'state':'malformed'}
    cells={}
    for v in c['cells']:
        if not isinstance(v,list) or len(v)!=7 or any(type(n) is not int for n in v[:5]):
            return {'state':'malformed'}
        x,y,z,i,j=v[:5]
        if not (-7<=x<=7 and -2<=y<=3 and -7<=z<=7 and 0<=i<len(pal) and 0<=j<len(shapes)) or (x,y,z) in cells:
            return {'state':'malformed'}
        if any(bit is not None and type(bit) is not bool for bit in v[5:]):
            return {'state':'malformed'}
        cells[x,y,z]=v
    if len(cells)!=1350 or c.get('unknown')!=0:
        return {'state':'cache_unknown','unknown':c.get('unknown')}
    def block(x,y,z):
        v=cells.get((x,y,z))
        if v is None:return None
        k=shapes[v[4]]
        name=str(pal[v[3]]).removeprefix('minecraft:')
        return {'name':name,'box':k['boundingBox'],'shapes':k['shapes'],
                'doorOpen':v[5],'doorUpper':v[6]}
    def full(b):
        return b is not None and b['box']=='block' and b['shapes']==[[0,0,0,1,1,1]]
    def body_clear(b):
        if b is None or b['box']=='unverified' or b['shapes'] is None:return None
        if b['box']=='empty':return b['shapes']==[]
        if b['box']!='block':return None
        return not any(shape[0]<.8 and shape[3]>.2 and shape[2]<.8 and shape[5]>.2 and
                       shape[1]<1.0 and shape[4]>0 for shape in b['shapes'])
    def role(x,z):
        f,feet,head=[block(x,y,z) for y in (-1,0,1)]
        if any(b is None for b in (f,feet,head)):return '?'
        if any(b['name'].endswith('_door') for b in (feet,head)):
            v=feet if feet['name'].endswith('_door') else head
            return 'O' if v['doorOpen'] is True else 'D' if v['doorOpen'] is False else '?'
        if any(any(t in b['name'] for t in ('lava','water','fire','cactus','magma','powder_snow','campfire')) for b in (f,feet,head)):return '!'
        if not full(f):
            return '.' if f['box']=='empty' and f['shapes']==[] else ':'
        checks=[body_clear(feet),body_clear(head)]
        if any(v is None for v in checks):return '?'
        if not all(checks):return '#'
        return '+'
    # A center cell being air does not prove the 0.6-wide avatar can pass
    # between corners. This *read-only* analysis sweeps its full horizontal
    # footprint across every proposed center-to-center WALK, checking nine
    # support probes and two body-height layers. No path is an action permit.
    hazards=('lava','water','fire','magma','cactus','campfire','powder_snow','sweet_berry_bush')
    def boxes_at(x,y,z):
        b=block(x,y,z)
        if b is None or b['box']=='unverified' or not isinstance(b['shapes'],list):
            return None
        if any(t in b['name'] for t in hazards) or b['name'].endswith(('_door','trapdoor')):
            return None
        if b['box']=='empty':
            return [] if not b['shapes'] else None
        return b['shapes'] if b['box']=='block' and b['shapes'] else None
    def swept_flat_step(ax,az,bx,bz):
        if abs(ax-bx)+abs(az-bz)!=1:
            return False
        for i in range(9):
            px=ax+.5+(bx-ax)*i/8
            pz=az+.5+(bz-az)*i/8
            for dx in (-.29,0,.29):
                for dz in (-.29,0,.29):
                    fx,fz=px+dx,pz+dz
                    ix,iz=int(fx//1),int(fz//1)
                    supports=boxes_at(ix,-1,iz)
                    if supports is None or not any(
                        abs(-1+shape[4])<.015 and
                        shape[0]-.0001<=fx-ix<=shape[3]+.0001 and
                        shape[2]-.0001<=fz-iz<=shape[5]+.0001
                        for shape in supports):
                        return False
            for ix in range(int((px-.3)//1),int((px+.3)//1)+1):
                for iz in range(int((pz-.3)//1),int((pz+.3)//1)+1):
                    for iy in (0,1):
                        solids=boxes_at(ix,iy,iz)
                        if solids is None:
                            return False
                        if any(ix+sh[0]<px+.3-.001 and ix+sh[3]>px-.3+.001 and
                               iz+sh[2]<pz+.3-.001 and iz+sh[5]>pz-.3+.001 and
                               iy+sh[1]<1.8-.001 and iy+sh[4]>.001 for sh in solids):
                            return False
        return True
    def door_walk_survey(doors):
        # Finite BFS, shortest path from the CURRENT nominal cell center.
        # This is not a bot position, BDS witness, or movement authorization.
        queue=[(0,0,[])]
        seen={(0,0)}
        for x,z,route in queue:
            if len(route)>=8 or len(queue)>220:
                continue
            for dx,dz in ((1,0),(-1,0),(0,1),(0,-1)):
                nx,nz=x+dx,z+dz
                if not (-6<=nx<=6 and -6<=nz<=6) or (nx,nz) in seen:
                    continue
                if not swept_flat_step(x,z,nx,nz):
                    continue
                seen.add((nx,nz))
                queue.append((nx,nz,route+[[nx,nz]]))
        targets=[]
        for dx,dz in doors[:2]:
            routes=[(x,z,route) for x,z,route in queue
                    if abs(x-dx)+abs(z-dz)==1]
            routes.sort(key=lambda row:len(row[2]))
            if routes:
                x,z,route=routes[0]
                targets.append({'door':[dx,dz],'approach':[x,z],
                                'centerlineSteps':len(route),'centerline':route,
                                'bdsVerified':False,'executable':False})
        return {'source':'read_only_client_collision_cache',
                'movementPermitted':False,'serverMovementVerified':False,
                'nominalCenterOnly':True,'actualFootPositionUnverified':True,
                'avatarWidth':0.6,'avatarHeight':1.8,
                'reachableCenters':len(queue),'firstCellCandidates':
                    [[x,z] for x,z,route in queue if len(route)==1][:4],
                'doorApproaches':targets}
    doorpoints=[]
    for x in range(-7,8):
        for z in range(-7,8):
            b=block(x,0,z)
            if b and b['name'].endswith('_door'):doorpoints.append((x,z))
    doorpoints.sort(key=lambda q:q[0]**2+q[1]**2)
    points=[(0,0),(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-2,-2),(-2,-3),(-3,-3),(-3,-4),(-3,-5)]
    for x,z in doorpoints[:2]:
        points.extend([(x,z),(x+1,z),(x-1,z),(x,z+1),(x,z-1)])
    points=list(dict.fromkeys((x,z) for x,z in points if -7<=x<=7 and -7<=z<=7))[:19]
    samples=[]
    for x,z in points:
        columns=[]
        for y in (-1,0,1,2):
            b=block(x,y,z)
            if b and (b['name']!='air' or b['box']!='empty' or b['shapes']!=[]):
                columns.append({'dy':y,**b})
        samples.append({'dx':x,'dz':z,'centerCandidate':role(x,z),'blocks':columns})
    return {'state':'observed','source':'client_chunk_cache_not_bds',
       'bdsEndpointVerified':False,'movementPermitted':False,
       'collisionRadius':7,'records':len(cells),'unknown':0,
       'sweptDoorSurvey':door_walk_survey(doorpoints),
       'doorColumns':[{'dx':x,'dz':z,
                       'lower':block(x,0,z),'upper':block(x,1,z)}
                      for x,z in doorpoints[:2]],
       'grid':{'xRange':[-7,2],'zRange':[-7,2],
           'rows':[{'z':z,'cells':''.join('A' if (x,z)==(0,0) else role(x,z) for x in range(-7,3))}
                   for z in range(-7,3)],
           'legend':{'+':'center floor and body collision verified (not swept path)','A':'Alice',
                    '.':'no full floor',':':'partial/unknown floor','#':'center blocked',
                    'D':'door closed','O':'door open','?':'geometry/door state unknown','!':'hazard'}},
       'samples':samples}

REMOTE=r"""
import json,os,subprocess,sys,time
from pathlib import Path
root=Path.home()/'.alice-bedrock-control'
result={'state':'unverified'}
try:
 p=subprocess.run(['/usr/bin/python3',str(Path.home()/'minecraft-ai/scripts/alice-mint.py'),'status'],
                  capture_output=True,text=True,timeout=12,check=False)
 if p.returncode or len(p.stdout)>20000:raise ValueError('status_unavailable')
 s=json.loads(p.stdout)
 stat=root/'status.json';view=root/'world-view.json'
 for f,size in ((stat,8192),(view,524288)):
  if root.is_symlink() or f.is_symlink() or not f.is_file() or f.stat().st_size>size or f.stat().st_mode&0o077 or f.stat().st_uid!=os.getuid():
   raise ValueError('unsafe_file')
 d=json.loads(stat.read_text())
 if s.get('statusSource')!='current_process' or d.get('producerPid')!=s.get('pid') or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879 or not d.get('connected') or not d.get('sessionEstablished'):
  raise ValueError('wrong_owner')
 v=json.loads(view.read_text())
 age=int(time.time()*1000)-v.get('observedAt',0)
 if v.get('version')!=1 or not v.get('connected') or v.get('dimension')!='overworld' or not 0<=age<=12000:raise ValueError('stale_view')
 __ANALYZE__
 result=summarize(v)
except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
 pass
print(json.dumps(result,separators=(',',':')))
"""
def remote():
    return REMOTE.replace('__ANALYZE__',inspect.getsource(summarize))
def selftest():
    compile(remote(),'<readonly-original-world>','exec')
    assert 'querytarget' not in REMOTE and 'restart' not in REMOTE
    assert summarize({'palette':['air'],'collisionSurvey':None})['state']=='not_published'
    assert 'door_walk_survey(doorpoints)' in inspect.getsource(summarize)
    assert 'swept_flat_step' in remote()
    print('ALICE_COLLISION_SHAPE_READONLY_SELFTEST_PASS')
def run(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('unsafe_output')
    obs=None
    try:
        p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes',
            'tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(remote())],
            capture_output=True,text=True,timeout=45,check=False)
        if p.returncode==0 and len(p.stdout)<22000:
            x=json.loads(p.stdout)
            if x.get('state') in ('unverified','not_published','malformed','cache_unknown','observed'):obs=x
    except (OSError,ValueError,subprocess.SubprocessError):pass
    report={'audit':'ALICE_17879_COLLISION_READONLY','schemaVersion':1,
            'readOnly':True,'bdsCommandsSent':False,'movementAttempted':False,'observation':obs}
    fd=os.open(out/'collision_shape_readonly.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':obs.get('state') if obs else 'unavailable'}))
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--read':run(sys.argv[2])
    else:raise SystemExit('usage --self-test | --read OUTPUT')
