'use strict'
// Original AliceBedrockRuntime methods, same instance and validated policy.
function createScoutRuntimeMethods({verifyScoutStep,nightConditions,probeFlatInput,selectFailedFlatStep,observedDoorBits,validateCrossing,environment}){
  return {
  settlePendingScoutStepOnWitness(){
    const step=this.pendingScoutStep
    if(!step)return {state:'none'}
    const now=this.clock()
    if(this.closed||step.epoch!==this.epoch||now<step.startedAt||
       now-step.startedAt>240000){
      this.pendingScoutStep=null
      return {state:'rejected',reason:'scout_step_context_or_deadline_changed'}
    }
    const out=verifyScoutStep(step,this.movementEvidence?.get?.(),
      this.bot.entity?.position,now)
    if(out.reason==='scout_step_new_independent_pair_missing')
      return {state:'waiting',reason:out.reason}
    this.pendingScoutStep=null
    const complete=out.ok&&step.candidate?.waypoints?.length===1&&
      step.candidate?.key===[step.target.x,step.target.y,step.target.z].join(',')
    const result={ok:complete,attempted:true,
      reason:out.ok?(complete?'scout_step_server_verified_full_route':
        'scout_step_server_verified_partial_route'):out.reason,
      serverMovementVerified:out.ok,
      serverMovedBlocks:out.ok?out.travelledBlocks:null,
      confirmedEndpoint:complete?step.candidate.key:null}
    if(step.candidate?.key){
      const progress=this.explorationProgress.finish(step.candidate,result)
      if(progress)this.log.log('[Alice exploration] endpoint feedback:',JSON.stringify(progress))
    }
    if(out.ok){
      // Even a verified partial step is NOT the original multi-cell goal.
      // Re-observe current blocks before admitting any additional path.
      this.lastVoxelKey=null
      this.nextIdleAt=Math.min(this.nextIdleAt,now+15000)
      this.scoutDirection=null
    }
    this.lastScoutProgress={confirmed:complete,partialVerified:out.ok&&!complete,
      reason:result.reason,
      failureKind:out.ok?'none':'evidence_gap',
      serverMovedBlocks:out.ok?Math.round(out.travelledBlocks*100)/100:null,
      at:now}
    if(out.ok&&!complete){
      this.continuousGoal.acknowledgePartial('EXPLORE',step.source,result)
    }else{
      this.continuousGoal.finish('EXPLORE',step.source,result)
      if(step.source==='自主模型')this.goalPlanner.outcome(result)
    }
    this.log.log('[Alice exploration] post-input scout step BDS witness:',
      JSON.stringify({reason:result.reason,serverMovementVerified:out.ok,
        fullRouteVerified:complete,serverMovedBlocks:this.lastScoutProgress.serverMovedBlocks}))
    return {state:out.ok?'verified':'rejected',reason:result.reason,
      serverMovementVerified:out.ok,fullRouteVerified:complete}
  },
  async boundedScout(candidate,signal,{allowNightFallback=false}={}){
    // At night only a verified two-cell flat defensive reposition may run;
    // ordinary scouting still requires daytime safety.
    // Keep the initial route origin stable as Pathfinder advances, but
    // evaluate health, hostile proximity, weather and footing against the
    // live bot on every waypoint. Do not turn night into normal daytime scout.
    const initial=this.bot.entity?.position
    const routeOrigin=initial&&{x:initial.x,y:initial.y,z:initial.z}
    const phaseAllowed=()=>environment(this.bot).safeToExplore||
      allowNightFallback&&nightConditions(this.bot,candidate.nightCorridor||candidate,{routeOrigin}).ok===true
    // One bounded local attempt, no break/place/sprint/teleport.
    // A one-cell verified climb may use normal Pathfinder jumping.
    // Pathfinder's local position estimate is not BDS server position evidence.
    if(signal?.aborted)return {ok:false,reason:'cancelled'}
    if(this.verticalWatch.active())return {ok:false,reason:'vertical_observation_hold'}
    if(candidate?.kind==='observed_one_cell_vertical'&&!this.verifyVerticalTransition(candidate))
      return {ok:false,reason:'vertical_transition_changed_or_unverified',attempted:false}
    if(!candidate?.ok||!Array.isArray(candidate.waypoints)||!candidate.waypoints.length||
       !this.bot.pathfinder?.goto||!this.api?.GoalNear||!this.api?.Movements)
      return {ok:false,reason:'scouting_navigation_unavailable'}
    if(!this.ready()||this.threat()||this.bot.health<16||this.core.hasFollowIntent()||
       !phaseAllowed())
      return {ok:false,reason:'unsafe_scout_start'}
    const start=this.bot.entity.position.clone()
    // A one-cell witness must not be used to authorize an arbitrary far
    // GoalNear or a diagonal detour under the guise of a bounded segment.
    if(this.requireBdsAlignedExplore){
      const first=candidate.waypoints[0],sx=Math.floor(start.x),
        sy=Math.floor(start.y),sz=Math.floor(start.z)
      if(!first||!['x','y','z'].every(k=>Number.isSafeInteger(first[k]))||
         Math.abs(first.x-sx)+Math.abs(first.z-sz)!==1||
         Math.abs(first.y-sy)>1)
        return {ok:false,reason:'scout_first_waypoint_not_adjacent',
          attempted:false,serverMovementVerified:false}
    }
    const p=candidate.target
    const checkpoint=this.movementEvidence?.checkpoint?.()||null
    const startingWitness=this.movementEvidence?.get?.()||null
    const timeoutMs=Math.min(20000,Math.max(6500,4000+candidate.distance*1250))
    let timer,aborted,ended=false,lastAttemptedWaypoint=null,lastAttemptStart=null
    let locallyCompletedWaypoints=0
    const deadline=new Promise((_,reject)=>{
      timer=setTimeout(()=>{ended=true;reject(Error('scout_timeout'))},timeoutMs)
      aborted=()=>reject(Error('scout_cancelled'))
      signal?.addEventListener('abort',aborted,{once:true})
    })
    try{
      // The chosen 3D route is explicit. Follow each *known* adjacent cell;
      // do not hand an arbitrary distant destination to A* for unknown detours.
      const moves=new this.api.Movements(this.bot)
      this.p.terrain_policy.cautiousPathOptions(moves)
      moves.canDig=false;moves.allow1by1towers=false;moves.canOpenDoors=false
      moves.allowParkour=false;moves.openable?.clear?.()
      this.bot.pathfinder.setMovements(moves)
      const traverse=async()=>{
        // Only ONE new waypoint per admitted independent BDS baseline.
        // A subsequent goto against the pre-input baseline is not a fresh
        // navigation admission, even if local Pathfinder says reached.
        for(const waypoint of (this.requireBdsAlignedExplore?
          candidate.waypoints.slice(0,1):candidate.waypoints)){
          lastAttemptedWaypoint=waypoint
          const before=this.bot.entity?.position
          lastAttemptStart=before&&[before.x,before.y,before.z].every(Number.isFinite)?
            {x:before.x,y:before.y,z:before.z}:null
          if(candidate.kind==='observed_one_cell_vertical'&&!this.verifyVerticalTransition(candidate))
             throw Error('vertical_transition_changed_or_unverified')
           if(ended||signal?.aborted||this.verticalWatch.active()||
             this.threat()||this.core.hasFollowIntent()||
             this.bot.health<16||!phaseAllowed())
            throw Error('scout_conditions_changed')
          await this.bot.pathfinder.goto(new this.api.GoalNear(
            waypoint.x,waypoint.y,waypoint.z,0))
          if(ended||signal?.aborted)throw Error('scout_cancelled_after_waypoint')
          const localPos=this.bot.entity?.position
          if(!localPos||Math.hypot(localPos.x-(waypoint.x+0.5),
              localPos.y-waypoint.y,localPos.z-(waypoint.z+0.5))>1.15)
            throw Error('scout_waypoint_not_reached')
          // Local-only waypoint resolution is NOT Bedrock server acceptance.
          locallyCompletedWaypoints++
        }
      }
      await Promise.race([traverse(),deadline])
      if(this.requireBdsAlignedExplore){
        if(signal?.aborted||ended||this.closed||this.threat()||
           this.core.hasFollowIntent()||this.bot.health<16||!phaseAllowed())
          return {ok:false,reason:'scout_conditions_changed',serverMovementVerified:false}
        const first=candidate.waypoints[0]
        const from=startingWitness?.independentLatestFeet
        const startAt=this.clock()
        if(!from||!['x','y','z'].every(k=>Number.isFinite(from[k]))||
           !Number.isInteger(startingWitness?.independentSamples)||
           !Number.isSafeInteger(startingWitness?.independentAt)||
           !first||!['x','y','z'].every(k=>Number.isSafeInteger(first[k]))||
           this.pendingScoutStep)
          return {ok:false,reason:'scout_start_witness_context_invalid',
            serverMovementVerified:false}
        const current=this.bot.entity?.position
        const localEstimate=current?Math.hypot(current.x-start.x,
          current.y-start.y,current.z-start.z):null
        this.pendingScoutStep={from:{x:from.x,y:from.y,z:from.z},
          target:{x:first.x,y:first.y,z:first.z},candidate,
          epoch:this.epoch,source:this.action?.source||'autonomous',
          startedAt:startAt,loginAt:startingWitness.loginAt??null,
          lifeEpochAt:startingWitness.lifeEpochAt??null,
          independentAt:startingWitness.independentAt,
          independentSamples:startingWitness.independentSamples}
        this.log.log('[Alice exploration] one waypoint locally reached:',JSON.stringify({
          localEstimateBlocks:Number.isFinite(localEstimate)?
            Math.round(localEstimate*100)/100:null,
          reason:'scout_step_awaiting_new_bds_pair',serverMovementVerified:false}))
        return {ok:false,reason:'scout_step_awaiting_new_bds_pair',
          attempted:true,serverMovementVerified:false,
          localEstimateBlocks:Number.isFinite(localEstimate)?
            Math.round(localEstimate*100)/100:null,
          distance:candidate.distance,elevationChanges:candidate.elevationChanges}
      }
      if(signal?.aborted||this.threat()||this.core.hasFollowIntent()||
         this.bot.health<16||!phaseAllowed())
        return {ok:false,reason:'scout_conditions_changed'}
      const local=start.distanceTo(this.bot.entity?.position||start)
      const server=this.movementEvidence?.get?.()
      const movement=this.movementEvidence?.progress?.(checkpoint)||
        {confirmed:false,reason:'server_position_not_observed'}
      const verifiedFeet=server?.latestFeet
      const age=server?.lastAt!=null?this.clock()-server.lastAt:Infinity
      const endDistance=verifiedFeet&&[verifiedFeet.x,verifiedFeet.y,verifiedFeet.z].every(Number.isFinite)?
        Math.hypot(verifiedFeet.x-(p.x+0.5),verifiedFeet.y-p.y,
          verifiedFeet.z-(p.z+0.5)):Infinity
      const localServerDelta=verifiedFeet&&this.bot.entity?.position&&
        [this.bot.entity.position.x,this.bot.entity.position.y,this.bot.entity.position.z].every(Number.isFinite)?
        Math.hypot(this.bot.entity.position.x-verifiedFeet.x,
          this.bot.entity.position.y-verifiedFeet.y,this.bot.entity.position.z-verifiedFeet.z):Infinity
      const confirmed=movement.confirmed===true&&age>=0&&age<=5000&&
        endDistance<=1.75&&localServerDelta<=1.25
      const result={ok:confirmed,serverMovementVerified:confirmed,
        reason:confirmed?'server_verified_scout_endpoint':'scout_server_endpoint_unconfirmed',
        localEstimateBlocks:Number.isFinite(local)?Math.round(local*100)/100:null,
        serverMovedBlocks:confirmed?movement.movedBlocks:null,
        serverEvidenceReason:movement.reason,serverEndpointDistance:Number.isFinite(endDistance)?
          Math.round(endDistance*100)/100:null,
        target:p,distance:candidate.distance,elevationChanges:candidate.elevationChanges,
        localServerDelta:Number.isFinite(localServerDelta)?Math.round(localServerDelta*100)/100:null,
        confirmedEndpoint:confirmed?candidate.key:null,
        direction:confirmed?candidate.direction:null}
      this.log.log('[Alice exploration] segment outcome:',JSON.stringify(result))
      return result
    }catch(err){
      const reason=String(err.message||'scout_navigation_failed').slice(0,90)
      const after=this.bot.entity?.position
      const localAfter=after&&[after.x,after.y,after.z].every(Number.isFinite)?
        {x:Math.round(after.x*100)/100,y:Math.round(after.y*100)/100,
          z:Math.round(after.z*100)/100}:null
      const before=lastAttemptStart
      const localMoved=before&&localAfter?
        Math.round(Math.hypot(localAfter.x-before.x,
          localAfter.y-before.y,localAfter.z-before.z)*100)/100:null
      const totalLocal=start&&after&&[after.x,after.y,after.z].every(Number.isFinite)?
        Math.round(Math.hypot(after.x-start.x,after.y-start.y,after.z-start.z)*100)/100:null
      const center=lastAttemptedWaypoint&&localAfter?{
        x:lastAttemptedWaypoint.x+.5,
        y:lastAttemptedWaypoint.y,z:lastAttemptedWaypoint.z+.5}:null
      const gap=center?Math.hypot(localAfter.x-center.x,
        localAfter.y-center.y,localAfter.z-center.z):null
      this.log.log('[Alice movement] A* waypoint failure:',JSON.stringify({
        reason:reason==='No path to the goal!'?'pathfinder_no_path':reason,
        firstWaypoint:candidate?.waypoints?.[0]||null,
        failedWaypoint:lastAttemptedWaypoint||null,
        before,lastAfter:localAfter,localMovedBlocks:localMoved,
        totalLocalEstimateBlocks:totalLocal,
        completedLocalWaypoints:locallyCompletedWaypoints,
        distanceToWaypoint:gap==null?null:Math.round(gap*100)/100,
        withinWaypoint:gap!=null&&gap<=.4,
        serverPositionSamples:this.movementEvidence?.get?.()?.received||0,
        bdsWitnessSamples:this.movementEvidence?.get?.()?.independentSamples||0
      }))
      // A* can report noPath for a later cell after reaching an earlier
      // waypoint locally. Select the failed cell itself, never re-probe the
      // already-completed prefix. Local position is not server proof.
      // Our independently observed voxel graph can have a verified flat
      // corridor where the pinned Java-derived Bedrock A* refuses even its
      // first waypoint. Diagnose that *transport*, not the strategic model:
      // one locally rechecked, bounded physical Bedrock input (never a
      // jump/dig/place, never an unverified multi-step success).
      if(reason==='No path to the goal!'&&
         candidate?.kind==='observed_voxel_walking_only'&&
         !signal?.aborted&&this.job?.signal===signal){
        const selection=selectFailedFlatStep(
          candidate,lastAttemptedWaypoint,this.bot.entity?.position)
        if(!selection.ok){
          this.log.log('[Alice movement] A* failed waypoint probe selection:',
            JSON.stringify({reason:selection.reason,attempted:false,
              failedWaypoint:lastAttemptedWaypoint||null}))
          return {ok:false,reason:selection.reason,attempted:false,
            serverMovementVerified:false,failedWaypoint:lastAttemptedWaypoint,
            target:candidate.target,elevationChanges:candidate.elevationChanges}
        }
        try{this.bot.pathfinder.stop?.()}catch{}
        this.log.log('[Alice movement] A* failed waypoint probe selection:',
          JSON.stringify({reason:selection.reason,attempted:false,
            failedWaypoint:lastAttemptedWaypoint,
            probeWaypoint:selection.selectedWaypoint,
            selectedIndex:selection.selectedIndex}))
        // The observed failed voxel can be a WOODEN DOOR that the generic
        // collision graph considered traversable. A* cannot reliably navigate
        // that Bedrock stateful block; the simple flat pulse explicitly denies
        // doors. Delegate instead to the independently validated OPEN-door
        // passage action, never activate (possibly closing) an opened door.
        const doorway=selection.selectedWaypoint
        let doorBlock=null
        try{
          const self=this.bot.entity?.position
          if(self?.offset)doorBlock=this.bot.blockAt(self.offset(
            doorway.x-self.x,doorway.y-self.y,doorway.z-self.z))
        }catch{}
        const doorName=String(doorBlock?.name||'').replace(/^minecraft:/,'')
        if(/^(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door$/.test(doorName)){
          const observedBits=observedDoorBits(doorBlock)
          const doorOpenObserved=observedBits.open
          const self=this.bot.entity.position
          const approach=[Math.floor(self.x),Math.floor(self.y),Math.floor(self.z)]
          const door={kind:'wooden_door',permitted:false,
            position:[doorway.x,doorway.y,doorway.z],
            approach:{position:approach,steps:0,waypoints:[],
              routeComplete:true,elevationChanges:0,serverVerified:false}}
          const geometry=validateCrossing(this.bot,door)
          if(!geometry.ok&&geometry.reason!=='crossing_raised_full_block_landing_requires_jump'){
            this.log.log('[Alice exploration] scout door passage:',
              JSON.stringify({reason:geometry.reason,attempted:false,
                failedWaypoint:doorway,doorOpenObserved,
                serverMovementVerified:false}))
            return {ok:false,reason:geometry.reason,attempted:false,
              failedWaypoint:doorway,serverMovementVerified:false,
              target:candidate.target,elevationChanges:candidate.elevationChanges}
          }
          // The scout/noPath doorway fallback uses EXACTLY the same
          // independent-BDS gated one-crossing executor as indoor escape.
          // No second unguarded physical entry is allowed.
          const crossed=await this.crossObservedDoor(door,signal)
          this.recordEscapePassage(door,crossed)
          this.log.log('[Alice exploration] scout door passage:',
            JSON.stringify({reason:crossed.reason,attempted:crossed.attempted===true,
              pulses:crossed.pulses||0,failedWaypoint:doorway,
              doorOpenObserved,
              serverMovementVerified:crossed.serverMovementVerified===true}))
          return {...crossed,ok:false,failedWaypoint:doorway,
            target:candidate.target,elevationChanges:candidate.elevationChanges,
            localPositionTrust:'mineflayer_prediction_not_server_proof'}
        }
        const probe=await probeFlatInput(this.bot,selection.candidate,{
          signal,movementEvidence:this.movementEvidence,clock:this.clock,
          safe:()=>!this.verticalWatch.active()&&
            this.escapeApproachGuard(signal).ok&&
            environment(this.bot).safeToExplore&&
            !this.goalPlanner.stoppedByHuman&&
            this.liveBehavior.settings.agentMode==='autonomous'
        })
        this.log.log('[Alice movement] A* noPath physical input probe:',
          JSON.stringify({reason:probe.reason,attempted:probe.attempted,
            probeWaypoint:selection.selectedWaypoint,
            pulses:probe.pulses||0,physicsTicks:probe.physicsTicks||0,
            localEstimateBlocks:probe.localEstimateBlocks||0,
            serverMovementVerified:probe.serverMovementVerified===true,
            serverEvidenceReason:probe.serverEvidenceReason||null}))
        return {...probe,ok:false,
          reason:probe.serverMovementVerified?
            'direct_flat_step_server_confirmed_partial_route':
            probe.reason==='direct_flat_first_waypoint_already_local'?
              'scout_first_waypoint_local_only_server_unverified':probe.reason,
          failedWaypoint:lastAttemptedWaypoint,
          probeWaypoint:selection.selectedWaypoint,target:candidate.target,
          distance:candidate.distance,elevationChanges:candidate.elevationChanges,
          localPositionTrust:'mineflayer_prediction_not_server_proof'}
      }
      this.log.log('[Alice movement] A* scout route rejected:',
        JSON.stringify({reason,kind:candidate?.kind||'unknown',
          failedWaypoint:lastAttemptedWaypoint||null,
          firstWaypoint:candidate?.waypoints?.[0]||null}))
      return {ok:false,reason,failedWaypoint:lastAttemptedWaypoint,
        target:candidate.target,distance:candidate.distance,
        elevationChanges:candidate.elevationChanges}
    }finally{
      ended=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted)
      // cancelActive already stopped this route on preemption. Never stop
      // a newer SURVIVE/FOLLOW route that may have started after that abort.
      if(!signal?.aborted)this.bot.pathfinder.stop?.()
    }
  },
  }
}
module.exports={createScoutRuntimeMethods}
