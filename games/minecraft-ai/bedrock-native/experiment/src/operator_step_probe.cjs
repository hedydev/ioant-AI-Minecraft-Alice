'use strict'
// A one-time, stationary-to-nearby walking test in the EXISTING Bedrock world.
// Target is discovered from actually observed collision shapes, never guessed
// from a hardcoded coordinate. Two observed cells, ONE traversed; no jump/dig/place/teleport.
const {surveyVoxelActions,selectSafeWalkingCandidate}=require('./voxel_actions.cjs')
const {environment}=require('./world_routine.cjs')
const {nightConditions}=require('./night_survival.cjs')
// Night probe executes ONE of two fully validated cells, never a new night route.
const HOSTILE=/^(zombie|husk|drowned|skeleton|stray|bogged|spider|cave_spider|creeper|witch|pillager|ravager|wither_skeleton|phantom|slime|magma_cube|silverfish|endermite|zoglin|hoglin)$/
function selectProbeRoute(bot,{survey=null}={}){
 const p=bot?.entity?.position
 if(!p||![p.x,p.y,p.z].every(Number.isFinite)||bot.entity.onGround!==true||
    !Number.isFinite(bot.health)||bot.health<16||!Number.isFinite(bot.food)||bot.food<8)
   return {candidate:null,reason:'probe_start_health_ground_unverified'}
 const env=environment(bot)
 if(!env.safeToExplore&&(env.phase!=='night'||env.weather!=='clear'))
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
 // Observe TWO cells so the route is genuinely continuous and not an
 // isolated 1x1 pocket. Execute only the FIRST adjacent cell: each new
 // Pathfinder goto otherwise requires a new, still-aligned BDS pair, and
 // client-only movement to the first cell can mislead that second gate.
 // Preserve the UNMODIFIED two-cell nightConditions contract. The smaller
 // execution distance is not permission to avoid the full night corridor.
 if(!env.safeToExplore&&!nightConditions(bot,candidate).ok)
   return {candidate:null,reason:'probe_night_conditions_denied'}
 const first=candidate.waypoints[0]
 if(!first||![first.x,first.y,first.z].every(Number.isFinite))
   return {candidate:null,reason:'probe_first_cell_unknown'}
 const single={...candidate,kind:'observed_one_cell_flat_probe',
   waypoints:[first],target:{...first},distance:1,
   key:[first.x,first.y,first.z].join(','),nightCorridor:candidate}
 return {candidate:single,reason:'one_adjacent_cell_from_verified_two_cell_route'}
}
module.exports={selectProbeRoute}
