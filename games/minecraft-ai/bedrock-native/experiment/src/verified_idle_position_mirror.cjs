'use strict'
// Read-only independent BDS samples may safely reconcile an idle local
// physics prediction. NEVER teleport on BDS or substitute packet corrections
// for proof. This does not authorize a path: the caller must still apply all
// normal movement and safety gates after the correction.
const {scoutStartProof}=require('./scout_start_proof.cjs')
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const COOLDOWN_MS=60000
function verifiedIdleMirrorDecision({bot,evidence,runtime,clock=Date.now,lastMirroredAt=0}={}){
 const now=clock(),s=evidence?.get?.(),self=bot?.entity?.position
 if(!Number.isSafeInteger(now)||!runtime||!bot||!finite(self)||!s)
  return {ok:false,reason:'idle_mirror_missing_state'}
 if(!runtime.started||runtime.closed||!runtime.ready?.()||
    runtime.core?.state!=='IDLE'||runtime.job||runtime.idleBusy||
    runtime.safetyBusy||runtime.core?.hasFollowIntent?.()||
    runtime.goalPlanner?.stoppedByHuman||
    runtime.liveBehavior?.settings?.autonomyEnabled!==true||
    runtime.liveBehavior?.settings?.agentMode!=='autonomous'||
    bot.isSleeping||bot.vehicle||bot._creativeFlying||
    !Number.isFinite(bot.health)||bot.health<16||
    runtime.threat?.()||
    runtime.lastSafetyAt>0&&now-runtime.lastSafetyAt<4500)
  return {ok:false,reason:'idle_mirror_safety_gate'}
 if(lastMirroredAt>0&&now-lastMirroredAt<COOLDOWN_MS)
  return {ok:false,reason:'idle_mirror_cooldown'}
 const proof=scoutStartProof(bot,evidence,clock)
 if(proof.reason!=='scout_client_server_position_diverged')
  return {ok:false,reason:proof.ok?'already_aligned':proof.reason}
 // A current-life stationary pair, not just one BDS sample from the same
 // login, is mandatory. This rule is stronger than the ordinary path proof.
 if(!Number.isSafeInteger(s.loginAt)||!Number.isSafeInteger(s.independentPreviousAt)||
    s.independentPreviousAt<=s.loginAt||
    Number.isSafeInteger(s.lifeEpochAt)&&s.independentPreviousAt<=s.lifeEpochAt||
    s.awaitingVerifiedRespawn===true||
    !Number.isFinite(s.independentPairTravelBlocks)||
    s.independentPairTravelBlocks>0.1)
  return {ok:false,reason:'idle_mirror_not_stationary_same_life'}
 const server=s.independentLatestFeet
 if(!finite(server))return {ok:false,reason:'idle_mirror_no_server_position'}
 const distance=Math.hypot(server.x-self.x,server.y-self.y,server.z-self.z)
 if(!(distance>0.75&&distance<=3))
  return {ok:false,reason:'idle_mirror_delta_out_of_bound'}
 return {ok:true,reason:'stationary_bds_idle_local_realign',distance:Math.round(distance*100)/100,
    position:{x:server.x,y:server.y,z:server.z}}
}
function reconcileVerifiedIdleMirror(args){
 const r=verifiedIdleMirrorDecision(args)
 if(!r.ok)return r
 const bot=args.bot,p=bot.entity.position
 // No network packet, server command, teleport or client input frame here.
 // Only discard idle, diverged prediction after independent BDS confirmation.
 bot.pathfinder?.setGoal?.(null)
 bot.clearControlStates?.()
 p.x=r.position.x;p.y=r.position.y;p.z=r.position.z
 if(bot.entity.velocity){
  bot.entity.velocity.x=0;bot.entity.velocity.y=0;bot.entity.velocity.z=0
 }
 bot.entity.onGround=false
 return {ok:true,reason:r.reason,distance:r.distance,bdsTeleport:false}
}
module.exports={verifiedIdleMirrorDecision,reconcileVerifiedIdleMirror,COOLDOWN_MS}
