'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {surveyVoxelActions,walkingCandidate}=require('../src/voxel_actions.cjs')
const air=()=>({name:'air',boundingBox:'empty',shapes:[]})
const full=()=>({name:'polished_andesite',boundingBox:'block',shapes:[[0,0,0,1,1,1]]})
const slab=()=>({name:'stone_slab',boundingBox:'block',shapes:[[0,0,0,1,.5,1]]})
const fixture=(mods={},start=[0.5,65,0.5])=>{
  const p=(x,y,z)=>({x,y,z,offset(dx,dy,dz){return p(x+dx,y+dy,z+dz)}})
  return {entity:{onGround:true,position:p(...start)},blockAt:q=>{
    const xyz=[Math.floor(q.x),Math.floor(q.y),Math.floor(q.z)].join(',')
    return xyz in mods?mods[xyz]:q.y<65?full():air()
  }}
}
test('observed built full-block floors generate walking without a natural-ground name allowlist',()=>{
  const r=surveyVoxelActions(fixture(),{radius:3})
  assert.equal(r.status,'route_candidate')
  assert(r.route.actions.includes('WALK'))
  assert.equal(r.route.executable,false)
  const c=walkingCandidate(r)
  assert.equal(c.kind,'observed_voxel_walking_only')
  assert(c.waypoints.length>=3)
})
test('one-block rise is a proposed jump, never silently executable as a flat walk',()=>{
  const f=fixture({'1,65,0':full()}),read=f.blockAt
  f.blockAt=q=>{
    const x=Math.floor(q.x),z=Math.floor(q.z)
    return x===0&&z===0||x===1&&z===0?read(q):air()
  }
  const r=surveyVoxelActions(f,{radius:2})
  assert.equal(r.status,'route_candidate')
  assert(r.route.actions.includes('JUMP_UP'))
  assert.equal(walkingCandidate(r),null)
})
test('observed half-slab top is recognized at real half-block feet height',()=>{
  const r=surveyVoxelActions(fixture({'0,64,0':slab()},[0.5,64.5,0.5]),{radius:2})
  assert.equal(r.center[1],64.5)
  assert.equal(r.status,'route_candidate')
})
test('hazards and unloaded chunks fail closed',()=>{
  const lava={name:'lava',boundingBox:'empty',shapes:[]}
  const r=surveyVoxelActions(fixture({'1,64,0':lava}),{radius:1})
  assert((r.blockedReasons.hazard_floor||0)>0)
  const f=fixture();f.blockAt=()=>null
  assert.equal(surveyVoxelActions(f).status,'unverified')
  assert.equal(walkingCandidate(surveyVoxelActions(f)),null)
})
test('no dig/place API can be reached by read-only voxel survey',()=>{
  const f=fixture()
  f.dig=()=>{throw Error('dig forbidden')}
  f.placeBlock=f.dig
  const r=surveyVoxelActions(f)
  assert(r.route.actions.every(a=>['WALK','JUMP_UP','STEP_DOWN'].includes(a)))
})
test('voxel survey clamps read and search budgets',()=>{
  let reads=0;const f=fixture(),read=f.blockAt
  f.blockAt=q=>{reads++;return read(q)}
  const r=surveyVoxelActions(f,{maxReads:64,maxNodes:4,radius:6})
  assert(reads<=64)
  assert(r.observedBlocks<=64)
})
test('unknown collision geometry does not become traversable',()=>{
  const f=fixture({'0,64,0':{name:'stone',boundingBox:'block',shapes:null}})
  assert.equal(surveyVoxelActions(f).status,'unverified')
})

test('a valid flat alternative remains available even if high-scoring path requires jumping',()=>{
  const b=fixture({'1,65,0':full()})
  const s=surveyVoxelActions(b,{radius:4})
  assert.equal(s.status,'route_candidate')
  assert(s.walkRoute)
  assert(s.walkRoute.actions.every(a=>a==='WALK'))
  const route=walkingCandidate(s)
  assert(route?.waypoints.length>=3)
  assert.equal(route.elevationChanges,0)
})

