'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {surveyVoxelActions}=require('../src/voxel_actions.cjs')
const {pickVerticalStep,assessEarthwork,serverPositionProof,executeEarthwork}=
 require('../src/terrain_adaptation.cjs')
const at=(x,y,z)=>({x,y,z,
 offset(dx,dy,dz){return at(x+dx,y+dy,z+dz)},
 minus(p){return at(x-p.x,y-p.y,z-p.z)},
 clone(){return at(x,y,z)}})
const full=(name='grass_block',pos)=>({name,boundingBox:'block',
 shapes:[[0,0,0,1,1,1]],position:pos})
const air=pos=>({name:'air',boundingBox:'empty',shapes:[],position:pos})
function fixture({up=false,down=false,gap=false,soil=false,built=false,unknown=false}={}){
 const blocks=new Map()
 const f={entity:{onGround:true,position:at(.5,65,.5)},inventory:{items:()=>f.items.map(x=>({...x}))},
  items:[{name:'cobblestone',count:3}],
  blockAt(q){
   const x=Math.floor(q.x),y=Math.floor(q.y),z=Math.floor(q.z),key=[x,y,z].join(',')
   if(blocks.has(key))return blocks.get(key)
   if(unknown&&x===2&&z===2)return null
   if(built&&x===-1&&z===-1&&y===64)return full('oak_planks',at(x,y,z))
   if(soil&&x===1&&z===0&&y===65)return full('dirt',at(x,y,z))
   if(up&&x===1&&z===0&&y===65)return full('stone',at(x,y,z))
   if(down&&x===1&&z===0&&y===64)return air(at(x,y,z))
   if(gap&&x===1&&z===0&&(y===64||y===63))return air(at(x,y,z))
   const cutoff=(down&&x===1&&z===0)?64:(gap&&x===1&&z===0)?63:65
   return y<cutoff?full('grass_block',at(x,y,z)):air(at(x,y,z))
  },
  _blocks:blocks
 }
 return f
}
const ready=(bot,age=0)=>({get:()=>({latestFeet:{x:bot.entity.position.x,
 y:bot.entity.position.y,z:bot.entity.position.z},lastAt:10000-age,received:2})})
test('collision-checked rise chooses one JUMP_UP, not an automatic dig',()=>{
 const bot=fixture({up:true}),survey=surveyVoxelActions(bot,{radius:3})
 const result=pickVerticalStep(survey,{origin:bot.entity.position})
 assert.equal(result.candidate?.action,'JUMP_UP')
 assert.equal(result.candidate.waypoints.length,1)
 assert.equal(result.candidate.elevationChanges,1)
})
test('one-block descent is permitted but no drop beyond one level',()=>{
 const bot=fixture({down:true}),survey=surveyVoxelActions(bot,{radius:3})
 assert.equal(pickVerticalStep(survey,{origin:bot.entity.position}).candidate?.action,'STEP_DOWN')
 const bogus={status:'route_candidate',verticalOptions:[{action:'STEP_DOWN',target:[1,63,0]}]}
 assert.equal(pickVerticalStep(bogus,{origin:bot.entity.position}).candidate,null)
})
test('hostile direction and attempted target still veto a vertical candidate',()=>{
 const bot=fixture({up:true}),v=surveyVoxelActions(bot)
 const choice=pickVerticalStep(v,{origin:bot.entity.position}).candidate
 assert(choice)
 assert.equal(pickVerticalStep(v,{origin:bot.entity.position,blocked:new Set([choice.key])}).candidate,null)
 assert.equal(pickVerticalStep(v,{origin:bot.entity.position,
  hostiles:[{x:1.5,y:66,z:.5}]}).candidate,null)
})
test('two-deep isolated hole with safe landing yields bridge candidate, not a step',()=>{
 const w=assessEarthwork(fixture({gap:true}))
 assert.equal(w.candidate?.action,'PLACE_BRIDGE')
 assert.deepEqual(w.candidate.target,{x:1,y:64,z:0})
})
test('natural dirt obstruction yields one protected dig candidate',()=>{
 const w=assessEarthwork(fixture({soil:true}))
 assert.equal(w.candidate?.action,'DIG_SOIL')
 assert.equal(w.candidate.block,'dirt')
})
test('buildings and unknown blocks fail closed for excavation and bridges',()=>{
 for(const mode of [{gap:true,built:true},{soil:true,built:true},{soil:true,unknown:true}]){
  const w=assessEarthwork(fixture(mode))
  assert.equal(w.candidate,null,JSON.stringify(mode))
 }
})
test('stale or missing server self-position forbids mutation even if terrain is valid',async()=>{
 const bot=fixture({gap:true}),plan=assessEarthwork(bot).candidate
 assert.equal(serverPositionProof(bot,ready(bot,6000),()=>10000).ok,false)
 let mutation=0;bot.placeBlock=async()=>{mutation++}
 const result=await executeEarthwork(bot,plan,{
  evidence:ready(bot,6000),clock:()=>10000,safe:()=>true})
 assert.equal(result.ok,false);assert.equal(result.attempted,false);assert.equal(mutation,0)
})
test('one safe bridge verifies actual block and inventory, never claims travel',async()=>{
 const bot=fixture({gap:true}),plan=assessEarthwork(bot).candidate
 bot.equip=async()=>{}
 let calls=0
 bot.placeBlock=async()=>{
  calls++;bot._blocks.set('1,64,0',full('cobblestone',at(1,64,0)))
  bot.items=[{name:'cobblestone',count:2}]
 }
 const result=await executeEarthwork(bot,plan,{
  evidence:ready(bot),clock:()=>10000,safe:()=>true,sleep:async()=>{}})
 assert.equal(calls,1);assert.equal(result.worldModificationVerified,true)
 assert.equal(result.serverMovementVerified,false)
})
test('verified dig removes only a specifically approved soil block',async()=>{
 const bot=fixture({soil:true}),plan=assessEarthwork(bot).candidate
 bot.dig=async b=>{
  bot._blocks.set('1,65,0',air(at(1,65,0)))
  bot.items=[{name:'cobblestone',count:3},{name:'dirt',count:1}]
 }
 const result=await executeEarthwork(bot,plan,{
  evidence:ready(bot),clock:()=>10000,safe:()=>true,sleep:async()=>{}})
 assert.equal(result.ok,true);assert.equal(result.reason,'observed_soil_removed_and_inventory_pickup')
})
test('the whole action is skipped after a player STOP or if the world changes',async()=>{
 const bot=fixture({soil:true}),plan=assessEarthwork(bot).candidate
 let digs=0;bot.dig=async()=>{digs++}
 const r=await executeEarthwork(bot,plan,{evidence:ready(bot),clock:()=>10000,safe:()=>false})
 assert.equal(r.attempted,false);assert.equal(digs,0)
 bot._blocks.set('1,65,0',full('stone_bricks',at(1,65,0)))
 const rr=await executeEarthwork(bot,plan,{evidence:ready(bot),clock:()=>10000,safe:()=>true})
 assert.equal(rr.attempted,false);assert.equal(digs,0)
})

test('a disappeared locally observed soil block without a pickup is not proof of digging',async()=>{
 const bot=fixture({soil:true}),plan=assessEarthwork(bot).candidate
 bot.dig=async()=>{bot._blocks.set('1,65,0',air(at(1,65,0)))}
 const result=await executeEarthwork(bot,plan,{
  evidence:ready(bot),clock:()=>10000,safe:()=>true,sleep:async()=>{}})
 assert.equal(result.ok,false)
 assert.equal(result.worldModificationVerified,false)
})
