'use strict'
// Fixed operation reasons only. Missing transport evidence is not evidence
// that a resource site is bad; do not persist it as a wood-site failure.
const NAVIGATION_FAILURES=Object.freeze({
  navigation_bds_position_unavailable:'scout_bds_position_unavailable',
  navigation_bds_position_diverged:'scout_client_server_position_diverged',
  navigation_local_position_unavailable:'scout_client_position_unavailable',
  navigation_scout_bds_position_unavailable:'scout_bds_position_unavailable',
  navigation_scout_client_server_position_diverged:'scout_client_server_position_diverged',
  navigation_scout_client_position_unavailable:'scout_client_position_unavailable'
})
const navigationHoldReason=reason=>Object.hasOwn(NAVIGATION_FAILURES,reason)?
  NAVIGATION_FAILURES[reason]:null
function startupTerrainObserved(bot){
  const p=bot?.entity?.position
  if(!p||![p.x,p.y,p.z].every(Number.isFinite)||bot.entity.onGround!==true)return false
  try{
    return [-1,0,1].every(dy=>bot.blockAt(p.offset(0,dy,0))!=null)
  }catch{return false}
}
module.exports={navigationHoldReason,startupTerrainObserved}
