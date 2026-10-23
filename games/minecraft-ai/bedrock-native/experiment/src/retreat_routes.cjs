'use strict'
// Emergency retreat choices share Bedrock's observed WALK-only collision graph.
// End-point-only safeTile() could choose a "safe" tile behind a wall or hole.
const {surveyVoxelActions}=require('./voxel_actions.cjs')
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
function planSafeRetreat(bot,target,{radius=4,maxNodes=96,maxReads=640}={}){
 const origin=bot?.entity?.position,enemy=target?.position
 if(!finite(origin)||!finite(enemy))return {ok:false,reason:'retreat_position_unobserved'}
 const survey=surveyVoxelActions(bot,{radius,maxNodes,maxReads,includeSingleStep:true})
 const routes=survey.walkRoutes||[]
 if(survey.status!=='route_candidate'||!routes.length)
   return {ok:false,reason:'retreat_flat_geometry_not_verified',
     reachableCells:survey.reachableCells||0}
 const startDist=distance(origin,enemy),scored=[]
 for(const r of routes){
   if(!r||r.steps<1||r.steps>8||!Array.isArray(r.waypoints)||
      r.waypoints.length!==r.steps||!Array.isArray(r.actions)||
      r.actions.length!==r.steps||!r.actions.every(a=>a==='WALK'))continue
   let previous=startDist,valid=true
   // Inspect the *entire* corridor: no moving toward the enemy to get
   // to a distant endpoint. Do not assume unknown cells are traversable.
   const cells=r.waypoints.slice(0,4)
   // A short verified escape is preferable to standing next to a creeper.
   // Every cell still comes from the full-footprint collision survey.
   for(const coords of cells){
     if(!Array.isArray(coords)||coords.length!==3||coords.some(n=>!Number.isFinite(n))){
       valid=false;break
     }
     const center={x:coords[0]+.5,y:coords[1],z:coords[2]+.5}
     const d=distance(center,enemy)
     if(d+0.12<previous){valid=false;break}
     previous=d
   }
   const gain=previous-startDist
   const minGain=cells.length===1?0.35:cells.length===2?0.65:1.15
   if(!valid||gain<minGain)continue
   const first=cells[0]
   if(!first||Math.abs(first[1]-origin.y)>.15||
      Math.abs(Math.floor(origin.x)-first[0])+
        Math.abs(Math.floor(origin.z)-first[2])!==1)continue
   scored.push({first,route:r,
     gain,steps:cells.length})
 }
 scored.sort((a,b)=>b.gain-a.gain||a.steps-b.steps)
 const best=scored[0]
 if(!best)return {ok:false,reason:'retreat_no_verified_away_corridor',
   reachableCells:survey.reachableCells||0,candidates:routes.length}
 return {ok:true,reason:best.steps<3?'observed_short_emergency_retreat_corridor':
   'observed_collision_safe_retreat_corridor',
   firstWaypoint:{x:best.first[0],y:best.first[1],z:best.first[2]},
   gain:Math.round(best.gain*100)/100,candidates:scored.length,
   candidateSteps:best.steps,serverMovementVerified:false}
}
module.exports={planSafeRetreat}
