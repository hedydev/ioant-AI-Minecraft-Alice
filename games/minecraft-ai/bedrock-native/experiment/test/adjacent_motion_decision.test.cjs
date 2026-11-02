'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {chooseAdjacentMovement}=require('../src/adjacent_motion_decision.cjs')
const v=(x,y,z)=>({x,y,z,offset(dx,dy,dz){return v(x+dx,y+dy,z+dz)}})
const goal={x:4,y:65,z:0}
function scene({raised=false,roofAt=null,wall=false,unknown=false,
  occupied=false,airborne=false}={}){
 const calls=[]
 const bot={game:{dimension:'overworld'},
  entity:{position:v(.5,65,.5),onGround:!airborne},
  entities:occupied?{other:{name:'cow',position:v(1.5,raised?66:65,.5)}}:{},
  blockAt(p){
   calls.push(['read',Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)])
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(unknown&&x===1&&z===0)return null
   if(roofAt===y)return {name:'stone',boundingBox:'block'}
   if(x===1&&z===0&&y===65&&(raised||wall))
     return {name:'stone',boundingBox:'block'}
   if(wall&&x===1&&z===0&&y===66)
     return {name:'stone',boundingBox:'block'}
   if(y===64)return {name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
   return {name:'air',boundingBox:'empty'}
  },
  setControlState:()=>{throw Error('pure decision must never move')},
  pathfinder:{goto:()=>{throw Error('pure decision must never navigate')}}
 }
 return {bot,calls}
}
const decide=(bot,target=goal)=>chooseAdjacentMovement(bot,{
 toward:target,allowDirectional:true,allowJump:true})
test('prefers ordinary WALK through two-high low-ceiling passage instead of jumping',()=>{
 const f=scene({roofAt:67})
 const plan=decide(f.bot)
 assert.equal(plan.ok,true)
 assert.equal(plan.action,'WALK')
 assert.deepEqual(plan.target,{x:1,y:65,z:0})
 assert.equal(plan.source,'observed_flat_neighbor')
 assert.equal(plan.permitted,false)
 assert.equal(plan.serverMovementVerified,false)
 assert(f.calls.length>0)
})
test('one full block rise permits JUMP_UP only with known takeoff and landing overhead',()=>{
 const plan=decide(scene({raised:true}).bot,{x:4,y:66,z:0})
 assert.equal(plan.ok,true)
 assert.equal(plan.action,'JUMP_UP')
 assert.deepEqual(plan.target,{x:1,y:66,z:0})
 assert.equal(plan.permitted,false)
 assert.equal(plan.serverMovementVerified,false)
})
test('raised block plus low ceiling refuses JUMP_UP: never jump into a roof',()=>{
 for(const height of [67,68]){
  const plan=decide(scene({raised:true,roofAt:height}).bot,{x:4,y:66,z:0})
  assert.equal(plan.ok,false,String(height))
  assert.equal(plan.reason,'jump_origin_support_or_headroom_unverified')
 }
})
test('two-high wall, unloaded neighbor, air start and entity occupation are not guessed walks',()=>{
 for(const opts of [{wall:true},{unknown:true},{airborne:true},{occupied:true}]){
  const plan=decide(scene(opts).bot)
  assert.equal(plan.ok,false,JSON.stringify(opts))
 }
})
test('only a read-only proven flat route may choose a planned waypoint',()=>{
 const f=scene({roofAt:67})
 const route={status:'observed_route_candidate',routeComplete:true,
  permitted:false,serverVerified:false,waypoints:[[1,65,0],[2,65,0]]}
 const plan=chooseAdjacentMovement(f.bot,{route,allowJump:false})
 assert.equal(plan.ok,true)
 assert.equal(plan.action,'WALK')
 assert.equal(plan.source,'observed_flat_route')
 assert.deepEqual(plan.target,{x:1,y:65,z:0})
 const invalid=chooseAdjacentMovement(f.bot,{
  route:{...route,waypoints:[[2,65,0]]},allowJump:false})
 assert.equal(invalid.ok,false)
})
test('no permission to infer an unobserved path from a nearby target',()=>{
 const f=scene()
 assert.equal(chooseAdjacentMovement(f.bot,{toward:goal}).ok,false)
 assert.equal(chooseAdjacentMovement(f.bot,{
   toward:{x:NaN,y:65,z:0},allowJump:true}).ok,false)
})
