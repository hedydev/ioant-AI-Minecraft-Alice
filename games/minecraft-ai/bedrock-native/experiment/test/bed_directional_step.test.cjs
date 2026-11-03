'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {selectDirectionalBedStep}=require('../src/bed_directional_step.cjs')
const V=(x,y,z)=>({x,y,z,offset(a,b,c){return V(x+a,y+b,z+c)}})
function world({obstacle=null}={}){
 const bot={game:{dimension:'overworld'},
  entity:{position:V(.5,65,.5),onGround:true},entities:{},
  blockAt:p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(obstacle&&x===1&&y===65&&z===0)
     return {name:obstacle,boundingBox:'block'}
   if(y===64)return {name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
   return {name:'air',boundingBox:'empty'}
  }}
 return bot
}
const bed={x:14,y:65,z:0}
test('distant loaded bed may only suggest a SINGLE horizontal adjacent voxel',()=>{
 const r=selectDirectionalBedStep(world(),bed)
 assert.equal(r.ok,true)
 assert.deepEqual(r.first,[1,65,0])
 assert.equal(r.permitted,false)
 assert.equal(r.serverVerified,false)
 assert.equal(r.destinationBedReached,false)
})
test('solid wall or closed wooden door does not become a guessed route',()=>{
 for(const name of ['stone','spruce_door','oak_stairs','oak_trapdoor']){
  const r=selectDirectionalBedStep(world({obstacle:name}),bed)
  assert.equal(r.ok,false,name)
 }
})
test('hostile or nearby player occupying first safe cell blocks the step',()=>{
 const bot=world()
 bot.entities.zombie={position:V(1.5,65,.5),name:'zombie'}
 assert.equal(selectDirectionalBedStep(bot,bed).ok,false)
})
test('real Bedrock self entry cannot obstruct its own bedward step',()=>{
 const bot=world()
 bot.entity.id=17
 bot.entities[17]=bot.entity
 assert.deepEqual(selectDirectionalBedStep(bot,bed).first,[1,65,0])
 // Identity can also be mirrored as another object by an adapter.
 bot.entities[17]={...bot.entity}
 assert.equal(selectDirectionalBedStep(bot,bed).ok,true)
 bot.entities.other={id:18,name:'player',position:V(1.5,65,.5)}
 assert.equal(selectDirectionalBedStep(bot,bed).ok,false)
})
test('unknown floor, airborne, vertical or wrong dimension never authorize movement',()=>{
 const bot=world()
 bot.entity.onGround=false
 assert.equal(selectDirectionalBedStep(bot,bed).ok,false)
 bot.entity.onGround=true
 bot.game.dimension='nether'
 assert.equal(selectDirectionalBedStep(bot,bed).ok,false)
 bot.game.dimension='overworld'
 bot.blockAt=()=>null
 assert.equal(selectDirectionalBedStep(bot,bed).ok,false)
})
test('one-cell search never invents a distant or unloaded bed destination',()=>{
 const bot=world()
 assert.equal(selectDirectionalBedStep(bot,{x:40,y:65,z:0}).ok,false)
 assert.equal(selectDirectionalBedStep(bot,{x:NaN,y:65,z:0}).ok,false)
})

test('non-colliding wall torch beneath low roof does not veto one flat WALK',()=>{
 const bot=world(),original=bot.blockAt
 bot.blockAt=p=>{
  const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
  if(y===67&&x===0&&[-1,0].includes(z))
    return {name:'cobblestone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
  if(y===66&&x===0&&[-1,0].includes(z))
    return {name:'torch',boundingBox:'empty',shapes:[]}
  return original(p)
 }
 const r=selectDirectionalBedStep(bot,{x:0,y:65,z:-14})
 assert.equal(r.ok,true)
 assert.deepEqual(r.first,[0,65,-1])
 assert.equal(r.serverVerified,false)
})

test('unknown torch collision geometry and truly solid head block both fail closed',()=>{
 for(const head of [
  {name:'torch',boundingBox:'block'},
  {name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
 ]){
  const bot=world(),original=bot.blockAt
  bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===0&&[-1,0].includes(z)&&y===66)return head
   return original(p)
  }
  const r=selectDirectionalBedStep(bot,{x:0,y:65,z:-14})
  assert.equal(r.ok,false)
 }
})
