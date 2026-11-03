'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {candidateOneBlockJump,performOneBlockJump}=require('../src/one_block_jump.cjs')
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}})
function scene({stepHeight=1,roof=false,unknown=false,partial=false,
 ground=true,occupant=false}={}){
 const events=[]
 const bot={
  game:{dimension:'overworld'},entities:occupant?{
    other:{name:'zombie',position:v(1.5,66,.5)}}:{},
  entity:{position:v(.5,65,.5),onGround:ground},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(unknown&&x===1)return null
   if(roof&&y===68)return {name:'stone',boundingBox:'block'}
   if(x===1&&z===0&&y===65&&stepHeight>=1)
     return {name:partial?'oak_stairs':'stone',boundingBox:'block'}
   if(x===1&&z===0&&y===66&&stepHeight>=2)
     return {name:'stone',boundingBox:'block'}
   if(y===64)return {name:'stone',boundingBox:'block'}
   return {name:'air',boundingBox:'empty'}
  },
  lookAt:async()=>{events.push(['look'])},
  setControlState:(key,state)=>{events.push([key,state])}
 }
 return {bot,events}
}
test('observes one FULL block rise and rejects non-adjacent claims',()=>{
 const f=scene()
 const plan=candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)})
 assert.equal(plan.ok,true)
 assert.equal(plan.action,'JUMP_UP')
 assert.deepEqual(plan.target,{x:1,y:66,z:0})
 assert.equal(plan.permitted,false)
 assert.equal(plan.serverMovementVerified,false)
})
test('empty-collision torch above takeoff or raised landing permits bounded jump only',async()=>{
 for(const [x,y,z] of [[0,66,0],[0,67,0],[0,68,0],[1,67,0],[1,68,0]]){
  const f=scene(),original=f.bot.blockAt
  f.bot.blockAt=p=>Math.floor(p.x)===x&&Math.floor(p.y)===y&&Math.floor(p.z)===z?
    {name:'torch',boundingBox:'empty',shapes:[]}:original(p)
  const plan=candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)})
  assert.equal(plan.ok,true,'empty torch '+[x,y,z])
  assert.equal(plan.serverMovementVerified,false)
  const moved=await performOneBlockJump(f.bot,plan,{safe:()=>true,sleep:async()=>{},pulses:1})
  assert.equal(moved.attempted,true)
  assert.equal(moved.serverMovementVerified,false)
  assert.equal(f.events.filter(e=>e[0]==='jump'&&e[1]).length,1)
 }
})
test('a blocking or untrusted torch shape cannot authorize any jump',()=>{
 for(const candidate of [
  {name:'torch',boundingBox:'block',shapes:[[0,0,0,1,1,1]]},
  {name:'torch',boundingBox:'empty',shapes:[[0,0,0,1,1,1]]},
  {name:'torch',boundingBox:'block',shapes:[]},
  {name:'unknown_decor',boundingBox:'empty',shapes:[]} ]){
  const f=scene(),original=f.bot.blockAt
  f.bot.blockAt=p=>Math.floor(p.x)===0&&Math.floor(p.y)===66&&Math.floor(p.z)===0?
    candidate:original(p)
  const plan=candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)})
  assert.equal(plan.ok,false,JSON.stringify(candidate))
  assert.equal(f.events.length,0)
 }
})
test('wooden door is not a step and Minecraft stairs are not a full-cube jump',()=>{
 for(const partial of [true]){
  const f=scene({partial})
  assert.equal(candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)}).ok,false)
 }
})
test('unknown blocks, missing headroom, two-block rise and no-ground stop',()=>{
 for(const kind of [{unknown:true},{roof:true},{stepHeight:2},{ground:false}]){
  const f=scene(kind)
  assert.equal(candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)}).ok,false,
   JSON.stringify(kind))
 }
})
test('known entity occupying elevated landing prevents jump',()=>{
 const f=scene({occupant:true})
 assert.equal(candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)}).ok,false)
})
test('bounded jump emits forward and jump only and releases even after abort',async()=>{
 const f=scene(),c=candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)})
 const res=await performOneBlockJump(f.bot,c,{
  safe:()=>true,sleep:async()=>{},pulses:2})
 assert.equal(res.ok,false)
 assert.equal(res.attempted,true)
 assert.equal(res.serverMovementVerified,false)
 assert.equal(res.reason,'jump_input_sent_endpoint_requires_new_bds_pair')
 assert.equal(f.events.filter(x=>x[0]==='jump'&&x[1]).length,1,
  'only one jump initiation even while still airborne')
 assert.equal(f.events.filter(x=>x[0]==='forward'&&x[1]).length,2)
 assert.deepEqual(f.events.slice(-2),[['forward',false],['jump',false]])
 const second=scene(),d=candidateOneBlockJump(second.bot,{toward:v(3.5,66,.5)})
 const signal={aborted:true}
 const denied=await performOneBlockJump(second.bot,d,{signal,safe:()=>true})
 assert.equal(denied.attempted,false)
 assert.equal(second.events.length,0)
})
test('airborne frames continue bounded forward carry without triggering a second jump',async()=>{
 const f=scene(),c=candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)})
 let count=0
 const result=await performOneBlockJump(f.bot,c,{pulses:4,safe:()=>true,
  sleep:async()=>{
   count++
   if(count===1){f.bot.entity.onGround=false;f.bot.entity.position=v(.8,65.6,.5)}
   else if(count===2){f.bot.entity.position=v(1.35,65.9,.5)}
   else {f.bot.entity.position=v(1.5,66,.5);f.bot.entity.onGround=true}
  }})
 assert.equal(result.attempted,true)
 assert.equal(result.serverMovementVerified,false)
 assert(count>=3,'must not end jump when onGround becomes false after takeoff')
 assert.equal(f.events.filter(x=>x[0]==='jump'&&x[1]).length,1)
 assert.deepEqual(f.events.slice(-2),[['forward',false],['jump',false]])
})
test('shape changing after planning stops before physical input',async()=>{
 const f=scene(),c=candidateOneBlockJump(f.bot,{toward:v(3.5,66,.5)})
 const original=f.bot.blockAt.bind(f.bot)
 f.bot.blockAt=p=>Math.floor(p.x)===1&&Math.floor(p.y)===65?
   {name:'oak_door',boundingBox:'block'}:original(p)
 const res=await performOneBlockJump(f.bot,c,{safe:()=>true})
 assert.equal(res.attempted,false)
 assert.equal(f.events.length,0)
})
