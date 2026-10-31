'use strict'
// A one-time, stationary-to-nearby walking test in the EXISTING Bedrock world.
// Target is discovered from actually observed collision shapes, never guessed
// from a hardcoded coordinate. Two adjoining cells, no jump/dig/place/teleport.
const {surveyVoxelActions,selectSafeWalkingCandidate}=require('./voxel_actions.cjs')
const {environment}=require('./world_routine.cjs')
const {nightConditions}=require('./night_survival.cjs')
const HOSTILE=/^(zombie|husk|drowned|skeleton|stray|bogged|spider|cave_spider|creeper|witch|pillager|ravager|wither_skeleton|phantom|slime|magma_cube|silverfish|endermite|zoglin|hoglin)$/
function selectProbeRoute(bot,{survey=null}={}){
 const p=bot?.entity?.position
 if(!p||![p.x,p.y,p.z].every(Number.isFinite)||bot.entity.onGround!==true||
    !Number.isFinite(bot.health)||bot.health<16||!Number.isFinite(bot.food)||bot.food<8)
   return {candidate:null,reason:'probe_start_health_ground_unverified'}
 const env=environment(bot)
 if(!env.safeToExplore && env.phase!=='night'&&env.phase!=='dusk')
   return {candidate:null,reason:'probe_weather_time_unverified'}
 const observed=survey||surveyVoxelActions(bot,{radius:3,maxNodes:96,maxReads:500})
 if(observed.status!=='route_candidate')return {candidate:null,reason:'probe_terrain_unverified'}
 const two=(observed.walkRoutes||[]).filter(r=>r?.steps===2&&
   r.actions?.length===2&&r.actions.every(a=>a==='WALK'))
 const safe=selectSafeWalkingCandidate({...observed,walkRoutes:two,walkRoute:two[0]||null},{
   hostiles:Object.values(bot.entities||{}).filter(e=>HOSTILE.test(e?.name||'')&&e.position).map(e=>e.position),
   origin:p,minHostileDistance:12})
 if(!safe.candidate)return {candidate:null,reason:safe.reason}
 const candidate=safe.candidate
 if(candidate.waypoints.length!==2||candidate.distance!==2||
   candidate.elevationChanges!==0)return {candidate:null,reason:'probe_route_not_two_flat_cells'}
 if(!env.safeToExplore&&!nightConditions(bot,candidate).ok)
   return {candidate:null,reason:'probe_night_conditions_denied'}
 return {candidate,reason:'two_observed_adjacent_flat_cells'}
}
module.exports={selectProbeRoute}
