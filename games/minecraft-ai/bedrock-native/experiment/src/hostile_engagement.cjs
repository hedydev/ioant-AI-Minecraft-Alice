'use strict'
// Engagement, not mere mob proximity, gates autonomous Bedrock combat.
// A 3-block near-field is only a candidate zone: require directed approach,
// recent harm with a reachable melee actor, or an observed incoming projectile.
const RANGED=new Set(['skeleton','stray','bogged','pillager','drowned','witch'])
const PROJECTILES=new Set(['arrow','spectral_arrow','trident','small_fireball',
  'fireball','wither_skull','shulker_bullet','thrown_potion'])
const finite=p=>p&&[p.x,p.y,p.z].every(v=>typeof v==='number'&&Number.isFinite(v))
const key=e=>{
 const v=e?.id??e?.runtime_id??e?.runtimeId
 return typeof v==='number'||typeof v==='bigint'||typeof v==='string'?String(v):null
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
const targetProximity=(e,targets)=>{
 const picks=targets.filter(t=>finite(t.position))
  .map(t=>({...t,distance:distance(e.position,t.position)}))
  .sort((a,b)=>a.distance-b.distance)
 return picks[0]||null
}
function incomingProjectile(projectile,point){
 const p=projectile?.position,v=projectile?.velocity
 if(!finite(p)||!finite(v)||!finite(point))return false
 const speed=Math.hypot(v.x,v.y,v.z)
 if(speed<0.03||speed>30)return false
 const unit={x:v.x/speed,y:v.y/speed,z:v.z/speed}
 const toward={x:point.x-p.x,y:point.y+1.0-p.y,z:point.z-p.z}
 const along=toward.x*unit.x+toward.y*unit.y+toward.z*unit.z
 if(along<=0||along>18)return false
 const miss=Math.hypot(toward.x-unit.x*along,toward.y-unit.y*along,
   toward.z-unit.z*along)
 return miss<=1.5
}
function likelyShooter(entity,projectile){
 if(!RANGED.has(entity?.name)||!finite(entity?.position)||
    !finite(projectile?.position)||!finite(projectile?.velocity))return false
 const v=projectile.velocity,spd=Math.hypot(v.x,v.y,v.z)
 if(spd<0.03)return false
 const p=projectile.position,s=entity.position
 const diff={x:p.x-s.x,y:p.y-(s.y+1.2),z:p.z-s.z}
 const along=(diff.x*v.x+diff.y*v.y+diff.z*v.z)/spd
 if(along<0||along>18)return false
 const miss=Math.sqrt(Math.max(0,diff.x**2+diff.y**2+diff.z**2-along**2))
 return miss<=2.5
}
class HostileEngagement {
 constructor({clock=Date.now,meleeRadius=3}={}){
  this.clock=clock;this.meleeRadius=meleeRadius;this.seen=new Map()
 }
 reset(){this.seen.clear()}
 select({hostiles=[],projectiles=[],selfPosition,ownerPosition=null,
   lastSelfDamageAt=0,lastOwnerDamageAt=0,barrierFor=()=> 'unknown',
   health=20}={}){
  if(!finite(selfPosition))return null
  const now=this.clock()
  if(!Number.isSafeInteger(now))return null
  const targets=[{role:'self',position:selfPosition}]
  if(finite(ownerPosition)&&distance(selfPosition,ownerPosition)<=12)
   targets.push({role:'owner',position:ownerPosition})
  const observed=[]
  for(const mob of hostiles){
   if(!finite(mob?.position))continue
   const id=key(mob),near=targetProximity(mob,targets)
   if(!near)continue
   const prev=id===null?null:this.seen.get(id)
   const gap=prev?now-prev.at:Infinity
   // Multiple controllers inspect danger inside the same 300ms safety
   // period. Preserve the previous observation until a new movement sample
   // exists, rather than erasing a two-sample approach on a repeated read.
   let approaching=prev&&gap>=0&&gap<180?prev.approaching:0
   if(prev&&gap>=180&&gap<=2200){
    const delta={x:mob.position.x-prev.position.x,
      z:mob.position.z-prev.position.z}
    const travel=Math.hypot(delta.x,delta.z)
    const dx=near.position.x-mob.position.x,dz=near.position.z-mob.position.z
    const d=Math.hypot(dx,dz)
    const toward=d>0.15&&travel>0?
      (delta.x*dx+delta.z*dz)/(travel*d):0
    if(travel>=0.18&&travel<=2.8&&toward>=0.78)
      approaching=Math.min((prev.approaching||0)+1,4)
   }
   if(id!==null&&(!prev||gap>=180||gap<0))this.seen.set(id,{
     at:now,approaching,
     position:{x:mob.position.x,y:mob.position.y,z:mob.position.z}})
   // An observed solid wall vetoes inferred melee intent; a confirmed
   // incoming projectile must be handled separately from melee LOS.
   const barrier=barrierFor(mob)
   const hitAt=near.role==='self'?lastSelfDamageAt:lastOwnerDamageAt
   const recentHit=Number.isSafeInteger(hitAt)&&hitAt>0&&now>=hitAt&&
     now-hitAt<=3000
   const meleeReachable=barrier==='clear'||
     (near.distance<=1.2&&recentHit&&barrier!=='blocked')
   if(meleeReachable&&near.distance<=this.meleeRadius&&
      (approaching>=2||recentHit)){
    observed.push({target:mob,role:near.role,distance:near.distance,
      evidence:recentHit?'nearby_recent_hurt':'directed_close_approach',
      urgentAttack:recentHit})
   }
  }
  // Projectile motion must predict a hit on Alice or an escorted player.
  // Do NOT infer that all skeletons in range are shooting.
  for(const projectile of projectiles){
   if(!PROJECTILES.has(projectile?.name))continue
   const target=targets.find(t=>incomingProjectile(projectile,t.position))
   if(!target)continue
   const possible=hostiles.filter(m=>RANGED.has(m?.name)&&
     finite(m.position)&&distance(m.position,target.position)<=18&&
     likelyShooter(m,projectile)).sort((a,b)=>
       distance(a.position,projectile.position)-
       distance(b.position,projectile.position))
   // A trajectory is not an attacker identifier when several plausible
   // shooters overlap. In that case retain the evidence for evasion only;
   // do not attack whichever skeleton happens to be closest.
   if(possible.length!==1)continue
   observed.push({target:possible[0],role:target.role,
     distance:distance(possible[0].position,target.position),
     evidence:'incoming_projectile',urgentAttack:true})
  }
  // A threatening projectile outranks a mere approach; otherwise prefer the
  // nearest corroborated hostile, never an unrelated closer passive mob.
  observed.sort((a,b)=>{
   const score=x=>x.evidence==='incoming_projectile'?3:
     x.evidence==='nearby_recent_hurt'?2:1
   return score(b)-score(a)||a.distance-b.distance
  })
  for(const [id,v] of this.seen)
   if(now<v.at||now-v.at>5000)this.seen.delete(id)
  while(this.seen.size>64)this.seen.delete(this.seen.keys().next().value)
  const found=observed[0]
  if(!found)return null
  return {
   type:health<=13?'SURVIVE':found.role==='owner'?'GUARD':'SELF_DEFENSE',
   priority:health<=13?100:found.role==='owner'?80:90,
   target:found.target,evidence:found.evidence,urgentAttack:found.urgentAttack
  }
 }
}
module.exports={HostileEngagement,incomingProjectile,likelyShooter}
