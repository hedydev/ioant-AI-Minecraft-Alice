'use strict'
// Bounded observed ONE-FULL-BLOCK ascent. A two-block wooden door is not
// itself a staircase, and neither a visual step nor local jump physics
// provides independent Bedrock server movement proof.
const {knownAir}=require('./scout_routes.cjs')
const {fullSupport}=require('./escape_survey.cjs')
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
 // The start cell needs solid support and three known-clear blocks of
 // vertical jump clearance, not just normal 2-block walking clearance.
 if(!fullSupport(read(root.x,root.y-1,root.z))||
    ![0,1,2,3].every(d=>knownAir(read(root.x,root.y+d,root.z))))
   return fail('jump_origin_support_or_headroom_unverified')
 const steps=[]
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const x=root.x+dx,y=root.y,z=root.z+dz
  const block=read(x,y,z)
  if(special(block)||!fullSupport(block))continue
  // The top of the raised block becomes the new floor; two-block body
  // clearance plus extra rise headroom are required.
  if(![1,2,3].every(d=>knownAir(read(x,y+d,z))))continue
  // Do not enter a space occupied by a monster, player, or other entity,
  // regardless of whether that entity is currently attacking.
  if(Object.values(bot.entities||{}).some(e=>finite(e?.position)&&
     Math.hypot(e.position.x-x-.5,e.position.y-(y+1),e.position.z-z-.5)<1.15))
    continue
  const to={x,y:y+1,z}
  const before=toward?Math.hypot(pos.x-toward.x,pos.z-toward.z):null
  const after=toward?Math.hypot(x+.5-toward.x,z+.5-toward.z):null
  if(toward&&after>=before-.15)continue
  steps.push({to,remaining:after??0})
 }
 if(!steps.length)return fail('no_observed_one_block_jump_landing')
 steps.sort((a,b)=>a.remaining-b.remaining)
 const to=steps[0].to
 return {ok:true,reason:'observed_one_block_ascent_candidate',
   action:'JUMP_UP',target:to,from:root,permitted:false,
   serverMovementVerified:false}
}
async function performOneBlockJump(bot,candidate,{
 signal,safe=()=>false,sleep=wait,pulses=4,pulseMs=125}={}){
 const deny=(reason,attempted=false)=>({ok:false,reason,attempted,
   serverMovementVerified:false})
 if(candidate?.action!=='JUMP_UP'||!candidate?.target)
   return deny('jump_not_approved_action')
 const plan=candidateOneBlockJump(bot)
 if(!plan.ok)return deny(plan.reason)
 const target=candidate.target
 if(![target.x,target.y,target.z].every(Number.isSafeInteger)||
    plan.target.x!==target.x||plan.target.y!==target.y||plan.target.z!==target.z)
   return deny('jump_landing_changed')
 if(typeof bot.lookAt!=='function'||typeof bot.setControlState!=='function')
   return deny('jump_physical_input_unavailable')
 const permitted=()=>!signal?.aborted&&(safe()===true||safe()?.ok===true)
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
   const fresh=candidateOneBlockJump(bot)
   if(!fresh.ok||fresh.target.x!==target.x||
      fresh.target.y!==target.y||fresh.target.z!==target.z)
     return deny('jump_landing_changed',attempted)
   attempted=true
   try{
    bot.setControlState('jump',true)
    bot.setControlState('forward',true)
    await sleep(ms)
   }finally{
    bot.setControlState('forward',false)
    bot.setControlState('jump',false)
   }
   // Local ascent may change the observed starting floor. Do not try again
   // after local physics has changed tile/height: wait for independent BDS.
   const p=bot.entity?.position
   if(!finite(p)||Math.floor(p.y)!==plan.from.y||
      Math.floor(p.x)!==plan.from.x||Math.floor(p.z)!==plan.from.z)break
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
