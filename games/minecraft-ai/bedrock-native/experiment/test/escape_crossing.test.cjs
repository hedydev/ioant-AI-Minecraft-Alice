'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {validatePassageGeometry,validateCrossing,crossDoor}=require('../src/escape_crossing.cjs')
const vec=(x,y,z)=>({x,y,z,offset(a,b,c){return vec(x+a,y+b,z+c)}})
const Door={kind:'wooden_door',permitted:false,position:[0,65,1],
 approach:{position:[0,65,0],routeComplete:true,elevationChanges:0,
 steps:0,waypoints:[],serverVerified:false}}
function room({floor=true,outside=true,upper=true,open=true,move=true}={}){
 const events=[]
 let forward=false
 const bot={
  entity:{position:vec(.5,65,.5),eyeHeight:1.62,onGround:true},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x!==0||z<0||z>2)return {name:'stone_bricks',boundingBox:'block'}
   if(y===64)return {name:(z===2&&!floor)?'air':'oak_planks',
      boundingBox:(z===2&&!floor)?'empty':'block'}
   if(z===1&&y===65)return {name:'oak_door',boundingBox:'block',
    getProperties:()=>({open_bit:open?1:0,upper_block_bit:0})}
   if(z===1&&y===66)return upper?{name:'oak_door',boundingBox:'block',
    getProperties:()=>({open_bit:open?1:0,upper_block_bit:1})}:null
   if(z===2&&!outside)return null
   if(y===65||y===66)return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
  },
  lookAt:async p=>events.push(['look',p.x,p.y,p.z]),
  setControlState:(name,state)=>{events.push(['control',name,state]);if(name==='forward')forward=state},
  activateBlock:()=>events.push(['activate']),dig:()=>events.push(['dig']),
  placeBlock:()=>events.push(['place'])
 }
 const sleep=async()=>{
   if(forward&&move)bot.entity.position=vec(.5,65,bot.entity.position.z+.45)
 }
 return {bot,events,sleep,isForward:()=>forward}
}
const options=(f,extra={})=>({clock:()=>100000,sleep:f.sleep,...extra})
test('open lower and upper wooden door with known opposite safe cell is eligible',()=>{
 const f=room()
 assert.equal(validateCrossing(f.bot,Door).ok,true)
 assert.deepEqual(validateCrossing(f.bot,Door).beyond,[0,65,2])
})
test('crossing uses at most eight bounded forward pulses without pathfinder or door activation',async()=>{
 const f=room()
 const r=await crossDoor(f.bot,Door,options(f))
 assert.equal(r.ok,false,'client pose alone must never count as BDS passage')
 assert.equal(r.reason,'door_passage_local_only_server_unverified')
 assert.equal(r.attempted,true)
 assert(r.pulses>=1&&r.pulses<=8)
 assert.equal(f.events.some(e=>e[0]==='dig'||e[0]==='activate'||e[0]==='place'),false)
 assert.equal(f.events.some(e=>e[0]==='goto'),false)
 assert.equal(f.isForward(),false,'controls must be released')
 assert(f.events.some(e=>e[0]==='control'&&e[1]==='forward'&&e[2]===true))
})
test('fresh Bedrock server self-position near far side confirms door passage, not outdoors',async()=>{
 const f=room()
 const evidence={checkpoint:()=>({events:2}),progress:()=>({confirmed:true,reason:'server_position_changed'}),
 get:()=>({lastAt:99995,latestFeet:{x:.5,y:65,z:2.5}})}
 const r=await crossDoor(f.bot,Door,options(f,{movementEvidence:evidence}))
 assert.equal(r.ok,true)
 assert.equal(r.serverMovementVerified,true)
 assert.equal(r.reason,'door_passage_server_confirmed_room_exit_unverified')
})
test('missing or unsafe outside, unknown upper half, closed door all deny movement',async()=>{
 for(const args of [{floor:false},{outside:false},{upper:false},{open:false}]){
  const f=room(args)
  assert.equal(validateCrossing(f.bot,Door).ok,false)
  const r=await crossDoor(f.bot,Door,options(f))
  assert.equal(r.attempted,false)
  assert.equal(f.events.length,0)
 }
})
test('wrong side or unverified ground cannot trigger input',()=>{
 const f=room()
 f.bot.entity.position=vec(.5,65,2.5)
 assert.equal(validateCrossing(f.bot,Door).reason,'crossing_not_at_observed_door_side')
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=false
 assert.equal(validateCrossing(f.bot,Door).reason,'crossing_ground_or_position_unverified')
})
test('safety/STOP preemption stops before movement and never activates door',async()=>{
 const f=room()
 const r=await crossDoor(f.bot,Door,options(f,{safe:()=>({ok:false,reason:'hostile_threat_detected'})}))
 assert.equal(r.reason,'crossing_preempted:hostile_threat_detected')
 assert.equal(r.attempted,false)
 assert.equal(f.events.length,0)
})
test('stalled local physics refuses verified passage and stops all forward input',async()=>{
 const f=room({move:false})
 const evidence={checkpoint:()=>({events:1}),progress:()=>({confirmed:true}),
 get:()=>({lastAt:99995,latestFeet:{x:.5,y:65,z:2.5}})}
 const r=await crossDoor(f.bot,Door,options(f,{movementEvidence:evidence}))
 assert.equal(r.reason,'crossing_no_local_forward_progress')
 assert.equal(r.serverMovementVerified,false)
 assert.equal(f.isForward(),false)
 assert(r.pulses<=5)
})
test('mid-pulse human STOP immediately releases forward input',async()=>{
 const f=room()
 const controller=new AbortController()
 let pressed=false
 const result=await crossDoor(f.bot,Door,options(f,{signal:controller.signal,sleep:async()=>{
   if(!pressed){pressed=true;controller.abort()}
 }}))
 assert.equal(result.ok,false)
 assert.match(result.reason,/crossing_aborted/)
 assert.equal(f.isForward(),false)
})

