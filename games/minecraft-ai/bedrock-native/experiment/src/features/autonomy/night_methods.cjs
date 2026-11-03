'use strict'
// Original AliceBedrockRuntime methods extracted without behavior changes.
// The original Alice instance remains sole owner of tasks, safety and witnesses.
function createNightRuntimeMethods({planNightReposition,scoutStartProof,surveyVoxelActions,environment}){
  return {
  tryNightReposition(source='night_wait'){
    const phase=environment(this.bot)
    if(!['night','dusk'].includes(phase.phase))return false
    const update=(status,reason)=>{
      const next={status,reason,source,phase:phase.phase,at:this.clock()}
      // Different callers may observe the same hold during one idle cycle.
      // Repeated safety checks must not flood the acceptance timeline.
      const key=JSON.stringify([status,reason,phase.phase])
      this.lastNightPlan=next
      if(this.lastNightPlanKey!==key){
        this.lastNightPlanKey=key
        this.log.log('[Alice night] survival strategy:',JSON.stringify({
          status,reason,source,phase:phase.phase,worldModification:false}))
      }
    }
    // A known sleeping place has priority over speculative movement.
    if((this.lastSleepOpportunity?.eligible||0)>0){
      update('waiting','known_bed_preferred');return false
    }
    if(this.clock()-(this.lastNightRepositionAt??Number.NEGATIVE_INFINITY)<120000){
      update('waiting','night_reposition_cooldown');return false
    }
    if(this.bot.health<16||this.threat()||this.safetyBusy||
       this.verticalWatch.active()){
      update('blocked','night_immediate_safety_priority');return false
    }
    const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
    if(!proof.ok){
      update('blocked',proof.reason);return false
    }
    const voxel=surveyVoxelActions(this.bot,{radius:4,maxNodes:96,maxReads:640})
    const proposed=planNightReposition(this.bot,voxel,{
      blocked:new Set([...this.failureMemory.activeRoutes(),
        ...this.explorationProgress.excluded()]),visited:this.scoutVisited})
    if(!proposed.ok){
      update('blocked',proposed.reason);return false
    }
    // Only naturally selected and fully loaded corridors, never a forced
    // input pulse or an unbounded night roam. BDS evidence still rules success.
    this.lastNightRepositionAt=this.clock()
    update('started','night_verified_two_step_reposition')
    this.startJob('EXPLORE','夜间生存',
      async signal=>{
        const result=await this.boundedScout(proposed.candidate,signal,{allowNightFallback:true})
        update(result?.serverMovementVerified===true?'server_verified':'unverified',
          result?.reason||'night_movement_unverified')
        return result
      },
      {label:'夜间寻找更安全的短程落脚点',announce:false,
        scoutCandidate:proposed.candidate})
    return true
  },
  }
}
module.exports={createNightRuntimeMethods}
