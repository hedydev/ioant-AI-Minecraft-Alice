'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {planOpenDoorLane}=require('../src/door_lane.cjs')
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}})
const geometry={door:[-1261,98,655],from:[-1261,98,654]}
function fixture({x=-1260.546,doorShape=[0,0,0,.183,1,1],
  upperShape=doorShape,upperOpen=0,doorName='wooden_door'}={}){
 const reads=[]
 const bot={entity:{position:v(x,98,654.5),onGround:true},
  blockAt(p){
   reads.push([p.x,p.y,p.z])
   if(Math.floor(p.x)!==-1261||Math.floor(p.z)!==655||![98,99].includes(Math.floor(p.y)))
     return null
   const upper=Math.floor(p.y)===99
   return {name:doorName,boundingBox:'block',getProperties:()=>({
      open_bit:upper?upperOpen:1,upper_block_bit:upper?1:0}),
     shapes:upper?upperShape?[upperShape]:undefined:doorShape?[doorShape]:undefined}
  }}
 return {bot,reads}
}
test('actual Alice log 0.183 open-panel shape and x=-1260.546 produces a safe lane away from collision',()=>{
 const f=fixture(),r=planOpenDoorLane(f.bot,geometry)
 assert.equal(r.ok,true)
 assert.equal(r.axis,'x')
 assert(r.target>-1260.49&&r.target<-1260.35,JSON.stringify(r))
 assert(r.requiredShift>.08&&r.requiredShift<.25,JSON.stringify(r))
 assert(r.validMin>-1260.52,'avatar left boundary must clear open door leaf')
 assert.equal(r.worldModification,false)
 assert.equal(r.serverMovementVerified,false)
 assert.equal(f.reads.length,2,'observe both halves only')
})
test('upper open_bit false is not mistaken for a shut wooden door; upper is known',()=>{
 const r=planOpenDoorLane(fixture({upperOpen:0}).bot,geometry)
 assert.equal(r.ok,true)
})
test('wide door collision shape leaves insufficient room for player body, do not attempt to align',()=>{
 const r=planOpenDoorLane(fixture({doorShape:[0,0,0,.5,1,1],upperShape:[0,0,0,.5,1,1]}).bot,geometry)
 assert.equal(r.ok,false)
 assert.equal(r.reason,'door_lane_no_body_width_clearance')
})
test('unknown upper collision shape refuses guessed corrective movement',()=>{
 const r=planOpenDoorLane(fixture({upperShape:null}).bot,geometry)
 assert.equal(r.ok,false)
 assert.equal(r.reason,'door_lane_collision_shapes_unavailable')
})
test('known open panel along Z works for a door approached along X',()=>{
 const f=fixture()
 const bot={entity:{position:v(4.5,98,7.454),onGround:true},
   blockAt:p=>({name:'oak_door',getProperties:()=>({open_bit:Math.floor(p.y)===98?1:0,
      upper_block_bit:Math.floor(p.y)===99?1:0}),shapes:[[0,0,0,1,1,.183]]})}
 const r=planOpenDoorLane(bot,{door:[5,98,7],from:[4,98,7]})
 assert.equal(r.ok,true)
 assert.equal(r.axis,'z')
 assert(r.requiredShift>.08)
})
test('never mutate read-only shape arrays or issue controls',()=>{
 const shape=[0,0,0,.183,1,1],f=fixture({doorShape:shape})
 f.bot.setControlState=()=>{throw Error('must not move')}
 f.bot.activateBlock=()=>{throw Error('must not toggle')}
 planOpenDoorLane(f.bot,geometry)
 assert.deepEqual(shape,[0,0,0,.183,1,1])
})
