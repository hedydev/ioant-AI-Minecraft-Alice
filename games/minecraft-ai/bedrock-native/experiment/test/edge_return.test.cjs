'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {selectEdgeReturn,performEdgeReturn}=require('../src/edge_return.cjs')
const V=(x,y,z)=>({x,y,z,offset(a,b,c){return V(x+a,y+b,z+c)},clone(){return V(x,y,z)}})
const full={name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
const air={name:'air',boundingBox:'empty',shapes:[]}
const hazard={name:'lava',boundingBox:'empty',shapes:[]}
function edge({ground=true,ledge=true,roof=true,headBlock=false,unknown=false,
 occupied=false,blockedFloor=false,water=false}={}){
 const signals=[],bot={game:{dimension:'overworld'},
  entity:{id:7,onGround:ground,eyeHeight:1.62,position:V(.11,65,.60)},
  entities:occupied?{other:{id:8,name:'villager',position:V(-.5,65,.5)}}:{},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(unknown&&x===-1&&z===0)return null
   if(y===64){
    if(x===-1&&z===0)return blockedFloor?air:water?hazard:full
    if(!ledge&&x===0&&z===0)return full
   }
   if(y===66&&x===-1&&z===0&&headBlock)return full
   if(y===67&&roof)return full
   return air
  },lookAt:async()=>{},setControlState:(k,v)=>signals.push([k,v])
 }
 return {bot,signals}
}
const toward={x:-4,y:65,z:-5}
test('3/9 Bedrock grounded edge can identify only a full west floor candidate',()=>{
 const {bot,signals}=edge(),c=selectEdgeReturn(bot,{toward})
 assert.equal(c.ok,true)
 assert.equal(c.action,'EDGE_RETURN')
 assert.deepEqual(c.target,{x:-1,y:65,z:0})
 assert.equal(c.sampledContacts.start,3)
 assert.equal(c.sampledContacts.min,3)
 assert.equal(c.sampledContacts.end,9)
 assert(c.sampledContacts.samples>=8)
 assert.equal(c.permitted,false)
 assert.equal(c.serverMovementVerified,false)
 assert.equal(c.bdsOriginVerified,false)
 assert.equal(signals.length,0)
})
test('unknown, unsupported, ungrounded, hazard, wall, entity or full floor do not qualify',()=>{
 for(const opts of [{ground:false},{ledge:false},{headBlock:true},
  {unknown:true},{blockedFloor:true},{water:true},{occupied:true}]){
  const {bot,signals}=edge(opts)
  const q=selectEdgeReturn(bot,{toward})
  assert.equal(q.ok,false,JSON.stringify(opts))
  assert.equal(signals.length,0)
 }
})
test('ceiling in the THIRD body-height cell does not prohibit flat WALK',()=>{
 const {bot}=edge({roof:true})
 assert.equal(selectEdgeReturn(bot).ok,true)
})
test('never send physical input without fresh external safety approval',async()=>{
 const {bot,signals}=edge(),candidate=selectEdgeReturn(bot)
 const r=await performEdgeReturn(bot,candidate,{safe:()=>false})
 assert.equal(r.attempted,false)
 assert.equal(r.serverMovementVerified,false)
 assert.deepEqual(signals,[])
})
test('a bounded local motion can never impersonate a BDS-confirmed endpoint',async()=>{
 const {bot,signals}=edge(),candidate=selectEdgeReturn(bot)
 let walking=false
 bot.setControlState=(k,v)=>{signals.push([k,v]);walking=v}
 const r=await performEdgeReturn(bot,candidate,{safe:()=>true,
  pulseMs:75,maxPulses:4,
  sleep:async()=>{if(walking){const p=bot.entity.position;bot.entity.position=V(p.x-.22,65,.60)}}})
 assert.equal(r.attempted,true)
 assert.equal(r.serverMovementVerified,false)
 assert.equal(r.ok,false)
 assert.equal(signals.at(-1)[1],false)
 assert(signals.filter(([k,v])=>k==='forward'&&v).length<=4)
 assert(Math.abs(bot.entity.position.x-.11)<=1)
})
test('prototype-owned blockAt survives each in-flight original-geometry recheck',async()=>{
 const {bot,signals}=edge()
 const original=bot.blockAt
 delete bot.blockAt
 Object.setPrototypeOf(bot,{blockAt:original})
 const plan=selectEdgeReturn(bot)
 assert.equal(plan.ok,true)
 let moving=false
 bot.setControlState=(k,v)=>{signals.push([k,v]);moving=v}
 const answer=await performEdgeReturn(bot,plan,{safe:()=>true,maxPulses:4,
  sleep:async()=>{if(moving){const p=bot.entity.position;bot.entity.position=V(p.x-.22,65,.60)}}})
 assert.equal(answer.attempted,true)
 assert.equal(answer.reason,'edge_input_sent_independent_endpoint_required')
 assert.equal(answer.serverMovementVerified,false)
 assert.deepEqual(signals.at(-1),['forward',false])
})
test('the returned plan is not reusable after any source geometry change',async()=>{
 const {bot,signals}=edge(),candidate=selectEdgeReturn(bot)
 bot.blockAt=()=>air
 const r=await performEdgeReturn(bot,candidate,{safe:()=>true})
 assert.equal(r.attempted,false)
 assert.equal(r.serverMovementVerified,false)
 assert.equal(signals.length,0)
})
