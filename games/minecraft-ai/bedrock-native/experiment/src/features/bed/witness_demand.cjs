'use strict'
// Read-only evidence demand, never a query or movement permit. The existing
// opt-in timer still owns budget, pacing, pair ACK and stalled backoff.
function bedWitnessDemand(r){
 const now=r.clock(),ev=r.movementEvidence?.get?.(),settings=r.liveBehavior?.settings
 if(!Number.isSafeInteger(now)||!r.ready()||r.closed||r.bot.isSleeping||
    r.core.state!=='IDLE'||r.job||r.maintenanceBusy||r.safetyBusy||r.threat()||
    r.core.hasFollowIntent()||r.goalPlanner.stoppedByHuman||r.bot.health<16||
    settings?.autonomyEnabled!==true||settings.agentMode!=='autonomous'||
    r.bot.game?.dimension!=='overworld'||r.verticalWatch?.active()||
    !['position_witness_unverified','eligible_for_work','work_cooldown',
      'human_grace_period'].includes(r.idleGateReason()))return null
 // The native observer uses null for the FIRST life; a numeric boundary
 // exists only after a real respawn. Null must match exactly on both sides.
 if(!Number.isSafeInteger(ev?.loginAt)||
    !(ev?.lifeEpochAt===null||Number.isSafeInteger(ev?.lifeEpochAt))||
    ev.awaitingVerifiedRespawn===true)return null
 const step=r.pendingBedStep,p=r.pendingBedRequest
 // An already issued automatic bed step needs its independent endpoint too;
 // its 240s physical deadline does not inherit a longer intent lifetime.
 const endpoint=step&&Number.isSafeInteger(step.startedAt)
 const owner=endpoint?step:p
 if(!owner||owner.epoch!==r.epoch||owner.loginAt!==ev.loginAt||
    owner.lifeEpochAt!==ev.lifeEpochAt)return null
 const at=endpoint?step.startedAt:p.at
 const expires=endpoint?Math.min(step.createdAt+240000,step.startedAt+240000):
   Math.min(p.expiresAt,p.globalExpiresAt)
 if(!endpoint&&(!['sleep','set_spawnpoint'].includes(p.action)||
    !['door','approach','interact','awaiting_step'].includes(p.stage)||
    p.dimension!=='overworld'))return null
 if(!Number.isSafeInteger(at)||!Number.isSafeInteger(expires)||
    now<at||now>=expires||expires-at>(endpoint?240000:90*60000))return null
 return {version:1,kind:endpoint?'endpoint':'intent',state:'needs_evidence',
   at,expiresAt:expires,loginAt:ev.loginAt,lifeEpochAt:ev.lifeEpochAt,
   permissionGranted:false,querySent:false}
}
module.exports={bedWitnessDemand}
