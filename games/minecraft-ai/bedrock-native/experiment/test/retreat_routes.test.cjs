'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {planSafeRetreat}=require('../src/retreat_routes.cjs')
const p=(x,y,z)=>({x,y,z,offset(dx,dy,dz){return p(x+dx,y+dy,z+dz)},
 clone(){return p(x,y,z)},floored(){return p(Math.floor(x),Math.floor(y),Math.floor(z))},
 distanceTo:q=>Math.hypot(x-q.x,y-q.y,z-q.z)})
const full={name:'stone_bricks',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
const air={name:'air',boundingBox:'empty',shapes:[]}
const fixture=(read=null)=>{
 const bot={entity:{position:p(.5,65,.5),onGround:true},
  blockAt:read|| (q=>q.y<65?full:air)}
 return bot
}
test('escape planner requires an entire observed away-from-hostile corridor',()=>{
 const bot=fixture()
 const result=planSafeRetreat(bot,{position:p(-2.5,65,.5)})
 assert.equal(result.ok,true)
 assert.equal(result.firstWaypoint.y,65)
 assert.equal(result.firstWaypoint.x,1)
 assert(result.candidateSteps>=3)
 assert.equal(result.serverMovementVerified,false)
})
test('unloaded blocks, unverified support and lava never become escape corridors',()=>{
 for(const read of [
  ()=>null,
  q=>q.y<65?{name:'lava',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}:air,
  q=>q.y<65?full:{name:'stone_bricks',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
 ]){
  const result=planSafeRetreat(fixture(read),{position:p(-2.5,65,.5)})
  assert.equal(result.ok,false)
 }
})
test('no safe away route must refuse even if a nearby endpoint exists behind a wall',()=>{
 const bot=fixture(q=>{
  if(q.y<65)return full
  // The only empty body column is Alice's current cell. The apparently
  // free retreat endpoint is separated by walls on every possible corridor.
  if(q.y>=65&&(Math.floor(q.x)!==0||Math.floor(q.z)!==0))return full
  return air
 })
 const result=planSafeRetreat(bot,{position:p(-2.5,65,.5)})
 assert.equal(result.ok,false)
})
test('retreat is not a confirmed server movement or a permit to excavate',()=>{
 const result=planSafeRetreat(fixture(),{position:p(-2.5,65,.5)})
 assert.equal(result.ok,true)
 assert.equal(result.serverMovementVerified,false)
 assert(!('dig' in result))
})

test('emergency retreat accepts a single observed away cell in a narrow cul-de-sac',()=>{
 const bot=fixture(q=>{
   const x=Math.floor(q.x),z=Math.floor(q.z)
   if(q.y<65)return full
   return z===0&&(x===0||x===1)?air:full
 })
 const result=planSafeRetreat(bot,{position:p(-2.5,65,.5)})
 assert.equal(result.ok,true,JSON.stringify(result))
 assert.equal(result.candidateSteps,1)
 assert.deepEqual(result.firstWaypoint,{x:1,y:65,z:0})
 assert.equal(result.reason,'observed_short_emergency_retreat_corridor')
 assert.equal(result.serverMovementVerified,false)
})
test('single-cell emergency route never passes when floor or clearance is unknown',()=>{
 const bot=fixture(q=>{
   const x=Math.floor(q.x),z=Math.floor(q.z)
   if(x===1&&z===0&&q.y<65)return null
   if(q.y<65)return full
   return z===0&&(x===0||x===1)?air:full
 })
 const r=planSafeRetreat(bot,{position:p(-2.5,65,.5)})
 assert.equal(r.ok,false)
})
test('retreat rejects a route which gets closer to a threat, even with open floor',()=>{
 const bot=fixture()
 const hostile={position:p(2.5,65,.5)}
 const result=planSafeRetreat(bot,hostile,{radius:1})
 if(result.ok){
   const p1=result.firstWaypoint
   assert(Math.hypot(p1.x+.5-2.5,p1.y-65,p1.z+.5-.5)>
     Math.hypot(.5-2.5,0,0),'one-cell route must increase separation')
 }
 assert.equal(result.serverMovementVerified,false)
})
