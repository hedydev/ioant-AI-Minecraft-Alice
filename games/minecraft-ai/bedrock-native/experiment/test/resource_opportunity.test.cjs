'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {observedNaturalTree,selectResourceStep}=require('../src/resource_opportunity.cjs')
const p=(x,y,z)=>({x,y,z,offset(dx,dy,dz){return p(x+dx,y+dy,z+dz)},
 distanceTo:q=>Math.hypot(x-q.x,y-q.y,z-q.z)})
const block=(name,x,y,z)=>({name,position:p(x,y,z),boundingBox:'block'})
const treeBot=(built=false)=>{
 const at=q=>{
  const x=Math.floor(q.x),y=Math.floor(q.y),z=Math.floor(q.z)
  if(built&&x===1&&y===65&&z===0)return block('oak_planks',x,y,z)
  if(x===0&&z===0&&y>=65&&y<=68)return block('oak_log',x,y,z)
  if(y>=68&&y<=70&&Math.abs(x)<=1&&Math.abs(z)<=1)
    return block('oak_leaves',x,y,z)
  return block(y<65?'dirt':'air',x,y,z)
 }
 return {entity:{position:p(.5,65,.5)},blockAt:at,
   findBlocks:()=>[p(0,65,0),p(0,66,0)]}
}
test('verified natural trunk + canopy permits only one resource goal',()=>{
 const scan=observedNaturalTree(treeBot())
 assert.equal(scan.ok,true)
 assert.equal(selectResourceStep({plan:'LEARN_WEAPON',wood:0,
   phase:'day',safeToExplore:true,tree:scan}).action,'gather_one_log')
})
test('player-built planks near trunk revoke autonomous logging authorization',()=>{
 const scan=observedNaturalTree(treeBot(true))
 assert.equal(scan.ok,false)
 assert.equal(scan.reason,'near_player_structure')
 assert.equal(selectResourceStep({plan:'LEARN_WEAPON',wood:0,
   phase:'day',safeToExplore:true,tree:scan}).action,'none')
})
test('unknown blocks and missing APIs do not justify digging',()=>{
 assert.equal(observedNaturalTree({}).ok,false)
 const bot=treeBot();bot.blockAt=()=>null
 assert.equal(observedNaturalTree(bot).ok,false)
})
test('inventory crafting is an actual task step and respects recipe cooldown',()=>{
 assert.equal(selectResourceStep({plan:'LEARN_WEAPON',wood:2,phase:'night'}).action,
   'craft_wooden_sword')
 assert.equal(selectResourceStep({plan:'LEARN_WEAPON',wood:2,
   craftDeferred:true}).reason,'craft_recipe_cooldown')
 assert.equal(selectResourceStep({plan:'LEARN_WEAPON',wood:2,hasWeapon:true}).action,'none')
})
test('no natural resources or night-time no material defers rather than modifying arbitrary blocks',()=>{
 assert.equal(selectResourceStep({plan:'LEARN_WEAPON',wood:0,phase:'night',
   tree:{ok:true},safeToExplore:false}).action,'none')
 assert.equal(selectResourceStep({plan:'LEARN_WEAPON',wood:0,phase:'day',
   tree:{ok:false},safeToExplore:true}).action,'none')
})
