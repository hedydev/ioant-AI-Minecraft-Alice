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
   if(y===64)return {name:'stone',boundingBox:'block'}
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
