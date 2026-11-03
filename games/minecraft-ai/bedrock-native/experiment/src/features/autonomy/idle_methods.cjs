'use strict'
// Original AliceBedrockRuntime methods extracted without behavior changes.
// The original Alice instance remains sole owner of tasks, safety and witnesses.
const {createIdleAdmission}=require('./idle_admission.cjs')
function createIdleRuntimeMethods({WOOD_LOGS,evaluateShelter,placeShelterBlock,homeAgenda,observedNaturalTree,selectResourceStep,scoutStartProof,startupTerrainObserved,surveyVoxelActions,selectSafeWalkingCandidate,pickVerticalStep,assessEarthwork,serverPositionProof,planDoorOpen,attemptDoorOpen,validateApproach,approachDoor,selectDrive,environment,candidateScout,decideAutonomousResponse,siteKey,simpleReason,HOSTILES,THREAT_CLEAR_MS,recognize}){
  const reviewIdleAdmission=createIdleAdmission({WOOD_LOGS,homeAgenda,scoutStartProof,startupTerrainObserved,serverPositionProof,evaluateShelter,environment,THREAT_CLEAR_MS})
  return {
  async idleTick(){
    // Spawn readiness and the periodic controller share one decision flight.
    if(this.idleBusy)return
    this.idleBusy=true
    try{return await this.runIdleDecision()}
    finally{this.idleBusy=false}
  },
  async runIdleDecision(){
    const review=reviewIdleAdmission.call(this)
    if(!review.allowed)return
    const {goalInventory,goalHasWeapon,goalWood,goalPlan,night,
      shelter,shelterPriority,canBuild}=review
    if(this.p.autonomy_policy.mayStartIdleWork({now:this.clock(),lastHumanAt:this.lastHumanAt,
      nextWorkAt:this.nextIdleAt,state:this.core.state,following:false,health:this.bot.health,underThreat:false})){
      this.nextIdleAt=this.clock()+this.p.autonomy_policy.AUTONOMY_WORK_COOLDOWN_MS
      const inv=goalInventory,weapon=goalHasWeapon,wood=goalWood,plan=goalPlan
      // Night is not synonymous with "wait until day". Inspect possible
      // emergency cover and progress a build ONE block at a time if every
      // existing protection, inventory, hostiles and BDS-position gate passes.
      if(shelterPriority){
        // Surviving with a usable weapon outranks adding more shelter blocks.
        // If weapon crafting proves impossible, the bounded craft cooldown
        // lets the existing one-block shelter path continue on review.
        if(night&&!weapon&&wood>=2&&
           this.clock()>=this.nextAutonomousCraftAt){
          this.startJob('CRAFT','夜间生存',
            signal=>this.craftWeaponOrTable('wooden_sword',signal),{
              label:'优先制作防身木剑',announce:false})
          return
        }
        const safeEnemies=Object.values(this.bot.entities||{})
          .filter(e=>HOSTILES.has(e?.name)&&e.position?.distanceTo?.(this.bot.entity.position)<12)
        const proof=serverPositionProof(this.bot,this.movementEvidence,this.clock)
        if(canBuild&&proof.ok&&safeEnemies.length===0&&
            this.bot.health>=16&&this.clock()-this.lastShelterAttemptAt>=5000){
          this.lastShelterAttemptAt=this.clock()
          this.startJob('BUILD','自主庇护',signal=>placeShelterBlock(this.bot,shelter,{
            signal,evidence:this.movementEvidence,clock:this.clock,
            safe:()=>this.ready()&&this.job?.signal===signal&&
              this.core.state==='BUILD'&&!this.core.hasFollowIntent()&&
              this.liveBehavior.settings.autonomyEnabled&&
              this.liveBehavior.settings.agentMode==='autonomous'&&
              !this.goalPlanner.stoppedByHuman&&!this.threat()&&!this.safetyBusy&&
              !Object.values(this.bot.entities||{}).some(e=>HOSTILES.has(e?.name)&&
                e.position?.distanceTo?.(this.bot.entity.position)<12)&&
              this.bot.health>=16
          }),{label:'搭建临时庇护结构：放置一块已验证材料',announce:false})
          return
        }
        const why=!canBuild?shelter?.reason||'shelter_no_safe_candidate':
          !proof.ok?'shelter_position_unconfirmed':
          safeEnemies.length?'shelter_build_blocked':'shelter_no_safe_candidate'
        // Unable to build is not automatically permission to wait all night.
        // A separate, stricter short night-safety route may be attempted.
        if(night&&this.tryNightReposition(why))return
        // Preserve the actionable shelter-build blocker; the distinct
        // nightSurvival field reports why a fallback walk was unsafe.
        this.lastIdleHold={goal:'SECURE_SHELTER',reason:why,
          at:this.clock(),nextReviewAt:this.clock()+15000}
        this.continuousGoal.wait(why)
        this.log.log('[Alice shelter] no placement authorized:',JSON.stringify({
          reason:why,phase:this.lastWorldRoutine.phase,
          material:shelter?.material??null,remaining:shelter?.remaining??null,
          serverPositionVerified:proof.ok===true,nearbyHostiles:safeEnemies.length,
          nextReviewMs:15000,worldModification:false}))
        this.nextIdleAt=Math.min(this.nextIdleAt,this.clock()+15000)
        return
      }
      const place=this.bot.entity.position
      const woodFailure=this.failureMemory.blocked('wood',place)
      const movementFailure=this.failureMemory.blocked('motion',place)
      // Deterministic resource-first mission step: a nearby tree must pass
      // the SAME strict canopy/structure check as the eventual dig executor.
      // Inventory-only crafting is allowed without an outdoor scout. Actual
      // success is still the inventory-change verification, never the prompt.
      const observedTree=plan==='COLLECT_WOOD'||plan==='LEARN_WEAPON'&&wood<2?
        !woodFailure&&this.lastWorldRoutine.safeToExplore?
          observedNaturalTree(this.bot,{radius:12,maxColumns:3}):null:null
      const resourceStep=selectResourceStep({plan,hasWeapon:weapon,wood,
        craftDeferred:this.clock()<this.nextAutonomousCraftAt,
        woodFailure:!!woodFailure,phase:this.lastWorldRoutine.phase,
        safeToExplore:this.lastWorldRoutine.safeToExplore,
        tree:observedTree})
      const proofKey=[siteKey(place),resourceStep.action,resourceStep.reason].join('|')
      this.lastResourceOpportunity={action:resourceStep.action,
        reason:resourceStep.reason,treeVerified:observedTree?.ok===true,
        inventoryWood:wood,observedAt:this.clock()}
      if(this.lastResourceOpportunityKey!==proofKey){
        this.lastResourceOpportunityKey=proofKey
        this.log.log('[Alice mission] resource opportunity:',
          JSON.stringify(this.lastResourceOpportunity))
      }
      // Explicit user STOP/FOLLOW and safety gates were checked at idleTick
      // entry; no awaited model step can interleave before this startJob.
      if(resourceStep.action==='gather_one_log'&&!movementFailure&&this.bot.health>=16){
        this.startJob('GATHER','自主任务',signal=>this.runVerifiedResourceStep('GATHER',signal),{
          label:'天然树木：实际收集一块原木',announce:false})
        return
      }
      if(resourceStep.action==='craft_wooden_sword'){
        this.startJob('CRAFT','自主任务',
          signal=>this.runVerifiedResourceStep('CRAFT',signal),{
            label:'背包材料：实际制作木剑',announce:false})
        return
      }
      // Night is an active survival phase. After bed/shelter/inventory work,
      // attempt only an observed, equal-height, two-cell safe reposition.
      if(night&&this.tryNightReposition('no_safe_shelter_or_bed'))return
      // Historical site-wide `scout` failures are retained for audit but
      // cannot block the new route-aware 3D planner. A failed specific
      // waypoint is excluded, leaving alternate verified routes available.
      // Read-only, bounded 3D voxel mechanics are observed BEFORE the LLM.
      // Unlike natural-only scout routes, verified collision shapes recognize
      // artificial full-block floors and half-block surfaces. Up/down/jumps
      // remain candidate knowledge ONLY, never automatic physical actions.
      const voxel=surveyVoxelActions(this.bot,{radius:4,maxNodes:96,maxReads:640})
      const reasons=Object.entries(voxel.blockedReasons||{})
        .sort((a,b)=>b[1]-a[1]).slice(0,3)
      this.lastVoxelNavigation={status:voxel.status,reason:voxel.reason,
        center:voxel.center||null,reachableCells:voxel.reachableCells,
        unknownBlocks:voxel.unknownBlocks,
        blockers:Object.fromEntries(reasons),
        candidate:voxel.route?{target:voxel.route.target,steps:voxel.route.steps,
          actions:[...new Set(voxel.route.actions)],executable:false}:null,
        flatCandidate:voxel.walkRoute?{target:voxel.walkRoute.target,
          steps:voxel.walkRoute.steps,actions:['WALK'],executable:false}:null}
      const voxelKey=JSON.stringify(this.lastVoxelNavigation)
      if(voxelKey!==this.lastVoxelKey){
        this.lastVoxelKey=voxelKey
        this.log.log('[Alice voxel] collision-aware route observed:',
          JSON.stringify(this.lastVoxelNavigation))
      }
      const resourceNeed=plan==='COLLECT_WOOD'||plan==='LEARN_WEAPON'&&wood<2
      // In hybrid mode an untried resource site may have no verified tree,
      // while an independently observed flat corridor can still be explored.
      // Do not require a *failed harvest* as the sole way to unlock motion.
      const initialSafeWalk=(plan==='OBSERVE'||resourceNeed&&!woodFailure)&&
        !movementFailure&&this.lastWorldRoutine.safeToExplore&&this.bot.health>=16
      const shouldProbe=woodFailure&&!movementFailure&&this.lastWorldRoutine.safeToExplore
      const failedWaypoints=new Set([...this.failureMemory.activeRoutes(),
        ...this.explorationProgress.excluded()])
      let candidate=shouldProbe?candidateScout(this.bot,{
        avoid:this.scoutVisited,blockedCells:failedWaypoints,
        previousDirection:this.scoutDirection}):null
      // A single best flat route may lead into the standoff zone of a
      // hostile. Scan multiple fully observed WALK-only alternatives and
      // prefer safe routes *away* from known threats. Never lower the safety
      // radius just to force movement or authorize step-down/jump/dig/place.
      const hostiles=()=>Object.values(this.bot.entities||{})
        .filter(e=>HOSTILES.has(e?.name)&&e.position).map(e=>e.position)
      const walkGate=shouldProbe||initialSafeWalk?
        selectSafeWalkingCandidate(voxel,{hostiles:hostiles(),
          blocked:failedWaypoints,visited:this.scoutVisited,
          origin:this.bot.entity?.position}):
        {candidate:null,reason:'daylight_or_resource_policy_gate',
          checkedRoutes:0,threatRoutes:0,blockedRoutes:0,knownHostiles:0}
      this.lastVoxelNavigation.walkSelection={
        reason:walkGate.reason,explorationProgress:this.explorationProgress.summary(),
        checkedRoutes:walkGate.checkedRoutes,
        threatRoutes:walkGate.threatRoutes,blockedRoutes:walkGate.blockedRoutes,
        knownHostiles:walkGate.knownHostiles}
      const verticalGate=shouldProbe||initialSafeWalk?
        pickVerticalStep(voxel,{origin:this.bot.entity?.position,
          hostiles:hostiles(),blocked:failedWaypoints,visited:this.scoutVisited}):
        {candidate:null,reason:'daylight_or_safety_gate'}
      const terrainWork=assessEarthwork(this.bot)
      const positionProof=serverPositionProof(this.bot,this.movementEvidence,this.clock)
      this.lastTerrainAdaptation={
        vertical:verticalGate.candidate?{action:verticalGate.candidate.action,
          target:verticalGate.candidate.target,reason:verticalGate.reason}:
          {reason:verticalGate.reason},
        earthwork:terrainWork.candidate?{action:terrainWork.candidate.action,
          target:terrainWork.candidate.target,reason:terrainWork.reason}:
          {reason:terrainWork.reason},
        positionProof:positionProof.reason}
      const terrainKey=JSON.stringify(this.lastTerrainAdaptation)
      if(terrainKey!==this.lastTerrainAdaptationKey){
        this.lastTerrainAdaptationKey=terrainKey
        this.log.log('[Alice voxel] terrain adaptation observed:',
          JSON.stringify(this.lastTerrainAdaptation))
      }
      const walkGateKey=JSON.stringify(this.lastVoxelNavigation.walkSelection)
      if(this.lastWalkGateKey!==walkGateKey){
        this.lastWalkGateKey=walkGateKey
        this.log.log('[Alice exploration] flat route selection:',
          JSON.stringify(this.lastVoxelNavigation.walkSelection))
      }
      if(walkGate.candidate&&(initialSafeWalk||!candidate?.ok))candidate=walkGate.candidate
      if(!walkGate.candidate&&verticalGate.candidate)candidate=verticalGate.candidate
      let decision=decideAutonomousResponse({plan,woodCount:wood,
        woodFailure,movementFailure,world:this.lastWorldRoutine,scoutCandidate:candidate})
      // Preserve the earlier failed-resource observation behavior, including
      // night and movement-evidence cooldowns: observation is READ ONLY.
      // Also review a built-room exit before any wood-gathering failure when
      // natural resources are unavailable. A discovered exit is NOT a permit.
      const firstDoorReview=!night&&resourceNeed&&observedTree?.ok!==true&&
        this.lastWorldRoutine.safeToExplore===true&&!movementFailure
      const traditionalDoorReview=woodFailure&&
        ['WAIT','SCOUT'].includes(decision.action)
      if((traditionalDoorReview||firstDoorReview)&&
          this.clock()-this.lastEscapeSurveyAt>=90000)
        this.observeBlockedRoom()
      // An older door must not follow Alice after her actual position changes.
      const survey=this.lastEscapeSurvey
      const origin=survey?.center,pos=this.bot.entity?.position
      const nearbySurvey=survey&&Array.isArray(origin)&&pos&&
        this.clock()-this.lastEscapeSurveyAt<=25000&&
        Math.hypot(pos.x-(origin[0]+0.5),pos.y-origin[1],
          pos.z-(origin[2]+0.5))<=2.25?survey:null
      // A narrow loaded room can have a surveyed edge frontier without
      // there being a verified outdoor exit. Keep its wooden door eligible
      // for strict one-cell BDS navigation; wide reachable areas still scout.
      const enclosedCandidate=firstDoorReview&&nearbySurvey?.door&&
        (nearbySurvey.status==='door_interaction_candidate'||
          nearbySurvey.openFrontier&&
          Number.isSafeInteger(nearbySurvey.reachableCells)&&
          nearbySurvey.reachableCells<32)
      // Preserve the originally authorized short-reach (up to two observed
      // steps) door interaction and long-route validation separately.
      // A reachable wooden handle is not a BDS-confirmed passage.
      const freshDoor=(woodFailure||enclosedCandidate)&&!movementFailure&&
        this.clock()-this.lastEscapeSurveyAt<=25000
          ?this.lastEscapeSurvey?.door||null:null
      let doorExecutable=false
      if(freshDoor){
        const door=freshDoor,route=door.approach?.waypoints
        if(Array.isArray(route)&&route.length>2)
          doorExecutable=validateApproach(this.bot,door).ok===true
        else if(Array.isArray(route)&&route.length<=2){
          const doorGate=planDoorOpen(this.bot,{doorCandidates:[door]})
          doorExecutable=doorGate.ok===true||doorGate.reason==='door_already_open'
        }
      }
      const indoorDoorPriority=!!enclosedCandidate&&doorExecutable
      if(indoorDoorPriority)
        decision={action:'WAIT',goal:'FIND_ROOM_EXIT',
          reason:'observed_indoor_exit_before_resource_scout'}
      const doorDriven=woodFailure||indoorDoorPriority
      const proposedRoute=freshDoor?.approach?.waypoints||[]
      const drive=selectDrive({decision,world:this.lastWorldRoutine,
        survey:nearbySurvey,doorExecutable,woodFailure:!!doorDriven,
        movementFailure:!!movementFailure,
        needsRawMaterials:plan==='COLLECT_WOOD'||plan==='LEARN_WEAPON'&&wood<2})
      decision=drive.decision
      this.driveJournal.observe(drive)
      this.recordAutonomousDecision(decision)
      // WAIT is an explicit result of the observed scene, not "no goal".
      // Active work still starts only through the existing guarded startJob.
      if(decision.action==='WAIT')
        this.continuousGoal.wait(this.lastWorldRoutine.safeToExplore?
          'no_safe_route':'waiting_for_daylight')
      if(indoorDoorPriority){
        // Prioritize already inspected non-destructive door navigation over a
        // speculative model scout. Existing startJob and independent BDS proof
        // still decide whether any physical action can happen.
        this.log.log('[Alice exploration] enclosed-door priority:',
          JSON.stringify({reason:'observed_indoor_exit_before_resource_scout',
            steps:proposedRoute.length,serverMovementVerified:false}))
      }else if(this.planner?.url){
        const actionEpoch=this.epoch
        const modelOutcome=await this.runAutonomousModelStep({wood,woodFailure,movementFailure,candidate,drive,terrainWork})
        // A real witnessed action or STOP may have advanced the epoch while
        // the LLM was thinking. Never let its late completion replace the
        // active job's hold/status or trigger a second action.
        if(this.epoch!==actionEpoch||this.closed||this.job)return
        // OBSERVE is not a veto of a separately validated, bounded
        // non-destructive skill. The old unconditional return disabled indoor
        // door/SCOUT execution whenever Ollama was configured.
        // Model error, STOP, rejected tool and stale epoch NEVER fall through.
        if(!['observe','deferred'].includes(modelOutcome)){
          // Invalid/offline/cancelled model results never authorize motion.
          this.nextIdleAt=Math.min(this.nextIdleAt,this.clock()+30000)
          this.lastIdleHold={goal:drive.driveGoal,reason:'model_'+modelOutcome,
            at:this.clock(),nextReviewAt:this.nextIdleAt}
          return
        }
        // Awaiting Ollama yields the event loop to FOLLOW/STOP/COMBAT. Recheck
        // ownership before *any* local fallback, including observe cooldowns.
        if(this.epoch!==actionEpoch||this.closed||this.job||
           this.core.state!=='IDLE'||this.core.hasFollowIntent()||
           !this.liveBehavior.settings.autonomyEnabled||
           this.liveBehavior.settings.agentMode!=='autonomous'||
           this.goalPlanner.stoppedByHuman||!this.ready()||
           this.safetyBusy||this.threat()||this.bot.health<16||
           this.verticalWatch.active())return
        const observedSafeWalk=initialSafeWalk&&candidate?.ok===true&&
          ['observed_voxel_walking_only','observed_one_cell_vertical'].includes(candidate.kind)&&
          environment(this.bot).safeToExplore===true
        if(observedSafeWalk&&['WORK','OBSERVE'].includes(decision.action)){
          // Revalidate threats after asynchronous Ollama planning. A fresh
          // mob may have entered the corridor during the model roundtrip.
          const freshGate=candidate.kind==='observed_one_cell_vertical'?
            {candidate:this.verifyVerticalTransition(candidate)?candidate:null}:
            selectSafeWalkingCandidate(voxel,{
            hostiles:Object.values(this.bot.entities||{})
              .filter(e=>HOSTILES.has(e?.name)&&e.position).map(e=>e.position),
            blocked:new Set([...this.failureMemory.activeRoutes(),
              ...this.explorationProgress.excluded()]),visited:this.scoutVisited,
            origin:this.bot.entity?.position})
          if(!freshGate.candidate||freshGate.candidate.key!==candidate.key){
            this.log.log('[Alice exploration] flat route selection:',
              JSON.stringify({reason:'flat_route_changed_during_model_planning',
                checkedRoutes:freshGate.checkedRoutes,
                threatRoutes:freshGate.threatRoutes}))
            return
          }
          this.log.log('[Alice autonomy] verified local skill after model observation:',
            JSON.stringify({goal:'DISCOVER_RESOURCES',action:'SCOUT',
              reason:'daylight_verified_safe_walk_or_vertical_transition'}))
          this.startJob('EXPLORE','自主探索',
            signal=>this.boundedScout(candidate,signal),{
              label:'观察新区域寻找材料',announce:false,scoutCandidate:candidate})
          if(this.job?.type!=='EXPLORE'&&
             scoutStartProof(this.bot,this.movementEvidence,this.clock).reason===
               'scout_bds_position_unavailable')
            this.prepareDeferredScout(candidate,'自主探索')
          return
        }
        if(this.maybeStartEarthwork(terrainWork,candidate,movementFailure))return
        const localSkillPermitted=!movementFailure&&(
          !!doorDriven&&decision.action==='SCOUT'&&decision.candidate?.ok===true||
          !!doorDriven&&decision.action==='WAIT'&&!!freshDoor&&
            ['FIND_ROOM_EXIT','OBSERVE_ROOM'].includes(drive.driveGoal))
        if(!localSkillPermitted){
          const reason=night&&this.lastNightPlan?.reason||
            (resourceNeed&&!environment(this.bot).safeToExplore?
            'daylight_required':movementFailure?'movement_evidence_cooldown':
            candidate?.ok!==true?walkGate.reason||'no_verified_flat_walk_candidate':
            'no_authorized_skill_for_current_goal')
          const key=[siteKey(this.bot.entity?.position),this.lastVoxelKey,reason].join('|')
          // Shorten observation cadence, never physical safety cooldowns.
          this.nextIdleAt=Math.min(this.nextIdleAt,this.clock()+30000)
          this.lastIdleHold={goal:drive.driveGoal,reason,
            at:this.clock(),nextReviewAt:this.nextIdleAt}
          if(this.lastSafeSkillHoldKey!==key){
            this.lastSafeSkillHoldKey=key
            this.log.log('[Alice autonomy] model observe without local action:',
              JSON.stringify({goal:drive.driveGoal,action:decision.action,reason}))
          }
          return
        }
        this.log.log('[Alice autonomy] verified local skill after model observation:',
          JSON.stringify({goal:drive.driveGoal,action:decision.action,
            reason:'model_observe_does_not_disable_bounded_navigation'}))
      }else{
        this.goalPlanner.goalSource='fixed-safety' // Explicit model-disabled behavior.
        // Model-disabled autonomous Alice can use the same strictly observed
        // 2–8 cell all-WALK path, without adding new movement primitives.
        if(initialSafeWalk&&candidate?.ok===true&&
           ['observed_voxel_walking_only','observed_one_cell_vertical'].includes(candidate.kind)&&
           ['WORK','OBSERVE'].includes(decision.action)){
          const freshGate=candidate.kind==='observed_one_cell_vertical'?
            {candidate:this.verifyVerticalTransition(candidate)?candidate:null}:
            selectSafeWalkingCandidate(voxel,{
            hostiles:Object.values(this.bot.entities||{})
              .filter(e=>HOSTILES.has(e?.name)&&e.position).map(e=>e.position),
            blocked:new Set([...this.failureMemory.activeRoutes(),
              ...this.explorationProgress.excluded()]),visited:this.scoutVisited,
            origin:this.bot.entity?.position})
          if(freshGate.candidate?.key===candidate.key&&
             this.liveBehavior.settings.agentMode==='autonomous'&&
             !this.goalPlanner.stoppedByHuman&&!this.threat()){
            this.startJob('EXPLORE','自主探索',
              signal=>this.boundedScout(candidate,signal),{
                label:'独立探索已验证的短平路',announce:false,scoutCandidate:candidate})
            if(this.job?.type!=='EXPLORE'&&
               scoutStartProof(this.bot,this.movementEvidence,this.clock).reason===
                 'scout_bds_position_unavailable')
              this.prepareDeferredScout(candidate,'自主探索')
            return
          }
        }
      }
      if(!indoorDoorPriority&&this.maybeStartEarthwork(terrainWork,candidate,movementFailure))return
      if(decision.action==='SCOUT'){
        this.startJob('EXPLORE','自主探索',signal=>this.boundedScout(decision.candidate,signal),{
          label:'寻找未探索的安全资源区域',announce:false,scoutCandidate:decision.candidate})
        return
      }
      if(decision.action==='WAIT'){
        // A failed outdoor/natural-only scout can be inside a valid player-built
        // room. Observe artificial floors, possible doors, steps and blockers
        // without authorizing a new movement or a destructive Minecraft action.
        // Survey was captured BEFORE SCOUT/WAIT selection, to avoid
        // hiding a known indoor exit behind outdoor resource planning.
        // Indoor doorway interaction is NOT ordinary night-time outdoor scouting.
        // One observed closed wooden door, in immediate reach, with a short
        // contiguous full-block approach. No navigation, excavation or roaming.
        const door=this.lastEscapeSurvey?.door
        if(doorDriven&&!movementFailure&&
            ['FIND_ROOM_EXIT','OBSERVE_ROOM'].includes(drive.driveGoal)&&
            door&&this.clock()-this.lastEscapeSurveyAt<=25000){
          const doorKey=door.position?.join(',')
          const attemptedRecently=doorKey===this.lastEscapeDoorAttemptKey&&
            this.clock()-this.lastEscapeDoorAttemptAt<600000
          // A wooden handle within the original strictly validated short
          // interaction range may be opened without walking. Longer routes
          // still require BDS-proven single-cell approaches.
          const needApproach=Array.isArray(door.approach?.waypoints)&&
            door.approach.waypoints.length>2
          const approachRecently=doorKey===this.lastEscapeApproachKey&&
            this.clock()<this.lastEscapeApproachRetryAt
          if(needApproach&&!approachRecently){
            const proposal=validateApproach(this.bot,door)
            if(proposal.ok&&this.bot.health>=16){
              this.lastEscapeApproachKey=doorKey
              this.lastEscapeApproachAt=this.clock()
              this.lastEscapeApproachRetryAt=this.clock()+180000
              this.startJob('EXPLORE','自主脱困',async signal=>{
                const outcome=await approachDoor(this.bot,door,{
                  signal,GoalNear:this.api?.GoalNear,Movements:this.api?.Movements,
                  configureMoves:m=>this.p.terrain_policy.cautiousPathOptions(m),
                  movementEvidence:this.movementEvidence,clock:this.clock,
                  safe:()=>this.escapeApproachGuard(signal)
                })
                if(!signal.aborted&&outcome.attempted===true&&
                    outcome.reason==='approach_first_cell_awaits_independent_bds_pair'&&
                    outcome.witnessStart&&Number.isSafeInteger(outcome.startedAt)&&
                    !this.pendingDoorApproachStep){
                  this.pendingDoorApproachStep={
                    ...outcome.witnessStart,startedAt:outcome.startedAt,
                    door:door.position.slice(),epoch:this.epoch
                  }
                }
                // Threat/STOP preemption can abort the task without a normal
                // result log; it must still bound the next automatic attempt.
                if(signal.aborted){
                  this.lastEscapeApproachRetryAt=this.clock()+30000
                  // Genuine safety cancellation should not inherit an unrelated
                  // two-minute wood-work schedule after danger has cleared.
                  if(String(signal.reason?.message||'').includes('safety overrides lower priority task')){
                    this.nextIdleAt=Math.min(this.nextIdleAt,this.lastEscapeApproachRetryAt)
                    this.lastEscapeSurveyAt=Number.NEGATIVE_INFINITY
                  }
                }else{
                  const unsafe=typeof outcome.reason==='string'&&
                    /^(approach_preempted|approach_conditions_changed|approach_aborted)/.test(outcome.reason)
                  const pathFailed=String(outcome.reason||'').includes('No path to the goal')
                  this.lastEscapeApproachRetryAt=this.clock()+
                    (outcome.ok?45000:unsafe?30000:pathFailed?120000:180000)
                  if(!outcome.ok){
                    this.nextIdleAt=Math.min(this.nextIdleAt,this.lastEscapeApproachRetryAt)
                    // Re-scan current topology after an interrupted/failed move;
                    // never reuse old waypoints as if they are still connected.
                    this.lastEscapeSurveyAt=Number.NEGATIVE_INFINITY
                  }
                }
                if(!signal.aborted){
                  this.lastEscapeDoorAction={reason:outcome.reason,attempted:outcome.attempted===true,
                    openObserved:false,door:door.position,at:this.clock(),
                    steps:outcome.steps||null,lastWaypoint:outcome.lastWaypoint||null,
                    serverMovementVerified:outcome.serverMovementVerified===true}
                  if(this.lastEscapeSurvey)this.lastEscapeSurvey.doorAction=this.lastEscapeDoorAction
                  this.log.log('[Alice exploration] doorway approach outcome:',
                    JSON.stringify(this.lastEscapeDoorAction))
                  if(outcome.ok){
                    // Do not trust old topology after moving. Next autonomous
                    // cycle must freshly observe the now-nearby door.
                    this.lastEscapeSurveyAt=Number.NEGATIVE_INFINITY
                    this.nextIdleAt=this.clock()+15000
                  }
                }
                return outcome
              },{label:'安全接近房间木门',announce:false})
              return
            }
            if(!proposal.ok&&this.lastEscapeDoorAction?.reason!==proposal.reason){
              this.lastEscapeDoorAction={reason:proposal.reason,attempted:false,
                openObserved:false,door:door.position,at:this.clock(),
                serverMovementVerified:false}
              if(this.lastEscapeSurvey)this.lastEscapeSurvey.doorAction=this.lastEscapeDoorAction
              this.log.log('[Alice exploration] doorway approach gated:',
                JSON.stringify(this.lastEscapeDoorAction))
            }
          }
          if(!needApproach){
            const doorSurvey={doorCandidates:[door]}
            const plan=planDoorOpen(this.bot,doorSurvey)
            if(plan.ok&&!attemptedRecently&&this.bot.health>=16){
              this.lastEscapeDoorAttemptKey=doorKey
              this.lastEscapeDoorAttemptAt=this.clock()
              this.startJob('EXPLORE','自主脱困',async signal=>{
                const outcome=await attemptDoorOpen(this.bot,doorSurvey,{
                  signal,safe:()=>this.ready()&&this.job?.signal===signal&&
                    this.core.state==='EXPLORE'&&this.bot.health>=16&&
                    !this.threat()&&!this.core.hasFollowIntent()&&
                    !this.safetyBusy&&this.liveBehavior.settings.autonomyEnabled
                })
                let finalOutcome=outcome
                if(!signal.aborted){
                  this.lastEscapeDoorAction={reason:outcome.reason,
                    attempted:outcome.attempted===true,openObserved:outcome.openObserved===true,
                    door:door.position,at:this.clock(),serverMovementVerified:false}
                  if(this.lastEscapeSurvey)this.lastEscapeSurvey.doorAction=this.lastEscapeDoorAction
                  this.log.log('[Alice exploration] door interaction outcome:',
                    JSON.stringify(this.lastEscapeDoorAction))
                  if(outcome.ok){
                    this.lastEscapePassageAttemptKey=doorKey
                    const crossed=await this.crossObservedDoor(door,signal)
                    if(!signal.aborted)this.recordEscapePassage(door,crossed)
                    // Open-door success is not successful passage. Preserve
                    // both observations and report the final requested action.
                    finalOutcome={...crossed,doorOpenObserved:true}
                  }
                }
                return finalOutcome
              },{label:'尝试打开附近木门',announce:false})
              return
            }
            if(plan.reason==='door_already_open'&&
                (this.lastEscapePassageAttemptKey!==doorKey||
                  this.clock()>=this.lastEscapePassageRetryAt)){
              this.lastEscapePassageAttemptKey=doorKey
              this.lastEscapePassageRetryAt=this.clock()+120000
              this.startJob('EXPLORE','自主脱困',async signal=>{
                const crossed=await this.crossObservedDoor(door,signal)
                if(!signal.aborted)this.recordEscapePassage(door,crossed)
                return crossed
              },{label:'通过已打开的房间木门',announce:false})
              return
            }
            if(!plan.ok&&this.lastEscapeDoorAction?.reason!==plan.reason){
              this.lastEscapeDoorAction={reason:plan.reason,attempted:false,
                openObserved:false,door:door.position,at:this.clock(),serverMovementVerified:false,
                stateFormat:plan.stateFormat||null}
              if(this.lastEscapeSurvey)this.lastEscapeSurvey.doorAction=this.lastEscapeDoorAction
              this.log.log('[Alice exploration] door interaction gated:',
                JSON.stringify(this.lastEscapeDoorAction))
            }
          }
        }
        if(candidate&&!candidate.ok){
          // A probe failure is not permission to walk, but must not hide
          // newly loaded terrain during the next independent observation.
          const previous=this.failureMemory.blocked('probe',place)
          if(!previous||previous.reason!==simpleReason(candidate.reason)){
            const deferred=this.failureMemory.mark('probe',place,candidate.reason)
            this.log.log('[Alice exploration] terrain probe evidence:',
              JSON.stringify({...deferred,examined:candidate.examined||null,
                terrainUnloaded:candidate.terrainUnloaded||0}))
          }
        }
        this.nextIdleAt=this.clock()+
          (drive.driveGoal==='PREPARE_DAYLIGHT'?15000:30000)
        this.lastIdleHold={goal:drive.driveGoal,
          reason:night&&this.lastNightPlan?.reason||
            decision.reason||candidate?.reason||'waiting_for_safe_route',
          at:this.clock(),nextReviewAt:this.nextIdleAt}
        this.continuousGoal.wait(this.lastWorldRoutine.safeToExplore?
          'no_safe_route':'waiting_for_daylight')
        return
      }
      if(plan==='LEARN_WEAPON') {
        // First acquire materials in GATHER state. Do not report "CRAFT" when
        // the only attempted world action is searching for raw wood.
        if(wood<2)this.startJob('GATHER','自主任务',signal=>this.gatherCount(1,signal))
        else this.startJob('CRAFT','自主任务',async signal=>{
          const result=await this.craftWeaponOrTable('wooden_sword',signal)
          if(result.ok)return result
          return result
        })
      } else if(plan==='COLLECT_WOOD')this.startJob('GATHER','自主任务',signal=>this.gatherCount(1,signal))
      // The fully equipped, model-disabled OBSERVE path must also resurvey.
      // This schedules only read-only observation, not physical movement.
      if(!this.job){
        this.nextIdleAt=Math.min(this.nextIdleAt,this.clock()+30000)
        this.lastIdleHold={goal:this.driveJournal.get()?.goal||decision.goal,
          reason:this.lastVoxelNavigation?.walkSelection?.reason||decision.reason||'no_safe_task',
          at:this.clock(),nextReviewAt:this.nextIdleAt}
      }
    }
    if(!this.job&&this.clock()-this.lastLookAt>20000&&typeof this.bot.look==='function'){
      this.lastLookAt=this.clock()
      try{await this.bot.look(Math.random()*Math.PI*2,0,true)}catch(e){this.log.warn('[Alice look]',e.message)}
    }
    const near=Object.values(this.bot.players||{}).some(p=>p?.entity?.position?.distanceTo?.(this.bot.entity.position)<16)
    if(this.p.social_policy.maySpeakSpontaneously({state:this.core.state,hasActiveAction:!!this.job,
      hasFollowIntent:false,underThreat:false,nearPlayer:near,elapsed:this.clock()-this.lastQuipAt,roll:Math.random()})){
      this.lastQuipAt=this.clock();this.say('我正在留意附近的资源和怪物，有需要可以叫我。')
    }
  },
  }
}
module.exports={createIdleRuntimeMethods}
