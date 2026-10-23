'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {evaluateShelter,placeShelterBlock,blueprint}=require('../src/night_shelter.cjs')
class Vec{
 constructor(x,y,z){this.x=x;this.y=y;this.z=z}
 offset(x,y,z){return new Vec(this.x+x,this.y+y,this.z+z)}
 minus(o){return new Vec(this.x-o.x,this.y-o.y,this.z-o.z)}
}
function world({material='dirt',count=30}={}){
 let now=100000
 const cells=new Map(),inventory=[{name:material,count}]
 const key=p=>[Math.round(p.x),Math.round(p.y),Math.round(p.z)].join(',')
 const set=(x,y,z,name)=>cells.set([x,y,z].join(','),name)
 const get=p=>cells.has(key(p))?cells.get(key(p)):(Math.round(p.y)===63?'grass_block':'air')
 const bot={entity:{position:new Vec(.5,64,.5)},game:{dimension:'overworld'},
   inventory:{items:()=>inventory},
   blockAt(p){const name=get(p);return {name,boundingBox:name==='air'?'empty':'block',
     position:new Vec(Math.round(p.x),Math.round(p.y),Math.round(p.z))}},
   async equip(){},
   async placeBlock(reference,face){
     const target=reference.position.offset(face.x,face.y,face.z)
     const hand=inventory.find(i=>i.count>0)
     if(!hand)throw Error('missing')
     set(target.x,target.y,target.z,hand.name)
     if(hand.name.endsWith('_door'))set(target.x,target.y+1,target.z,hand.name)
     hand.count--
   }}
 return {bot,set,inventory,now}
}
test('night shelter sees candidate on observed natural ground, only one placeable tile',()=>{
 const {bot}=world()
 const p=evaluateShelter(bot)
 assert.equal(p.status,'placement_candidate')
 assert.equal(p.material,'dirt')
 assert.equal(p.blocksRequired,24)
 assert.equal(p.remaining,24)
 assert.equal(p.candidate.part,'wall')
 assert.equal(blueprint(0,64,0).length,23)
 assert(!blueprint(0,64,0).some(x=>x.x===0&&x.z===-1&&x.y<66),
   'must not seal the only exit when missing a door')
})
test('night shelter cannot modify a building, unloaded earth, or empty inventory',()=>{
 const x=world();x.set(2,64,0,'chest')
 assert.equal(evaluateShelter(x.bot).reason,'shelter_existing_structure_nearby')
 const y=world({count:0})
 assert.equal(evaluateShelter(y.bot).reason,'shelter_materials_missing')
 const z=world();z.set(-1,64,-1,'oak_planks')
 assert.equal(evaluateShelter(z.bot).reason,'shelter_footprint_obstructed')
})
test('missing authoritative BDS self-position refuses even one shelter block',async()=>{
 const w=world(),proposal=evaluateShelter(w.bot)
 let called=0
 w.bot.placeBlock=async()=>{called++}
 const result=await placeShelterBlock(w.bot,proposal,{
  safe:()=>true,clock:()=>100000,evidence:{get:()=>({
   lastAt:null,received:0,latestFeet:null})}
 })
 assert.equal(result.ok,false)
 assert.equal(result.reason,'no_fresh_authoritative_self_position')
 assert.equal(called,0)
 assert.equal(w.inventory[0].count,30)
})
test('one trusted placement requires fresh geometry, consumes inventory and verifies actual block',async()=>{
 const w=world(),proposal=evaluateShelter(w.bot)
 const evidence={get:()=>({latestFeet:new Vec(.5,64,.5),lastAt:99950,received:2})}
 const result=await placeShelterBlock(w.bot,proposal,{
  safe:()=>true,clock:()=>100000,evidence,sleep:async()=>{}
 })
 assert.equal(result.ok,true)
 assert.equal(result.worldModificationVerified,true)
 assert.equal(result.serverMovementVerified,false)
 assert.equal(result.remaining,23)
 assert.equal(w.inventory[0].count,29)
 assert.equal(evaluateShelter(w.bot).remaining,23)
})
test('shelter framing is not reported as a safe house without a verified closable entrance',()=>{
 const w=world({count:0})
 for(const b of blueprint(0,64,0))w.set(b.x,b.y,b.z,'dirt')
 assert.equal(evaluateShelter(w.bot).reason,'shelter_door_material_missing')
 w.inventory.push({name:'oak_door',count:1})
 assert.equal(evaluateShelter(w.bot).candidate.part,'door')
 w.set(0,64,-1,'oak_door');w.set(0,65,-1,'oak_door')
 assert.equal(evaluateShelter(w.bot).reason,'shelter_door_open_state_unverified')
 assert.equal(evaluateShelter(w.bot).status,'frame_with_door_observed')
})

test('after the 23-block frame a door is placed once and remains unverified as closed',async()=>{
 const w=world({count:0})
 for(const block of blueprint(0,64,0))w.set(block.x,block.y,block.z,'dirt')
 w.inventory.push({name:'oak_door',count:1})
 const proposal=evaluateShelter(w.bot)
 assert.equal(proposal.material,'oak_door')
 assert.equal(proposal.candidate.part,'door')
 const result=await placeShelterBlock(w.bot,proposal,{clock:()=>100000,safe:()=>true,
   evidence:{get:()=>({latestFeet:new Vec(.5,64,.5),lastAt:99950,received:2})},
   sleep:async()=>{}})
 assert.equal(result.ok,true)
 assert.equal(result.part,'door')
 assert.equal(result.worldModificationVerified,true)
 assert.equal(w.inventory[1].count,0)
 const after=evaluateShelter(w.bot)
 assert.equal(after.status,'frame_with_door_observed')
 assert.equal(after.reason,'shelter_door_open_state_unverified',
   'observed Bedrock door halves are not proof of an actually closed, safe home')
})
