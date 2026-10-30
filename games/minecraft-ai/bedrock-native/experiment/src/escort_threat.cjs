'use strict'
// Escort threat assessment. Position-only proximity is NOT attack reachability
// when a verified solid wall separates Alice from a hostile.
const PASSABLE=new Set(['air','cave_air','void_air','water','flowing_water',
  'grass','tall_grass','short_grass','fern','large_fern','torch','wall_torch'])
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
function observedHostileBarrier(bot,target,{maxDistance=12}={}){
 const from=bot?.entity?.position,to=target?.position
 if(!finite(from)||!finite(to)||typeof bot.blockAt!=='function')return 'unknown'
 const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z
 const len=Math.hypot(dx,dy,dz)
 if(!Number.isFinite(len)||len>maxDistance||len<1)return 'unknown'
 const steps=Math.ceil(len/0.45)
 for(let i=2;i<steps-1;i++){
  const f=i/steps
  const p={x:from.x+dx*f,y:from.y+1.15+dy*f,z:from.z+dz*f}
  let block
  try{block=bot.blockAt(p)}catch{return 'unknown'}
  if(!block||typeof block.name!=='string')return 'unknown'
  const name=block.name.replace(/^minecraft:/,'')
  if(PASSABLE.has(name)||block.boundingBox==='empty')continue
  // Glass/closed doors are opaque for *melee access*, even if visible.
  // Open doors cannot be assumed traversable without an observed geometry bit.
  return 'blocked'
 }
 return 'clear'
}
class OwnerMotion{
 constructor(){this.last=null;this.lastMoveAt=-Infinity}
 observe(position,now){
  if(!finite(position)||!Number.isFinite(now))return false
  if(!this.last||now<this.last.at||now-this.last.at>5000){
   this.last={position:{x:position.x,y:position.y,z:position.z},at:now}
   this.lastMoveAt=-Infinity
   return false
  }
  const d=Math.hypot(position.x-this.last.position.x,position.z-this.last.position.z)
  if(d>=0.3){
   this.last={position:{x:position.x,y:position.y,z:position.z},at:now}
   this.lastMoveAt=now
  }
  return now-this.lastMoveAt>=0&&now-this.lastMoveAt<=1800
 }
 reset(){this.last=null;this.lastMoveAt=-Infinity}
}
function escortAssessment({hasIntent=false,health,danger,barrier='unknown',
  ownerMoving=false,recentSelfHurt=false,self,target}={}){
 if(!hasIntent||!Number.isFinite(health)||health<=8||recentSelfHurt)
  return {allowFollow:false,reason:'emergency_or_no_escort'}
 if(!danger)return {allowFollow:true,reason:'no_active_threat'}
 if(barrier==='blocked')return {allowFollow:true,reason:'hostile_behind_observed_barrier'}
 const dist=finite(self)&&finite(target)?
  Math.hypot(self.x-target.x,self.y-target.y,self.z-target.z):null
 // Never treat an unknown position or a close mob as safe.
 if(dist===null||dist<=3.5)return {allowFollow:false,reason:'close_or_unverified_hostile'}
 if(ownerMoving)return {allowFollow:true,reason:'escort_moving_owner'}
 return {allowFollow:false,reason:'owner_stopped_defend'}
}
module.exports={observedHostileBarrier,OwnerMotion,escortAssessment}
