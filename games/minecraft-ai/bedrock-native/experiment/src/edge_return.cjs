'use strict'
// Conservative, single-cell edge-to-full-floor candidate. This module never
// authorizes a move by itself. Its bounded executor requires the EXISTING
// independent-BDS admission and gameplay safety callbacks from the caller.
const {boxes}=require('./voxel_actions.cjs')
const {fullSupport}=require('./escape_survey.cjs')
const HAZARD=/(?:lava|fire|magma|cactus|campfire|powder_snow|water|bubble_column|sweet_berry_bush)/
const DOOR=/(?:_door|_trapdoor)$/
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const denied=(reason,attempted=false)=>({ok:false,reason,attempted,
  permitted:false,serverMovementVerified:false})
const TARGETS=[[-1,0,'west'],[0,-1,'north'],[1,0,'east'],[0,1,'south']]
const offsets=[-.29,0,.29]
const asName=b=>String(b?.name||'').replace(/^minecraft:/,'')
function reader(bot,origin){
 const shapes=(x,y,z)=>{
  try{
   const block=bot.blockAt(origin.offset(x-origin.x,y-origin.y,z-origin.z))
   if(!block||!asName(block)||HAZARD.test(asName(block))||
      DOOR.test(asName(block)))return null
   return boxes(block)
  }catch{return null}
 }
 const footprint=(x,z)=>{
  let count=0
  const y=origin.y,by=Math.floor(y-.001)
  for(const dx of offsets)for(const dz of offsets){
   const px=x+dx,pz=z+dz,bx=Math.floor(px),bz=Math.floor(pz)
   const shape=shapes(bx,by,bz)
   if(shape===null)return null
   if(shape.some(a=>Math.abs(by+a[4]-y)<.015&&
      px-bx>=a[0]-.0001&&px-bx<=a[3]+.0001&&
      pz-bz>=a[2]-.0001&&pz-bz<=a[5]+.0001))count++
  }
  return count
 }
 const bodyClear=(x,z)=>{
  for(let bx=Math.floor(x-.3);bx<=Math.floor(x+.3);bx++)
   for(let bz=Math.floor(z-.3);bz<=Math.floor(z+.3);bz++)
    for(let by=Math.floor(origin.y);by<Math.ceil(origin.y+1.8);by++){
     const shape=shapes(bx,by,bz)
     if(shape===null)return false
     if(shape.some(a=>bx+a[0]<x+.3-.001&&bx+a[3]>x-.3+.001&&
        bz+a[2]<z+.3-.001&&bz+a[5]>z-.3+.001&&
        by+a[1]<origin.y+1.8-.001&&by+a[4]>origin.y+.001))
      return false
    }
  return true
 }
 return {footprint,bodyClear}
}
const sameTarget=(a,b)=>!!a&&!!b&&
 a.x===b.x&&a.y===b.y&&a.z===b.z
