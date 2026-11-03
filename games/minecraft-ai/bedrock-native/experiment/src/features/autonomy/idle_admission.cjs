'use strict'
// Synchronous, read-mostly autonomy admission; same Alice instance owns state.
// No extra async boundary, timer, client or independent BDS query is created.
function createIdleAdmission({WOOD_LOGS,homeAgenda,scoutStartProof,startupTerrainObserved,serverPositionProof,evaluateShelter,environment,THREAT_CLEAR_MS}){
  return function reviewIdleAdmission(){
    this.refreshBehavior()
    // A door crossing may be visible locally long before the next BDS
    // query. Never open/cross again on client prediction alone.
    if(this.pendingDoorCrossing){
      if(this.clock()-this.pendingDoorCrossing.startedAt>240000){
        const p=this.pendingDoorCrossing
        this.pendingDoorCrossing=null
        this.lastEscapePassageAction={reason:'door_crossing_independent_bds_timeout',
          status:'unverified',door:p.door,beyond:p.beyond,
          at:this.clock(),attempted:true,serverMovementVerified:false,
          roomExitVerified:false}
        this.lastEscapePassageRetryAt=this.clock()+120000
      }else return {allowed:false}
    }
    // Explicit bed requests own the optional autonomous plan while awaiting
    // independently witnessed one-cell steps. STOP/FOLLOW/safety can still
    // preempt; equipment and urgent food run via maintenanceTick.
    if(this.pendingBedRequest)return {allowed:false}
    if(this.pendingDoorApproachStep){
      if(this.clock()-this.pendingDoorApproachStep.startedAt<=240000)return {allowed:false}
      this.pendingDoorApproachStep=null
      this.lastEscapeDoorAction={reason:'door_approach_independent_timeout',
        attempted:true,openObserved:false,serverMovementVerified:false,at:this.clock()}
      this.lastEscapeApproachRetryAt=this.clock()+180000
      this.lastEscapeSurveyAt=Number.NEGATIVE_INFINITY
      this.log.log('[Alice exploration] doorway first-cell witness expired:',
        JSON.stringify({reason:'door_approach_independent_timeout',serverMovementVerified:false}))
    }
    if(this.pendingScoutStep){
      if(this.clock()-this.pendingScoutStep.startedAt<=240000)return {allowed:false}
      const step=this.pendingScoutStep
      this.pendingScoutStep=null
      this.lastScoutProgress={confirmed:false,reason:'scout_step_independent_timeout',
        failureKind:'evidence_gap',at:this.clock()}
      if(step.candidate?.key)this.explorationProgress.finish(step.candidate,{
        ok:false,attempted:true,reason:'scout_step_independent_timeout'})
      this.log.log('[Alice exploration] scout step witness expired:',JSON.stringify({
        reason:'scout_step_independent_timeout',serverMovementVerified:false}))
    }
    if(!this.liveBehavior.settings.autonomyEnabled)return {allowed:false}
    if(this.liveBehavior.settings.agentMode==='companion'||this.goalPlanner.stoppedByHuman)return {allowed:false}
    if(!this.ready()||this.bot.isSleeping||this.job||this.safetyBusy||this.threat()||this.bot.health<14||this.core.hasFollowIntent()||
       this.verticalWatch.active())return {allowed:false}
    // A retreat/noPath cycle may clear briefly before the next 300ms safety
    // tick. Require the same stable post-threat window used by FOLLOW.
    if(this.lastSafetyAt>0&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS)return {allowed:false}
    if(this.core.state!=='IDLE')return {allowed:false}
    // Safety preemption is temporary; only explicit user STOP should keep
    // autonomy halted (checked above via stoppedByHuman). Re-enter the same
    // durable objective after the ordinary safety/health/human grace gates.
    this.continuousGoal.resume()
    this.lastWorldRoutine=environment(this.bot)
    const homeSummary=this.homeBase.summary()
    this.lastHomeAgenda=homeAgenda(this.bot,homeSummary,{
      mode:this.liveBehavior.settings.agentMode,
      stopped:this.goalPlanner.stoppedByHuman,
      following:this.core.hasFollowIntent(),
      threat:!!this.threat(),
      serverProof:scoutStartProof(this.bot,this.movementEvidence,this.clock).ok,
      candidateHome:this.homeBase.last,now:this.clock()})
    const agendaKey=[this.lastHomeAgenda.objective,this.lastHomeAgenda.reason].join('|')
    if(this.lastHomeAgendaKey!==agendaKey){
      this.lastHomeAgendaKey=agendaKey
      this.log.log('[Alice home] autonomous agenda:',JSON.stringify({
        objective:this.lastHomeAgenda.objective,
        reason:this.lastHomeAgenda.reason,phase:this.lastHomeAgenda.phase,
        actualReturnRouteVerified:false}))
    }
    // Never begin a NEW resource excursion on the approach to dusk when
    // the HOME return route remains unverified. Existing survival fallback
    // stays enabled at night, and sleep remains the maintenance priority.
    if(this.lastHomeAgenda.objective==='return_home'&&
       this.lastWorldRoutine.phase==='day'&&this.lastWorldRoutine.tick>=8500){
      this.nextIdleAt=this.clock()+5000
      this.lastIdleHold={goal:'RETURN_HOME',reason:
        'return_path_requires_live_independent_bds_and_segment_verification',
        at:this.clock(),nextReviewAt:this.clock()+5000}
      return {allowed:false}
    }
    // A durable objective is independent of Core's transient IDLE state
    // and of the 120-second action eligibility timer. Observe trusted
    // inventory every 5-second idle cycle, but never issue an action here.
    const goalInventory=this.ops.inventory()||[]
    const goalHasWeapon=goalInventory.some(i=>i.name.endsWith('_sword')||i.name.endsWith('_axe'))
    const goalWood=goalInventory.filter(i=>WOOD_LOGS.has(i.name)||i.name.endsWith('_planks'))
      .reduce((n,i)=>n+i.count,0)
    const baseGoalPlan=this.p.autonomy_policy.decideIdleWork({
      hasUsableWeapon:goalHasWeapon,woodResources:goalWood})
    const night=this.lastWorldRoutine.phase==='night'||this.lastWorldRoutine.phase==='dusk'
    if(!night){this.lastNightPlan=null;this.lastNightPlanKey=null}
    const prepareBeforeDark=this.lastWorldRoutine.phase==='day'&&
      this.lastWorldRoutine.tick>=9000&&this.lastWorldRoutine.tick<11000
    // Shelter outranks non-urgent weapons/resources after dusk. During late
    // daylight prioritize it only if Alice already carries building blocks.
    // No change to actual movement permission is implied by this goal.
    const shelter=night||prepareBeforeDark?evaluateShelter(this.bot):null
    const canBuild=shelter?.status==='placement_candidate'
    // Only a verified natural-ground outdoor footprint qualifies for shelter
    // priority. Preserve the existing indoor door/room escape executor when
    // Alice is standing on constructed floors or the local geometry is unknown.
    const unverifiedOutdoor=new Set(['shelter_world_unavailable',
      'shelter_terrain_unloaded','shelter_not_natural_ground',
      'shelter_self_space_not_clear','shelter_existing_structure_nearby'])
    const outdoorSite=!!shelter&&!unverifiedOutdoor.has(shelter.reason)
    const shelterPriority=night&&outdoorSite||prepareBeforeDark&&canBuild
    const goalPlan=shelterPriority?'SECURE_SHELTER':baseGoalPlan
    this.continuousGoal.reconcile({plan:goalPlan,wood:goalWood,hasWeapon:goalHasWeapon})
    if(this.startupObservationPending){
      // Spawn/life/inventory can precede landing and loaded nearby blocks.
      // Choose the goal now, but do not spend a two-minute action budget or
      // ask the model to plan from this incomplete initial world snapshot.
      const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
      if(!proof.ok){this.holdNavigation(proof);return}
      if(!startupTerrainObserved(this.bot)){
        this.nextIdleAt=this.clock()+5000
        this.lastIdleHold={goal:goalPlan,reason:'startup_terrain_sync_pending',
          at:this.clock(),nextReviewAt:this.clock()+5000}
        this.continuousGoal.wait('unsafe_or_unavailable')
        return {allowed:false}
      }
      this.startupObservationPending=false
      this.lastIdleHold=null;this.nextIdleAt=Math.min(this.nextIdleAt,this.clock())
    }
    if(this.navigationHold){
      const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
      if(proof.ok){
        this.navigationHold=null;this.lastBdsExploreHoldReason=null
        this.lastIdleHold=null;this.nextIdleAt=Math.min(this.nextIdleAt,this.clock())
      }else{
        this.holdNavigation(proof)
        // Do not repeatedly rescan the same tree or ask the model to solve
        // a missing position witness. Inventory-only craft remains eligible.
        // The absence of materials must not prevent READ-ONLY planning.
        // Neither this preview nor a saved candidate authorizes any movement.
        this.prepareAutonomousScoutPreview(goalPlan,goalWood)
        if(goalWood<2)return {allowed:false}
      }
    }
    this.lastShelterOpportunity=shelter?{
      status:shelter.status,reason:shelter.reason,site:shelter.site,
      remaining:shelter.remaining??null,blocksRequired:shelter.blocksRequired,
      material:shelter.material??null,canBuildWithCurrentProof:false,
      observedAt:this.clock()}:null
    if(shelter){
      const proof=serverPositionProof(this.bot,this.movementEvidence,this.clock)
      this.lastShelterOpportunity.canBuildWithCurrentProof=proof.ok===true
      this.lastShelterOpportunity.positionProof=proof.reason
      const reportKey=JSON.stringify([shelter.status,shelter.reason,
        shelter.remaining,shelter.material,proof.reason,goalPlan])
      if(reportKey!==this.lastShelterKey){
        this.lastShelterKey=reportKey
        this.log.log('[Alice shelter] assessment:',
          JSON.stringify(this.lastShelterOpportunity))
      }
    }
    // Survival observation is independent of the two-minute raw-material
    // work budget. A night WAIT must not suppress fresh, bounded safety
    // opportunities for minutes after an earlier failed resource action.
    // Keep bed, real shelter construction and inventory-only defensive craft
    // above any speculative walking; never relax BDS, collision or mob gates.
    if(night&&this.clock()>=this.nextNightSafetyReviewAt&&
       this.clock()-this.lastHumanAt>=this.p.autonomy_policy.AUTONOMY_GRACE_MS){
      this.nextNightSafetyReviewAt=this.clock()+15000
      const canCraftDefense=!goalHasWeapon&&goalWood>=2&&
        this.clock()>=this.nextAutonomousCraftAt
      const canPlaceShelter=shelterPriority&&canBuild
      if(!canCraftDefense&&!canPlaceShelter&&
         this.tryNightReposition('periodic_night_survival'))return {allowed:false}
    }
    return {allowed:true,goalInventory,goalHasWeapon,goalWood,goalPlan,night,
      shelter,shelterPriority,canBuild}
  }
}
module.exports={createIdleAdmission}
