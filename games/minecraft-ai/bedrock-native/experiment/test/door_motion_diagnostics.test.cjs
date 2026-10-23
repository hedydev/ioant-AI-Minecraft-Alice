'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {createDoorMotionProbe,blockSummary}=require('../src/door_motion_diagnostics.cjs')
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}})
function fixture(){
 const bot=new EventEmitter()
 bot.physicsEnabled=true
 bot.entity={position:v(.5,65,.5),onGround:true,yaw:Math.PI,
   velocity:v(0,0,0),isCollidedHorizontally:false}
 let held=false
 bot.getControlState=key=>key==='forward'&&held
 bot.blockAt=p=>Math.floor(p.z)===1&&[65,66].includes(Math.floor(p.y))?
   {name:'oak_door',boundingBox:'block',getProperties:()=>({
     open_bit:1,upper_block_bit:Math.floor(p.y)===66?1:0}),
     shapes:[[0,0,0,.1875,1,1]]}:null
 let received=1
 const evidence={get:()=>({received,latestFeet:{x:.5,y:65,z:.5},
   lastAt:99900,lastSource:'correct_player_move_prediction'})}
 const probe=createDoorMotionProbe(bot,[0,65,1],evidence,{clock:()=>100000})
 return {bot,probe,hold:x=>{held=x},serverPackets:x=>{received=x}}
}
test('reports passive collision, tick/forward state, door shapes and server correction separately',()=>{
 const f=fixture()
 f.hold(true)
 f.bot.entity.isCollidedHorizontally=true
 f.bot.emit('physicsTick')
 f.bot.emit('physicsTick')
 f.serverPackets(2)
 f.hold(false)
 const result=f.probe.finish('crossing_no_local_forward_progress')
 assert.equal(result.physicsTicks,2)
 assert.equal(result.forwardPhysicsTicks,2)
 assert.equal(result.horizontalCollisionTicks,2)
 assert.equal(result.doorInitially.lower.open,true)
 assert.equal(result.doorInitially.upper.upper,true)
 assert.deepEqual(result.doorInitially.lower.shapes,[[0,0,0,.188,1,1]])
 assert.equal(result.serverPacketCountDelta,1)
 assert.equal(result.serverPositionIsNotAssumedFromClient,true)
 assert.equal(result.localMoved,0)
 assert.equal(f.bot.listenerCount('physicsTick'),0)
 assert.equal(f.probe.finish('finished_twice'),null)
})
test('handles missing server packets, physics and geometry without invented evidence',()=>{
 const bot=new EventEmitter()
 bot.entity={position:v(.5,65,.5),onGround:true}
 bot.blockAt=()=>null
 const probe=createDoorMotionProbe(bot,[0,65,1],null,{clock:()=>100000})
 const result=probe.finish('crossing_no_local_forward_progress')
 assert.equal(result.serverPacketCountDelta,null)
 assert.equal(result.serverPositionFinal,null)
 assert.equal(result.doorInitially.lower.open,null)
 assert.equal(result.physicsTicks,0)
 assert.equal(result.physicsEnabled,false)
 assert.equal(bot.listenerCount('physicsTick'),0)
})
test('does not modify world blocks or drive controls',()=>{
 const f=fixture(),events=[]
 f.bot.setControlState=()=>events.push('input')
 f.bot.dig=()=>events.push('dig')
 f.bot.activateBlock=()=>events.push('click')
 f.bot.blockAt=(p=>{events.push('read');return null})
 const d=f.probe.finish('crossing_no_local_forward_progress')
 assert.equal(d.doorFinally.lower.name,'unknown')
 assert.deepEqual([...new Set(events)],['read'])
})
