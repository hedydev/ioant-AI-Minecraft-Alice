'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {verifyFlatFirstStep,probeFlatInput}=require('../src/direct_flat_step.cjs')
const vec=(x,y,z)=>({x,y,z,offset(dx,dy,dz){return vec(x+dx,y+dy,z+dz)}})
const full={name:'stone_bricks',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
const air={name:'air',boundingBox:'empty',shapes:[]}
const candidate={kind:'observed_voxel_walking_only',waypoints:[
  {x:1,y:65,z:0},{x:2,y:65,z:0}],target:{x:2,y:65,z:0}}
const fixture=()=>({
  entity:{position:vec(.5,65,.5),onGround:true,eyeHeight:1.62},
  blockAt:p=>Math.floor(p.y)===64?full:air,
  lookAt:async()=>{},
  setControlState:()=>{},
  on:()=>{},off:()=>{}
})
test('checks loaded support and full body corridor, never trusting unknown ground or obstacles',()=>{
 const b=fixture()
 assert.equal(verifyFlatFirstStep(b,candidate).ok,true)
 const absent=fixture();absent.blockAt=()=>null
 assert.equal(verifyFlatFirstStep(absent,candidate).ok,false)
 const walled=fixture();walled.blockAt=p=>
  Math.floor(p.y)===65&&Math.floor(p.x)===1?full:
    Math.floor(p.y)===64?full:air
 assert.equal(verifyFlatFirstStep(walled,candidate).reason,'direct_flat_collision_observed')
 const door=fixture();door.blockAt=p=>
  Math.floor(p.y)===65&&Math.floor(p.x)===1?
    {name:'oak_door',boundingBox:'empty',shapes:[]}:
    Math.floor(p.y)===64?full:air
 assert.equal(verifyFlatFirstStep(door,candidate).ok,false)
})
test('never attempts a jump, vertical step, far target, or off-ground input',()=>{
 const b=fixture()
 const jumping={...candidate,waypoints:[{x:1,y:66,z:0}]}
 assert.equal(verifyFlatFirstStep(b,jumping).ok,false)
 const afar={...candidate,waypoints:[{x:5,y:65,z:0}]}
 assert.equal(verifyFlatFirstStep(b,afar).ok,false)
 b.entity.onGround=false
 assert.equal(verifyFlatFirstStep(b,candidate).ok,false)
})
test('bounded forward pulses use actual Bedrock input and never call local motion server proof',async()=>{
 const b=fixture(),controls=[]
 let active=false
 b.setControlState=(k,on)=>{controls.push([k,on]);active=on}
 let ticks=0
 const sleep=async()=>{
  ticks++
  if(active)b.entity.position=vec(b.entity.position.x+.2,65,.5)
 }
 const move={checkpoint:()=>({events:0,position:null}),
   progress:()=>({confirmed:false,reason:'no_two_server_positions'}),
   get:()=>({received:0,latestFeet:null})}
 const p=await probeFlatInput(b,candidate,{sleep,movementEvidence:move,maxPulses:5})
 assert.equal(p.attempted,true)
 assert(p.localEstimateBlocks>=.4)
 assert.equal(p.serverMovementVerified,false)
 assert.equal(p.ok,false)
 assert.equal(p.reason,'scout_local_movement_not_server_verified')
 assert(ticks<=5)
 assert.equal(active,false)
 assert.deepEqual(controls.at(-1),['forward',false])
})
test('no physics progress stops early rather than endlessly retrying the same blocked path',async()=>{
 const b=fixture(),controls=[]
 b.setControlState=(k,on)=>controls.push(on)
 const p=await probeFlatInput(b,candidate,{sleep:async()=>{},maxPulses:5})
 assert.equal(p.reason,'direct_flat_no_local_motion')
 assert(p.pulses<=3)
 assert.equal(p.serverMovementVerified,false)
 assert.equal(controls.at(-1),false)
})
test('STOP/safety cancellation prevents any new input and releases owned controls',async()=>{
 const b=fixture(),controls=[]
 b.setControlState=(k,on)=>controls.push(on)
 const pre=await probeFlatInput(b,candidate,{safe:()=>false})
 assert.equal(pre.attempted,false)
 assert.equal(controls.length,0)
 let allow=true
 const post=await probeFlatInput(b,candidate,{
  safe:()=>allow,sleep:async()=>{allow=false}
 })
 assert.equal(post.ok,false)
 assert.equal(post.reason,'direct_flat_preempted_safety_gate_denied')
 assert.equal(controls.at(-1),false)
})
test('a server-verified single step never certifies the rest of an untraveled multi-cell route',async()=>{
 const b=fixture();let held=false
 b.setControlState=(k,on)=>{held=on}
 const move={checkpoint:()=>({events:1,position:{x:.5,y:65,z:.5}}),
   progress:()=>({confirmed:true,reason:'server_position_changed',movedBlocks:1}),
   get:()=>({received:2,lastAt:1000,
     latestFeet:{x:1.5,y:65,z:.5}})}
 const p=await probeFlatInput(b,candidate,{clock:()=>1100,
   movementEvidence:move,sleep:async()=>{
     if(held)b.entity.position=vec(Math.min(b.entity.position.x+.25,1.5),65,.5)
   }})
 assert.equal(p.ok,true)
 assert.equal(p.serverMovementVerified,true)
 assert.equal(p.reason,'direct_flat_step_server_confirmed')
 assert.equal(held,false)
})

test('already reached first cell does not claim native input failure or send any keys',async()=>{
 const b=fixture(),input=[]
 b.entity.position=vec(1.5,65,.5)
 b.setControlState=(k,v)=>input.push([k,v])
 const result=await probeFlatInput(b,candidate,{sleep:async()=>{throw Error('must not pulse')}})
 assert.equal(result.reason,'direct_flat_first_waypoint_already_local')
 assert.equal(result.attempted,false)
 assert.equal(result.pulses,0)
 assert(!input.some(x=>x[1]===true))
})

test('select actual second waypoint when A* already reached the first voxel locally',()=>{
 const {selectFailedFlatStep}=require('../src/direct_flat_step.cjs')
 const a=selectFailedFlatStep(candidate,candidate.waypoints[1],vec(1.5,65,.5))
 assert.equal(a.ok,true)
 assert.equal(a.selectedIndex,1)
 assert.deepEqual(a.selectedWaypoint,candidate.waypoints[1])
 assert.equal(a.serverPositionVerified,false)
 assert.equal(a.candidate.waypoints.length,1)
})
test('only an adjacent failed waypoint may be probed; never skip unknown route prefix',()=>{
 const {selectFailedFlatStep}=require('../src/direct_flat_step.cjs')
 const far=selectFailedFlatStep(candidate,candidate.waypoints[1],vec(.5,65,.5))
 assert.equal(far.ok,false)
 assert.equal(far.reason,'direct_flat_failed_waypoint_not_adjacent')
 const bad=selectFailedFlatStep(candidate,{x:99,y:65,z:0},vec(1.5,65,.5))
 assert.equal(bad.reason,'direct_flat_failed_waypoint_not_in_route')
 const last=selectFailedFlatStep(candidate,candidate.waypoints[1],vec(2.5,65,.5))
 assert.equal(last.reason,'direct_flat_last_waypoint_already_local')
})
test('stateful doors block direct pulses with specific reason rather than anonymous unknown',async()=>{
 const b=fixture(),controls=[]
 b.entity.position=vec(1.5,65,.5)
 b.blockAt=p=>Math.floor(p.y)===65&&Math.floor(p.x)===2?
  {name:'oak_door',boundingBox:'empty',shapes:[]}:
  Math.floor(p.y)===64?full:air
 b.setControlState=(k,v)=>controls.push([k,v])
 const {selectFailedFlatStep}=require('../src/direct_flat_step.cjs')
 const selected=selectFailedFlatStep(candidate,candidate.waypoints[1],b.entity.position)
 assert.equal(selected.ok,true)
 const p=await probeFlatInput(b,selected.candidate)
 assert.equal(p.reason,'direct_flat_stateful_door')
 assert.equal(p.attempted,false)
 assert(!controls.some(v=>v[1]===true))
})
