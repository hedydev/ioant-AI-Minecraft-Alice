'use strict'
// Reconcile LOCAL Bedrock physics only. Never issue any server teleport.
const {scoutStartProof}=require('./scout_start_proof.cjs')
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
function decide({bot,evidence,phase,cycle=0,mirroredCycle=0,clock=Date.now}={}){
 if(!Number.isSafeInteger(cycle)||cycle<1||cycle<=mirroredCycle||phase!=='respawn_verified')
   return {ok:false,reason:'no_unreconciled_respawn'}
 if(!bot?.entity||!finite(bot.entity.position)||!Number.isFinite(bot.health)||
    bot.health<=0||bot.isSleeping||bot.vehicle||bot._creativeFlying)
   return {ok:false,reason:'self_not_safe'}
 const proof=scoutStartProof(bot,evidence,clock)
 if(proof.reason!=='scout_client_server_position_diverged')
   return {ok:false,reason:proof.ok?'already_aligned':proof.reason}
 const s=evidence.get(),p=s?.independentLatestFeet
 if(!finite(p)||!Number.isFinite(s.independentPairTravelBlocks)||
    s.independentPairTravelBlocks>0.1)
   return {ok:false,reason:'server_pair_not_stationary'}
 const m=Math.hypot(p.x-bot.entity.position.x,p.y-bot.entity.position.y,p.z-bot.entity.position.z)
 if(!(m>0.75&&m<=16))return {ok:false,reason:'local_mirror_delta_out_of_bound'}
 return {ok:true,reason:'verified_bds_respawn_local_mirror',
   distance:Math.round(m*100)/100,position:p,cycle}
}
function reconcileRespawnMirror(args){
 const r=decide(args)
 if(!r.ok)return r
 const b=args.bot,p=b.entity.position
 b.pathfinder?.setGoal?.(null)
 b.clearControlStates?.()
 p.x=r.position.x;p.y=r.position.y;p.z=r.position.z
 if(b.entity.velocity){b.entity.velocity.x=0;b.entity.velocity.y=0;b.entity.velocity.z=0}
 b.entity.onGround=false
 return {ok:true,reason:r.reason,distance:r.distance,cycle:r.cycle}
}
module.exports={respawnMirrorDecision:decide,reconcileRespawnMirror}
