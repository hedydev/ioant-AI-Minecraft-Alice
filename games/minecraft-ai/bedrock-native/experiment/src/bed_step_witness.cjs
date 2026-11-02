'use strict'
// A local 4.5s GoalNear completion is NOT BDS movement proof.
// A later, entirely NEW independent BDS double sample may confirm one cell.
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const allowed=new Set(['bds_querytarget','bds_script_api','bds_stable_actionbar'])
function verifyBedStep(step,observation,localPosition,now){
 const fail=reason=>({ok:false,reason,serverMovementVerified:false})
 if(!step||!finite(step.from)||!finite(step.target)||
    !Number.isSafeInteger(step.startedAt)||!Number.isSafeInteger(step.epoch)||
    !Number.isInteger(step.independentSamples)||step.independentSamples<2||
    !Number.isSafeInteger(step.independentAt)||!Number.isSafeInteger(now)||
    now<step.startedAt||now-step.startedAt>240000)
   return fail('bed_step_context_or_deadline_invalid')
 if(!observation||!allowed.has(observation.independentSource)||
    (observation.loginAt??null)!==step.loginAt||
    (observation.lifeEpochAt??null)!==step.lifeEpochAt)
   return fail('bed_step_independent_owner_mismatch')
 if(!Number.isInteger(observation.independentSamples)||
    observation.independentSamples<step.independentSamples+2||
    !Number.isSafeInteger(observation.independentPreviousAt)||
    !Number.isSafeInteger(observation.independentAt)||
    observation.independentPreviousAt<=step.startedAt||
    observation.independentAt<=observation.independentPreviousAt||
    now-observation.independentPreviousAt>4000||
    now-observation.independentAt>4000||
    now<observation.independentAt)
   return fail('bed_step_new_independent_pair_missing')
 const to=observation.independentLatestFeet
 if(!finite(to)||!finite(localPosition))
   return fail('bed_step_endpoint_position_unavailable')
 const blocks=Math.hypot(to.x-step.from.x,to.y-step.from.y,to.z-step.from.z)
 const goal=Math.hypot(to.x-step.target.x-.5,to.y-step.target.y,to.z-step.target.z-.5)
 const drift=Math.hypot(to.x-localPosition.x,to.y-localPosition.y,to.z-localPosition.z)
 if(blocks<.25||blocks>1.8||goal>1.1||drift>.75)
   return {ok:false,reason:'bed_step_bds_endpoint_unconfirmed',
     serverMovementVerified:false,travelledBlocks:blocks,endpointError:goal,localDrift:drift}
 return {ok:true,reason:'bed_step_new_independent_endpoint_confirmed',
   serverMovementVerified:true,travelledBlocks:blocks,endpointError:goal,localDrift:drift}
}
module.exports={verifyBedStep}
