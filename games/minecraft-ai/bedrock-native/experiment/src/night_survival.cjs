'use strict'
// Night safety is separate from daytime exploration. This module can only
// propose a two-cell, level, observed WALK corridor; never grants movement
// permission or treats local physics as proof of server travel.
const {selectSafeWalkingCandidate}=require('./voxel_actions.cjs')
const HOSTILES=new Set(['zombie','husk','drowned','skeleton','stray','bogged','spider',
  'cave_spider','creeper','witch','pillager','ravager','wither_skeleton','phantom',
  'slime','magma_cube','silverfish','endermite','zoglin','hoglin'])
const vec=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
function knownHostiles(bot){
  const self=bot?.entity?.position
  const mobs=Object.values(bot?.entities||{})
    .filter(e=>HOSTILES.has(e?.name)&&vec(e?.position)).map(e=>e.position)
  return {mobs,near:vec(self)&&mobs.some(p=>Math.hypot(p.x-self.x,p.y-self.y,p.z-self.z)<12)}
}
function nightConditions(bot,candidate,{routeOrigin=null}={}){
  const p=bot?.entity?.position,time=bot?.time?.timeOfDay
  if(!vec(p)||!Number.isFinite(time)||time<11000||time>=23460||
    bot?.game?.dimension!=='overworld')return {ok:false,reason:'night_phase_not_verified'}
  if(bot?.isRaining===true||bot?.thunderState>0)
    return {ok:false,reason:'night_weather_not_safe'}
  if(!Number.isFinite(bot?.health)||bot.health<16||bot?.entity?.onGround!==true)
    return {ok:false,reason:'night_health_or_ground_unverified'}
  const hostile=knownHostiles(bot)
  if(hostile.near)return {ok:false,reason:'night_hostile_within_12'}
  if(!candidate?.ok||candidate.kind!=='observed_voxel_walking_only'||
    !Array.isArray(candidate.waypoints)||candidate.waypoints.length!==2||
    candidate.distance!==2||candidate.elevationChanges!==0)
    return {ok:false,reason:'night_route_not_short_flat'}
  // Validate the immutable surveyed route origin, NOT the bot's current
  // position after its first waypoint. Re-check live health, weather and
  // hostile distance against the CURRENT bot position on every call.
  const origin=routeOrigin??p
  if(!vec(origin))return {ok:false,reason:'night_route_origin_unknown'}
  const y=Math.floor(origin.y)
  let x=Math.floor(origin.x),z=Math.floor(origin.z)
  for(const waypoint of candidate.waypoints){
    if(!Number.isSafeInteger(waypoint.x)||!Number.isSafeInteger(waypoint.z)||
       waypoint.y!==y||Math.abs(waypoint.x-x)+Math.abs(waypoint.z-z)!==1)
      return {ok:false,reason:'night_route_not_contiguous'}
    x=waypoint.x;z=waypoint.z
  }
  if(hostile.mobs.some(m=>candidate.waypoints.some(w=>
    Math.hypot(w.x+.5-m.x,w.y-m.y,w.z+.5-m.z)<12)))
    return {ok:false,reason:'night_route_near_hostile'}
  return {ok:true,reason:'night_verified_short_level_route'}
}
function planNightReposition(bot,voxel,{blocked=new Set(),visited=new Set()}={}){
  const e=bot?.entity?.position
  if(!vec(e))return {ok:false,reason:'night_position_unknown'}
  const early=nightConditions(bot,{ok:true,kind:'observed_voxel_walking_only',
    distance:2,elevationChanges:0,
    waypoints:[{x:Math.floor(e.x)+1,y:Math.floor(e.y),z:Math.floor(e.z)},
      {x:Math.floor(e.x)+2,y:Math.floor(e.y),z:Math.floor(e.z)}]})
  if(!early.ok&&early.reason!=='night_route_near_hostile')
    return {ok:false,reason:early.reason}
  const hostiles=knownHostiles(bot).mobs
  const selected=selectSafeWalkingCandidate(voxel,{
    hostiles,blocked,visited,origin:e,minHostileDistance:12
  })
  if(!selected.candidate)return {ok:false,reason:selected.reason}
  const points=selected.candidate.waypoints.slice(0,2)
  if(points.length!==2)return {ok:false,reason:'night_route_too_short'}
  const end=points[1]
  const candidate={...selected.candidate,waypoints:points,
    target:{x:end.x,y:end.y,z:end.z},distance:2,
    key:[end.x,end.y,end.z].join(','),elevationChanges:0}
  const check=nightConditions(bot,candidate)
  return check.ok?{ok:true,reason:check.reason,candidate}:
    {ok:false,reason:check.reason}
}
module.exports={planNightReposition,nightConditions,knownHostiles}
