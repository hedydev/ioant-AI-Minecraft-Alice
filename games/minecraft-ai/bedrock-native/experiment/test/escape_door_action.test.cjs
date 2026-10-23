'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {surveyEscape}=require('../src/escape_survey.cjs')
const {planDoorOpen,attemptDoorOpen}=require('../src/escape_door_action.cjs')
const pos=(x,y,z)=>({x,y,z,offset(a,b,c){return pos(x+a,y+b,z+c)}})
function room({doorProps={open_bit:false,upper_block_bit:false},cancelled=false}={}){
 let activation=0,open=false,digs=0,looked=0
 const floor={name:'oak_planks',boundingBox:'block'}
 const air={name:'air',boundingBox:'empty'}
 const wall={name:'stone_bricks',boundingBox:'block'}
 const bot={entity:{position:pos(.5,65,.5),onGround:true},entities:{},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)return {name:'oak_door',boundingBox:'block',
     position:pos(x,y,z),getProperties:()=>({...doorProps,open_bit:open||doorProps.open_bit})}
   if(y===64&&Math.abs(x)<=1&&Math.abs(z)<=1)return floor
   if(y>=65&&y<=66&&Math.abs(x)<=1&&Math.abs(z)<=1)return air
   return wall
  },
  lookAt:async()=>{looked++},
  activateBlock:async()=>{activation++;open=true},
  dig(){digs++},
  placeBlock(){digs++},
  setControlState(){digs++}
 }
 return {bot,survey:()=>surveyEscape(bot,{radius:4}),counts:()=>({activation,open,digs,looked})}
}
test('closed Bedrock wooden door can be opened exactly once, without moving or digging',async()=>{
 const f=room(),s=f.survey()
 assert.equal(s.status,'door_interaction_candidate')
 assert.equal(planDoorOpen(f.bot,s).ok,true)
 const done=await attemptDoorOpen(f.bot,s,{sleep:async()=>{}})
 assert.equal(done.ok,true)
 assert.equal(done.reason,'door_open_observed_exit_unverified')
 assert.equal(done.serverMovementVerified,false)
 assert.equal(f.counts().activation,1)
 assert.equal(f.counts().digs,0)
 assert.equal(planDoorOpen(f.bot,s).reason,'door_already_open')
})
test('unknown Bedrock open_bit cannot trigger interaction',async()=>{
 const f=room({doorProps:{upper_block_bit:false}}),s=f.survey()
 // Explicitly preserve a missing open_bit, rather than converting unknown to false.
 const original=f.bot.blockAt
 f.bot.blockAt=p=>{
  const b=original(p)
  if(b.name==='oak_door')b.getProperties=()=>({upper_block_bit:false})
  return b
 }
 assert.equal(planDoorOpen(f.bot,s).reason,'door_open_bit_unverified')
 assert.equal((await attemptDoorOpen(f.bot,s)).attempted,false)
 assert.equal(f.counts().activation,0)
})
test('survey must supply complete short, level, connected approach',()=>{
 const f=room(),s=f.survey(),d=s.doorCandidates[0]
 assert.equal(planDoorOpen(f.bot,{doorCandidates:[{...d,
   approach:{...d.approach,routeComplete:false}}]}).ok,false)
 assert.equal(planDoorOpen(f.bot,{doorCandidates:[{...d,
   approach:{...d.approach,waypoints:[[3,65,0]]}}]}).ok,false)
 assert.equal(f.counts().activation,0)
})
test('STOP or safety preemption before actuation does nothing',async()=>{
 const f=room(),s=f.survey()
 const r=await attemptDoorOpen(f.bot,s,{safe:()=>false})
 assert.equal(r.reason,'door_action_preempted')
 assert.equal(f.counts().activation,0)
 assert.equal(f.counts().digs,0)
})
test('activation without updated block state is not reported as success',async()=>{
 const f=room(),s=f.survey()
 const original=f.bot.blockAt
 f.bot.blockAt=p=>{
  const b=original(p)
  if(b.name==='oak_door')b.getProperties=()=>({open_bit:false,upper_block_bit:false})
  return b
 }
 const r=await attemptDoorOpen(f.bot,s,{sleep:async()=>{}})
 assert.equal(r.reason,'door_state_change_not_observed')
 assert.equal(r.ok,false)
 assert.equal(r.attempted,true)
 assert.equal(f.counts().activation,1)
 assert.equal(f.counts().digs,0)
})

test('Bedrock numeric 0/1 lower-door bits allow exactly one interaction and confirm numeric open',async()=>{
 const f=room({doorProps:{open_bit:0,upper_block_bit:0}})
 const original=f.bot.blockAt
 f.bot.blockAt=p=>{
   const b=original(p)
   if(b.name==='oak_door')b.getProperties=()=>({
     open_bit:f.counts().open?1:0,upper_block_bit:0})
   return b
 }
 const observed=f.survey()
 assert.equal(planDoorOpen(f.bot,observed).ok,true)
 const result=await attemptDoorOpen(f.bot,observed,{sleep:async()=>{}})
 assert.equal(result.ok,true)
 assert.equal(result.openObserved,true)
 assert.equal(result.stateFormat.openBit,'integer_bit')
 assert.equal(result.stateFormat.upperBit,'integer_bit')
 assert.equal(result.serverMovementVerified,false)
 assert.equal(f.counts().activation,1)
 assert.equal(f.counts().digs,0)
 assert.equal(planDoorOpen(f.bot,observed).reason,'door_already_open')
})
test('numeric Bedrock upper half must never be activated',async()=>{
 const f=room({doorProps:{open_bit:0,upper_block_bit:1}})
 const s=f.survey()
 const gate=planDoorOpen(f.bot,s)
 assert.equal(gate.reason,'door_upper_half_unverified')
 assert.equal((await attemptDoorOpen(f.bot,s)).attempted,false)
 assert.equal(f.counts().activation,0)
})
test('unknown upper door bit cannot be assumed to mean bottom half',async()=>{
 const f=room({doorProps:{open_bit:0}})
 const s=f.survey()
 const gate=planDoorOpen(f.bot,s)
 assert.equal(gate.reason,'door_upper_bit_unverified')
 assert.equal(gate.stateFormat.upperBit,'missing')
 assert.equal((await attemptDoorOpen(f.bot,s)).attempted,false)
 assert.equal(f.counts().activation,0)
})
test('Bedrock bit strings are not silently coerced to known closed state',async()=>{
 const f=room({doorProps:{open_bit:'0',upper_block_bit:0}})
 const s=f.survey()
 const gate=planDoorOpen(f.bot,s)
 assert.equal(gate.reason,'door_open_bit_unverified')
 assert.equal(gate.stateFormat.openBit,'unsupported')
 assert.equal((await attemptDoorOpen(f.bot,s)).attempted,false)
 assert.equal(f.counts().activation,0)
})
