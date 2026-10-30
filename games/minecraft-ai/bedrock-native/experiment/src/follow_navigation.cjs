'use strict'
const WOOD_DOOR=/^(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door$/
function configureDoors(moves, registry) {
  if(!moves||!moves.openable?.add||!Array.isArray(registry?.blocksArray))
    return {enabled:false,woodenDoorTypes:0,reason:'no_registry_or_openable_set'}
  let count=0
  for(const block of registry.blocksArray){
    const name=String(block?.name||'').replace(/^minecraft:/,'')
    if(!WOOD_DOOR.test(name)||!Number.isInteger(block.id)||block.id<0)continue
    moves.openable.add(block.id);count++
  }
  // Pinned Bedrock pathfinder only registers fence gates; wooden doors are missing.
  // Open by interact/activateBlock, never break or place building blocks.
  moves.canOpenDoors=count>0
  return {enabled:moves.canOpenDoors,woodenDoorTypes:count,reason:count?'open_wooden_doors_only':'no_wooden_door_ids'}
}
function createResponsiveFollowGoal(GoalFollow,entity,radius,{refreshBlocks=1}={}){
  if(typeof GoalFollow!=='function'||!entity?.position||!(radius>0))throw Error('Invalid GoalFollow arguments')
  const goal=new GoalFollow(entity,radius)
  goal.x=Math.floor(entity.position.x);goal.y=Math.floor(entity.position.y);goal.z=Math.floor(entity.position.z)
  // Pinned GoalFollow reports success when FLOORED bot/target coords are
  // within range. At (target x=4.9, bot x=1.1) the node delta is only 3,
  // even though player feet are 3.8 blocks apart. Use real target feet and
  // candidate CELL CENTER. Respect the full configured stop radius rather
  // than shrinking it, which needlessly crowds the following player.
  // Runtime also releases the active goal at real-foot distance <= radius.
  const reliableRadius=radius
  goal.isEnd=function(node){
    const p=this.entity?.position
    if(!p||![p.x,p.y,p.z].every(Number.isFinite)||
       !node||![node.x,node.y,node.z].every(Number.isFinite))return false
    const dx=node.x+0.5-p.x,dy=node.y-p.y,dz=node.z+0.5-p.z
    return dx*dx+dy*dy+dz*dz<=reliableRadius*reliableRadius
  }
  goal.hasChanged=function(){
    const p=this.entity?.position
    if(!p||![p.x,p.y,p.z].every(Number.isFinite))return false
    const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
    const dx=x-this.x,dy=y-this.y,dz=z-this.z
    if(dx*dx+dy*dy+dz*dz<refreshBlocks*refreshBlocks)return false
    this.x=x;this.y=y;this.z=z
    return true
  }
  return goal
}
const CLEAR=new Set(['air','cave_air','void_air','grass','tall_grass','short_grass','fern','large_fern','water','flowing_water','torch','wall_torch','redstone_torch','vine','snow_layer'])
function observedLineOfSight(bot,entity,{maxDistance=20}={}){
  const from=bot.entity?.position,to=entity?.position
  if(!from||!to||typeof bot.blockAt!=='function')return null
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z
  const length=Math.hypot(dx,dy,dz)
  if(!Number.isFinite(length)||length>maxDistance||length<0.75)return null
  const steps=Math.ceil(length/0.7)
  if(steps<3)return true
  let samples=0
  for(let i=2;i<=steps-2;i++){
    const q=i/steps
    const p=from.offset?.(dx*q,1.45+dy*q,dz*q)
    if(!p)return null
    let b;try{b=bot.blockAt(p)}catch{return null}
    if(!b)return null // unloaded != opaque
    const name=String(b.name||'').replace(/^minecraft:/,'')
    if(CLEAR.has(name)||b.boundingBox==='empty'||/(?:^|_)glass(?:_pane)?$/.test(name)||name.endsWith('_leaves')){samples++;continue}
    return false
  }
  return samples>0?true:null
}
module.exports={configureDoors,createResponsiveFollowGoal,observedLineOfSight}
