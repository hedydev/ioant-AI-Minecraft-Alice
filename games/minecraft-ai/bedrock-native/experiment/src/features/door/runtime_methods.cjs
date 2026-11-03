'use strict'
// Extracted, behavior-preserving Alice runtime feature methods.
// Explicit dependency injection retains original owner and BDS safety gates.
function createDoorRuntimeMethods({verifyScoutStep,scoutStartProof,surveyEscape,validateCrossing,planRaisedDoorThreshold,performRaisedDoorThreshold,crossDoor,verifyRaisedDoorThreshold,verifyRaisedDoorLanding,verifyDoorCrossing,chooseAdjacentMovement,performOneBlockJump,THREAT_CLEAR_MS}){
  return {
  // One observed doorway WALK never implies its entire approach is complete.
  // A different, independently accepted BDS pair must prove the previous
  // cell before another route is admitted. Missing/old data stays pending.
  settlePendingDoorApproachOnWitness(){
    const step=this.pendingDoorApproachStep
    if(!step)return {state:'none'}
    const now=this.clock()
    if(this.closed||step.epoch!==this.epoch||now<step.startedAt||
       now-step.startedAt>240000){
      this.pendingDoorApproachStep=null
      return {state:'rejected',reason:'door_approach_epoch_or_deadline_changed'}
    }
    const out=verifyScoutStep(step,this.movementEvidence?.get?.(),
      this.bot.entity?.position,now)
    if(out.reason==='scout_step_new_independent_pair_missing')
      return {state:'waiting',reason:'door_approach_new_independent_pair_missing'}
    this.pendingDoorApproachStep=null
    const verified=out.ok===true
    this.lastEscapeDoorAction={
      reason:verified?'door_approach_one_cell_server_verified':out.reason,
      attempted:true,openObserved:false,door:step.door,
      at:now,steps:1,serverMovementVerified:verified
    }
    this.lastEscapeSurveyAt=Number.NEGATIVE_INFINITY
    this.lastEscapeApproachRetryAt=verified?now:now+180000
    this.nextIdleAt=Math.min(this.nextIdleAt,verified?now+1000:now+180000)
    this.log.log('[Alice exploration] door first-cell BDS endpoint:',
      JSON.stringify({reason:this.lastEscapeDoorAction.reason,
        serverMovementVerified:verified,remainingCellsUnverified:true}))
    return {state:verified?'verified':'rejected',
      reason:this.lastEscapeDoorAction.reason,serverMovementVerified:verified}
  },
  // A full doorway crossing is attempted only when Alice ALREADY stands
  // at its observed near-side cell and the original 4s/0.75m independent
  // BDS admission proof is currently valid. Do not chain a hidden A* leg.
  async crossObservedDoor(door,signal){
    const fail=reason=>({ok:false,reason,attempted:false,
      serverMovementVerified:false,roomExitVerified:false})
    if(this.pendingDoorCrossing)return fail('door_previous_crossing_bds_pending')
    if(signal?.aborted||this.closed)return fail('door_crossing_cancelled')
    const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
    if(!proof.ok)return fail(proof.reason)
    const fresh=surveyEscape(this.bot,{radius:6,maxNodes:160})
    const current=fresh.doorCandidates.find(candidate=>
      candidate.position?.join(',')===door?.position?.join(','))
    if(!current)return fail('passage_door_not_in_fresh_survey')
    if(current.approach?.steps!==0)
      return fail('door_approach_requires_separate_bds_verified_steps')
    const crossing=validateCrossing(this.bot,current)
    const threshold=!crossing.ok&&
      crossing.reason==='crossing_raised_full_block_landing_requires_jump'?
      planRaisedDoorThreshold(this.bot,current):null
    const geometry=crossing.ok?crossing:threshold
    if(!geometry?.ok)return fail(threshold?.reason||crossing.reason)
    const independent=this.movementEvidence?.get?.()
    const first=independent?.independentLatestFeet
    if(!first||![first.x,first.y,first.z].every(Number.isFinite)||
       Math.hypot(first.x-geometry.from[0]-.5,
         first.y-geometry.from[1],first.z-geometry.from[2]-.5)>1.05)
      return fail('door_crossing_bds_start_not_at_near_side')
    const startAt=this.clock()
    const receipt={
      kind:threshold?.ok?'raised_threshold':'full_crossing',
      epoch:this.epoch,createdAt:startAt,startedAt:startAt,
      door:geometry.door.slice(),from:geometry.from.slice(),
      beyond:geometry.beyond.slice(),
      initialBdsFeet:{x:first.x,y:first.y,z:first.z},
      independentSamples:independent.independentSamples,
      loginAt:independent.loginAt??null,
      lifeEpochAt:independent.lifeEpochAt??null
    }
    // The physical executor can observe packet movement, but may NEVER
    // turn packet observation into independent BDS passage acceptance.
    const outcome=threshold?.ok?
      await performRaisedDoorThreshold(this.bot,current,{
        signal,safe:()=>this.escapeApproachGuard(signal)}):
      await crossDoor(this.bot,current,{
        signal,movementEvidence:this.movementEvidence,clock:this.clock,
        safe:()=>this.escapeApproachGuard(signal)})
    if(signal?.aborted||this.closed||this.epoch!==receipt.epoch)
      return {...outcome,ok:false,serverMovementVerified:false,
        roomExitVerified:false,reason:'door_crossing_job_preempted'}
    if(outcome.attempted===true){
      // Timestamp AFTER the entire physical input sequence. This makes it
      // impossible for a pair sampled during lookAt/lane alignment to be
      // misattributed as a new post-crossing BDS endpoint.
      receipt.startedAt=this.clock()
      this.pendingDoorCrossing=receipt
      return {...outcome,ok:false,serverMovementVerified:false,
        roomExitVerified:false,
        reason:receipt.kind==='raised_threshold'?
          'door_threshold_waiting_for_post_input_independent_bds':
          'door_crossing_waiting_for_post_input_independent_bds'}
    }
    return {...outcome,ok:false,serverMovementVerified:false,
      roomExitVerified:false}
  },
  // Only an accepted post-input independent BDS pair may settle crossing.
  // A verified "other side" coordinate does NOT imply outside/safe HOME.
  settlePendingDoorCrossingOnWitness(){
    const p=this.pendingDoorCrossing
    if(!p)return {state:'none'}
    const now=this.clock()
    if(this.closed||this.epoch!==p.epoch||
       this.bot.game?.dimension!=='overworld'||
       now<p.createdAt||now-p.createdAt>240000){
      this.pendingDoorCrossing=null
      return {state:'rejected',reason:'door_crossing_context_or_deadline_invalid',
        serverMovementVerified:false,roomExitVerified:false}
    }
    const verdict=p.kind==='raised_threshold'?
      verifyRaisedDoorThreshold(p,this.movementEvidence?.get?.(),
        this.bot.entity?.position,now):
      p.kind==='raised_landing'?
        verifyRaisedDoorLanding(p,this.movementEvidence?.get?.(),
          this.bot.entity?.position,now):
        verifyDoorCrossing(p,this.movementEvidence?.get?.(),
          this.bot.entity?.position,now)
    if(verdict.reason==='door_crossing_post_input_pair_missing'||
       (verdict.reason==='threshold_post_input_pair_missing'||
        verdict.reason==='raised_landing_post_input_pair_missing'))
      return {state:'waiting',reason:verdict.reason,
        serverMovementVerified:false,roomExitVerified:false}
    this.pendingDoorCrossing=null
    if(p.kind==='raised_threshold'&&verdict.ok){
      const e=this.movementEvidence?.get?.()
      this.verifiedRaisedThreshold={epoch:this.epoch,
        door:p.door.slice(),beyond:p.beyond.slice(),at:now,
        independentSamples:e?.independentSamples,
        loginAt:p.loginAt,lifeEpochAt:p.lifeEpochAt}
    }else this.verifiedRaisedThreshold=null
    this.lastEscapePassageAction={
      reason:verdict.reason,status:verdict.ok?
        (p.kind==='raised_threshold'?'threshold_only_bds_verified':
          p.kind==='raised_landing'?'raised_landing_bds_verified':
          'independent_bds_verified'):'unverified',
      attempted:true,door:p.door,at:now,beyond:p.beyond,
      movementKind:p.kind,thresholdVerified:verdict.thresholdVerified===true,
      raisedLandingVerified:verdict.raisedLandingVerified===true,
      serverMovementVerified:verdict.ok,roomExitVerified:false
    }
    if(this.lastEscapeSurvey)
      this.lastEscapeSurvey.passageAction=this.lastEscapePassageAction
    this.lastEscapePassageRetryAt=now+(verdict.ok?600000:120000)
    if(verdict.ok){
      this.lastEscapeSurveyAt=Number.NEGATIVE_INFINITY
      this.nextIdleAt=now+15000
    }
    this.log.log('[Alice exploration] independent BDS door endpoint:',
      JSON.stringify(this.lastEscapePassageAction))
    return {state:verdict.ok?'verified':'rejected',reason:verdict.reason,
      movementKind:p.kind,thresholdVerified:verdict.thresholdVerified===true,
      raisedLandingVerified:verdict.raisedLandingVerified===true,
      serverMovementVerified:verdict.ok,roomExitVerified:false}
  },
  resumeRaisedDoorLandingOnWitness(){
    const stage=this.verifiedRaisedThreshold
    if(!stage)return {state:'none'}
    this.verifiedRaisedThreshold=null // consume once; never retry on stale BDS
    const hold=reason=>({state:'held',reason,serverMovementVerified:false})
    const now=this.clock()
    if(this.closed||this.epoch!==stage.epoch||now<stage.at||
       now-stage.at>4000||this.pendingDoorCrossing||this.pendingBedRequest||
       this.job||!this.ready()||this.goalPlanner.stoppedByHuman||
       this.core.state!=='IDLE'||this.core.hasFollowIntent()||
       this.threat()||this.safetyBusy||this.verticalWatch.active()||
       this.bot.health<16||this.bot.entity?.onGround!==true||
       this.bot.isSleeping||!this.liveBehavior.settings.autonomyEnabled||
       this.liveBehavior.settings.agentMode!=='autonomous')
      return hold('raised_landing_safety_or_epoch_changed')
    const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
    if(!proof.ok)return hold(proof.reason)
    const e=this.movementEvidence.get(),p=e?.independentLatestFeet
    if(!p||[p.x,p.y,p.z].some(x=>!Number.isFinite(x))||
       e.independentSamples<stage.independentSamples||
       (e.loginAt??null)!==stage.loginAt||
       (e.lifeEpochAt??null)!==stage.lifeEpochAt||
       Math.floor(p.x)!==stage.door[0]||
       Math.floor(p.y)!==stage.door[1]||
       Math.floor(p.z)!==stage.door[2]||
       Math.hypot(p.x-stage.door[0]-.5,
         p.y-stage.door[1],p.z-stage.door[2]-.5)>.78)
      return hold('raised_landing_bds_takeoff_unverified')
    const plan=chooseAdjacentMovement(this.bot,{
      toward:{x:stage.beyond[0],y:stage.beyond[1]+1,z:stage.beyond[2]},
      allowDirectional:true,allowJump:true})
    if(!plan.ok)return hold(plan.reason)
    if(plan.action!=='JUMP_UP'||plan.target.x!==stage.beyond[0]||
       plan.target.y!==stage.beyond[1]+1||
       plan.target.z!==stage.beyond[2])
      return hold('raised_landing_not_expected_jump')
    let epoch=null
    this.startJob('EXPLORE','自主脱困',async signal=>{
      const allowed=()=>!signal.aborted&&this.epoch===epoch&&
        this.escapeApproachGuard(signal).ok&&
        scoutStartProof(this.bot,this.movementEvidence,this.clock).ok&&
        !this.goalPlanner.stoppedByHuman&&!this.verticalWatch.active()
      if(!allowed())return {ok:false,attempted:false,serverMovementVerified:false,
        reason:'raised_landing_start_preempted'}
      const witness=this.movementEvidence.get()
      const start=witness?.independentLatestFeet
      if(!start||Math.floor(start.x)!==stage.door[0]||
         Math.floor(start.y)!==stage.door[1]||
         Math.floor(start.z)!==stage.door[2])
        return {ok:false,attempted:false,serverMovementVerified:false,
          reason:'raised_landing_takeoff_changed'}
      const createdAt=this.clock()
      const physical=await performOneBlockJump(this.bot,plan.jump,{
        signal,safe:allowed})
      if(signal.aborted||this.closed||this.epoch!==epoch)
        return {ok:false,attempted:physical.attempted===true,
          serverMovementVerified:false,reason:'raised_landing_interrupted'}
      if(physical.attempted){
        this.pendingDoorCrossing={kind:'raised_landing',epoch,
          createdAt,startedAt:this.clock(),door:stage.door.slice(),
          beyond:stage.beyond.slice(),
          initialBdsFeet:{x:start.x,y:start.y,z:start.z},
          independentSamples:witness.independentSamples,
          loginAt:witness.loginAt??null,lifeEpochAt:witness.lifeEpochAt??null}
      }
      return {ok:false,attempted:physical.attempted===true,
        serverMovementVerified:false,roomExitVerified:false,
        reason:physical.attempted?
          'raised_landing_waiting_for_post_input_independent_bds':physical.reason}
    },{label:'门槛BDS确认后跳上一级',announce:false})
    epoch=this.epoch
    if(this.job?.type!=='EXPLORE'||this.action?.source!=='自主脱困')
      return hold('raised_landing_job_not_admitted')
    return {state:'started',reason:'raised_landing_one_jump_admitted',
      serverMovementVerified:false}
  },
  recordEscapePassage(door,outcome){
    this.lastEscapePassageAction={
      reason:outcome.reason,status:this.pendingDoorCrossing?
        'awaiting_independent_bds':'unverified',
      attempted:outcome.attempted===true,
      door:door.position,at:this.clock(),beyond:outcome.beyond||null,
      serverMovementVerified:false,
      roomExitVerified:false
    }
    if(this.lastEscapeSurvey)this.lastEscapeSurvey.passageAction=this.lastEscapePassageAction
    this.log.log('[Alice exploration] doorway passage outcome:',
      JSON.stringify(this.lastEscapePassageAction))
    if(outcome.movementDiagnostic){
      this.log.log('[Alice exploration] doorway movement diagnostic:',
        JSON.stringify(outcome.movementDiagnostic))
    }
    const risk=/preempted|aborted|safety_gate|conditions_changed/.test(String(outcome.reason))
    this.lastEscapePassageRetryAt=this.clock()+
      (outcome.serverMovementVerified?600000:risk?30000:120000)
    if(outcome.serverMovementVerified){
      this.lastEscapeSurveyAt=Number.NEGATIVE_INFINITY
      this.nextIdleAt=this.clock()+15000
    }
  },
  escapeApproachGuard(signal){
    if(this.closed||!this.ready())return {ok:false,reason:'alice_not_ready'}
    if(this.job?.signal!==signal)return {ok:false,reason:'job_ownership_changed'}
    if(this.core.state!=='EXPLORE')return {ok:false,reason:'state_not_exploring'}
    if(!this.liveBehavior.settings.autonomyEnabled)return {ok:false,reason:'autonomy_disabled'}
    if(this.core.hasFollowIntent())return {ok:false,reason:'follow_intent_preempted'}
    if(this.bot.health<16)return {ok:false,reason:'health_below_escape_threshold'}
    if(this.safetyBusy)return {ok:false,reason:'safety_controller_busy'}
    if(this.threat())return {ok:false,reason:'hostile_threat_detected'}
    if(this.lastSafetyAt>0&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS)
      return {ok:false,reason:'recent_threat_cooldown'}
    return {ok:true}
  },
  observeBlockedRoom(){
    // One bounded, read-only survey per 90s at a failed resource site.
    // Never touch the world or infer a door is a true outdoor exit.
    this.lastEscapeSurveyAt=this.clock()
    const survey=surveyEscape(this.bot,{radius:6,maxNodes:160})
    this.lastEscapeSurvey={
      status:survey.status,reason:survey.reason,
      center:survey.center,reachableCells:survey.reachableCells,
      unknownCells:survey.unknownCells,blockedCells:survey.blockedCells,
      openFrontier:survey.openFrontier,
      door:survey.doorCandidates[0]||null,
      vertical:survey.verticalObstacles[0]||null,
      obstacle:survey.breakCandidates[0]||null,
      canModifyWorld:false,observedAt:this.clock(),
      doorAction:this.lastEscapeDoorAction,
      passageAction:this.lastEscapePassageAction
    }
    this.log.log('[Alice exploration] escape survey:',JSON.stringify(this.lastEscapeSurvey))
    return this.lastEscapeSurvey
  },
  }
}
module.exports={createDoorRuntimeMethods}
