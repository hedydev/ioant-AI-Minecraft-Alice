'use strict'
// Shared permission boundary for all normal physical Pathfinder navigation:
// GATHER, EXPLORE, FOLLOW and non-emergency pathfinding. Never modifies
// movement packets/coordinates or turns stale server evidence into success.
const {scoutStartProof}=require('./scout_start_proof.cjs')
function installNavigationPositionGuard(bot,evidence,{clock=Date.now,enabled=true,onReject=()=>{}}={}){
  const pf=bot?.pathfinder
  if(!pf||typeof pf.goto!=='function'||typeof pf.setGoal!=='function')
    throw Error('navigation_pathfinder_unavailable')
  const beforeGoto=pf.goto,beforeSetGoal=pf.setGoal
  let rejected=0,lastRejection=null
  const verify=()=>{
    const proof=scoutStartProof(bot,evidence,clock)
    if(proof.ok)return
    rejected++
    const reason=proof.reason
    lastRejection={reason,distance:proof.distance??null,at:clock()}
    try{onReject(lastRejection)}catch{}
    // The caller (gather, follow, scout) owns its own task failure/rollback.
    throw Error('navigation_'+reason)
  }
  function goto(goal){
    if(enabled)verify()
    return beforeGoto.apply(this,arguments)
  }
  function setGoal(goal){
    // Stopping/cancelling must ALWAYS work. setGoal is a synchronous
    // fire-and-forget API; return false rather than throwing out of FOLLOW
    // timers. Callers must NOT mark denied follow targets as started.
    if(enabled&&goal!=null){
      try{verify()}catch(err){
        if(String(err.message||'').startsWith('navigation_scout_'))return false
        throw err
      }
    }
    return beforeSetGoal.apply(this,arguments)
  }
  pf.goto=goto
  pf.setGoal=setGoal
  const snapshot=()=>({enabled:!!enabled,rejected,lastRejection})
  return {snapshot,detach(){
    if(pf.goto===goto)pf.goto=beforeGoto
    if(pf.setGoal===setGoal)pf.setGoal=beforeSetGoal
  }}
}
module.exports={installNavigationPositionGuard}
