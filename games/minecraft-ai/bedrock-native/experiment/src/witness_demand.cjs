'use strict'
// Pure, read-only diagnosis for an ON-DEMAND BDS position witness.
// No MCSManager calls, shell access, scheduler or authorization side effects.
// In particular, a hint never authorizes querying BDS or moving Alice.
const {scoutStartProof}=require('./scout_start_proof.cjs')
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const validAt=(v,now)=>Number.isSafeInteger(v)&&v>0&&now>=v&&now-v<=4000
function witnessDemand({connected=false,sessionEstablished=false,bot,evidence,clock=Date.now}={}){
  const result=(state,samplesNeeded=0)=>({
    mode:'operator_on_demand_only',state,samplesNeeded,querySent:false,
    permissionGranted:false,navigationAuthorized:false})
  if(!connected||!sessionEstablished)return result('session_not_connected')
  const s=evidence?.get?.()
  if(!s||!Number.isSafeInteger(s.loginAt))return result('login_not_verified')
  if(s.awaitingVerifiedRespawn)return result('respawn_not_verified')
  if(!finite(bot?.entity?.position))return result('client_position_unavailable')
  const verdict=scoutStartProof(bot,evidence,clock)
  if(verdict.ok)return {...result('fresh_pair_aligned'),navigationAuthorized:true}
  if(verdict.reason==='scout_client_server_position_diverged')
    return result('client_server_diverged')
  // Only timestamps observed after this login/life may count. A lifetime
  // sample count or a stale private file does not count as a fresh pair.
  const now=clock(),life=s.lifeEpochAt
  const good=t=>validAt(t,now)&&t>s.loginAt&&(
    !Number.isSafeInteger(life)||t>life)
  const latestFresh=good(s.independentAt)&&finite(s.independentLatestFeet)&&
    ['bds_querytarget','bds_script_api','bds_stable_actionbar'].includes(s.independentSource)
  const previousFresh=latestFresh&&good(s.independentPreviousAt)&&
    s.independentPreviousAt<s.independentAt
  if(previousFresh)return result('pair_present_but_unverified')
  if(latestFresh)return result('needs_second_fresh_sample',1)
  return result('needs_two_fresh_samples',2)
}
module.exports={witnessDemand}