function selectEdgeReturn(bot,{toward=null}={}){
 const pos=bot?.entity?.position
 if(!finite(pos)||typeof pos.offset!=='function'||bot.entity.onGround!==true||
    bot.game?.dimension!=='overworld'||typeof bot.blockAt!=='function')
  return denied('edge_ground_world_or_cache_unverified')
 if(Math.abs(pos.y-Math.floor(pos.y))>.015)
  return denied('edge_ground_height_unverified')
 if(toward!==null&&!finite(toward))
  return denied('edge_target_unverified')
 const origin={x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)}
 const geom=reader(bot,pos)
 const start=geom.footprint(pos.x,pos.z)
 if(start===null||start<3||start>=9||!geom.bodyClear(pos.x,pos.z))
  return denied('edge_partial_origin_unverified')
 const candidates=[]
 for(const [dx,dz,direction] of TARGETS){
  const x=origin.x+dx,z=origin.z+dz,cx=x+.5,cz=z+.5
  const floor=(()=>{try{return bot.blockAt(pos.offset(x-pos.x,origin.y-1-pos.y,z-pos.z))}catch{return null}})()
  if(!fullSupport(floor))continue
  const distance=Math.hypot(cx-pos.x,cz-pos.z)
  const steps=Math.ceil(distance/.07)
  if(steps<2||steps>32)continue
  let prev=start,min=start,valid=true
  for(let i=1;i<=steps;i++){
   const px=pos.x+(cx-pos.x)*i/steps,pz=pos.z+(cz-pos.z)*i/steps
   const contacts=geom.footprint(px,pz)
   if(contacts===null||contacts<3||contacts<prev||!geom.bodyClear(px,pz)){
    valid=false;break
   }
   // Every entity on the swept centerline is a potential obstacle.
   if(Object.values(bot.entities||{}).some(e=>e!==bot.entity&&
      !(e?.id!=null&&bot.entity?.id!=null&&
        String(e.id)===String(bot.entity.id))&&finite(e?.position)&&
      Math.hypot(e.position.x-px,e.position.y-pos.y,e.position.z-pz)<1.0)){
    valid=false;break
   }
   min=Math.min(min,contacts);prev=contacts
  }
  if(!valid||prev!==9)continue
  const goal=toward?Math.hypot(cx-toward.x,cz-toward.z):0
  candidates.push({target:{x,y:origin.y,z},direction,
    minContacts:min,firstContacts:start,lastContacts:prev,
    samples:steps+1,distance,goal})
 }
 if(!candidates.length)return denied('edge_no_monotone_full_floor_neighbor')
 candidates.sort((a,b)=>a.goal-b.goal||a.distance-b.distance||
  TARGETS.findIndex(v=>v[2]===a.direction)-TARGETS.findIndex(v=>v[2]===b.direction))
 const selected=candidates[0]
 return {ok:true,reason:'observed_single_cell_edge_to_full_floor',
  action:'EDGE_RETURN',target:selected.target,direction:selected.direction,
  sampledContacts:{start:selected.firstContacts,min:selected.minContacts,
    end:selected.lastContacts,samples:selected.samples},
  permitted:false,serverMovementVerified:false,
  bdsOriginVerified:false,readOnlyCandidate:true}
}
const approved=safe=>{
 try{const r=safe();return r===true||r?.ok===true}catch{return false}
}
async function performEdgeReturn(bot,candidate,{
 signal,safe=()=>false,sleep=wait,maxPulses=5,pulseMs=80
}={}){
 if(candidate?.action!=='EDGE_RETURN'||!candidate.target||
    ![candidate.target.x,candidate.target.y,candidate.target.z].every(Number.isSafeInteger))
  return denied('edge_action_unapproved')
 const original=bot?.entity?.position
 const goal={x:candidate.target.x+.5,z:candidate.target.z+.5}
 const plan=selectEdgeReturn(bot,{toward:{x:goal.x,y:candidate.target.y,z:goal.z}})
 if(!plan.ok||!sameTarget(plan.target,candidate.target))
  return denied('edge_geometry_candidate_changed')
 if(typeof bot.lookAt!=='function'||typeof bot.setControlState!=='function')
  return denied('edge_input_unavailable')
 if(signal?.aborted||!approved(safe))return denied('edge_safety_preempted')
 // A genuine Vec3 carries offset/clone methods on its prototype.
 const start=original.clone?.()||original
 const dx=goal.x-start.x,dz=goal.z-start.z,length=Math.hypot(dx,dz)
 if(length<.3||length>1.55)return denied('edge_distance_unverified')
 const unit={x:dx/length,z:dz/length},geom=reader(bot,start)
 const corridor=p=>{
  if(!finite(p)||Math.abs(p.y-start.y)>.15)return false
  const sx=p.x-start.x,sz=p.z-start.z
  const along=sx*unit.x+sz*unit.z
  return along>=-.12&&along<=length+.17&&
    Math.abs(sx*unit.z-sz*unit.x)<=.22
 }
 const stillObserved=()=>{
  const anchored={...bot,entity:{...bot.entity,position:start,onGround:true}}
  const next=selectEdgeReturn(anchored,{toward:{
   x:goal.x,y:candidate.target.y,z:goal.z}})
  return next.ok&&sameTarget(next.target,candidate.target)
 }
 let attempted=false,previous=plan.sampledContacts.start
 try{
  await bot.lookAt({x:goal.x,y:candidate.target.y+(bot.entity.eyeHeight||1.62),
   z:goal.z},true)
  const n=Math.min(6,Math.max(1,Number.isInteger(maxPulses)?maxPulses:5))
  const duration=Math.min(110,Math.max(65,pulseMs))
  for(let i=0;i<n;i++){
   if(signal?.aborted||!approved(safe))
    return denied('edge_safety_preempted',attempted)
   if(!corridor(bot.entity?.position)||bot.entity.onGround!==true)
    return denied('edge_ground_or_corridor_changed',attempted)
   if(!stillObserved())return denied('edge_original_geometry_changed',attempted)
   const p=bot.entity.position,contacts=geom.footprint(p.x,p.z)
   if(contacts===null||contacts<3||contacts<previous||!geom.bodyClear(p.x,p.z))
    return denied('edge_contact_or_collision_changed',attempted)
   previous=contacts
   if(contacts===9&&Math.floor(p.x)===candidate.target.x&&
      Math.floor(p.z)===candidate.target.z)break
   attempted=true
   try{
    bot.setControlState('forward',true)
    await sleep(duration)
   }finally{bot.setControlState('forward',false)}
  }
  // Even a local endpoint in the target cell is not a BDS endpoint.
  const p=bot.entity?.position
  const moved=finite(p)?Math.hypot(p.x-start.x,p.z-start.z):0
  return denied(attempted&&moved<.08?'edge_input_no_local_motion':
    'edge_input_sent_independent_endpoint_required',attempted)
 }catch{
  return denied('edge_input_error_or_preempted',attempted)
 }finally{
  try{bot.setControlState('forward',false)}catch{}
 }
}
module.exports={selectEdgeReturn,performEdgeReturn}
