'use strict'
// A genuinely new independent BDS pair may wake the ORIGINAL autonomy
// controller once within its unmodified 4-second freshness gate.
// No BDS queries, packets, goal injection, or movement authorization here.
const {scoutStartProof}=require('./scout_start_proof.cjs')
function createWitnessIdleResume({runtime,bot,evidence,clock=Date.now,
  schedule=fn=>setImmediate(fn),log={warn(){}}}={}){
 if(typeof runtime?.idleTick!=='function'||!bot||!evidence)
  throw Error('witness_idle_resume_requires_runtime')
 let pending=false,lastTriggeredAt=-Infinity,lastOutcome='not_requested'
 let lastLoggedOutcome='',lastLoggedAt=-Infinity
 function note(reason){
  lastOutcome=reason
  const now=clock()
  // Fixed reason names only. Never log coordinates, identity, model text
  // or the private witness. Emit a change, or once every 15 seconds.
  if(typeof log.log==='function'&&
      (reason!==lastLoggedOutcome||now-lastLoggedAt>=15000)){
   lastLoggedOutcome=reason;lastLoggedAt=now
   log.log('[Alice autonomy] BDS witness idle handoff:',
     JSON.stringify({outcome:reason}))
  }
 }
 function ineligibleReason(){
  const settings=runtime.liveBehavior?.settings
  if(runtime.started!==true||runtime.closed===true||runtime.ready?.()!==true)
   return 'runtime_not_ready'
  if(settings?.autonomyEnabled!==true||settings?.agentMode!=='autonomous')
   return 'autonomy_not_enabled'
  if(runtime.goalPlanner?.stoppedByHuman)return 'human_stop'
  if(runtime.core?.state!=='IDLE')return 'not_idle'
  if(runtime.core?.hasFollowIntent?.())return 'follow_intent'
  if(runtime.idleBusy||runtime.job||runtime.safetyBusy)
   return 'controller_busy'
  if(bot.isSleeping)return 'sleeping'
  return null
 }
 function request(){
  const now=clock()
  if(!Number.isSafeInteger(now)){note('invalid_clock');return false}
  if(pending){note('already_pending');return false}
  const proof=scoutStartProof(bot,evidence,clock)
  if(!proof.ok){note(proof.reason);return false}
  const blocked=ineligibleReason()
  if(blocked){note(blocked);return false}
  if(now-lastTriggeredAt<5000){note('handoff_cooldown');return false}
  pending=true;note('queued')
  try{
   schedule(()=>{
    // A queued callback has NOT consumed a wake. If a job, threat state,
    // or witness expiry wins the race, the next fresh pair must still get a
    // chance. Recheck all original gates just before the real idleTick.
    const fresh=scoutStartProof(bot,evidence,clock)
    const unsafe=ineligibleReason()
    if(!fresh.ok||unsafe){
     pending=false;note(!fresh.ok?fresh.reason:unsafe);return
    }
    lastTriggeredAt=clock()
    note('idle_started')
    Promise.resolve().then(()=>runtime.idleTick()).catch(err=>
      log.warn('[Alice autonomy] fresh BDS decision deferred:',
        String(err?.message||err).slice(0,80))).finally(()=>{pending=false})
   })
  }catch(err){
   pending=false;note('scheduler_unavailable')
   log.warn('[Alice autonomy] BDS idle scheduler unavailable:',
     String(err?.message||err).slice(0,80))
   return false
  }
  return true
 }
 return {request,get:()=>({pending,lastTriggeredAt,lastOutcome})}
}
module.exports={createWitnessIdleResume}
