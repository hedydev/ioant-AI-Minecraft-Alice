'use strict'
// An admitted Pathfinder waypoint is only local prediction until a NEW
// independent BDS double sample proves its post-input destination.
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const SOURCES=new Set(['bds_querytarget','bds_script_api','bds_stable_actionbar'])
function verifyScoutStep(step,obs,local,now){
 const fail=reason=>({ok:false,reason,serverMovementVerified:false})
 if(!step||!finite(step.from)||!finite(step.target)||
    !Number.isSafeInteger(step.startedAt)||!Number.isSafeInteger(step.epoch)||
    !Number.isSafeInteger(step.independentAt)||
    !Number.isInteger(step.independentSamples)||step.independentSamples<2||
    !Number.isSafeInteger(now)||now<step.startedAt||now-step.startedAt>240000)
   return fail('scout_step_context_or_deadline_invalid')
 if(!obs||!SOURCES.has(obs.independentSource)||
    (obs.loginAt??null)!==(step.loginAt??null)||
    (obs.lifeEpochAt??null)!==(step.lifeEpochAt??null))
   return fail('scout_step_independent_owner_mismatch')
 if(!Number.isInteger(obs.independentSamples)||
    obs.independentSamples<step.independentSamples+2||
    !Number.isSafeInteger(obs.independentPreviousAt)||
    !Number.isSafeInteger(obs.independentAt)||
    obs.independentPreviousAt<=step.startedAt||
    obs.independentAt<=obs.independentPreviousAt||
    now-obs.independentPreviousAt>4000||
    now-obs.independentAt>4000||now<obs.independentAt)
   return fail('scout_step_new_independent_pair_missing')
 const to=obs.independentLatestFeet
 if(!finite(to)||!finite(local))
   return fail('scout_step_endpoint_position_unavailable')
 const travel=Math.hypot(to.x-step.from.x,to.y-step.from.y,to.z-step.from.z)
 const goal=Math.hypot(to.x-step.target.x-.5,to.y-step.target.y,to.z-step.target.z-.5)
 const drift=Math.hypot(to.x-local.x,to.y-local.y,to.z-local.z)
 if(travel<.25||travel>2||goal>.95||drift>.75)
   return {ok:false,reason:'scout_step_bds_endpoint_unconfirmed',
     serverMovementVerified:false,travelledBlocks:travel,endpointError:goal,localDrift:drift}
 return {ok:true,reason:'scout_step_new_independent_endpoint_confirmed',
   serverMovementVerified:true,travelledBlocks:travel,endpointError:goal,localDrift:drift}
}
module.exports={verifyScoutStep}
