'use strict'
// Stationary, bounded melee permission after an emergency retreat failure.
// Never changes coordinates, queues movement or downgrades the live Pathfinder
// gate. BDS-independent movement proof is still mandatory for navigating.
const CORNERED=new Set([
 'retreat_flat_geometry_not_verified','retreat_no_verified_away_corridor'
])
const STOPPED_PATH=new Set(['retreat_pathfinder_no_path','retreat_pathfinder_error'])
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
function packetAligned(bot,evidence,now){
 const sample=evidence?.get?.()
 const self=bot?.entity?.position,feet=sample?.latestFeet
 if(!finite(self)||!finite(feet)||
    !['correct_player_move_prediction','self_move_player'].includes(sample.lastSource)||
    !Number.isSafeInteger(sample.lastAt)||sample.lastAt>now||
    now-sample.lastAt>4000)return false
 return Math.hypot(self.x-feet.x,self.y-feet.y,self.z-feet.z)<=0.75
}
function stationaryDefense({retreat,bot,target,hostiles,ready,now,movementEvidence}={}){
 if(!retreat||retreat.ok===true||ready!==true)return {ok:false,reason:'not_available'}
 const self=bot?.entity?.position,enemy=target?.position
 if(!finite(self)||!finite(enemy)||
    !Number.isFinite(bot?.health)||bot.health<=0||bot.isAlive===false)
   return {ok:false,reason:'no_live_position'}
 if(!hostiles?.has?.(target?.name)||target.name==='creeper'||
    !Object.values(bot.entities||{}).includes(target))
   return {ok:false,reason:'not_safe_target'}
 const gap=Math.hypot(self.x-enemy.x,self.y-enemy.y,self.z-enemy.z)
 if(gap>3.5||Math.abs(self.y-enemy.y)>1.6)
   return {ok:false,reason:'not_melee_reachable'}
 if(retreat.attempted===false&&CORNERED.has(retreat.reason))
   return {ok:true,reason:'no_verified_corridor'}
 if(retreat.attempted===false&&retreat.reason==='retreat_bds_position_unavailable'&&
    gap<=2.75&&packetAligned(bot,movementEvidence,now))
   return {ok:true,reason:'static_guarded_packet_aligned'}
 // A failed Pathfinder attempt is not cornering. Only after the bounded
 // emergency path has been explicitly stopped may a very close mob be met
 // with a stationary swing. In particular, no other attempted route qualifies.
 if(retreat.attempted===true&&STOPPED_PATH.has(retreat.reason)&&
    retreat.pathfinderStopRequested===true&&gap<=2.75)
   return {ok:true,reason:'failed_pathfinder_stopped'}
 return {ok:false,reason:'movement_or_position_unverified'}
}
function defenseDelay(misses,{health,distance}={}){
 const attempts=Math.min(5,Math.max(1,Number.isSafeInteger(misses)?misses:1))
 const delay=Math.min(12000,1750*2**(attempts-1))
 // An unarmed, bleeding, stationary defender must not spend 12s between
 // single swings. Still cap to 1 swing per >= 1.75s, never free-attack.
 return Number.isFinite(health)&&health<=13&&
   Number.isFinite(distance)&&distance<=2.75?
   Math.min(delay,2500):delay
}
module.exports={stationaryDefense,defenseDelay,packetAligned}
