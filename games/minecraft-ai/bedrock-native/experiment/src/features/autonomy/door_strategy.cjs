'use strict'
// Synchronous wooden-door review and WAIT job admission. Original async job callbacks remain unchanged.
function createDoorStrategy({validateApproach,planDoorOpen,selectDrive,approachDoor,attemptDoorOpen}){
  function reviewDoorStrategy({decision:initialDecision,night,resourceNeed,observedTree,woodFailure,movementFailure,plan,wood}){
    let decision=initialDecision
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
    return {decision,freshDoor,indoorDoorPriority,doorDriven,proposedRoute,drive}
  }
  function runDoorWaitStrategy({doorDriven,movementFailure,drive}){
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
          const openPlan=planDoorOpen(this.bot,{doorCandidates:[door]})
          const needApproach=Array.isArray(door.approach?.waypoints)&&
            door.approach.waypoints.length>0&&
            (door.approach.waypoints.length>2||
              !openPlan.ok&&openPlan.reason!=='door_already_open')
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
              return true
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
              return true
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
              return true
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
    return false
  }
  return {reviewDoorStrategy,runDoorWaitStrategy}
}
module.exports={createDoorStrategy}
