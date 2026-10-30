'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {configureDoors,createResponsiveFollowGoal,observedLineOfSight}=require('../src/follow_navigation.cjs')
const v=(x,y=64,z=0)=>({x,y,z,offset(dx,dy,dz){return v(x+dx,y+dy,z+dz)}})
class GoalFollow {
  constructor(entity,range){this.entity=entity;this.x=Math.floor(entity.position.x);this.y=Math.floor(entity.position.y);this.z=Math.floor(entity.position.z);this.rangeSq=range*range}
  isEnd(p){const dx=this.x-p.x,dy=this.y-p.y,dz=this.z-p.z;return dx*dx+dy*dy+dz*dz<=this.rangeSq}
}
test('follow goal refreshes after a single owner block instead of freezing on stale target',()=>{
  const player={position:v(0)},goal=createResponsiveFollowGoal(GoalFollow,player,8)
  player.position=v(0.5);assert.equal(goal.hasChanged(),false)
  player.position=v(1.1);assert.equal(goal.hasChanged(),true);assert.equal(goal.x,1)
  player.position=v(1.9);assert.equal(goal.hasChanged(),false)
  player.position=v(2);assert.equal(goal.hasChanged(),true);assert.equal(goal.x,2)
})
test('pinned GoalFollow false success at 4.15 real blocks must not stop Alice',()=>{
  const player={position:v(4.65)},goal=createResponsiveFollowGoal(GoalFollow,player,3)
  const alice={x:0,y:64,z:0}
  const legacy=new GoalFollow(player,3)
  assert.equal(legacy.isEnd(alice),false,'choose a node in the roundoff standoff zone')
  const roundedNode={x:1,y:64,z:0}
  assert.equal(legacy.isEnd(roundedNode),true,
    'pinned GoalFollow rounds both positions: delta 3 is wrongly within 3')
  assert.equal(goal.isEnd(roundedNode),false,
    'real target feet at x 4.65 are too far from cell center 1.5')
  assert.equal(goal.isEnd({x:3,y:64,z:0}),true,
    'a genuine nearby traversable candidate stays an end node')
  assert.equal(goal.isEnd({x:2,y:64,z:0}),true,
    'a cell center within three real blocks must not force crowding closer')
})
test('wooden doors only; no iron, trapdoors or blocks can be damaged',()=>{
  const moves={canOpenDoors:false,canDig:false,openable:new Set([51])}
  const r=configureDoors(moves,{blocksArray:[
    {name:'oak_door',id:41},{name:'spruce_door',id:42},{name:'dark_oak_door',id:43},
    {name:'iron_door',id:44},{name:'copper_door',id:45},{name:'oak_trapdoor',id:46},{name:'oak_planks',id:47}]})
  assert.deepEqual(r,{enabled:true,woodenDoorTypes:3,reason:'open_wooden_doors_only'})
  assert.deepEqual([...moves.openable].sort((a,b)=>a-b),[41,42,43,51]);assert.equal(moves.canDig,false)
})
test('unknown Bedrock door registry leaves door-opening disabled',()=>{
  const moves={canOpenDoors:false,openable:new Set()}
  assert.equal(configureDoors(moves,{blocksArray:[{name:'iron_door',id:1}]}).enabled,false)
})
test('a known plank wall occludes close visual contact, unloaded chunks stay unknown',()=>{
  const alice=v(0),player={position:v(6)}
  const bot={entity:{position:alice},blockAt:p=>({name:p.x>2&&p.x<3?'oak_planks':'air',boundingBox:p.x>2&&p.x<3?'block':'empty'})}
  assert.equal(observedLineOfSight(bot,player),false)
  bot.blockAt=()=>({name:'air',boundingBox:'empty'})
  assert.equal(observedLineOfSight(bot,player),true)
  bot.blockAt=()=>null
  assert.equal(observedLineOfSight(bot,player),null)
})
