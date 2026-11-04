'use strict'
// Bounded, offline collision simulation only. No apply(bot), events, packets,
// controls, world edits or server movement claims. Same pinned Physics as input.
const {boxes}=require('./voxel_actions.cjs')
const BAD=/lava|fire|magma|cactus|campfire|powder_snow|water|bubble_column|sweet_berry_bush|portal|cobweb|wither_rose/
function previewCeilingLimitedJump(bot,target,{loadPhysics=()=>require('prismarine-physics')}={}){
 const fail=()=>({ok:false,reason:'jump_ceiling_trajectory_unverified'})
 const p=bot?.entity?.position,v=bot?.entity?.velocity
 if(typeof p?.clone!=='function'||typeof v?.clone!=='function'||!bot.registry||
    ![p.x,p.y,p.z,v.x,v.y,v.z].every(Number.isFinite)||
    Math.hypot(v.x,v.y,v.z)>.12)return fail()
 const root={x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)}
 if(!target||![target.x,target.y,target.z].every(Number.isSafeInteger)||
    target.y!==root.y+1||Math.abs(target.x-root.x)+Math.abs(target.z-root.z)!==1)return fail()
 const cache=new Map();let unknown=false
 const world={getBlock(pos){
  const x=Math.floor(pos.x),y=Math.floor(pos.y),z=Math.floor(pos.z),key=[x,y,z].join(',')
  if(Math.abs(x-root.x)>2||Math.abs(z-root.z)>2||y<root.y-2||y>root.y+4){unknown=true;return null}
  if(cache.has(key))return cache.get(key)
  if(cache.size>=120){unknown=true;return null}
  let b=null
  try{b=bot.blockAt(p.offset(x-p.x,y-p.y,z-p.z))}catch{}
  if(!b||!Array.isArray(b.shapes)||boxes(b)===null||
     BAD.test(String(b.name||''))||b.isWaterlogged===true){unknown=true;return null}
  cache.set(key,b);return b
 }}
 try{
  const {Physics,PlayerState}=loadPhysics(),control={forward:true,back:false,
   left:false,right:false,jump:true,sprint:false,sneak:false}
  // PlayerState attributes are otherwise shared references. Clone them before
  // the speculative engine adjusts speed modifiers. Never use live controls.
  const view={...bot,entity:{...bot.entity,position:p.clone(),velocity:v.clone(),
   attributes:structuredClone(bot.entity.attributes||{}),effects:structuredClone(bot.entity.effects||{})},
   jumpTicks:0,jumpQueued:true,fireworkRocketDuration:0}
  const state=new PlayerState(view,control),physics=Physics(bot.registry,world)
  state.yaw=Math.atan2(-(target.x+.5-p.x),-(target.z+.5-p.z))
  for(let tick=0;tick<20;tick++){
   control.jump=tick===0;control.forward=tick<10
   physics.simulatePlayer(state,world)
   if(unknown||state.isInWater||state.isInLava||
      ![state.pos.x,state.pos.y,state.pos.z].every(Number.isFinite)||
      state.pos.y<root.y-.15||state.pos.y>root.y+1.3)return fail()
   const dx=target.x-root.x,dz=target.z-root.z
   const along=(state.pos.x-p.x)*dx+(state.pos.z-p.z)*dz
   const side=Math.abs((state.pos.x-p.x)*dz-(state.pos.z-p.z)*dx)
   if(along<-.15||along>1.35||side>.25)return fail()
  }
  if(state.onGround!==true||Math.floor(state.pos.x)!==target.x||
     Math.floor(state.pos.z)!==target.z||Math.abs(state.pos.y-target.y)>.03)return fail()
  return {ok:true,reason:'bounded_ceiling_jump_trajectory_observed',ticks:20,
   readBlocks:cache.size,serverMovementVerified:false}
 }catch{return fail()}
}
module.exports={previewCeilingLimitedJump}
