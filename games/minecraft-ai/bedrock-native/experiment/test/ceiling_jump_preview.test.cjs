'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {previewCeilingLimitedJump}=require('../src/jump_clearance_preview.cjs')
const {candidateOneBlockJump,performOneBlockJump}=require('../src/one_block_jump.cjs')
let deps=null
try{deps={...require('prismarine-physics'),Vec3:require('vec3').Vec3,
 registry:require('prismarine-registry')('bedrock_1.26.51')}}catch{}
function scene({roof=68,partial=false}={}){
 const {Vec3,registry}=deps,calls=[]
 const bot={registry,game:{dimension:'overworld'},entities:{},inventory:{slots:[]},
  jumpTicks:0,jumpQueued:false,fireworkRocketDuration:0,
  entity:{position:new Vec3(.5,65,.5),velocity:new Vec3(0,0,0),onGround:true,
    yaw:0,pitch:0,attributes:{},effects:{}},
  controlState:{forward:false,jump:false},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   const solid=y===64||y===roof||(x===1&&z===0&&y===65)
   return {name:solid?'stone':'air',type:registry.blocksByName[solid?'stone':'air'].id,
    position:new Vec3(x,y,z),boundingBox:solid?'block':'empty',
    shapes:solid?[partial&&y===roof?[0,.5,0,1,1,1]:[0,0,0,1,1,1]]:[],
    getProperties:()=>({})}
  },lookAt:async()=>{},setControlState:(...a)=>calls.push(a)}
 return{bot,calls}
}
test('real pinned Physics validates one-block landing under a verified three-cell ceiling without live mutation',
 {skip:!deps},()=>{
 const {bot,calls}=scene(),snapshot=JSON.stringify([bot.entity,bot.controlState])
 const out=previewCeilingLimitedJump(bot,{x:1,y:66,z:0})
 assert.equal(out.ok,true,JSON.stringify(out))
 assert.equal(out.ticks,20);assert(out.readBlocks<=120)
 assert.equal(JSON.stringify([bot.entity,bot.controlState]),snapshot);assert.deepEqual(calls,[])
 const candidate=candidateOneBlockJump(bot,{toward:{x:3.5,y:66,z:.5}})
 assert.equal(candidate.ok,true);assert.equal(candidate.ceilingLimited,true)
 assert.equal(candidate.serverMovementVerified,false)
})
test('low or partial roof remains blocked even with real Physics; no physical input',
 {skip:!deps},()=>{
 for(const opts of [{roof:67},{roof:68,partial:true}]){
  const {bot,calls}=scene(opts)
  assert.equal(candidateOneBlockJump(bot,{toward:{x:3.5,y:66,z:.5}}).ok,false)
  assert.deepEqual(calls,[])
 }
})
test('real Vec3 and initial velocity survive mid-air geometry rechecks',
 {skip:!deps},async()=>{
 const {bot,calls}=scene()
 const plan=candidateOneBlockJump(bot,{toward:{x:3.5,y:66,z:.5}})
 assert.equal(plan.ok,true)
 const res=await performOneBlockJump(bot,plan,{safe:()=>true,pulses:2,sleep:async()=>{
   bot.entity.onGround=false;bot.entity.velocity.y=.2
 }})
 assert.equal(res.attempted,true,JSON.stringify(res))
 assert.equal(calls.filter(a=>a[0]==='jump'&&a[1]===true).length,1)
 assert.equal(res.serverMovementVerified,false)
})
