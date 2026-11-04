'use strict'
// Bounded observed ONE-FULL-BLOCK ascent. A two-block wooden door is not
// itself a staircase, and neither a visual step nor local jump physics
// provides independent Bedrock server movement proof.
const {knownAir}=require('./scout_routes.cjs')
const {fullSupport,knownWalkingClear}=require('./escape_survey.cjs')
const {observedDoorBits}=require('./escape_door_action.cjs')
const {planOpenDoorLane}=require('./door_lane.cjs')
const {previewCeilingLimitedJump}=require('./jump_clearance_preview.cjs')
const WOOD_DOOR=/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door$/
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
const normal=p=>String(p?.name||'').replace(/^minecraft:/,'')
const special=p=>/(?:_stairs|_slab|_trapdoor|_door|ladder|scaffolding|water|lava|fire|cactus)/.test(normal(p))
const wait=ms=>new Promise(done=>setTimeout(done,ms))
function candidateOneBlockJump(bot,{toward=null}={}){
 const fail=reason=>({ok:false,reason,permitted:false,serverMovementVerified:false})
 const pos=bot?.entity?.position
 if(!finite(pos)||typeof pos.offset!=='function'||
    bot.entity?.onGround!==true||bot.game?.dimension!=='overworld'||
    typeof bot.blockAt!=='function')return fail('jump_start_unverified')
 if(toward!==null&&!finite(toward))return fail('jump_target_unverified')
 const root={x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)}
 const read=(x,y,z)=>{
  try{return bot.blockAt(pos.offset(x-pos.x,y-pos.y,z-pos.z))||null}
  catch{return null}
 }
 // Three clear cells above the floor fit a 1.8-high player and a one-block
 // rise. A full roof in the FOURTH cell caps normal jump velocity; permit
 // that case only after the pinned collision engine proves the whole landing.
 const origin=read(root.x,root.y,root.z),upper=read(root.x,root.y+1,root.z)
 const lowBits=observedDoorBits(origin),upBits=observedDoorBits(upper)
 const openDoorOrigin=WOOD_DOOR.test(normal(origin))&&
   normal(origin)===normal(upper)&&
   lowBits.open===true&&lowBits.upper===false&&upBits.upper===true
 if(!fullSupport(read(root.x,root.y-1,root.z))||
    !(openDoorOrigin?[2].every(d=>knownWalkingClear(read(root.x,root.y+d,root.z))):
      [0,1,2].every(d=>knownWalkingClear(read(root.x,root.y+d,root.z)))))
   return fail('jump_origin_support_or_headroom_unverified')
 const originRoof=read(root.x,root.y+3,root.z)
 if(!knownWalkingClear(originRoof)&&!fullSupport(originRoof))
   return fail('jump_origin_support_or_headroom_unverified')
 const steps=[]
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const x=root.x+dx,y=root.y,z=root.z+dz
  const block=read(x,y,z)
  if(special(block)||!fullSupport(block))continue
  if(openDoorOrigin){
   const lane=planOpenDoorLane(bot,{door:[root.x,root.y,root.z],
     from:[root.x-dx,root.y,root.z-dz]})
   if(!lane.ok||pos[lane.axis]<lane.validMin+.003||
      pos[lane.axis]>lane.validMax-.003)continue
  }
  // The top of the raised block becomes the new floor; two-block body
  // clearance plus extra rise headroom are required.
  if(![1,2].every(d=>knownWalkingClear(read(x,y+d,z))))continue
  const landingRoof=read(x,y+3,z)
  if(!knownWalkingClear(landingRoof)&&!fullSupport(landingRoof))continue
  // Do not enter a space occupied by a monster, player, or other entity,
  // regardless of whether that entity is currently attacking.
  if(Object.values(bot.entities||{}).some(e=>finite(e?.position)&&
     Math.hypot(e.position.x-x-.5,e.position.y-(y+1),e.position.z-z-.5)<1.15))
    continue
  const to={x,y:y+1,z}
  const before=toward?Math.hypot(pos.x-toward.x,pos.z-toward.z):null
  const after=toward?Math.hypot(x+.5-toward.x,z+.5-toward.z):null
  if(toward&&after>=before-.15)continue
  const capped=!knownWalkingClear(originRoof)||!knownWalkingClear(landingRoof)
  if(capped&&!previewCeilingLimitedJump(bot,to).ok)continue
  steps.push({to,remaining:after??0,capped})
 }
 if(!steps.length)return fail('no_observed_one_block_jump_landing')
 steps.sort((a,b)=>a.remaining-b.remaining)
 const to=steps[0].to
 return {ok:true,reason:'observed_one_block_ascent_candidate',
   action:'JUMP_UP',target:to,from:root,ceilingLimited:steps[0].capped,permitted:false,
   serverMovementVerified:false}
}
async function performOneBlockJump(bot,candidate,{
 signal,safe=()=>false,sleep=wait,pulses=4,pulseMs=125}={}){
 const deny=(reason,attempted=false)=>({ok:false,reason,attempted,
   serverMovementVerified:false})
 if(candidate?.action!=='JUMP_UP'||!candidate?.target)
   return deny('jump_not_approved_action')
 const target=candidate.target
 const plan=candidateOneBlockJump(bot,{toward:{x:target.x+.5,y:target.y,z:target.z+.5}})
 if(!plan.ok)return deny(plan.reason)
 if(![target.x,target.y,target.z].every(Number.isSafeInteger)||
    plan.target.x!==target.x||plan.target.y!==target.y||plan.target.z!==target.z)
   return deny('jump_landing_changed')
 if(typeof bot.lookAt!=='function'||typeof bot.setControlState!=='function')
   return deny('jump_physical_input_unavailable')
 // Real Vec3 stores offset/clone on its prototype; object spread loses them
 // and makes every mid-action geometry recheck fail before the first input.
 const start=bot.entity.position.clone?.()||{...bot.entity.position}
 const startVelocity=bot.entity.velocity?.clone?.()
 const direction={x:target.x+.5-start.x,z:target.z+.5-start.z}
 const axis=Math.hypot(direction.x,direction.z)
 if(axis<.5||axis>1.8)return deny('jump_takeoff_not_adjacent')
 const unit={x:direction.x/axis,z:direction.z/axis}
 const corridor=p=>{
   if(!finite(p))return false
   const dx=p.x-start.x,dz=p.z-start.z
   const along=dx*unit.x+dz*unit.z,
     side=Math.abs(dx*unit.z-dz*unit.x)
   return along>=-.20&&along<=axis+.35&&side<=.32&&
     p.y>=start.y-.3&&p.y<=start.y+1.8
 }
 const geometryUnchanged=()=>{
   // Re-evaluate the ORIGINAL surveyed origin/landing while airborne.
   // In-flight local onGround=false is expected and not a new failure.
   const original={...bot.entity,position:start,onGround:true,
     ...(startVelocity?{velocity:startVelocity}:{} )}
   const view={...bot,entity:original}
   const current=candidateOneBlockJump(view,
     {toward:{x:target.x+.5,y:target.y,z:target.z+.5}})
   return current.ok&&current.target.x===target.x&&
     current.target.y===target.y&&current.target.z===target.z
 }
 const permitted=()=>{
   if(signal?.aborted)return false
   try{const r=safe();return r===true||r?.ok===true}
   catch{return false}
 }
 if(!permitted())return deny('jump_safety_preempted')
 let attempted=false
 try{
  await bot.lookAt({x:target.x+.5,y:target.y+1.1,z:target.z+.5})
  if(!permitted())return deny('jump_safety_preempted')
  // Never chain the next stair, even if local path physics reports success.
  const n=Math.min(4,Math.max(1,Math.floor(pulses)))
  const ms=Math.min(160,Math.max(65,pulseMs))
  for(let i=0;i<n;i++){
   if(!permitted())return deny('jump_safety_preempted',attempted)
   if(!corridor(bot.entity?.position))
     return deny('jump_left_one_cell_corridor',attempted)
   if(!geometryUnchanged())
     return deny('jump_landing_changed',attempted)
   // The first pulse triggers takeoff; subsequent pulses supply a bounded
   // forward carry while airborne. Never require onGround in mid-jump.
   attempted=true
   try{
    if(i===0)bot.setControlState('jump',true)
    bot.setControlState('forward',true)
    await sleep(ms)
   }finally{
    bot.setControlState('forward',false)
    bot.setControlState('jump',false)
   }
   if(!corridor(bot.entity?.position))
     return deny('jump_left_one_cell_corridor',attempted)
   const p=bot.entity.position
   if(Math.floor(p.x)===target.x&&Math.floor(p.z)===target.z&&
      Math.abs(p.y-target.y)<=.3&&bot.entity.onGround===true)break
  }
  return deny('jump_input_sent_endpoint_requires_new_bds_pair',attempted)
 }catch{
  return deny('jump_input_failed_or_preempted',attempted)
 }finally{
  try{bot.setControlState('forward',false)}catch{}
  try{bot.setControlState('jump',false)}catch{}
 }
}
module.exports={candidateOneBlockJump,performOneBlockJump}
