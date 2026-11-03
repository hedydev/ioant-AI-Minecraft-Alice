'use strict'
const {environment}=require('../../world_routine.cjs')
const {scoutStartProof}=require('../../scout_start_proof.cjs')
// One controller, two callers: the maintenance timer and a genuinely accepted
// independent BDS pair. Waiting for proof/approach is NOT a failed bed attempt
// and must not spend the two-minute interaction retry cooldown.
function sleepOpportunity(r,{freshBdsWitness=false}={}){
 if(r.closed||!r.ready()||r.bot.isSleeping)return false
 const phase=environment(r.bot)
 const known=phase.canSleep?r.observedBeds.nearby(r.bot):[]
 let eligible=false,avoidBed=null,blocked=true,danger=null,travelOK=false
 if(phase.canSleep&&known.length){
  avoidBed=p=>!!r.failureMemory.blocked('bed',p)
  const survey=r.ops.inspectNightBeds?.(12,{avoidBed,knownPositions:known})||null
  eligible=survey?survey.eligible>0:r.ops.hasNearbyBed(12,{avoidBed,knownPositions:known})
  danger=r.threat()
  const here=r.bot.entity?.position
  const distance=here?known.reduce((d,p)=>Math.min(d,Math.hypot(
    p.x-here.x,p.y-here.y,p.z-here.z)),Infinity):Infinity
  const adjacent=Number.isFinite(distance)&&distance<=2.4
  blocked=r.safetyBusy||r.job||r.maintenanceBusy||r.core.hasFollowIntent()||
    r.goalPlanner.stoppedByHuman||r.pendingBedRequest||r.pendingBedStep||
    r.pendingScoutStep||r.pendingDoorApproachStep||r.pendingDoorCrossing
  travelOK=adjacent||r.bot.health>=14
  const needsProof=r.requireBdsAlignedExplore||freshBdsWitness
  const proof=needsProof?scoutStartProof(r.bot,r.movementEvidence,r.clock):{ok:true}
  const approachRequired=r.requireBdsAlignedExplore&&!adjacent
  const status=!eligible?survey?.status||'bed_candidate_unverified':
    blocked?'deferred_for_active_owner_or_job':danger?'deferred_for_immediate_danger':
    !travelOK?'deferred_low_health_bed_too_far':
    approachRequired?'bed_needs_verified_approach':!proof.ok?proof.reason:
    r.clock()<r.nextSleepAt?'sleep_retry_cooldown':'safe_bed_candidate'
  r.lastSleepOpportunity={status,phase:phase.phase,knownBeds:known.length,
    eligible:survey?.eligible??(eligible?1:0),hostile:survey?.hostile??null,
    occupied:survey?.occupied??null,unknown:survey?.unknown??null,adjacent}
  if(eligible&&!blocked&&!danger&&travelOK&&!approachRequired&&proof.ok&&
     r.clock()>=r.nextSleepAt&&!r.failureMemory.blocked('sleep',here)){
   // startJob can reject. Consume the cooldown only once the actual owner
   // exists, never because a timer happened outside the 4-second window.
   const prior=r.job
   r.startJob('RECOVER','自主生存',signal=>r.ops.sleepNearby({
     signal,radius:12,avoidBed,knownPositions:known,
     requireBdsProof:r.requireBdsAlignedExplore,
     forbidNavigation:r.requireBdsAlignedExplore,clock:r.clock}),
     {label:'利用已发现的安全床位睡觉',announce:false})
   if(r.job&&r.job!==prior){r.nextSleepAt=r.clock()+120000;return true}
  }
 }else r.lastSleepOpportunity={status:phase.canSleep?
   'no_observed_bed_currently_loaded':'outside_sleep_window',
   phase:phase.phase,knownBeds:known.length}
 const key=JSON.stringify(r.lastSleepOpportunity)
 if(key!==r.lastSleepOpportunityKey){
  r.lastSleepOpportunityKey=key
  r.log.log('[Alice sleep] opportunity:',key)
 }
 return false
}
module.exports={sleepOpportunity}
