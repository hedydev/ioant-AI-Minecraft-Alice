'use strict'
// Single-cell WALK-vs-JUMP_UP geometry decision for an observed bedward move.
// Observation is NEVER a movement permit, a BDS witness, or a completed path.
const {selectDirectionalBedStep}=require('./bed_directional_step.cjs')
const {candidateOneBlockJump}=require('./one_block_jump.cjs')
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isSafeInteger)
const no=reason=>({ok:false,reason,permitted:false,serverMovementVerified:false})
function flatSurveyRoute(bot,route){
 const p=bot?.entity?.position
 if(!p||!finite({x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)})||
    bot.entity?.onGround!==true||bot.game?.dimension!=='overworld'||
    route?.status!=='observed_route_candidate'||
    route.routeComplete!==true||route.serverVerified!==false||
    route.permitted!==false||!Array.isArray(route.waypoints)||
    route.waypoints.length===0)return null
 const y=Math.floor(p.y),x=Math.floor(p.x),z=Math.floor(p.z)
 if(!route.waypoints.every((w,i)=>Array.isArray(w)&&w.length===3&&
    w.every(Number.isSafeInteger)&&w[1]===y&&
    (i>0?Math.abs(w[0]-route.waypoints[i-1][0])+
      Math.abs(w[2]-route.waypoints[i-1][2])===1:true)))return null
 const first=route.waypoints[0]
 if(Math.abs(first[0]-x)+Math.abs(first[2]-z)!==1)return null
 return {x:first[0],y:first[1],z:first[2]}
}
function chooseAdjacentMovement(bot,{
 toward,route=null,allowDirectional=false,allowJump=false}={}){
 const flat=flatSurveyRoute(bot,route)
 if(flat)return {ok:true,action:'WALK',source:'observed_flat_route',
   target:flat,permitted:false,serverMovementVerified:false}
 if((allowDirectional||allowJump)&&!finite(toward))
   return no('movement_target_unverified')
 // Natural movement first: an observed 2-block-high flat passage requires
 // only WALK, even when the ceiling is too low for a jumping arc.
 const directional=allowDirectional?selectDirectionalBedStep(bot,toward):null
 if(directional?.ok){
   const [x,y,z]=directional.first
   return {ok:true,action:'WALK',source:'observed_flat_neighbor',
     target:{x,y,z},directional,permitted:false,serverMovementVerified:false}
 }
 // Jump is a FALLBACK for a known full-cube 1-block ascent, never a default
 // for obstacles or low ceilings. The existing jump planner checks takeoff,
 // transit overhead through +3 and the raised landing, and nearby entities.
 const jump=allowJump?candidateOneBlockJump(bot,{
   toward:{x:toward.x+.5,y:toward.y,z:toward.z+.5}}):null
 if(jump?.ok)return {ok:true,action:'JUMP_UP',source:'observed_full_block_rise',
   target:jump.target,jump,permitted:false,serverMovementVerified:false}
 return no(jump?.reason||directional?.reason||'verified_bed_corridor_unavailable')
}
module.exports={chooseAdjacentMovement}
