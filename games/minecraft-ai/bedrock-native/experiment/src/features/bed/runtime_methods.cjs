'use strict'
const {sleepOpportunity}=require('./sleep_opportunity.cjs')
// Extracted, behavior-preserving Alice runtime feature methods.
// Explicit dependency injection retains original owner and BDS safety gates.
function createBedRuntimeMethods({requestBed,resumeBed,scoutStartProof,selectAdjacentBed,surveyEscape,useBedForSpawn,verifyBedStep,chooseAdjacentMovement,HOSTILES,candidateOneBlockJump,selectDirectionalBedStep,performOneBlockJump,selectEdgeReturn,performEdgeReturn}){
  return {
  sleepTick(options={}){return sleepOpportunity(this,options)},
  requestBedTask(action,source,report=null){return requestBed(this,action,source,report)},
  resumeBedRequestOnWitness(){return resumeBed(this)},
  async spawnpointTick({freshBdsWitness=false}={}){
    // A 20s *observation* cooldown must never consume an independently
    // admitted 4s BDS witness pair. Only the trusted witness-reader caller
    // can ask to revisit immediately, and only after full scoutStartProof.
    if(freshBdsWitness&&!scoutStartProof(this.bot,this.movementEvidence,this.clock).ok)
      return false
    if(!this.ready()||this.bot.isSleeping||this.job||this.maintenanceBusy||
       this.pendingBedRequest||
       this.safetyBusy||this.threat()||this.core.hasFollowIntent()||
       this.goalPlanner.stoppedByHuman||this.bot.health<16||
       (!freshBdsWitness&&this.clock()<this.nextSpawnpointAt))return false
    // Login can announce a personal spawn elsewhere. It does not certify
    // using the observed bed in this session.
    if(this.homeBed.summary().status==='server_confirmed_current_session')return false
    // Observe bed reach before independent BDS admission; neither observation
    // authorizes an interaction or bypasses the existing movement safety gate.
    const positions=this.observedBeds.nearby(this.bot,{radius:16})
    const pick=selectAdjacentBed(this.bot,positions,{radius:16})
    // A local-only route is a diagnostic, never a replacement for BDS proof.
    const survey=pick.reason==='bed_needs_verified_approach'?
      surveyEscape(this.bot,{radius:7,maxNodes:100,bedPositions:positions}):null
    this.lastBedApproach=survey?.bedApproach||null
    const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
    if(!pick.bed||!proof.ok){
      this.lastSpawnpointAttempt={ok:false,
        reason:!pick.bed?pick.reason:proof.reason,
        bedReach:pick.reason,positionGate:proof.ok?'verified':proof.reason,
        attempted:false,at:this.clock()}
      this.nextSpawnpointAt=this.clock()+20000
      return false
    }
    // Spawnpoint setup is NOT sleep: no night gate or sleep-bed cooldown.
    this.nextSpawnpointAt=this.clock()+90000
    const block=pick.bed
    this.startJob('RECOVER','自主生存',async signal=>{
      const result=await useBedForSpawn(this.bot,block,{
        evidence:this.movementEvidence,clock:this.clock,signal,
        safe:()=>!this.closed&&this.ready()&&!this.threat()&&
          !this.core.hasFollowIntent()&&this.bot.health>=16})
      const confirmed=result.serverConfirmed===true&&this.homeBed.confirm(result)
      this.lastSpawnpointAttempt={ok:confirmed,reason:confirmed?
        'bed_personal_spawn_packet_confirmed':result.reason,
        attempted:result.attempted===true,at:this.clock()}
      if(confirmed)this.log.log('[Alice home] verified bed respawn:',
        JSON.stringify({status:this.homeBed.summary().status,source:'server_player_spawn_packet'}))
      else this.log.warn('[Alice home] bed spawn unconfirmed:',
        JSON.stringify({reason:result.reason}))
      return {ok:confirmed,reason:this.lastSpawnpointAttempt.reason}
    },{label:'设置床位重生点',announce:false})
    return !!this.job
  },

  // Finish ONE attempted bed cell only from an independently witnessed
  // BDS double sample issued AFTER the movement input. An earlier local
  // A* completion/packet correction does not complete the task.
  settlePendingBedStepOnWitness(){
    const step=this.pendingBedStep
    if(!step)return {state:'none'}
    const now=this.clock()
    if(step.epoch!==this.epoch||this.closed||
       this.bot.game?.dimension!=='overworld'||
       now<step.createdAt||now-step.createdAt>240000){
      this.pendingBedStep=null
      return {state:'rejected',reason:'bed_step_epoch_or_deadline_changed'}
    }
    if(!Number.isSafeInteger(step.startedAt))
      return {state:'waiting',reason:'bed_step_no_input_started'}
    const out=verifyBedStep(step,this.movementEvidence?.get?.(),
      this.bot.entity?.position,now)
    if(out.reason==='bed_step_new_independent_pair_missing')
      return {state:'waiting',reason:out.reason}
    this.pendingBedStep=null
    this.lastBedApproachAction={
      status:out.ok?'verified':'unverified',reason:out.reason,
      action:step.action||'WALK',
      attempted:true,serverMovementVerified:out.ok,
      at:now,serverMovedBlocks:out.ok?
        Math.round(out.travelledBlocks*100)/100:null}
    this.log.log('[Alice home] independent bed-step endpoint:',
      JSON.stringify(this.lastBedApproachAction))
    return {state:out.ok?'verified':'rejected',reason:out.reason,
      serverMovementVerified:out.ok}
  },

  // Called only on a newly accepted independent BDS witness-file event, not
  // from IDLE timers, local physics or unsolicited packet corrections.
  // The source provides coordinates, NOT movement permission. Revalidate
  // two new samples, the current world, room, bed and one loaded flat cell.
  resumeBedApproachOnWitness({bedPosition=null,source='自主生存'}={}){
    const fail=reason=>({state:'held',reason,attempted:false,serverMovementVerified:false})
    if(!scoutStartProof(this.bot,this.movementEvidence,this.clock).ok)
      return fail('fresh_independent_bds_pair_required')
    const now=this.clock(),settings=this.liveBehavior.settings
    const explicitBed=bedPosition&&[bedPosition.x,bedPosition.y,bedPosition.z].every(Number.isSafeInteger)
    if(this.goalPlanner.stoppedByHuman||
       !explicitBed&&(!settings.autonomyEnabled||settings.agentMode!=='autonomous'||
       now-this.lastHumanAt<this.p.autonomy_policy.AUTONOMY_GRACE_MS))
      return fail('human_or_companion_priority')
    if(!this.ready()||this.bot.isSleeping||this.maintenanceBusy||this.job||
       this.safetyBusy||this.threat()||this.core.hasFollowIntent()||
       this.core.state!=='IDLE'||this.verticalWatch.active()||
       this.bot.health<16||this.bot.game?.dimension!=='overworld'||
       this.bot.entity?.onGround!==true)
      return fail('unsafe_bed_approach_context')
    // Passive mobs behind a wall are not proof of attack intent. Existing
    // threat() still preempts; next-cell occupancy is checked *after*
    // read-only path selection. Do not impose a 12-block proximity combat
    // rule on movement, nor confuse Minecraft's bed-sleep monster rule.
    const here=this.bot.entity.position
    if(!explicitBed&&this.homeBed.summary().status!=='not_verified')return fail('already_has_personal_bed')
    if(this.pendingBedStep)return fail('bed_step_waiting_for_independent_endpoint')
    if(this.pendingScoutStep||this.pendingDoorCrossing)return fail('other_independent_movement_in_flight')
    if(now<this.nextBedApproachStepAt)return fail('one_cell_step_cooldown')
    const home=this.homeBase.last
    if(!explicitBed&&(home?.status!=='observed_indoor_home_candidate'||!home.bed||
       !Number.isSafeInteger(home.at)||now<home.at||now-home.at>45000))
      return fail('fresh_indoor_bed_candidate_required')
    const known=explicitBed?[bedPosition]:this.observedBeds.nearby(this.bot,{radius:12})
    const adjacent=selectAdjacentBed(this.bot,known,{radius:explicitBed?16:12})
    if(adjacent.bed)return fail('bed_already_in_interaction_range')
    if(adjacent.reason!=='bed_needs_verified_approach')
      return fail(adjacent.reason)
    // Use exactly the currently observed candidate bed, not an unrelated
    // occupied/shared bed elsewhere in the loaded chunk.
    const selected=known.filter(p=>[p.x,p.y,p.z].every(Number.isFinite)&&
      Math.hypot(p.x-(explicitBed?bedPosition.x:home.bed.x),
        p.y-(explicitBed?bedPosition.y:home.bed.y),
        p.z-(explicitBed?bedPosition.z:home.bed.z))<=1.5)
    if(!selected.length)return fail('home_bed_not_loaded')
    const survey=surveyEscape(this.bot,{radius:7,maxNodes:100,bedPositions:selected})
    const path=survey.bedApproach
    this.lastBedApproach=path||null
    // A single geometry policy decides WALK first, and JUMP_UP only if no
    // verified flat cell is available and the whole jump arc is clear.
    const decision=chooseAdjacentMovement(this.bot,{
      toward:explicitBed?bedPosition:home?.bed,route:path,
      allowDirectional:!!explicitBed,allowJump:!!explicitBed,
      allowEdgeReturn:!!explicitBed})
    if(!decision.ok)return fail(decision.reason)
    const jump=decision.action==='JUMP_UP'?decision.jump:null
    const edge=decision.action==='EDGE_RETURN'?decision.edge:null
    const directional=decision.source==='observed_flat_neighbor'?
      decision.directional:null
    const a=[decision.target.x,decision.target.y,decision.target.z]
    const first={x:a?.[0],y:a?.[1],z:a?.[2]}
    const at={x:Math.floor(here.x),y:Math.floor(here.y),z:Math.floor(here.z)}
    const occupiedNext=Object.values(this.bot.entities||{}).some(e=>
      HOSTILES.has(e?.name)&&e.position&&
      [e.position.x,e.position.y,e.position.z].every(Number.isFinite)&&
      Math.hypot(e.position.x-(first.x+.5),
        e.position.y-first.y,e.position.z-(first.z+.5))<1.5)
    if(occupiedNext)return fail('hostile_occupies_next_bed_step')
    // First use the safest possible stair-free horizontal adjacent cell;
    // never ask A* to traverse the remaining 4+ unverified cells in one go.
    if(![first.x,first.y,first.z].every(Number.isSafeInteger)||
       first.y!==at.y+(jump?.ok?1:0)||
       Math.abs(first.x-at.x)+Math.abs(first.z-at.z)!==1||
       ((jump?.ok||edge?.ok)?typeof this.bot.setControlState!=='function'||
         typeof this.bot.lookAt!=='function':
         !this.bot.pathfinder?.goto||!this.bot.pathfinder?.setMovements||
         !this.api?.GoalNear||!this.api?.Movements))
      return fail('first_cell_not_flat_or_navigation_unavailable')
    this.nextBedApproachStepAt=now+75000
    const initial=this.movementEvidence?.get?.()
    const initialFeet=initial?.independentLatestFeet
    const initialAt=initial?.independentAt
    const initialCount=initial?.independentSamples
    const oneStep={createdAt:now,startedAt:null,epoch:this.epoch+1,
      action:decision.action,
      independentAt:initialAt,independentSamples:initialCount,
      loginAt:initial?.loginAt??null,lifeEpochAt:initial?.lifeEpochAt??null,
      from:initialFeet&&{x:initialFeet.x,y:initialFeet.y,z:initialFeet.z},
      target:first}
    this.lastBedApproachAction={status:'starting',reason:'fresh_bds_one_cell_admitted',
      attempted:false,serverMovementVerified:false,at:now}
    this.startJob('EXPLORE',source,async signal=>{
      let timer=null,abortHandler=null
      let result={ok:false,reason:'bed_one_cell_bds_endpoint_unconfirmed',
        attempted:false,serverMovementVerified:false}
      try{
        // Recheck the original no-shortcut position gate at the actual start,
        // before Pathfinder receives any goal or movement input.
        const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
        if(!proof.ok||signal.aborted||this.threat()||this.core.hasFollowIntent()||
           this.bot.health<16||this.goalPlanner.stoppedByHuman||
           !explicitBed&&!this.liveBehavior.settings.autonomyEnabled||
           this.bot.entity?.onGround!==true)
          return {...result,reason:proof.ok?'bed_one_cell_safety_preempted':proof.reason}
        const fresh=surveyEscape(this.bot,{radius:7,maxNodes:100,bedPositions:selected})
        const refreshedJump=jump?.ok?candidateOneBlockJump(this.bot,
          {toward:{x:bedPosition.x+.5,y:bedPosition.y,z:bedPosition.z+.5}}):null
        const refreshedEdge=edge?.ok?selectEdgeReturn(this.bot,{toward:{
          x:bedPosition.x+.5,y:bedPosition.y,z:bedPosition.z+.5}}):null
        const stillSafe=jump?.ok?
          refreshedJump?.ok&&[
            refreshedJump.target.x,refreshedJump.target.y,
            refreshedJump.target.z].join(',')===a.join(','):
          edge?.ok?
            refreshedEdge?.ok&&[
              refreshedEdge.target.x,refreshedEdge.target.y,
              refreshedEdge.target.z].join(',')===a.join(','):
          directional?.ok?
            selectDirectionalBedStep(this.bot,bedPosition).first?.join(',')===a.join(','):
            fresh.bedApproach?.waypoints?.[0]?.join(',')===a.join(',')
        if(Object.values(this.bot.entities||{}).some(e=>
          HOSTILES.has(e?.name)&&e.position&&
          [e.position.x,e.position.y,e.position.z].every(Number.isFinite)&&
          Math.hypot(e.position.x-(first.x+.5),
            e.position.y-first.y,e.position.z-(first.z+.5))<1.5))
          return {...result,reason:'hostile_occupies_next_bed_step'}
        if(!stillSafe)
          return {...result,reason:'bed_first_cell_changed'}
        if(jump?.ok){
          // Exactly one verified geometry candidate can receive bounded jump
          // input. No local physics result grants further movement; wait for
          // a completely new independent BDS pair at the raised landing.
          oneStep.startedAt=this.clock()
          this.pendingBedStep=oneStep
          const physical=await performOneBlockJump(this.bot,jump,{
            signal,
            safe:()=>this.job?.signal===signal&&
              scoutStartProof(this.bot,this.movementEvidence,this.clock).ok&&
              !this.threat()&&!this.core.hasFollowIntent()&&
              !this.goalPlanner.stoppedByHuman&&
              !this.safetyBusy&&this.bot.health>=16
          })
          result={ok:false,attempted:physical.attempted===true,
            serverMovementVerified:false,
            reason:physical.attempted?
              'bed_jump_waiting_for_new_independent_endpoint':physical.reason}
          if(!physical.attempted&&this.pendingBedStep===oneStep)
            this.pendingBedStep=null
          return result
        }
        if(edge?.ok){
          // A grounded partial-foothold is NOT a normal WALK origin.
          // Only the original fresh independent BDS pair and ALL existing
          // safety gates may allow one bounded pulse sequence. The local
          // outcome is never endpoint proof; a NEW BDS pair is mandatory.
          oneStep.startedAt=this.clock()
          this.pendingBedStep=oneStep
          const physical=await performEdgeReturn(this.bot,edge,{
            signal,
            safe:()=>this.job?.signal===signal&&
              scoutStartProof(this.bot,this.movementEvidence,this.clock).ok&&
              !this.threat()&&!this.core.hasFollowIntent()&&
              !this.goalPlanner.stoppedByHuman&&
              !this.safetyBusy&&this.bot.health>=16
          })
          result={ok:false,attempted:physical.attempted===true,
            serverMovementVerified:false,
            reason:physical.attempted?
              'bed_edge_return_waiting_for_new_independent_endpoint':physical.reason}
          if(!physical.attempted&&this.pendingBedStep===oneStep)
            this.pendingBedStep=null
          return result
        }
        const movements=new this.api.Movements(this.bot)
        this.p.terrain_policy.cautiousPathOptions(movements)
        movements.canDig=false;movements.canOpenDoors=false
        movements.allowParkour=false;movements.allow1by1towers=false
        movements.openable?.clear?.()
        this.bot.pathfinder.setMovements(movements)
        const aborted=new Promise((_,reject)=>{
          abortHandler=()=>reject(Error('bed_step_aborted'))
          signal.addEventListener('abort',abortHandler,{once:true})
          timer=setTimeout(()=>reject(Error('bed_step_deadline')),4500)
          timer.unref?.()
        })
        result.attempted=true
        oneStep.startedAt=this.clock()
        this.pendingBedStep=oneStep
        await Promise.race([
          Promise.resolve().then(()=>this.bot.pathfinder.goto(
            new this.api.GoalNear(first.x,first.y,first.z,0))),
          aborted
        ]).catch(()=>{})
        // Ordinary querytarget witnesses may arrive ~180s apart. Do not
        // mislabel local path completion as verified or demand a new pair
        // inside the 4.5s physical movement deadline; settle asynchronously
        // in settlePendingBedStepOnWitness after the NEXT real BDS pair.
        result={ok:false,attempted:true,serverMovementVerified:false,
          reason:'bed_step_waiting_for_new_independent_endpoint'}
        return result
      }finally{
        if(!result.attempted&&this.pendingBedStep===oneStep)this.pendingBedStep=null
        if(timer)clearTimeout(timer)
        if(abortHandler)signal.removeEventListener('abort',abortHandler)
        try{this.bot.pathfinder.setGoal(null)}catch{}
        this.lastBedApproachAction={status:this.pendingBedStep===oneStep?'awaiting_bds_endpoint':
          result.ok?'verified':'unverified',
          reason:result.reason,attempted:result.attempted,
          serverMovementVerified:result.serverMovementVerified===true,
          at:this.clock()}
      }
    },{label:jump?.ok?'接近床：一次完整方块跳跃':
      edge?.ok?'接近床：单格安全退回地板':'接近床：一格安全步行',
      announce:false})
    // startJob intentionally returns void on success. Read the actual
    // guarded owner and source, not its undefined return value.
    if(this.job?.type!=='EXPLORE'||this.action?.source!==source){
      if(this.pendingBedStep===oneStep)this.pendingBedStep=null
      this.lastBedApproachAction={status:'blocked',reason:'bed_step_start_denied',
        attempted:false,serverMovementVerified:false,at:now}
      return fail('bed_step_start_denied')
    }
    return {state:'started',reason:'bed_first_cell_started',
      attempted:true,serverMovementVerified:false}
  },
  // Autonomous spawnpoint preparation is deliberately distinct from
  // user-ordered bed tasks. An observed loaded bed may be up to 16 cells
  // away, but can admit only ONE safe adjacent cell per FRESH BDS pair.
  // No prior HOME/respawn confirmation is required to begin this approach:
  // those confirmations are the desired result, not an admission prerequisite.
  resumeAutonomousBedApproachOnWitness(){
    const hold=reason=>{
      // Export only a bounded fixed diagnostic reason; never promote a
      // local-only route into a BDS-verified bed movement.
      if(!this.pendingBedStep&&
         !['starting','awaiting_bds_endpoint'].includes(this.lastBedApproachAction?.status)&&
         (this.lastBedApproachAction?.status!=='held'||
          this.lastBedApproachAction?.reason!==reason))
        this.lastBedApproachAction={status:'held',reason,attempted:false,
          serverMovementVerified:false,at:this.clock()}
      return {state:'held',reason}
    }
    const mode=this.liveBehavior?.settings
    if(!mode?.autonomyEnabled||mode.agentMode!=='autonomous'||
       this.goalPlanner?.stoppedByHuman||
       this.clock()-this.lastHumanAt<this.p.autonomy_policy.AUTONOMY_GRACE_MS)
      return hold('autonomous_bed_human_or_mode_priority')
    if(this.pendingBedRequest||this.pendingBedStep||this.pendingScoutStep||
       this.pendingDoorApproachStep||
       this.pendingDoorCrossing||this.job||this.maintenanceBusy||
       this.safetyBusy||this.threat()||this.core.hasFollowIntent()||
       this.bot.isSleeping||this.closed||!this.ready()||
       this.bot.health<16||this.bot.game?.dimension!=='overworld')
      return hold('autonomous_bed_other_priority')
    if(this.homeBed.summary().status==='server_confirmed_current_session')
      return hold('autonomous_bed_respawn_already_known')
    if(!scoutStartProof(this.bot,this.movementEvidence,this.clock).ok)
      return hold('autonomous_bed_bds_pair_not_fresh')
    const here=this.bot.entity?.position
    if(!here||!Number.isFinite(here.x)||!Number.isFinite(here.y)||
       !Number.isFinite(here.z))return hold('autonomous_bed_position_unknown')
    const known=this.observedBeds.nearby(this.bot,{radius:16})
      .slice().sort((a,b)=>Math.hypot(a.x-here.x,a.y-here.y,a.z-here.z)-
        Math.hypot(b.x-here.x,b.y-here.y,b.z-here.z))
    for(const position of known){
      const status=selectAdjacentBed(this.bot,[position],{radius:16})
      if(status.bed)return hold('autonomous_bed_already_in_reach')
      if(status.reason!=='bed_needs_verified_approach')continue
      // The original admission routine revalidates the same loaded bed,
      // health, STOP/FOLLOW, terrain, headroom and BDS position. It starts
      // one bounded WALK/JUMP only, then waits for NEW independent evidence.
      const result=this.resumeBedApproachOnWitness({bedPosition:{
        x:Math.floor(position.x),y:Math.floor(position.y),z:Math.floor(position.z)},
        source:'自主生存'})
      return result.state==='held'?hold(result.reason):result
    }
    return hold(known.length?'autonomous_bed_no_verified_free_approach':
      'autonomous_bed_not_loaded_in_radius')
  },
  }
}
module.exports={createBedRuntimeMethods}
