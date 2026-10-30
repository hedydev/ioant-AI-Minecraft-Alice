'use strict'
// Fail-closed admission for LIVE Bedrock physical exploration. Local Mineflayer
// movement is prediction and cannot be used as the start of a new path when
// trusted BDS position differs. Pure, side-effect-free; no teleport/reset.
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
function scoutStartProof(bot,evidence,clock=Date.now){
  const s=evidence?.get?.(),p=bot?.entity?.position
  // Corrections can arrive between Script API samples. They must never erase
  // the freshest independent observation or renew its 4s freshness deadline.
  const source=s?.independentSource||s?.lastSource
  const independent=s?.independentLatestFeet||s?.latestFeet
  const at=s?.independentAt??s?.lastAt
  // Requiring two lifetime samples is insufficient: a sample from an old
  // session/window must not make one new sample look like a fresh pair.
  const previousAt=s?.independentPreviousAt
  const now=clock()
  if(!s||!['bds_querytarget','bds_script_api'].includes(source)||
     !Number.isInteger(s.independentSamples)||s.independentSamples<2||
     !finite(independent)||!Number.isSafeInteger(at)||
     !Number.isSafeInteger(previousAt)||previousAt>=at||
     now-at<0||now-at>4000||now-previousAt<0||now-previousAt>4000)
    return {ok:false,reason:'scout_bds_position_unavailable'}
  if(!finite(p))return {ok:false,reason:'scout_client_position_unavailable'}
  const meters=Math.hypot(
    independent.x-p.x,independent.y-p.y,independent.z-p.z)
  if(meters>0.75)
    return {ok:false,reason:'scout_client_server_position_diverged',distance:Math.round(meters*100)/100}
  return {ok:true,reason:'fresh_bds_position_aligned',distance:Math.round(meters*100)/100}
}
module.exports={scoutStartProof}
