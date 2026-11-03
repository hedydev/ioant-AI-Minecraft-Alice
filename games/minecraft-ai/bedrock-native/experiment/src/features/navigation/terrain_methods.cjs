'use strict'
// Original Alice Bedrock instance methods, no second client or timer.
// Explicitly injected policy dependencies preserve BDS and safety admission.
function createTerrainRuntimeMethods({surveyVoxelActions,pickVerticalStep,HOSTILES,environment,serverPositionProof,executeEarthwork}){
  return {
  verifyVerticalTransition(candidate){
    if(candidate?.kind!=='observed_one_cell_vertical')return false
    const fresh=surveyVoxelActions(this.bot,{radius:3,maxNodes:64,maxReads:480})
    const choice=pickVerticalStep(fresh,{
      origin:this.bot.entity?.position,
      hostiles:Object.values(this.bot.entities||{})
        .filter(e=>HOSTILES.has(e?.name)&&e.position).map(e=>e.position),
      blocked:new Set([...this.failureMemory.activeRoutes(),
        ...this.explorationProgress.excluded()].filter(k=>k!==candidate.key)),
      visited:this.scoutVisited})
    return choice.candidate?.key===candidate.key&&choice.candidate?.action===candidate.action
  },
  maybeStartEarthwork(work,candidate,movementFailure){
    if(candidate?.ok||!work?.candidate||movementFailure||this.clock()-this.lastTerrainWorkAttemptAt<300000||
       !this.ready()||this.safetyBusy||this.threat()||this.core.hasFollowIntent()||
       this.goalPlanner.stoppedByHuman||this.verticalWatch.active()||this.bot.health<16||
       !environment(this.bot).safeToExplore||!this.liveBehavior.settings.autonomyEnabled||
       this.liveBehavior.settings.agentMode!=='autonomous'||this.job||
       this.failureMemory.blocked('route',work.candidate.target))return false
    const proof=serverPositionProof(this.bot,this.movementEvidence,this.clock)
    if(!proof.ok)return false
    this.lastTerrainWorkAttemptAt=this.clock()
    const selected=work.candidate
    this.startJob('EXPLORE','自主地形',async signal=>{
      const result=await executeEarthwork(this.bot,selected,{
        signal,clock:this.clock,evidence:this.movementEvidence,
        safe:()=>this.escapeApproachGuard(signal).ok&&
          !this.goalPlanner.stoppedByHuman&&this.liveBehavior.settings.agentMode==='autonomous'&&
          environment(this.bot).safeToExplore===true&&
          serverPositionProof(this.bot,this.movementEvidence,this.clock).ok})
      if(!result.ok)this.failureMemory.mark('route',selected.target,result.reason)
      this.log.log('[Alice voxel] terrain work outcome:',JSON.stringify({
        action:selected.action,reason:result.reason,attempted:result.attempted,
        worldModificationVerified:result.worldModificationVerified===true,
        serverMovementVerified:false}))
      return result
    },{label:selected.action==='PLACE_BRIDGE'?'安全填补一处小坑':'清除一块天然土层',announce:false})
    return true
  },
  }
}
module.exports={createTerrainRuntimeMethods}