test('door geometry can be checked before approaching; known blocked exit cannot cause motion',async()=>{
 const blocked=room({outside:false})
 blocked.bot.entity.position=vec(.5,65,-.5)
 const verdict=validatePassageGeometry(blocked.bot,Door)
 assert.equal(verdict.ok,false)
 assert.equal(verdict.reason,'crossing_opposite_side_blocked_or_unknown')
 assert.equal(blocked.events.length,0,'topology preflight is read-only')
 const clear=room()
 clear.bot.entity.position=vec(.5,65,-.5)
 assert.equal(validatePassageGeometry(clear.bot,Door).ok,true,
   'safe opposite terrain can be assessed without yet standing at the doorway')
 assert.equal(validateCrossing(clear.bot,Door).reason,'crossing_not_at_observed_door_side',
   'actual crossing still requires Alice to reach the adjacent door cell first')
})

test('real-log narrow open door aligns off-axis body before forward crossing without modifying blocks',async()=>{
 const f=room()
 f.bot.entity.position=vec(.454,65,.5) // real log: x=-1260.546 -> local .454
 let heading='south',digged=0,clicked=0
 const oldBlock=f.bot.blockAt.bind(f.bot)
 f.bot.blockAt=p=>{
   const b=oldBlock(p),y=Math.floor(p.y),z=Math.floor(p.z)
   if(z===1&&[65,66].includes(y)&&b?.name==='oak_door')
     return {...b,shapes:[[0,0,0,.183,1,1]]}
   return b
 }
 f.bot.lookAt=async target=>{
   const p=f.bot.entity.position
   heading=Math.abs(target.x-p.x)>Math.abs(target.z-p.z)?'east':'south'
   f.events.push(['look-direction',heading])
 }
 f.bot.dig=()=>{digged++}
 f.bot.activateBlock=()=>{clicked++}
 const physicalSleep=async()=>{
   if(!f.isForward())return
   const p=f.bot.entity.position
   if(heading==='east')f.bot.entity.position=vec(p.x+.1,65,p.z)
   else if(p.x>=.48)f.bot.entity.position=vec(p.x,65,p.z+.45)
   // A 0.6-wide player at x=.454 intersects the .183-thick door shape.
 }
 const r=await crossDoor(f.bot,Door,options(f,{sleep:physicalSleep}))
 assert.equal(r.reason,'door_passage_local_only_server_unverified')
 assert.equal(r.ok,false,'position estimate is still NOT BDS validation')
 assert.equal(r.doorLane.aligned,true)
 assert(r.doorLane.alignmentPulses>=1&&r.doorLane.alignmentPulses<=4)
 assert.deepEqual(f.events.filter(e=>e[0]==='look-direction').map(e=>e[1]),['east','south'])
 assert.equal(f.isForward(),false)
 assert.equal(digged,0)
 assert.equal(clicked,0)
})
test('mid-sidestep human stop cancels movement before any door crossing input',async()=>{
 const f=room(),controller=new AbortController()
 f.bot.entity.position=vec(.454,65,.5)
 const oldBlock=f.bot.blockAt.bind(f.bot)
 f.bot.blockAt=p=>{
   const b=oldBlock(p)
   return b?.name==='oak_door'?{...b,shapes:[[0,0,0,.183,1,1]]}:b
 }
 const r=await crossDoor(f.bot,Door,options(f,{signal:controller.signal,
   sleep:async()=>controller.abort()}))
 assert.match(r.reason,/crossing_aborted/)
 assert.equal(r.doorLane.alignmentPulses,1)
 assert.equal(r.pulses,0,'STOP before door-axis forward motion')
 assert.equal(f.isForward(),false)
})

test('known open-door collision that cannot fit body stops BEFORE any movement input',async()=>{
 const f=room(),oldBlock=f.bot.blockAt.bind(f.bot)
 f.bot.blockAt=p=>{
   const b=oldBlock(p)
   return b?.name==='oak_door'?{...b,shapes:[[0,0,0,.55,1,1]]}:b
 }
 const r=await crossDoor(f.bot,Door,options(f))
 assert.equal(r.reason,'crossing_collision_lane_blocked')
 assert.equal(r.attempted,false)
 assert.equal(r.pulses,0)
 assert.equal(r.doorLane.reason,'door_lane_no_body_width_clearance')
 assert.equal(f.isForward(),false)
 assert(!f.events.some(e=>e[0]==='look'||e[0]==='activate'||e[0]==='dig'))
})