test('independent flat search finds multiple candidate exits with distinct endpoints',()=>{
 const s=surveyVoxelActions(fixture(),{radius:4,maxNodes:96})
 assert(s.walkRoutes.length>5)
 assert(s.walkRoutes.every(r=>r.actions.every(a=>a==='WALK')))
 assert.equal(s.walkRoute.target.join(','),s.walkRoutes[0].target.join(','))
})
test('chooser takes a safer fully verified detour rather than one dangerous top-ranked route',()=>{
 const {selectSafeWalkingCandidate}=require('../src/voxel_actions.cjs')
 const s=surveyVoxelActions(fixture(),{radius:4,maxNodes:96})
 const hostile={x:8.5,y:65,z:4.5}
 const preferred=walkingCandidate(s)
 assert(preferred&&Math.hypot(preferred.target.x-hostile.x,
   preferred.target.y-hostile.y,preferred.target.z-hostile.z)<9)
 const picked=selectSafeWalkingCandidate(s,{hostiles:[hostile],
   origin:{x:.5,y:65,z:.5}})
 assert(picked.candidate,'an independently observed flat route should remain')
 assert.notEqual(picked.candidate.key,preferred.key)
 assert(picked.threatRoutes>0)
 assert(picked.candidate.waypoints.every(w=>w.y===65))
 assert(Math.hypot(picked.candidate.target.x+.5-hostile.x,
   picked.candidate.target.y-hostile.y,
   picked.candidate.target.z+.5-hostile.z)>=9)
})
test('chooser does not confuse nearby hostile exposure with missing terrain',()=>{
 const {selectSafeWalkingCandidate}=require('../src/voxel_actions.cjs')
 const s=surveyVoxelActions(fixture(),{radius:4,maxNodes:96})
 const result=selectSafeWalkingCandidate(s,{
   hostiles:[{x:.5,y:65,z:.5}],origin:{x:.5,y:65,z:.5}})
 assert.equal(result.candidate,null)
 assert.equal(result.reason,'all_eligible_flat_routes_near_hostiles')
 assert(result.threatRoutes>0)
})
test('failed and visited endpoints remain excluded even when safer routes are available',()=>{
 const {selectSafeWalkingCandidate}=require('../src/voxel_actions.cjs')
 const s=surveyVoxelActions(fixture(),{radius:4,maxNodes:96})
 const first=walkingCandidate(s)
 const result=selectSafeWalkingCandidate(s,{blocked:new Set([first.key])})
 assert(result.candidate)
 assert.notEqual(result.candidate.key,first.key)
 assert(result.blockedRoutes>0)
})


test('narrow two-cell fully loaded walkway is eligible; one cell and hostile are denied',()=>{
 const {selectSafeWalkingCandidate}=require('../src/voxel_actions.cjs')
 const narrow=n=>{
   const f=fixture(),original=f.blockAt
   f.blockAt=q=>{
     const x=Math.floor(q.x),z=Math.floor(q.z),y=Math.floor(q.y)
     if(y===64)return original(q)
     if(y>=65&&!(z===0&&x>=0&&x<=n))return full()
     return air()
   }
   return f
 }
 const two=surveyVoxelActions(narrow(2),{radius:4})
 const proposal=selectSafeWalkingCandidate(two)
 assert.equal(proposal.candidate?.distance,2)
 assert.equal(proposal.candidate?.waypoints.length,2)
 assert.equal(proposal.candidate?.kind,'observed_voxel_walking_only')
 const blocked=selectSafeWalkingCandidate(two,{blocked:new Set([proposal.candidate.key])})
 assert.equal(blocked.candidate,null,'recently tried endpoint cannot be retried')
 assert.equal(selectSafeWalkingCandidate(surveyVoxelActions(narrow(1))).candidate,null)
 const danger=selectSafeWalkingCandidate(two,{hostiles:[{x:1.5,y:65,z:.5}],
   origin:{x:.5,y:65,z:.5}})
 assert.equal(danger.candidate,null,'monster veto must still apply to short routes')
})

test('one-cell retreat option is explicit; normal exploration rejects same dead end',()=>{
 const b=fixture()
 b.blockAt=q=>{
   const x=Math.floor(q.x),z=Math.floor(q.z)
   if(q.y<65)return full()
   return z===0&&(x===0||x===1)?air():full()
 }
 const normal=surveyVoxelActions(b,{radius:1})
 assert.equal(normal.walkRoutes.length,0)
 const emergency=surveyVoxelActions(b,{radius:1,includeSingleStep:true})
 assert(emergency.walkRoutes.some(r=>r.steps===1),JSON.stringify(emergency))
 assert.equal(walkingCandidate(emergency),null,
   'a one-cell escape is never accepted as an autonomous exploration target')
})
