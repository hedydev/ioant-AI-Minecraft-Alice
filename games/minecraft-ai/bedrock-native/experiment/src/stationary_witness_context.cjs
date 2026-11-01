'use strict'
// A stationary BDS pair from BEFORE a movement attempt is not authority to
// rewind the stopped client afterwards. Wait for a new independent pair;
// do not change the proof threshold, renew timestamps, or predict BDS here.
function stationaryWitnessAfterActivity(bot,state,now){
  let timeline
  try{timeline=bot?._aliceBedrockInputSync?.summary?.()}catch{}
  if(!timeline||!Number.isSafeInteger(now)||!Number.isSafeInteger(state?.independentPreviousAt))
    return {ok:false,reason:'local_mirror_activity_unknown'}
  for(const key of ['lastMotionInputAt','lastAuthoritativePositionAt']){
    const at=timeline[key]
    if(at===null)continue // Known no such event since this plugin was injected.
    if(!Number.isSafeInteger(at)||at<0||at>now)
      return {ok:false,reason:'local_mirror_activity_unknown'}
    if(at>=state.independentPreviousAt)
      return {ok:false,reason:'local_mirror_witness_precedes_activity'}
  }
  return {ok:true}
}
module.exports={stationaryWitnessAfterActivity}
