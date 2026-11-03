'use strict'
// Original AliceBedrockRuntime methods extracted without behavior changes.
// The original Alice instance remains sole owner of tasks, safety and witnesses.
function createModelRuntimeMethods({scoutStartProof,environment,siteKey}){
  return {
  recordAutonomousDecision(choice){
    const phase=environment(this.bot).phase
    const nightSafetyReason=['night','dusk'].includes(phase)&&choice.action==='WAIT'?
      this.lastNightPlan?.reason||null:null
    const entry={goal:choice.goal,action:choice.action,reason:choice.reason,
      ...(nightSafetyReason?{nightSafetyReason}:{}),
      phase,site:siteKey(this.bot.entity?.position),at:this.clock()}
    const signature=[entry.goal,entry.action,entry.reason,
      nightSafetyReason||'',entry.phase,entry.site].join('|')
    this.lastIdleDecision=entry
    if(signature!==this.lastIdleDecisionKey||this.clock()-this.lastIdleDecisionLogAt>=600000){
      this.lastIdleDecisionKey=signature;this.lastIdleDecisionLogAt=this.clock()
      this.log.log('[Alice autonomy] world-aware decision:',JSON.stringify(entry))
    }
  },
  async runAutonomousModelStep({wood,woodFailure,movementFailure,candidate,drive,terrainWork}){
    const env=this.lastWorldRoutine,epoch=this.epoch
    const facts={phase:env?.phase||'unknown',weather:env?.weather||'unknown',
      health:this.bot.health,food:this.bot.food,wood,scene:drive.scene?.kind||'unknown',
      woodBlocked:!!woodFailure,movementBlocked:!!movementFailure,
      safeToExplore:env?.safeToExplore===true,scoutAvailable:candidate?.ok===true,
      positionEvidence:this.movementEvidence?.get?.()?.authoritativeSamples>0?
      'server_origin_position_observed':'unknown',
      // Keep the bounded terrain action summary before the larger voxel map,
      // so Ollama's capped observation input cannot truncate the new intent.
      terrainAdaptation:this.lastTerrainAdaptation,
      voxelNavigation:this.lastVoxelNavigation,
      routeBlockReason:this.lastVoxelNavigation?.walkSelection?.reason||'unknown',
      capabilities:['observe','gather_wood','craft_wooden_sword','scout_safe','adapt_terrain']}
    // The model must receive observed collision/map evidence rather than an
    // endless phase-only "unobserved" scene. Suppress repeated observe
    // requests for unchanged voxel facts; re-open on changed terrain/health/
    // inventory or daylight safety availability, not cosmetic dusk/dawn flips.
    const evidenceKey=JSON.stringify([facts.health,facts.food,facts.wood,
      facts.woodBlocked,facts.movementBlocked,facts.safeToExplore,
      facts.scoutAvailable,facts.voxelNavigation,facts.terrainAdaptation])
    this.goalPlanner.observe(evidenceKey)
    if(this.lastModelObserveKey===evidenceKey&&
       this.clock()-this.lastModelObserveAt<1200000)return 'observe'
    const summary=this.core.learning?.summary?.()||{}
    const proposal=await this.goalPlanner.request({observation:facts,memory:{
      knowledgeSkills:summary.knowledgeSkills||0,itemOutcomes:summary.itemOutcomes||0,
      deathLearning:this.deathExperience.summary()}})
    // A healthy model's event cooldown is not a veto of verified walking.
    if(!proposal)return this.goalPlanner.modelStatus==='ready'?'deferred':'unavailable'
    // Model responses become invalid as soon as STOP, FOLLOW, danger or a
    // newly observed task changes the local executor epoch or scene.
    const latest=environment(this.bot)
    if(this.closed||epoch!==this.epoch||!this.ready()||this.job||
      this.core.hasFollowIntent()||this.threat()||this.safetyBusy||this.bot.health<14||
      !this.liveBehavior.settings.autonomyEnabled||
      this.liveBehavior.settings.agentMode!=='autonomous'||
      latest.phase!==env.phase||latest.weather!==env.weather)return 'interrupted'
    if(proposal.tool==='observe'){
      this.lastModelObserveKey=evidenceKey;this.lastModelObserveAt=this.clock()
      this.goalPlanner.lastOutcome={result:'observation_only',
        reason:'voxel_collision_observation_recorded'}
      return 'observe'
    }
    this.lastModelObserveKey=null
    if(proposal.tool==='gather_wood'){
      if(woodFailure||['night','dusk'].includes(latest.phase)){
        this.goalPlanner.reject('unsafe_or_blocked_wood_site')
        return 'blocked'
      }
      this.startJob('GATHER','自主模型',signal=>this.gatherCount(1,signal),{
        announce:false,label:'模型建议：收集原木'})
    }else if(proposal.tool==='craft_wooden_sword'){
      if(wood<2){
        this.goalPlanner.reject('insufficient_observed_materials')
        return 'blocked'
      }
      this.startJob('CRAFT','自主模型',signal=>this.craftWeaponOrTable('wooden_sword',signal),{
        announce:false,label:'模型建议：制作木剑'})
    }else if(proposal.tool==='adapt_terrain'){
      if(!this.maybeStartEarthwork(terrainWork,candidate,movementFailure)){
        this.goalPlanner.reject('terrain_action_requires_verified_server_position_and_safe_geometry')
        return 'blocked'
      }
    }else if(proposal.tool==='scout_safe'){
      if(!candidate?.ok||movementFailure||latest.safeToExplore!==true||this.bot.health<16){
        this.goalPlanner.reject('no_verified_safe_scout_candidate')
        return 'blocked'
      }
      this.startJob('EXPLORE','自主模型',signal=>this.boundedScout(candidate,signal),{
        announce:false,label:'模型建议：安全短程观察',scoutCandidate:candidate})
      // A model proposal is not an admitted game action. In particular the
      // server-position proof can expire between the awaited model answer and
      // startJob(). Never label a refused BDS start as "model_handled".
      if(this.job?.type!=='EXPLORE'||this.action?.source!=='自主模型'){
        const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
        if(proof.reason==='scout_bds_position_unavailable')
          this.prepareDeferredScout(candidate,'自主模型')
        this.goalPlanner.reject(proof.ok?'scout_job_not_admitted':'scout_start_position_unverified')
        return 'blocked'
      }
    }
    return 'handled'
  },
  }
}
module.exports={createModelRuntimeMethods}
