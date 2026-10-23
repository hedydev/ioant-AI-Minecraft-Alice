'use strict'
// Geometry-only fallback candidate after a real noPath. No wandering, digging, jumping,
// teleports, or unknown terrain; movement execution belongs solely to runtime.
function finite(p){return !!p&&[p.x,p.y,p.z].every(Number.isFinite)}
const BAD=/lava|fire|magma|cactus|campfire|powder_snow|water|bubble_column|sweet_berry_bush/
const physical=b=>b?.boundingBox==='block'&&!BAD.test(b?.name||'')
const empty=b=>b?.boundingBox==='empty'&&!BAD.test(b?.name||'')
function safeFollowStep(bot,target,{radius=3,maxRange=8,maxStep=1.2}={}){
  const self=bot?.entity?.position,to=target?.position
  if(!finite(self)||!finite(to)||typeof bot?.blockAt!=='function'||
      bot.entity.onGround!==true||typeof self.offset!=='function')
    return {ok:false,reason:'position_ground_or_block_data_unavailable'}
  // A target one floor above/below does not make a short *flat* pulse unsafe:
  // every point of Alice's immediate corridor still needs known support,
  // two-block clearance, and no mobs. Never attempt to climb or drop here.
  if(Math.abs(self.y-to.y)>1.25)
    return {ok:false,reason:'target_vertical_gap_exceeds_short_recovery'}
  const dx=to.x-self.x,dz=to.z-self.z,range=Math.hypot(dx,dz)
  if(range>maxRange)return {ok:false,reason:'target_too_far_for_short_recovery'}
  const step=Math.min(maxStep,range-radius-0.5)
  if(step<0.45)return {ok:false,reason:'already_in_follow_radius'}
  const ux=dx/range,uz=dz/range,feetY=Math.floor(self.y)
  const hostile=/^(zombie|husk|drowned|skeleton|stray|bogged|creeper|spider|cave_spider|witch|pillager|ravager|phantom|slime)$/
  const destination={x:self.x+ux*step,y:self.y,z:self.z+uz*step}
  if(Object.values(bot.entities||{}).some(e=>{
    const p=e?.position
    return p&&[p.x,p.y,p.z].every(Number.isFinite)&&
      (hostile.test(e?.name||'')||e.kind==='Hostile mobs')&&
      Math.hypot(p.x-destination.x,p.y-destination.y,p.z-destination.z)<8
  }))return {ok:false,reason:'known_hostile_near_recovery_step'}
  // Probe the whole 0.6m player footprint at every 0.3m segment, not only
  // the destination or a ray that might skim a corner/hole.
  let sampled=0
  try {
    for(let d=0;d<=step+0.3;d+=0.3){
      for(const side of [-0.29,0,0.29]){
        const x=Math.floor(self.x+ux*d-uz*side),z=Math.floor(self.z+uz*d+ux*side)
        const base=self.offset(x-self.x,feetY-self.y,z-self.z)
        const floor=bot.blockAt(base.offset(0,-1,0))
        const feet=bot.blockAt(base)
        const head=bot.blockAt(base.offset(0,1,0))
        sampled+=3
        if(!physical(floor)||!empty(feet)||!empty(head))
          return {ok:false,reason:'unsafe_unloaded_or_blocked_corridor',sampled}
      }
    }
  }catch{return {ok:false,reason:'block_probe_failed',sampled}}
  return {ok:true,stepBlocks:Math.round(step*100)/100,
    yaw:Math.atan2(-dx,-dz),targetDistance:Math.round(range*100)/100,
    sampled,reason:'short_verified_flat_corridor'}
}
module.exports={safeFollowStep}
