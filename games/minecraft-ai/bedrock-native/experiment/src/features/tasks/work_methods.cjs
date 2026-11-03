'use strict'
// Original AliceBedrockRuntime methods, same instance and validated policy.
function createWorkRuntimeMethods({qty,WOOD_LOGS,safeShelteredFood,scoutStartProof,navigationHoldReason,classifyScoutFailure,classifyJobException}){
  return {
  startJob(type,source,task,{label=null,announce=true,scoutCandidate=null}={}){
    // This is a physical navigation gate, never a reason to rewrite client
    // coordinates. An old local A* position 20m away from BDS is not a safe
    // start for another path, even if the planner says SCOUT.
    // An input already issued by a previous scout must obtain a NEW
    // independent BDS endpoint before another optional path can start.
    if(this.pendingScoutStep&&(type==='EXPLORE'||type==='GATHER'))return false
    if((type==='EXPLORE'||type==='GATHER')&&this.requireBdsAlignedExplore){
      const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
      if(!proof.ok){
        this.holdNavigation(proof)
        return false
      }
      this.lastBdsExploreHoldReason=null
      this.navigationHold=null
    }
    if(!this.ready())return this.say('还没有可信的生命值/服务端背包/位置，暂不能行动。')
    const currentDanger=this.threat()
    // A known SOLID wall may let a following Alice eat while sheltered;
    // this applies ONLY to automatic food, never to optional sleep/crafting.
    const shelteredFood=type==='RECOVER'&&source==='自主生存'&&label==='安全进食'&&
      safeShelteredFood({danger:currentDanger,escort:this.escortDecision(currentDanger),
        health:this.bot.health,recentHurtAt:this.lastSelfDamageAt,now:this.clock()})
    if((currentDanger&&!shelteredFood)||(this.bot.health<14&&type!=='RECOVER'))
      return this.say('目前附近有危险或生命值过低，先暂停行动。')
    if(this.bot.isSleeping)return this.say('我还在睡觉，暂不行动。')
    if(this.job)return this.say('上一项工作尚未停止，稍后重试。')
    this.preparedScout.clear()
    const abort=new AbortController(),id=++this.epoch
    const jobSite=this.bot.entity?.position?.clone?.()||this.bot.entity?.position
    this.lastIdleHold=null
    this.job={abort,signal:abort.signal,id,type,startedAt:this.clock()};this.action={label:label||({GATHER:'采集原木',CRAFT:'制作物品',RECOVER:'恢复生存',STORAGE:'箱子操作'})[type]||type,source}
    this.core.transition(type,'order from '+source)
    this.continuousGoal.begin(type,source)
    // Model-selected SCOUT and rule-selected SCOUT share the same endpoint
    // memory and transport safety feedback; provenance differs, safety does not.
    const autonomousScout=type==='EXPLORE'&&!!scoutCandidate?.key&&
      (source==='自主探索'||source==='自主模型'||source==='夜间生存')
    if(autonomousScout){
      const attempt=this.explorationProgress.attempt(scoutCandidate)
      if(attempt)this.log.log('[Alice exploration] endpoint attempt:',
        JSON.stringify({key:attempt.key,outcome:'attempted',
          serverMovementVerified:false}))
    }
    if(announce)this.say('已开始'+this.action.label+'，只按服务器确认结果汇报。')
    Promise.resolve().then(()=>task(abort.signal)).then(result=>{
      if(this.epoch!==id||this.closed||abort.signal.aborted)return
      this.log.log('[Alice Bedrock] verified job result:',JSON.stringify(result))
      this.log.log('[Alice job] duration:',JSON.stringify({
        taskType:type,source:source==='自主模型'?'model':source==='自主任务'?'autonomous':'other',
        result:result?.ok===true?'verified':'incomplete',
        durationMs:Math.max(0,this.clock()-(this.job?.startedAt??this.clock()))}))
      if(type==='EXPLORE'&&result?.reason==='scout_step_awaiting_new_bds_pair'&&
         this.pendingScoutStep?.epoch===id){
        // Neither route success nor movement failure. The local waypoint
        // completed, but only a later post-input BDS pair can settle it.
        this.lastScoutProgress={confirmed:false,reason:result.reason,
          failureKind:'awaiting_independent_endpoint',segmentBlocks:result.distance||null,
          serverMovedBlocks:null,at:this.clock()}
        this.log.log('[Alice exploration] scout step awaits independent BDS:',JSON.stringify({
          reason:result.reason,localEstimateBlocks:result.localEstimateBlocks,
          serverMovementVerified:false}))
        return
      }
      this.driveJournal.recordOutcome({type,source,result})
      this.continuousGoal.finish(type,source,result)
      const dependencyHold=!result?.ok&&navigationHoldReason(result?.reason)
      if((source==='自主任务'&&['GATHER','CRAFT'].includes(type)&&
          result?.ok===true&&Number.isSafeInteger(result.verifiedDelta)&&
          result.verifiedDelta>0)||
         (source==='自主庇护'&&type==='BUILD'&&
          result?.ok===true&&result.worldModificationVerified===true)){
        // Verified materials/equipment changed. Re-evaluate the persistent
        // objective after five seconds, not the generic 120-second new-task
        // interval. This authorizes only an observation; existing inventory,
        // health, STOP/FOLLOW, daylight and route gates still own actions.
        this.nextIdleAt=Math.min(this.nextIdleAt,this.clock()+5000)
        this.goalPlanner.queue('task_result')
        this.log.log('[Alice goal] verified milestone review scheduled:',
          JSON.stringify({goal:this.continuousGoal.snapshot()?.goal,
            taskType:type,verifiedDelta:result.verifiedDelta??0,afterMs:5000,
            reason:'inventory_transition_verified'}))
      }
      if(source==='自主模型')this.goalPlanner.outcome(result)
      if(!result?.ok&&['自主任务','夜间生存'].includes(source)&&type==='CRAFT'){
        this.nextAutonomousCraftAt=this.clock()+600000
        this.log.log('[Alice mission] craft deferred:',
          JSON.stringify({reason:'inventory_recipe_unavailable',retryAfterMs:600000}))
      }
      if(!result?.ok&&source==='自主任务'&&type==='GATHER'&&!dependencyHold){
        const memory=this.failureMemory.mark('wood',jobSite,result?.reason)
        this.log.log('[Alice autonomy] work site cooldown:',JSON.stringify(memory))
        // A blocked resource work site is new evidence to survey the room.
        // Do not wait the generic 2-minute resource-work cooldown to NOTICE
        // an exit. This only schedules the next read-only observation; every
        // physical escape remains gated by ordinary STOP/FOLLOW/safety checks.
        if(!this.core.hasFollowIntent()&&this.liveBehavior.settings.autonomyEnabled){
          this.nextIdleAt=Math.min(this.nextIdleAt,this.clock()+5000)
          this.log.log('[Alice exploration] blocked resource site; indoor survey scheduled:',
            JSON.stringify({afterMs:5000,reason:memory.reason,worldModification:false}))
        }
      }
      if(source==='自主生存'&&type==='RECOVER'&&label?.includes('床')){
        this.lastBedFailure=result?.ok?null:{
          reason:String(result?.reason||'sleep_result_unknown').slice(0,100),
          bedPosition:result?.bedPosition||null,
          diagnosis:result?.bedDiagnosis||null,at:this.clock()
        }
        this.log.log('[Alice sleep] bed task outcome:',JSON.stringify({
          ok:result?.ok===true,reason:result?.reason||'unknown',
          bedPosition:result?.bedPosition||null,
          bedDiagnosis:result?.bedDiagnosis||null}))
      }
      if(!result?.ok&&source==='自主生存'&&type==='RECOVER'&&label?.includes('床')){
        if(result?.bedPosition){
          const specific=this.failureMemory.mark('bed',result.bedPosition,result.reason)
          this.log.log('[Alice sleep] rejected bed cooldown:',JSON.stringify(specific))
        }
        // One bed rejection must NOT punish all nearby beds for 12 minutes.
        // Keep the failed bed's own bounded cooldown and resurvey alternatives.
        // nextSleepAt starts at 0; Math.min(0, futureTime) would keep it
        // at 0 and silently disable the intended bounded cooldown.
        // One active RECOVER job owns this clock, so use this failure's
        // precise review deadline, independent of its prior scheduling.
        this.nextSleepAt=this.clock()+(result?.bedPosition?30000:90000)
        this.log.log('[Alice sleep] alternative bed review scheduled:',JSON.stringify({
          reason:result?.reason||'unknown',
          afterMs:result?.bedPosition?30000:90000,
          failedBedScoped:!!result?.bedPosition}))
      }
      if(['自主任务','夜间生存'].includes(source)&&['GATHER','CRAFT'].includes(type)){
        const phase=type==='GATHER'?'wood_pickup':'wooden_sword_craft'
        this.log.log('[Alice mission] inventory milestone:',JSON.stringify({
          phase,verified:result?.ok===true,
          reason:String(result?.reason||'inventory_result_missing').slice(0,90),
          verifiedDelta:Number.isFinite(result?.verifiedDelta)?result.verifiedDelta:0,
          proof:'server_inventory_delta_observed',at:this.clock()
        }))
      }
      if(autonomousScout){
        const progress=this.explorationProgress.finish(scoutCandidate,result)
        if(progress)this.log.log('[Alice exploration] endpoint feedback:',JSON.stringify(progress))
        const failureKind=result?.ok?'none':dependencyHold?'prerequisite':classifyScoutFailure(result?.reason)
        this.lastScoutProgress={confirmed:progress?.outcome==='confirmed',reason:String(result?.reason||'unknown'),
          failureKind,segmentBlocks:result?.distance||scoutCandidate?.distance||null,
          elevationChanges:result?.elevationChanges||scoutCandidate?.elevationChanges||0,
          serverMovedBlocks:result?.serverMovedBlocks||null,at:this.clock()}
        if(progress?.outcome==='confirmed'){
          this.scoutVisited.add(result.confirmedEndpoint)
          while(this.scoutVisited.size>32)this.scoutVisited.delete(this.scoutVisited.values().next().value)
          this.scoutDirection=result.direction||null
          this.scoutConfirmedSegments++
          // Subsequent segments start only after new world/inventory observations.
          this.nextIdleAt=this.clock()+15000
          this.log.log('[Alice exploration] server-verified segment; next survey eligible:',
            JSON.stringify({endpoint:result.confirmedEndpoint,segments:this.scoutConfirmedSegments,
              elevationChanges:result.elevationChanges||0}))
        }else if(result?.serverMovementVerified===true&&
                 result.reason==='direct_flat_step_server_confirmed_partial_route'){
          // Only the first cell was independently confirmed; observe the
          // world from the new position before planning another safe segment.
          this.nextIdleAt=this.clock()+15000
          this.lastVoxelKey=null
          this.log.log('[Alice exploration] partial physical step verified; resurvey required:',
            JSON.stringify({serverMovementVerified:true,
              reason:'one_cell_only_no_full_route_completion'}))
        }else if(failureKind==='evidence_gap'){
          // The server may accept every PlayerAuthInput tick without sending
          // correct_player_move_prediction. Do not declare success or mark a
          // fake transport/motion failure. Exclude this endpoint for 20 minutes
          // and re-observe after a bounded 90-second interval. All independent
          // STOP/FOLLOW/threat/terrain protections remain active.
          this.nextIdleAt=Math.min(this.nextIdleAt,this.clock()+90000)
          this.log.log('[Alice exploration] server position evidence missing:',JSON.stringify({
            reason:result?.reason||'unknown',serverMovementVerified:false,
            localEstimateBlocks:result?.localEstimateBlocks??null,
            nextReviewMs:90000,endpointExcluded:true}))
        }else if(failureKind!=='none'&&!dependencyHold){
          const failedPosition=failureKind==='route'?
            (result?.failedWaypoint||scoutCandidate?.target||jobSite):jobSite
          const memory=this.failureMemory.mark(failureKind,failedPosition,
            result?.reason||'unknown_scout_failure')
          this.log.log('[Alice exploration] scoped failure:',JSON.stringify(memory))
          // An unsafe or unverified transport deserves a longer rest; a
          // particular blocked route does not prohibit other safe directions.
          if(failureKind==='route')this.nextIdleAt=this.clock()+15000
        }
      }
      if(dependencyHold)this.holdNavigation({reason:dependencyHold})
      if(announce){
        if(result.ok)this.say('任务完成：'+(result.message||'结果已确认'))
        else this.say('任务未完成：'+(result.reason||'缺少实际结果确认'))
      }
    }).catch(err=>{
      if(this.epoch!==id||this.closed||abort.signal.aborted)return
      const stage=['tree_scan','pathfinder','dig','pickup'].includes(err?.stage)?
        err.stage:'task_rejected'
      // Only the operation layer's fixed anonymous failure vocabulary may
      // enter a private journal. Never trust arbitrary adapter error fields.
      const safeCodes=new Set(['action_timeout','pathfinder_no_path',
        'action_cancelled','adapter_api_exception','inventory_adapter_exception',
        'world_observation_exception','unclassified_job_exception',
        'navigation_bds_position_unavailable','navigation_bds_position_diverged',
        'navigation_local_position_unavailable'])
      const reason=type==='GATHER'&&stage!=='task_rejected'&&
        safeCodes.has(err?.reasonCode)?err.reasonCode:classifyJobException(err)
      this.continuousGoal.failed(type,source)
      if(source==='自主模型')this.goalPlanner.outcome({ok:false,reason})
      this.log.log('[Alice job] duration:',JSON.stringify({
        taskType:type,source:source==='自主模型'?'model':source==='自主任务'?'autonomous':'other',
        result:'exception',durationMs:Math.max(0,this.clock()-(this.job?.startedAt??this.clock()))}))
      this.log.warn('[Alice job] exception:',JSON.stringify({
        taskType:type,source:source==='自主任务'?'autonomous':
          source==='自主模型'?'model':'other',
        reason,stage,verified:false
      }))
      const dependencyHold=navigationHoldReason(reason)
      if(dependencyHold)this.holdNavigation({reason:dependencyHold})
      if(source==='自主任务'&&type==='GATHER'&&!dependencyHold){
        // This case was missing: thrown pathfinding/adapter errors bypassed
        // the normal {ok:false} handler, so the same natural tree was retried
        // on every 120-second autonomy interval with zero progress.
        // Persist an observed failed work site and reconsider safe alternatives.
        const memory=this.failureMemory.mark('wood',jobSite,reason)
        this.log.log('[Alice autonomy] work site cooldown:',JSON.stringify(memory))
        if(!this.core.hasFollowIntent()&&this.liveBehavior.settings.autonomyEnabled){
          this.nextIdleAt=Math.min(this.nextIdleAt,this.clock()+5000)
          this.goalPlanner.queue('tool_blocked')
          this.log.log('[Alice exploration] blocked resource site; indoor survey scheduled:',
            JSON.stringify({afterMs:5000,reason:memory.reason,worldModification:false}))
        }
      }
      this.say('任务异常停止：'+reason)
    }).finally(()=>{
      if(this.epoch!==id)return
      this.job=null;this.action=null
      if(this.core.state===type)this.core.resumeIntent('job finished')
    })
  },
  async gatherCount(n,signal){
    // Bound the full request to the original work site; each harvested log must
    // remain within the bounded 28-block starting work area, not drift unboundedly.
    const start=this.bot.entity?.position?.clone?.()
    let count=0,reason='no_verified_pickup'
    for(let tries=0;tries<Math.min(n*3,48)&&count<n;tries++){
      if(signal.aborted)throw Error('gather cancelled')
      if(this.bot.health<14||this.threat())throw Error('unsafe gathering conditions')
      const result=await this.ops.gatherOne({
        signal,origin:start,maxDistance:28,
        onStage:stage=>this.log.log('[Alice gather] stage:',JSON.stringify(stage))
      })
      if(result.ok){count+=result.gained;this.core.learning?.recordKnowledge?.('bedrock_gather_log',true,{count,source:'verified_inventory'})}
      else {reason=result.reason;break}
    }
    return {ok:count>=n,message:`实际收集${count}/${n}个原木`,reason:`实际收集${count}/${n}个，${reason}`}
  },
  async runVerifiedResourceStep(type,signal){
    // A claimed skill result is insufficient for an autonomous mission:
    // the item counts exposed by Bedrock inventory MUST change.
    const prior=this.ops.inventory()
    if(!Array.isArray(prior))return {ok:false,reason:'server_inventory_unavailable'}
    const amount=items=>items.filter(item=>type==='GATHER'?
      WOOD_LOGS.has(item.name):item.name==='wooden_sword')
      .reduce((sum,item)=>sum+(Number(item.count)||0),0)
    const before=amount(prior)
    const result=type==='GATHER'?await this.gatherCount(1,signal):
      await this.craftWeaponOrTable('wooden_sword',signal)
    const next=this.ops.inventory()
    if(!Array.isArray(next)||signal?.aborted)
      return {ok:false,reason:'inventory_or_job_preempted',verifiedDelta:0}
    const delta=amount(next)-before
    if(!result?.ok||delta<=0)return {ok:false,
      reason:delta<=0?'server_inventory_delta_not_observed':
        'skill_reported_failure_despite_inventory_delta',
      verifiedDelta:Math.max(0,delta)}
    return {ok:true,reason:'server_inventory_delta_verified',
      verifiedDelta:delta,message:result.message||'背包数量实际增加'}
  },
  async craftWeaponOrTable(item,signal){
    if(signal.aborted)throw Error('craft cancelled')
    const pos=this.bot.entity?.position
    const table=this.bot.findBlock?.({matching:b=>b?.name==='crafting_table',maxDistance:4})||null
    const near=table&&pos&&table.position.distanceTo(pos)<=4.5?table:null
    // Prefer inventory-only recipe steps, then a verified nearby placed table.
    let result=await this.ops.craftVerified(item,{signal,craftingTable:near})
    if(result.ok){this.core.learning?.recordKnowledge?.('bedrock_craft_'+item,true,{gained:result.gained});return {ok:true,message:`${item} ×${result.gained}`}}
    if(item==='wooden_sword'&&result.reason==='missing_ingredients_or_crafting_table'){
      const inventory=this.ops.inventory()||[]
      const oak=qty(this.bot,'oak_log')
      if(oak>0&&qty(this.bot,'oak_planks')<2){
        const plank=await this.ops.craftVerified('oak_planks',{signal})
        if(!plank.ok)return {ok:false,reason:'制作木板失败：'+plank.reason}
      }
      if(qty(this.bot,'stick')<1&&qty(this.bot,'oak_planks')>0){
        const stick=await this.ops.craftVerified('stick',{signal})
        if(!stick.ok)return {ok:false,reason:'制作木棍失败：'+stick.reason}
      }
      result=await this.ops.craftVerified(item,{signal,craftingTable:near})
      if(result.ok){this.core.learning?.recordKnowledge?.('bedrock_craft_'+item,true,{gained:result.gained});return {ok:true,message:`${item} ×${result.gained}`}}
    }
    return {ok:false,reason:result.reason+'（如需要工作台，必须已有放置好的工作台）'}
  },
  }
}
module.exports={createWorkRuntimeMethods}
