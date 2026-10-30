'use strict'
// Alice shared policy brain running on Bedrock Mineflayer action interface.
// Paper's canonical AliceCore + autonomy/safety/wood/social/inventory policy files
// are loaded by the entrypoint. The game actions are Bedrock-specific adapters.
const {BedrockOperations,qty,WOOD_LOGS} = require('./operations.cjs')
const {stationaryDefense,defenseDelay}=require('./defensive_melee.cjs')
const {equipmentSnapshot}=require('./life_actions.cjs')
const {observedHostileBarrier,OwnerMotion,escortAssessment}=require('./escort_threat.cjs')
const {OllamaPlanner} = require('./planner.cjs')
const {FollowProgress} = require('./follow_progress.cjs')
const {FollowInputObservation}=require('./follow_input_observation.cjs')
const {ContinuousGoal}=require('./continuous_goal.cjs')
const {evaluateShelter,placeShelterBlock}=require('./night_shelter.cjs')
const {ObservedBeds}=require('./observed_beds.cjs')
const {planNightReposition,nightConditions}=require('./night_survival.cjs')
const {configureDoors,createResponsiveFollowGoal,observedLineOfSight}=require('./follow_navigation.cjs')
const {parseStorage}=require('./storage_actions.cjs')
const {DEFAULTS}=require('./live_control.cjs')
const {localFollowDiagnostic}=require('./follow_diagnostics.cjs')
const {safeFollowStep}=require('./safe_follow_step.cjs')
const {VerticalMotionWatch}=require('./vertical_motion_watch.cjs')
const {ExplorationProgress}=require('./exploration_progress.cjs')
const {observedNaturalTree,selectResourceStep}=require('./resource_opportunity.cjs')
const {probeFlatInput,selectFailedFlatStep}=require('./direct_flat_step.cjs')
const {scoutStartProof}=require('./scout_start_proof.cjs')
const {navigationHoldReason,startupTerrainObserved}=require('./autonomy_readiness.cjs')
const {surveyVoxelActions,selectSafeWalkingCandidate}=require('./voxel_actions.cjs')
const {pickVerticalStep,assessEarthwork,serverPositionProof,executeEarthwork}=require('./terrain_adaptation.cjs')
const {surveyEscape}=require('./escape_survey.cjs')
const {planDoorOpen,attemptDoorOpen,observedDoorBits}=require('./escape_door_action.cjs')
const {validateApproach,approachDoor}=require('./escape_approach.cjs')
const {validatePassageGeometry,validateCrossing,crossDoor}=require('./escape_crossing.cjs')
const {selectDrive,SelfDriveJournal}=require('./self_drive.cjs')
const {ModelGoalScheduler}=require('./model_goals.cjs')
const {DeathExperience}=require('./death_experience.cjs')
const {environment,FailureMemory,candidateScout,decideAutonomousResponse,classifyScoutFailure,siteKey,simpleReason}=require('./world_routine.cjs')
const {LOG_GROUP,resolveItem,parseCollect,acquisitionStrategy}=require('./item_knowledge.cjs')
const HOSTILES=new Set(['zombie','husk','drowned','skeleton','stray','bogged','spider',
  'cave_spider','creeper','witch','pillager','ravager','wither_skeleton','phantom',
  'slime','magma_cube','silverfish','endermite','zoglin','hoglin'])
const nowMS=()=>Date.now()
const inRange=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max
const compact = v => String(v ?? '').trim().replace(/\s+/g,' ')
const logCount=items=>items.filter(i=>WOOD_LOGS.has(i.name)).reduce((n,i)=>n+i.count,0)
const FOLLOW_DISTANCE=DEFAULTS.followDistance // Default; live settings may override in running Alice
const THREAT_CLEAR_MS=4500 // Avoid FOLLOW/COMBAT thrashing near the detection boundary
const LAST_SEEN_MS=30000 // Original Paper uses only recent, dimension-matched positions
const ATTACK_UNCONFIRMED_MAX_MS=12000
const ATTACK_OUT_OF_RANGE_MS=7000
const attackKey=target=>target?.id!=null?String(target.id):target?.runtime_id!=null?String(target.runtime_id):null
// Errors thrown by an autonomous Bedrock action are telemetry, not action
// results. Never serialize arbitrary exception text, stack, player names or
// adapter credentials to the private acceptance journal.
function classifyJobException(error){
  const message=String(error?.message||'')
  if(/no\s*path|noPath|pathfinder.*(failed|unavailable)/i.test(message))
    return 'pathfinder_no_path'
  if(/timed?\s*out|timeout|deadline/i.test(message))
    return 'action_timeout'
  if(/not\s*a\s*function|cannot read properties|undefined|typeerror/i.test(message))
    return 'adapter_api_exception'
  if(/inventory|slot|stack/i.test(message))return 'inventory_adapter_exception'
  if(/chunk|unloaded|block|world/i.test(message))return 'world_observation_exception'
  return 'unclassified_job_exception'
}
function recognize(message) {
  const text=compact(message)
  if(!text||text.length>200)return null
  const m=text.match(/^(?:@?aliceai|@?alice|ai|艾丽丝|爱丽丝)[\s,，:：]+(.+)$/i)
  if(m)return m[1]
  if(parseCollect(text)||/^记住[：:].{2,100}$/.test(text))return text
  return /^(?:状态|帮助|你在干嘛[?？]?|你在哪里[?？]?|背包(?:有什么|里有什么)?|跟着我|跟紧我|紧跟我|跟随我|跟我走|保护我|停止|别跟了|记忆|学习状态|学到了什么|吃东西|回血|收集|采集|搜集|获取|挖|砍|找来|去找|记住|制作木剑|起床|起来|从(?:附近的?)?(?:箱子|储物箱|木桶)|(?:箱子|储物箱|木桶)(?:里|中)?(?:存入|存|放入)|(?:存入|放入|放进|放到)(?:附近的?)?(?:箱子|储物箱|木桶))/.test(text)?text:null
}
function parseTask(cmd) {
  const c=compact(cmd)
  const storage=parseStorage(c)
  if(storage)return storage
  if(/^(?:起床|起来|醒来)$/.test(c))return {type:'WAKE'}
  if(/^(?:停|停止|取消|别跟了|停下|别动)$/.test(c))return {type:'STOP'}
  if(/^(?:跟着我|跟紧我|紧跟我|跟随我|跟我走|跟我来|跟着我走)$/.test(c))return {type:'FOLLOW'}
  if(/^(?:保护我|护卫我|守护我)$/.test(c))return {type:'GUARD'}
  if(/^(?:吃东西|吃点东西|吃食物|回血|恢复生命|补血)$/.test(c))return {type:'EAT'}
  const teach=c.match(/^记住[：:]?(.{1,32}?)(?:是|等于|=)(?:minecraft:)?([a-z][a-z0-9_]{1,63})$/)
  if(teach)return {type:'TEACH_ITEM',alias:teach[1],item:teach[2]}
  if(/^(?:收集|采集|砍)(?:\s*(\d{1,3})\s*(?:个|根|块)?)?\s*(?:木头|原木|木材|树木|树)$/.test(c)) {
    const n=c.match(/\d{1,3}/)?.[0]
    const count=n==null?null:Number(n)
    return count==null?{type:'WOOD_QUESTION'}:inRange(count,1,32)?{type:'WOOD',count}:{type:'INVALID_QUANTITY'}
  }
  if(/^(?:制作|合成|做|造)(?:一把|一个|些|点)?(?:木剑|木头剑)$/.test(c))return {type:'CRAFT',item:'wooden_sword'}
  if(/^(?:制作|合成|做|造)(?:一个|些|点)?(?:工作台)$/.test(c))return {type:'CRAFT',item:'crafting_table'}
  return parseCollect(c)||{type:'UNKNOWN'}
}
class AliceBedrockRuntime {
  constructor({bot,core,policies,api,log=console,clock=nowMS,operator=null,planner=null,settingsReader=null,label='基岩世界',experienceFile=null,movementEvidence=null,requireBdsAlignedExplore=false}) {
    this.bot=bot;this.core=core;this.p=policies;this.api=api;this.log=log;this.clock=clock;this.label=label
    this.ops=operator||new BedrockOperations({bot,api,log,movementEvidence})
    this.movementEvidence=movementEvidence
    this.requireBdsAlignedExplore=requireBdsAlignedExplore===true
    this.lastBdsExploreHoldReason=null
    this.verticalWatch=new VerticalMotionWatch({clock})
    this.settingsReader=settingsReader
    const initialBehavior=settingsReader?.read()||{revision:0,settings:{...DEFAULTS}}
    this.liveBehavior={...initialBehavior,settings:{...DEFAULTS,...initialBehavior.settings}}
    this.followSettingsDirty=false
    this.planner=planner||null;this.plannerBusy=false;this.plannerAbort=null
    this.goalPlanner=new ModelGoalScheduler({planner:this.planner,clock,log})
    this.started=false;this.closed=false;this.hasHealth=false;this.hasInventorySync=false;this.lastHealth=null
    // Startup is not a human command. Actual chat still grants its full grace.
    this.action=null;this.job=null;this.epoch=0
    this.lastHumanAt=clock()-policies.autonomy_policy.AUTONOMY_GRACE_MS
    this.nextIdleAt=clock();this.idleBusy=false;this.startupDecisionQueued=false
    this.navigationHold=null
    this.startupObservationPending=this.requireBdsAlignedExplore
    this.followGoal=null;this.followSource=null;this.pendingWood=new Map()
    this.lastFollowEnd=null
    this.lastGuardedPlayer=null;this.lastSafetyAt=0;this.lastCombatAt=0;this.lastRetreatAt=0
    this.lastDanger=null;this.lastSelfDamageAt=0;this.lastThreatObservedAt=0
    this.ownerMotion=new OwnerMotion();this.lastEscortDecision=null
    this.deathNoted=false
    this.deathExperience=new DeathExperience({clock,log,file:experienceFile?
      require('node:path').join(require('node:path').dirname(experienceFile),
        'death-experience.json'):null})
    this.lastCombatDecisionKey=null;this.lastCombatDecisionAt=0
    this.lastFollowReportAt=0;this.followPosition=null
    this.followGoalRadius=this.liveBehavior.settings.followDistance;this.lastFollowRadiusChange=0
    this.nextSleepAt=0;this.nextEquipAt=0;this.maintenanceBusy=false
    this.lastEquipObservation=null
    this.lastSleepOpportunity=null;this.lastSleepOpportunityKey=null
    this.observedBeds=new ObservedBeds({clock,log,
      file:experienceFile?require('node:path').join(
        require('node:path').dirname(experienceFile),'observed-beds.json'):null})
    this.nextNightSafetyReviewAt=Number.NEGATIVE_INFINITY
    this.nextAutonomousCraftAt=0
    this.failureMemory=new FailureMemory(clock,experienceFile)
    this.explorationProgress=new ExplorationProgress({clock,log,
      file:experienceFile?require('node:path').join(require('node:path').dirname(experienceFile),'exploration-progress.json'):null})
    this.continuousGoal=new ContinuousGoal({clock,log,file:experienceFile?
      require('node:path').join(require('node:path').dirname(experienceFile),'continuous-goal.json'):null})
    this.lastWorldRoutine=null
    this.lastIdleDecision=null;this.lastIdleDecisionLogAt=0;this.lastIdleDecisionKey=null;this.lastIdleHold=null
    this.lastVoxelNavigation=null;this.lastVoxelKey=null;this.lastResourceOpportunity=null
    this.lastTerrainAdaptation=null;this.lastTerrainAdaptationKey=null;this.lastTerrainWorkAttemptAt=Number.NEGATIVE_INFINITY
    this.lastShelterOpportunity=null;this.lastShelterKey=null;this.lastShelterAttemptAt=Number.NEGATIVE_INFINITY
    this.lastModelObserveKey=null;this.lastModelObserveAt=Number.NEGATIVE_INFINITY
    this.lastBedFailure=null
    this.scoutVisited=new Set();this.scoutDirection=null;this.scoutConfirmedSegments=0;
    this.lastScoutProgress=null
    this.lastEscapeSurvey=null;this.lastEscapeSurveyAt=Number.NEGATIVE_INFINITY
    this.lastEscapeDoorAction=null;this.lastEscapeDoorAttemptAt=Number.NEGATIVE_INFINITY
    this.lastEscapeDoorAttemptKey=null
    this.lastEscapeApproachAt=Number.NEGATIVE_INFINITY;this.lastEscapeApproachKey=null
    this.lastEscapeApproachRetryAt=Number.NEGATIVE_INFINITY
    this.lastEscapePassageAction=null;this.lastEscapePassageAttemptKey=null
    this.lastEscapePassageRetryAt=Number.NEGATIVE_INFINITY
    this.driveJournal=new SelfDriveJournal({clock,log})
    this.followProgress=new FollowProgress({safeRadius:this.liveBehavior.settings.followDistance})
    this.followInputObservation=new FollowInputObservation()
    this.onFollowInputTick=()=>{
      if(this.core.hasFollowIntent()&&!this.closed)
        this.followInputObservation.tick(this.bot)
    }
    this.directFollowActive=false;this.directFollowTimer=null;this.directFollowNextAt=0;this.directFollowCheckpoint=null
    this.lastPathEventStatus=null;this.lastPathEventAt=0
    this.lastFollowDiagnostic=null;this.lastFollowDiagnosticAt=0
    this.doorConfiguration=null;this.lastSightBlocked=false
    this.onPathUpdate=result=>{
      const meta=this.followProgress.pathUpdate(result)
      if(!this.followGoal||!this.core.hasFollowIntent())return
      if(meta.status==='noPath'&&this.clock()-this.lastFollowDiagnosticAt>=12000){
        const target=this.visiblePlayer(this.core.intent?.data?.playerName)
        const evidence=localFollowDiagnostic(this.bot,target,meta)
        const server=this.movementEvidence?.get?.()
        const age=server?.lastAt!=null?this.clock()-server.lastAt:null
        const recent=age!=null&&age>=0&&age<=5000&&server.latestFeet
        evidence.serverOwnFeet=recent?server.latestFeet:null
        evidence.serverSampleAgeMs=recent?age:null
        evidence.serverVsLocalDelta=recent&&this.bot.entity?.position?
          Math.round(Math.hypot(server.latestFeet.x-this.bot.entity.position.x,
            server.latestFeet.y-this.bot.entity.position.y,
            server.latestFeet.z-this.bot.entity.position.z)*100)/100:null
        evidence.positionEvidence=recent?'recent_bedrock_server_packet':'no_recent_server_position_packet'
        this.lastFollowDiagnostic=evidence
        this.lastFollowDiagnosticAt=this.clock()
        this.log.log('[Alice follow] noPath terrain evidence:',JSON.stringify(evidence))
      }
      if(meta.status!==this.lastPathEventStatus||this.clock()-this.lastPathEventAt>15000){
        this.lastPathEventStatus=meta.status;this.lastPathEventAt=this.clock()
        this.log.log('[Alice follow] path planner:',JSON.stringify(meta))
      }
    }
    this.lastSeenPlayer=null;this.lastTargetLostAt=0
    // Bedrock's pinned player_list/remove handler deletes the online
    // roster entry BEFORE emitting playerLeft. entityGone is only unload.
    this.onPlayerLeft=player=>{
      const name=typeof player?.username==='string'?player.username:''
      const owner=this.core.intent?.data?.playerName
      if(!name||typeof owner!=='string'||!this.core.hasFollowIntent()||
        name.toLowerCase()!==owner.toLowerCase())return
      // Late remove for an old session must not defeat a rapid rejoin.
      if(Object.keys(this.bot.players||{}).some(k=>k.toLowerCase()===owner.toLowerCase()))return
      const guarding=this.lastGuardedPlayer!=null
      const safetyActive=this.safetyBusy||['SURVIVE','COMBAT','GUARD'].includes(this.core.state)
      const followWasActive=Boolean(this.followGoal||this.directFollowActive)
      this.stopDirectFollow('follow_owner_left_server')
      // Release the FOLLOW-owned path only, never a transient human job or
      // emergency COMBAT/SURVIVE pathfinder owner.
      if(followWasActive&&!this.job&&!safetyActive){
        try{this.bot.pathfinder?.setGoal?.(null)}catch{}
        try{this.bot.pathfinder?.stop?.()}catch{}
      }
      this.followGoal=null;this.followSource=null;this.followPosition=null
      this.lastSeenPlayer=null;this.lastTargetLostAt=0;this.lastGuardedPlayer=null
        this.ownerMotion.reset()
      this.lastFollowDiagnostic=null;this.lastFollowDiagnosticAt=0
      this.followProgress.reset()
      if(!this.job&&!safetyActive){
        this.core.stop('follow owner left Bedrock server')
      }else{
        // Safety and user work keep their body/state; later resumeIntent
        // returns to IDLE instead of pursuing the absent player.
        this.core.intent={type:'IDLE',data:{}}
      }
      this.lastFollowEnd={reason:'player_left_server',at:this.clock(),
        source:'bedrock_player_list_remove',previousMode:guarding?'guard':'follow'}
      this.goalPlanner.queue('new_goal')
      this.log.log('[Alice follow] player left server; FOLLOW/GUARD revoked:',
        JSON.stringify({player:name,reason:'bedrock_player_list_remove',
          safetyPreserved:safetyActive,jobPreserved:!!this.job}))
    }
    this.attackBackoff=new Map();this.observedHurt=new Map()
    this.recentAttackAttempts=new Map()
    this.onEntityHurt=entity=>{
      const key=attackKey(entity)
      if(key==null)return
      const now=this.clock()
      this.observedHurt.set(key,now)
      if(this.observedHurt.size>32)this.observedHurt.delete(this.observedHurt.keys().next().value)
      // A target hurt event has NO attacker ID. Correlation within 2s is
      // explicitly NOT proof Alice dealt damage; do not reset miss backoff.
      const previous=this.recentAttackAttempts.get(key)
      const age=previous===undefined?null:now-previous
      if(this.attackBackoff.has(key)||age!==null&&age>=0&&age<=2000){
        const kind=HOSTILES.has(entity?.name)?entity.name:'unknown'
        this.log.log('[Alice safety] target hurt observed (attacker unverified):',
          JSON.stringify({kind,elapsedMs:age!==null&&age>=0&&age<=2000?age:null,
            evidence:'target_hurt_attacker_unverified',verifiedCause:false}))
      }
    }
    this.safetyBusy=false;this.timers=[];this.lastQuipAt=clock();this.lastLookAt=0
    this.nextFoodAt=0;this.seenSpawn=false
  }
  refreshBehavior(){
    if(!this.settingsReader)return false
    const next=this.settingsReader.read()
    if(next.revision===this.liveBehavior.revision)return false
    const before=this.liveBehavior.settings
    this.liveBehavior={...next,settings:{...DEFAULTS,...next.settings}}
    if(this.liveBehavior.settings.agentMode!==before.agentMode){
      this.goalPlanner.cancel('mode_changed')
      this.goalPlanner.queue('mode_selected')
      if(this.action?.source==='自主模型'){
        this.cancelActive('agent mode changed')
        this.core.resumeIntent('agent mode changed')
      }
      if(this.liveBehavior.settings.agentMode==='autonomous'&&
         this.liveBehavior.settings.autonomyEnabled)
        this.continuousGoal.resume()
      else this.continuousGoal.interrupt('player_override')
    }
    this.followSettingsDirty=next.settings.followDistance!==before.followDistance||
      next.settings.occludedDistance!==before.occludedDistance
    if(this.core.hasFollowIntent?.()&&this.core.intent?.data)
      this.core.intent.data.distance=next.settings.followDistance
    this.log.log('[Alice control] applied live behavior settings:',JSON.stringify(next))
    return true
  }
  say(message) {const text=compact(message).slice(0,170);if(!text)return;try{this.bot.chat(text)}catch(e){this.log.warn('[Alice chat]',e.message)}}
  idleGateReason(){
    // Read-only explanation of the same gates used in runIdleDecision.
    // This must never issue movement, change timing, or override STOP.
    const settings=this.liveBehavior.settings;
    if(!settings.autonomyEnabled)return 'autonomy_disabled';
    if(settings.agentMode==='companion')return 'companion_mode';
    if(this.goalPlanner.stoppedByHuman)return 'human_stop';
    if(!this.ready())return 'sync_incomplete';
    if(this.bot.isSleeping)return 'sleeping';
    if(this.job)return 'job_active';
    if(this.safetyBusy)return 'safety_busy';
    if(this.threat())return 'threat_nearby';
    if(this.bot.health<14)return 'low_health';
    if(this.core.hasFollowIntent())return 'follow_intent';
    if(this.verticalWatch.active())return 'vertical_hold';
    if(this.lastSafetyAt>0&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS)
      return 'post_threat_window';
    if(this.core.state!=='IDLE')return 'non_idle_state';
    if(this.navigationHold)return 'position_witness_unverified';
    if(this.startupObservationPending)return 'startup_observation_pending';
    if(this.clock()-this.lastHumanAt<this.p.autonomy_policy.AUTONOMY_GRACE_MS)
      return 'human_grace_period';
    if(this.clock()<this.nextIdleAt)return 'work_cooldown';
    return 'eligible_for_work';
  }
  ready() {return this.started&&!this.closed&&this.seenSpawn&&this.hasHealth&&this.hasInventorySync&&
    Number.isFinite(this.bot.health)&&this.bot.health>0&&this.bot.entity?.position&&
    typeof this.bot.pathfinder?.setGoal==='function'&&this.ops.inventory()!==null}
  start(){
    if(this.started){this.seenSpawn=true;this.lastSafetyAt=this.clock();
      this.lastSelfDamageAt=0 // prior-life damage must not survive respawn
      this.verticalWatch.reset();return}
    this.started=true;this.closed=false;this.seenSpawn=true
    this.lastSelfDamageAt=0
    this.verticalWatch.reset()
    this.configureMovement()
    this.bot.on?.('entityHurt',this.onEntityHurt)
    this.bot.on?.('path_update',this.onPathUpdate)
    this.bot.on?.('playerLeft',this.onPlayerLeft)
    this.bot.on?.('physicsTick',this.onFollowInputTick)
    this.timers=[setInterval(()=>this.maintenanceTick().catch(e=>this.log.error('[Alice survival]',e)),5000),setInterval(()=>{try{this.safetyTick()}catch(e){this.log.error('[Alice safety]',e)}},300),
      setInterval(()=>this.followTick().catch(e=>this.log.error('[Alice follow]',e)),1000),
      setInterval(()=>this.idleTick().catch(e=>this.log.error('[Alice autonomy]',e)),5000)]
    for(const timer of this.timers)timer.unref?.()
    this.log.log('[Alice Bedrock] Core / Safety(300ms) / Follow(1s) / Autonomy(5s) controllers started')
    this.wakeStartupDecision()
  }
  wakeStartupDecision(){
    if(this.startupDecisionQueued||!this.ready())return
    this.startupDecisionQueued=true
    // Defer until the current server event finishes updating bot state.
    Promise.resolve().then(()=>this.idleTick())
      .catch(e=>this.log.error('[Alice autonomy]',e))
  }
  holdNavigation(proof){
    this.navigationHold=proof.reason
    this.nextIdleAt=this.clock()+5000
    this.lastIdleHold={goal:this.continuousGoal.goal?.goal||'DISCOVER_RESOURCES',
      reason:proof.reason,at:this.clock(),nextReviewAt:this.clock()+5000}
    this.continuousGoal.wait('server_position_unconfirmed')
    if(this.lastBdsExploreHoldReason!==proof.reason){
      this.lastBdsExploreHoldReason=proof.reason
      this.log.log('[Alice exploration] physical start rejected:',JSON.stringify({
        reason:proof.reason,localServerDistance:proof.distance??null,
        serverMovementVerified:false,attempted:false}))
    }
  }
  configureMovement(){
    if(!this.bot.pathfinder||!this.api?.Movements)throw Error('Verified Bedrock pathfinder API required')
    const moves=new this.api.Movements(this.bot)
    this.p.terrain_policy.cautiousPathOptions(moves)
    moves.canDig=false;moves.allow1by1towers=false
    // Pinned Bedrock pathfinder has only gate IDs in its openable registry;
    // explicit wooden doors need registration before allowing interaction.
    const doorConfig=configureDoors(moves,this.bot.registry)
    if(!this.doorConfiguration||this.doorConfiguration.enabled!==doorConfig.enabled||
        this.doorConfiguration.woodenDoorTypes!==doorConfig.woodenDoorTypes){
      this.log.log('[Alice follow] doorway navigation:',JSON.stringify(doorConfig))
      this.doorConfiguration=doorConfig
    }
    this.bot.pathfinder.setMovements(moves)
  }
  stop(reason='stop') {
    if(this.closed)return
    this.closed=true;this.started=false
    this.verticalWatch.reset()
    this.timers.forEach(clearInterval);this.timers=[]
    this.stopDirectFollow('runtime_stopped')
    this.bot.off?.('entityHurt',this.onEntityHurt)
    this.bot.off?.('path_update',this.onPathUpdate)
    this.bot.off?.('playerLeft',this.onPlayerLeft)
    this.bot.off?.('physicsTick',this.onFollowInputTick)
    this.followInputObservation.reset()
    this.cancelActive(reason);this.plannerAbort?.abort();this.log.log('[Alice Bedrock] controllers stopped:',reason)
  }
  cancelActive(reason='cancel') {
    this.stopDirectFollow(reason)
    this.epoch++
    this.plannerAbort?.abort();this.plannerAbort=null
    this.goalPlanner.cancel(reason.startsWith('stop')?'stop':'priority')
    if(this.job&&!this.job.signal.aborted){
      this.log.log('[Alice job] duration:',JSON.stringify({
        taskType:this.job.type,source:'interrupted',result:'cancelled',
        durationMs:Math.max(0,this.clock()-(this.job.startedAt??this.clock()))}))
      if(this.action?.source?.startsWith('自主'))
        this.continuousGoal.interrupt(reason.startsWith('stop')?'user_stop':'action_preempted')
      this.job.abort.abort(new Error(reason))
    }
    this.job=null;this.action=null;this.followGoal=null;this.followPosition=null
    this.lastFollowDiagnostic=null;this.lastFollowDiagnosticAt=0
    this.followGoalRadius=this.liveBehavior.settings.followDistance
    this.followProgress.reset()
    try{this.bot.pathfinder?.setGoal(null)}catch{}
    try{this.bot.pathfinder?.stop?.()}catch{}
    try{this.bot.stopDigging?.()}catch{}
    try{this.bot.clearControlStates?.()}catch{}
  }
  noteInventory(packet){
    // A pristine empty array is NOT evidence that the server synchronized inventory.
    // Only the initial server inventory_content packet establishes the read baseline.
    if(packet?.window_id==='inventory'){
      this.hasInventorySync=true;this.wakeStartupDecision()
    }
  }
  noteDeath(){
    // Correlation of mob proximity and damage is NOT kill attribution.
    if(this.deathNoted)return null
    this.deathNoted=true
    const mob=this.clock()-this.lastThreatObservedAt<=8000?
      this.lastDanger?.name||'unknown':'unknown'
    const finding=this.deathExperience.record({
      nearbyMob:mob,recentDamage:this.clock()-this.lastSelfDamageAt<=8000,
      healthBefore:this.lastHealth,food:this.bot.food})
    this.log.log('[Alice life] death analysis:',JSON.stringify(finding))
    return finding
  }
  noteHealth(){
    if(Number.isFinite(this.bot.health)&&this.bot.health>=0&&this.bot.health<=2048){
      this.hasHealth=true
      if(this.bot.health<=0){
        this.cancelActive('death');this.hasHealth=false;this.seenSpawn=false
        this.lastSafetyAt=this.clock()
        this.core.transition('SURVIVE','death: waiting for respawn')
      }
      if(this.lastHealth>this.bot.health&&this.bot.health>0)
        this.lastSelfDamageAt=this.clock()
      this.lastHealth=this.bot.health
      this.wakeStartupDecision()
    }
  }
  visiblePlayer(name){
    if(!name)return null
    const entry=Object.entries(this.bot.players||{}).find(([k])=>k.toLowerCase()===String(name).toLowerCase())
    return entry?.[1]?.entity?.position?entry[1].entity:null
  }
  threat(){
    if(!this.ready())return null
    const mobs=Object.values(this.bot.entities||{}).filter(e=>HOSTILES.has(e?.name)&&e?.position&&typeof e.position.distanceTo==='function')
    const owner=this.core.intent?.data?.playerName||this.lastGuardedPlayer
    const nearOwner=this.visiblePlayer(owner)?.position
    const protect=nearOwner?.distanceTo?.(this.bot.entity.position)<=12 ? nearOwner : null
    return this.p.safety_policy.selectThreat({now:this.clock(),health:this.bot.health,
      selfPosition:this.bot.entity.position,ownerPosition:protect,
      lastSelfDamageAt:this.lastSelfDamageAt,hostiles:mobs})
  }
  status(){
    if(!this.seenSpawn)return '正在等待 Minecraft 角色生成。'
    if(!this.ready())return '已进入服务器，但生命值、坐标或服务端背包快照还未可信同步；行动暂停。'
    const p=this.bot.entity.position
    const act=this.action?.label||({FOLLOW:'跟随玩家',GUARD:'护卫待命',SURVIVE:'危险避让',IDLE:'观察周围'}[this.core.state]||this.core.state)
    const owner=this.action?.source||this.core.intent?.data?.playerName||'自主任务'
    const goal=this.driveJournal?.get()?.goal
    return `Alice状态：${act}，来源${owner}；目标${goal||'观察环境'}；生命${this.bot.health}/20，饥饿${Number.isFinite(this.bot.food)?this.bot.food:'未知'}；坐标${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}。`
  }
  equipmentEvidence(){
    return {...equipmentSnapshot(this.bot,this.p.equipment?.chooseWeapon),
      lastAttempt:this.lastEquipObservation}
  }
  escortDecision(danger=this.threat(),{observeOwner=true}={}){
    const owner=this.core.intent?.data?.playerName
    const entity=this.core.hasFollowIntent?.()?this.visiblePlayer(owner):null
    const now=this.clock()
    const moving=entity&&observeOwner?this.ownerMotion.observe(entity.position,now):
      this.ownerMotion.lastMoveAt>-Infinity&&now-this.ownerMotion.lastMoveAt<=1800
    const recentHurt=this.lastSelfDamageAt>0&&now-this.lastSelfDamageAt<=6500
    const barrier=danger?.target?observedHostileBarrier(this.bot,danger.target):'unknown'
    const result=escortAssessment({hasIntent:!!entity&&this.core.hasFollowIntent(),
      health:this.bot.health,danger,barrier,ownerMoving:!!moving,
      recentSelfHurt:recentHurt,self:this.bot.entity?.position,target:danger?.target?.position})
    this.lastEscortDecision={reason:result.reason,allowFollow:result.allowFollow,
      barrier,ownerMoving:!!moving,at:now}
    return result
  }
  inventorySummary(){
    const items=this.ops.inventory()
    if(!items)return '背包尚未同步，不能猜测物品。'
    const grouped=new Map()
    for(const i of items)grouped.set(i.name,(grouped.get(i.name)||0)+i.count)
    const inv={inventory:{items:()=>[...grouped].map(([name,count])=>({name,count}))}}
    return this.p.inventory_policy.formatInventory(this.p.inventory_policy.inventorySnapshot(inv))
  }
  locationSummary(){
    if(!this.ready())return '位置还没有可信同步。'
    return this.p.inventory_policy.formatLocation({entity:this.bot.entity,game:this.bot.game})
  }
  async onChat(sender,message){
    if(this.closed||!sender)return
    const own=[this.bot.username,this.bot._client?.profile?.name].filter(Boolean).map(x=>x.toLowerCase())
    if(own.includes(sender.toLowerCase()))return
    let cmd=recognize(message)
    const asking=this.pendingWood.get(sender)
    if(!cmd&&asking&&this.clock()-asking.at<=45000)cmd=compact(message)
    if(!cmd)return
    if(this.p.social_policy.isStatusQuery(cmd)||/^(状态|你在干嘛[?？]?)$/.test(cmd))return this.say(this.status())
    if(this.p.inventory_policy.isInventoryQuery(cmd)||/^(背包|背包有什么)$/.test(cmd))return this.say(this.inventorySummary())
    if(this.p.inventory_policy.isLocationQuery(cmd)||/^(你在哪里[?？]?)$/.test(cmd))return this.say(this.locationSummary())
    if(/^(?:记忆|学习状态|学到了什么|记住了什么)$/.test(cmd)){
      const summary=this.core.learning?.summary?.()||{}
      const outcomes=Object.entries(this.core.learning?.data?.itemOutcomes||{}).slice(-4)
        .map(([name,r])=>name+' '+r.successes+'/'+r.attempts).join('，')
      return this.say('长期记忆：'+(summary.knowledgeSkills||0)+'种技能经验、'+(summary.itemAliases||0)+
        '个物品别名、'+(summary.itemOutcomes||0)+'种物品任务；'+(outcomes||'尚无已验证物品任务')+'。')
    }
    if(/^(帮助|help)$/.test(cmd))return this.say('命令：跟紧我、保护我、停止、记忆、吃东西、收集5个橡木原木、收集3个铁锭、记住：闪亮矿=diamond、从箱子里拿3个苹果。')
    if(asking && this.clock()-asking.at<=45000){
      const number=this.p.wood_policy.parseCountReply(cmd)
      if(number!=null){this.pendingWood.delete(sender);if(number>32)return this.say('单次最多采集32个，避免长时间破坏环境。')
        return this.acceptGather(sender,number)}
    }
    const task=parseTask(cmd)
    if(task.type==='UNKNOWN'){
      if(this.planner?.url)return this.askModel(sender,cmd)
      if(this.p.social_policy.classifyCasualMessage(cmd)==='chat')return this.say('我在这里。正在留意周围环境，有需要就叫我。')
      return this.say('尚未识别这条指令。若启用 Ollama，可以用自然语言与我交谈；没有执行未知命令。')
    }
    if(task.type==='INVALID_QUANTITY')return this.say('数量超出限制：采集1到32个，箱子单次取放1到64个。')
    if(task.type==='UNKNOWN_ITEM')return this.say('暂不识别物品 '+task.raw+'；请使用常见中文物品名或 minecraft:物品ID。')
    if(task.type==='TEACH_ITEM'){
      try {
        const existing=resolveItem(task.alias,this.bot.registry,null)
        if(existing.ok&&existing.item!==task.item)
          return this.say('不能覆盖 Minecraft 已知物品名称：'+task.alias)
        const saved=this.core.learning.rememberItemAlias(task.alias,task.item,this.bot.registry)
        return this.say('记住了：'+saved.phrase+' 是 '+saved.item+'（已写入持久记忆）。')
      }catch(e){return this.say('无法记住这个对应关系：'+String(e.message).slice(0,70))}
    }
    if(task.type==='WOOD_QUESTION'){
      this.pendingWood.set(sender,{at:this.clock()})
      return this.say(`${sender}，需要收集多少个原木？回复1到32之间的数量。`)
    }
    this.lastHumanAt=this.clock();this.nextIdleAt=Math.max(this.nextIdleAt,this.clock()+this.p.autonomy_policy.AUTONOMY_GRACE_MS)
    if(task.type==='WAKE'){
      if(!this.bot.isSleeping)return this.say('我现在没有睡觉。')
      try{await this.bot.wake();this.say('已收到起床操作，等待服务器确认。')}
      catch(e){this.say('起床失败：'+String(e.message).slice(0,60))}
      return
    }
    if(task.type==='STOP'){
      this.cancelActive('stop from '+sender);this.goalPlanner.halt();this.core.stop('user stop')
      this.continuousGoal.interrupt('user_stop')
      this.lastGuardedPlayer=null
      if(this.bot.isSleeping){try{await this.bot.wake()}catch(e){this.log.warn('[Alice sleep] stop while sleeping:',String(e.message).slice(0,80))}}
      this.say('已停止当前任务和跟随；如仍在睡觉，等待服务器起床确认。')
      return
    }
    if(this.bot.isSleeping){
      try{await this.bot.wake()}catch(e){return this.say('我还在睡觉，起床未成功：'+String(e.message).slice(0,60))}
      if(this.bot.isSleeping)return this.say('尚未收到起床确认，暂不行动。')
    }
    if(task.type==='FOLLOW'||task.type==='GUARD'){
      if(!this.safetyBusy)this.cancelActive('new movement order from '+sender)
      this.ownerMotion.reset()
      this.continuousGoal.interrupt('player_override')
      this.refreshBehavior()
      this.core.setFollowIntent(sender,this.liveBehavior.settings.followDistance)
      this.followSource=sender;this.lastFollowEnd=null
      if(task.type==='GUARD'){this.lastGuardedPlayer=sender;this.log.log('[Alice guard] persistent follow with automatic nearby defense enabled for',sender)}
      else this.lastGuardedPlayer=null
      this.say(task.type==='GUARD'?`收到，保护${sender}；会跟随并观察附近威胁。`:`收到，跟随${sender}；移动是否成功以服务器坐标为准。`)
      return
    }
    if(task.type==='EAT'){
      if(!this.ready())return this.say('需要先同步可信生命和背包，才能进食。')
      this.cancelActive('eat requested')
      this.startJob('RECOVER',sender,async signal=>{
        const r=await this.ops.eatIfSafe({signal,underThreat:!!this.threat()})
        return {ok:r.ok,message:r.ok?'饥饿值从'+r.foodBefore+'恢复至'+r.foodAfter:'',reason:r.reason||'食物未确认生效'}
      },{label:'安全进食'})
      return
    }
    if(task.type==='ITEM_REQUEST')return this.acceptAcquire(sender,task.term,task.count??1)
    if(task.type==='STORAGE'){
      this.cancelActive('container order from '+sender)
      this.startJob('STORAGE',sender,signal=>this.ops.transferNearby({...task,signal,radius:12}),{
        label:task.direction==='withdraw'?'从箱子取物':'存入箱子'})
      return
    }
    if(task.type==='WOOD')return this.acceptGather(sender,task.count)
    if(task.type==='CRAFT'){
      this.cancelActive('craft supersedes previous task')
      // Paper's FOLLOW intent is durable; a craft command is temporary work.
      this.startJob('CRAFT',sender,signal=>this.craftWeaponOrTable(task.item,signal))
    }
  }
  async askModel(sender,command){
    if(!this.planner||this.plannerBusy)return this.say('我正在处理上一条复杂指令，请稍后。')
    // Capture priority generation BEFORE the first await; player STOP/FOLLOW
    // may arrive while cancelling an existing autonomous model request.
    const epoch=this.epoch
    this.plannerBusy=true
    let ctrl=null
    try{
      await this.goalPlanner.cancelAndWait('human_chat')
      if(this.closed||epoch!==this.epoch)return
      ctrl=new AbortController();this.plannerAbort=ctrl
      const memories=this.core.learning?.data
      const memory=JSON.stringify({aliases:Object.entries(memories?.itemAliases||{}).slice(-12),
        outcomes:Object.entries(memories?.itemOutcomes||{}).slice(-12)})
      const plan=await this.planner.suggest({message:command,status:this.status(),memory,signal:ctrl.signal})
      if(ctrl.signal.aborted||this.closed||epoch!==this.epoch)return
      if(!plan)return this.say('我暂时无法安全理解这条指令。')
      switch(plan.action){
        case 'reply': return this.say(plan.message)
        case 'status': return this.say(this.status())
        case 'follow_player':return this.onChat(sender,'AliceAI 跟着我')
        case 'guard_player':return this.onChat(sender,'AliceAI 保护我')
        case 'collect_wood':return this.acceptGather(sender,plan.count)
        case 'collect_item':return this.acceptAcquire(sender,plan.item,plan.count,true)
        case 'eat_food':return this.onChat(sender,'AliceAI 吃东西')
        case 'craft_item':return this.onChat(sender,'AliceAI 制作'+(plan.item==='wooden_sword'?'木剑':'工作台'))
        case 'stop':return this.onChat(sender,'AliceAI 停止')
      }
    }catch(err){
      if(!ctrl?.signal.aborted&&!this.closed&&epoch===this.epoch)
        this.say('本地 Ollama 暂时不可用，我继续保持自主生存与安全观察。')
    }finally{this.plannerBusy=false;if(this.plannerAbort===ctrl)this.plannerAbort=null}
  }
  acceptAcquire(sender,term,count=1,skipModel=false){
    if(!inRange(count,1,32))return this.say('单次获取数量必须为1到32。')
    const resolved=resolveItem(term,this.bot.registry,this.core.learning)
    if(!resolved.ok){
      if(this.planner?.url&&resolved.reason==='unknown_registry_item'&&term.length>1&&!skipModel)
        return this.askModel(sender,'将物品 '+term+' 识别成Minecraft注册表中的标准物品并收集'+count+'个')
      return this.say('目前无法从基岩物品注册表识别 '+String(term).slice(0,35)+'；可以用 minecraft:物品ID，或教我物品别名。')
    }
    const item=resolved.item,strategy=acquisitionStrategy(item,WOOD_LOGS)
    const actionType=strategy==='verified_natural_tree'?'GATHER':'CRAFT'
    this.cancelActive('new item collection from '+sender)
    this.startJob(actionType,sender,signal=>this.acquireItem(item,count,signal),{label:'获取'+count+'个 '+item})
  }
  async acquireItem(item,requested,signal){
    // A Minecraft goal may have multiple sources: natural blocks, recipes,
    // farming, mob drops and mining. Only VERIFIED executors are permitted.
    const strategy=acquisitionStrategy(item,WOOD_LOGS)
    const isLogs=strategy==='verified_natural_tree'
    const skillItem=item===LOG_GROUP?'natural_logs':item
    const started=this.bot.entity?.position?.clone?.()
    let gained=0,reason='source_unavailable'
    for(let i=0;i<Math.min(requested*3,40)&&gained<requested;i++){
      if(signal.aborted||this.bot.health<14||this.threat())throw Error('collection interrupted by danger')
      let r
      if(isLogs)r=await this.ops.gatherOne({signal,origin:started,maxDistance:28,
        targetItem:item===LOG_GROUP?null:item})
      else {
        // Try a server-advertised recipe with existing ingredients only;
        // unknown underground/farm/mob sources do not get blind mining code.
        const p=this.bot.entity?.position
        const table=this.bot.findBlock?.({matching:b=>b?.name==='crafting_table',maxDistance:4})||null
        const nearby=table&&p&&table.position.distanceTo(p)<=4.5?table:null
        r=await this.ops.craftVerified(item,{signal,craftingTable:nearby})
      }
      if(!r?.ok||!Number.isSafeInteger(r.gained)||r.gained<=0){
        reason=r?.reason||'unverified_item_result';break
      }
      gained+=r.gained
    }
    const mode=isLogs?'gather':'craft'
    this.core.learning?.recordItemOutcome?.(skillItem,mode,{ok:gained>0,delta:gained,
      reason:gained>0?'server_inventory_delta_verified':reason})
    const verified=gained>=requested
    return {ok:verified,message:verified?'实际获得'+gained+'个 '+item:'',
      reason:'仅确认获得'+gained+'/'+requested+'个 '+item+'；'+
        (gained<requested?(isLogs?reason:'当前只有材料已齐全的配方合成器；矿石开采/农作物/怪物掉落尚无安全执行器。'+reason):'已完成')}
  }
  acceptGather(sender,count){
    if(!inRange(count,1,32))return this.say('一次只支持1到32个原木。')
    this.cancelActive('gather supersedes earlier task')
    // Leave the player for the requested task without forgetting the long-lived
    // FOLLOW intent. startJob() temporarily owns the body; finally resumes it.
    this.startJob('GATHER',sender,signal=>this.gatherCount(count,signal))
  }
  startJob(type,source,task,{label=null,announce=true,scoutCandidate=null}={}){
    // This is a physical navigation gate, never a reason to rewrite client
    // coordinates. An old local A* position 20m away from BDS is not a safe
    // start for another path, even if the planner says SCOUT.
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
    if(this.threat()||(this.bot.health<14&&type!=='RECOVER'))return this.say('目前附近有危险或生命值过低，先暂停行动。')
    if(this.bot.isSleeping)return this.say('我还在睡觉，暂不行动。')
    if(this.job)return this.say('上一项工作尚未停止，稍后重试。')
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
  }
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
  }
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
  }
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
  }
  safetyTick(){
    if(!this.ready())return
    // A local 4+ block vertical displacement in <=12s may be an actual fall,
    // deliberate ladder travel, or a Bedrock physics correction. We cannot
    // distinguish those without independent server data, so only suspend
    // *autonomous* exploration and resurvey. Human orders and SURVIVE remain.
    const vertical=this.verticalWatch.observe(this.bot,{
      dimension:this.bot.game?.dimension,
      serverPacketCount:this.movementEvidence?.get?.()?.received||0})
    if(vertical){
      this.log.log('[Alice safety] vertical displacement observation:',
        JSON.stringify(vertical))
      this.nextIdleAt=Math.max(this.nextIdleAt,this.clock()+90000)
      this.lastVoxelKey=null
      this.goalPlanner.cancel('safety')
      if(this.job?.type==='EXPLORE'&&
         /^自主/.test(String(this.action?.source||''))){
        this.cancelActive('vertical_position_unverified')
        // cancelActive invalidates stale job epochs but does not by itself
        // transition Core out of EXPLORE (the old job finally is discarded).
        this.core.resumeIntent('vertical observation hold')
      }
    }
    const observedDanger=this.threat()
    const escort=this.escortDecision(observedDanger)
    const danger=escort.allowFollow?null:observedDanger
    const critical=this.bot.health<=8
    const lowHealthHold=this.bot.health<14&&!escort.allowFollow
    if(danger||critical||lowHealthHold)this.goalPlanner.cancel('safety')
    if(!danger&&this.job?.type==='RECOVER')return
    if(!danger&&!critical&&!lowHealthHold){
      // Do not bypass the 4.5-second cooldown when a hostile disappears.
      // Immediate escorted movement is allowed only with a positive ongoing
      // observation that the known danger is distant or behind a barrier.
      if(observedDanger&&escort.allowFollow&&this.core.hasFollowIntent()){
        this.lastSafetyAt=0;this.lastDanger=null
        if(['SURVIVE','COMBAT','GUARD'].includes(this.core.state))
          this.core.resumeIntent('escort past distant or blocked hostile')
        return
      }
      // Spatial threat boundaries are noisy: a single missing entity update or
      // 0.5m movement must not start another path while safety is intervening.
      if(this.lastSafetyAt&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS)return
      if(this.lastSafetyAt&&['SURVIVE','GUARD','COMBAT'].includes(this.core.state)){
        this.lastSafetyAt=0;this.lastDanger=null;this.core.resumeIntent('threat absent for stable 4.5s')}
      return
    }
    this.lastSafetyAt=this.clock();this.lastDanger=danger?.target||null
    if(danger?.target)this.lastThreatObservedAt=this.clock()
    const vulnerable=this.bot.health<14||danger?.type==='SURVIVE'
    const state=vulnerable?'SURVIVE':(danger?.type==='GUARD'?'GUARD':'COMBAT')
    if(this.job||this.followGoal){this.cancelActive('safety overrides lower priority task')}
    if(this.core.state!==state){
      // Only mob category and rounded distance, not identity or chat contents.
      const mob=String(danger?.target?.name||'unknown').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30)
      const near=danger?.target?.position?.distanceTo?.(this.bot.entity.position)
      this.log.log('[Alice safety] threat context:',JSON.stringify({
        kind:mob||'unknown',tactic:state,
        distanceBlocks:Number.isFinite(near)?Math.round(near*10)/10:null,
        health:this.bot.health,retreatPathVerified:false
      }))
      this.core.transition(state,'urgent safety intervention')
    }
    if(!danger||this.safetyBusy)return
    const t=danger.target
    if(!t?.position)return
    const targetDistance=this.bot.entity.position.distanceTo(t.position)
    const lastDamageMs=this.lastSelfDamageAt>0?this.clock()-this.lastSelfDamageAt:Infinity
    const tactic=this.p.safety_policy.decideCombatTactic({health:this.bot.health,
      enemyType:t.name,distance:targetDistance,lastDamageMs})
    const recentHitOutsideMelee=lastDamageMs<=6500&&targetDistance>3.5
    const mobType=String(t.name||'unknown').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30)
    const learned=this.deathExperience.assess(mobType)
    // A repeated unsafe encounter changes the next combat choice, not
    // the trust level of movement or collision evidence.
    const observedTactic=recentHitOutsideMelee?'RETREAT_AFTER_HIT':
      learned.repeatedRisk?'LEARNED_AVOID_REPEAT_DEATH':tactic
    const tacticKey=mobType+'|'+observedTactic+'|'+(vulnerable?'low':'normal')
    if(tacticKey!==this.lastCombatDecisionKey||this.clock()-this.lastCombatDecisionAt>10000){
      this.lastCombatDecisionKey=tacticKey;this.lastCombatDecisionAt=this.clock()
      this.log.log('[Alice safety] combat decision:',JSON.stringify({
        kind:mobType,tactic:observedTactic,health:this.bot.health,
        distanceBlocks:Math.round(targetDistance*10)/10,
        recentSelfDamage:lastDamageMs<=6500,serverMovementVerified:false}))
    }
    if(vulnerable||t.name==='creeper'||tactic==='RETREAT'||tactic==='KITE_RECOVER'||
       tactic==='EVADE_COUNTER'||recentHitOutsideMelee||learned.repeatedRisk){
      if(this.clock()-this.lastRetreatAt<4500)return
      this.lastRetreatAt=this.clock();this.safetyBusy=true
      const controller=new AbortController()
      const retreatStartedAt=this.clock()
       this.ops.retreatFrom(t,{signal:controller.signal}).then(async r=>{
         this.log.log('[Alice safety] action duration:',JSON.stringify({
           kind:mobType,action:'retreat',result:r.ok===true?'verified':'unverified',
           durationMs:Math.max(0,this.clock()-retreatStartedAt)}))
        this.log.log('[Alice safety] retreat observed result:',JSON.stringify(r))
        if(!r.ok)this.log.warn('[Alice safety] retreat not independently confirmed:',
          JSON.stringify({reason:r.reason||'unknown',
            attempted:r.attempted===true,localMovedBlocks:r.localMovedBlocks??null,
            serverMovementVerified:r.serverMovementVerified===true}))
        // A failed retreat must not trap Alice without any defensive swing.
        // This guard never moves: a stopped failed Pathfinder, a known blocked
        // corridor, or a fresh server-packet-aligned STATIC witness refusal can
        // permit ONE bounded melee attempt. Divergent position cannot.
        const defenseGate=stationaryDefense({
          retreat:r,bot:this.bot,target:t,hostiles:HOSTILES,
          ready:this.ready(),now:this.clock(),movementEvidence:this.movementEvidence})
        if(!defenseGate.ok)return
        const key=attackKey(t),previous=key!=null?this.attackBackoff.get(key):null
        if(this.clock()-this.lastCombatAt<1250||
           (previous&&this.clock()<previous.nextAt))return
        this.lastCombatAt=this.clock()
        const defenseStartedAt=this.clock()
        if(key!=null){
          this.recentAttackAttempts.set(key,defenseStartedAt)
          if(this.recentAttackAttempts.size>32)
            this.recentAttackAttempts.delete(this.recentAttackAttempts.keys().next().value)
        }
         const defense=await this.ops.attackOnce(t,{signal:controller.signal})
         this.log.log('[Alice safety] action duration:',JSON.stringify({
           kind:mobType,action:'cornered_defense',
           result:defense.verifiedDamage===true?'verified':'unverified',
           durationMs:Math.max(0,this.clock()-defenseStartedAt)}))
        const misses=defense.verifiedDamage?0:Math.min((previous?.misses||0)+1,5)
        const delay=defenseDelay(misses,{health:this.bot.health,
          distance:this.bot.entity?.position?.distanceTo?.(t.position)})
        if(key!=null)this.attackBackoff.set(key,{misses,
          nextAt:this.clock()+delay})
        if(key!=null&&defense.attempted!==true)this.recentAttackAttempts.delete(key)
        this.log.log('[Alice safety] cornered defense:',JSON.stringify({
          kind:mobType,retreatReason:r.reason,defenseReason:defenseGate.reason,
          attempted:defense.attempted===true,verifiedDamage:defense.verifiedDamage===true,
          nextAttemptAfterMs:delay,serverMovementVerified:false}))
      }).catch(e=>this.log.warn('[Alice safety] retreat:',e.message)).finally(()=>{this.safetyBusy=false})
    }else{
      // An attack cooldown must never suppress a newly urgent retreat.
      if(this.clock()-this.lastCombatAt<1250)return
      const key=attackKey(t)
      const previous=key!=null?this.attackBackoff.get(key):null
      if(previous&&this.clock()<previous.nextAt)return
      this.lastCombatAt=this.clock();this.safetyBusy=true
      const attackStartedAt=this.clock()
      if(key!=null){
        this.recentAttackAttempts.set(key,attackStartedAt)
        if(this.recentAttackAttempts.size>32)
          this.recentAttackAttempts.delete(this.recentAttackAttempts.keys().next().value)
      }
       this.ops.attackOnce(t).then(r=>{
        if(key!=null&&r.attempted!==true)this.recentAttackAttempts.delete(key)
         this.log.log('[Alice safety] action duration:',JSON.stringify({
           kind:mobType,action:'attack',result:r.verifiedDamage===true?'verified':'unverified',
           durationMs:Math.max(0,this.clock()-attackStartedAt)}))
        if(key!=null){
          // No attacker identity on target hurt events: never count them as
          // confirmed damage or silently clear an unverified attack backoff.
          const prev=previous?.misses||0
          const misses=r.verifiedDamage?0:Math.min(prev+1,5)
          const delay=r.reason==='out_of_reach'?ATTACK_OUT_OF_RANGE_MS:
            Math.min(ATTACK_UNCONFIRMED_MAX_MS,1750*2**Math.max(0,misses-1))
          this.attackBackoff.set(key,{misses,nextAt:this.clock()+delay})
          if(this.attackBackoff.size>32)this.attackBackoff.delete(this.attackBackoff.keys().next().value)
          this.log.log('[Alice safety] attack observation:',JSON.stringify({target:t.name||key,
            attempted:!!r.attempted,verifiedDamage:!!r.verifiedDamage,
            reason:r.reason||'unknown',nextAttemptAfterMs:delay}))
        }else this.log.log('[Alice safety] attack target lacks stable ID; no hit claimed:',JSON.stringify(r))
      }).catch(e=>this.log.warn('[Alice safety] attack:',e.message)).finally(()=>{this.safetyBusy=false})
    }
  }
  stopDirectFollow(reason='cancelled'){
    if(!this.directFollowActive)return
    this.directFollowActive=false
    if(this.directFollowTimer){clearTimeout(this.directFollowTimer);this.directFollowTimer=null}
    // Only clear this controller's own forward intent. Do not touch newer
    // SURVIVE/FOLLOW control after they take the body.
    try{this.bot.setControlState?.('forward',false)}catch{}
    this.log.log('[Alice movement] short follow recovery stopped:',reason)
  }
  async tryShortFollow(target,radius){
    if(this.directFollowActive||this.clock()<this.directFollowNextAt)return false
    if(this.job||this.threat()||this.safetyBusy||this.bot.health<16||!this.core.hasFollowIntent()||
       typeof this.bot.setControlState!=='function'||typeof this.bot.look!=='function')return false
    const candidate=safeFollowStep(this.bot,target,{radius})
    if(!candidate.ok){
      this.directFollowNextAt=this.clock()+12000
      this.log.log('[Alice movement] noPath direct recovery unavailable:',candidate.reason)
      return false
    }
    this.directFollowNextAt=this.clock()+16000
    const checkpoint=this.movementEvidence?.checkpoint?.()||null
    const start=this.bot.entity.position.clone?.()||{...this.bot.entity.position}
    const epoch=this.epoch
    try{
      // Release only the failed A* path before controlling the Bedrock input
      // lane. The pinned fork transmits player_auth_input from setControlState.
      this.bot.pathfinder.setGoal(null)
      await this.bot.look(candidate.yaw,0,true)
      if(this.epoch!==epoch||!this.core.hasFollowIntent()||this.threat()||this.job)return false
      this.directFollowActive=true
      this.bot.setControlState('forward',true)
      this.directFollowTimer=setTimeout(()=>{
        if(!this.directFollowActive)return
        this.stopDirectFollow('bounded_400ms_finished')
        const evidence=this.movementEvidence?.progress?.(checkpoint)||
          {confirmed:false,reason:'server_position_not_observed'}
        const local=Math.hypot(
          this.bot.entity.position.x-start.x,this.bot.entity.position.y-start.y,this.bot.entity.position.z-start.z)
        this.log.log('[Alice movement] short follow recovery result:',JSON.stringify({
          attempted:true,stepLimit:candidate.stepBlocks,
          localEstimateBlocks:Number.isFinite(local)?Math.round(local*100)/100:null,
          serverEvidence:evidence,source:'bedrock_server_packets_only_if_observed'
        }))
        if(!evidence.confirmed)this.directFollowNextAt=Math.max(this.directFollowNextAt,this.clock()+30000)
      },400)
      this.directFollowTimer.unref?.()
      this.log.log('[Alice movement] short noPath follow input started:',JSON.stringify({
        stepLimit:candidate.stepBlocks,sampledBlocks:candidate.sampled,
        serverEvidenceRequired:true}))
      return true
    }catch(e){
      this.stopDirectFollow('input_error')
      this.log.warn('[Alice movement] short follow recovery unavailable:',String(e.message).slice(0,90))
      return false
    }
  }
  async followTick(){
    this.refreshBehavior()
    const danger=this.threat()
    const escort=this.escortDecision(danger)
    if(!this.ready()||this.bot.isSleeping||this.job||this.safetyBusy||
      (danger&&!escort.allowFollow)||(this.bot.health<14&&!escort.allowFollow)||
      (['SURVIVE','COMBAT','GUARD'].includes(this.core.state)&&!escort.allowFollow)||
      (this.lastSafetyAt>0&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS&&
       (!danger||!escort.allowFollow)))return
    if(!this.core.hasFollowIntent()){
      if(this.followGoal){this.bot.pathfinder.setGoal(null);this.followGoal=null}
      return
    }
    const player=this.core.intent?.data?.playerName
    const entity=this.visiblePlayer(player)
    const dimension=String(this.bot.game?.dimension??'unknown')
    if(!entity){
      const last=this.lastSeenPlayer
      const fresh=last&&last.name===player&&last.dimension===dimension&&
        this.clock()-last.at>=0&&this.clock()-last.at<=LAST_SEEN_MS
      const p=fresh?last.position:null
      // Paper tracks a last-seen waypoint for 30s, NEVER an imagined distant position.
      const far=p&&this.bot.entity.position.distanceTo(p)>6
      if(far){
        const goalKey=player+'@last_seen'
        if(this.followGoal!==goalKey&&this.api.GoalNear){
          this.configureMovement()
          if(this.bot.pathfinder.setGoal(new this.api.GoalNear(p.x,p.y,p.z,5),false)===false){
            this.followGoal=null
            return
          }
          this.followGoal=goalKey
          this.log.log('[Alice follow] player out of entity range; going only to observed last-seen waypoint',player)
        }
      }else if(this.followGoal){this.bot.pathfinder.setGoal(null);this.followGoal=null}
      if(!fresh&&this.clock()-this.lastTargetLostAt>10000){
        this.lastTargetLostAt=this.clock()
        this.log.warn('[Alice follow] target not visible, no fresh same-dimension waypoint; holding safely',player)
      }
      return
    }
    this.lastSeenPlayer={name:player,position:entity.position.clone?.()||{...entity.position},
      dimension,at:this.clock()}
    if(this.followProgress.onHold(this.clock()))return
    let visible=null
    try{visible=typeof this.bot.canSeeEntity==='function'?this.bot.canSeeEntity(entity):null}
    catch(e){this.log.warn('[Alice follow] sight unavailable:',String(e.message).slice(0,80))}
    // The Bedrock adapter may not expose entity visibility. Read-only world
    // samples detect a known wooden wall and shorten range to reach the door.
    const worldSight=observedLineOfSight(this.bot,entity)
    if(worldSight===false)visible=false
    else if(visible==null)visible=worldSight
    const wantedRadius=visible===false?this.liveBehavior.settings.occludedDistance:this.liveBehavior.settings.followDistance
    if((visible===false)!==this.lastSightBlocked){
      this.lastSightBlocked=visible===false
      this.log.log('[Alice follow] target visual contact:',this.lastSightBlocked?'occluded':'visible_or_unconfirmed',
        'desiredRadius:',wantedRadius)
    }
    this.followProgress.safeRadius=wantedRadius
    const changed=this.followGoal===player&&this.followGoalRadius!==wantedRadius&&
      (this.followSettingsDirty||this.clock()-this.lastFollowRadiusChange>5000)
    if(changed){
      this.followGoalRadius=wantedRadius;this.lastFollowRadiusChange=this.clock()
      this.followSettingsDirty=false
      this.configureMovement()
      if(this.bot.pathfinder.setGoal(createResponsiveFollowGoal(this.api.GoalFollow,entity,wantedRadius),true)===false){
        this.followGoal=null
        return
      }
      this.log.log('[Alice follow] visibility range:',wantedRadius,'sighted:',visible)
    }
    if(this.followGoal===player){
      if(this.directFollowActive)return
      if(this.followProgress.lastPathStatus==='noPath'){
        const stepStarted=await this.tryShortFollow(entity,wantedRadius)
        // An asynchronous Bedrock look may yield to a new human command or
        // emergency safety controller. Do not resume the obsolete follow goal.
        if(stepStarted||!this.core.hasFollowIntent()||this.job||this.safetyBusy||
           (this.core.state==='SURVIVE'&&!this.escortDecision().allowFollow)||
           (this.threat()&&!this.escortDecision().allowFollow))return
      }
      const pathMoving=this.bot.pathfinder.isMoving?.()??null
      const result=this.followProgress.observe({name:player,now:this.clock(),
        self:this.bot.entity.position,target:entity.position,pathMoving})
      if(result.observation){
        const control=this.followInputObservation.take()
        const delta=this.bot.entity.position
        const owner=entity.position
        const elevation=Math.round((owner.y-delta.y)*100)/100
        this.log.log('[Alice follow] movement observation:',JSON.stringify({...result.observation,
          pathMoving:pathMoving??'unknown',targetDeltaY:elevation,
          horizontalDistance:Math.round(Math.hypot(owner.x-delta.x,owner.z-delta.z)*100)/100,
          selfOnGround:this.bot.entity.onGround??null,
          ...control}))
        if(result.observation.stalledWindows>0)
          this.log.warn('[Alice follow] outside follow radius without valid progress:',
            JSON.stringify({distance:result.observation.localDistanceToTarget,
              wantedRadius:this.followProgress.safeRadius,
              pathMoving:pathMoving??'unknown',
              falseGoalSuccess:result.observation.falseGoalSuccess,
              targetDeltaY:elevation,
              jumpEdges:control.jumpEdges,forwardPressedTicks:control.forwardPressedTicks,
              physicsSamples:control.physicsSamples}))
      }
      if(result.action==='repath'){
        // Paper-like, non-destructive recovery. Never blind-jump or dig buildings.
        this.log.warn('[Alice follow] non-destructive re-path to visible player; status=',this.followProgress.lastPathStatus)
        this.configureMovement()
        if(this.bot.pathfinder.setGoal(createResponsiveFollowGoal(this.api.GoalFollow,entity,wantedRadius),true)===false){
          this.followGoal=null
          return
        }
      }else if(result.action==='hold'){
        this.bot.pathfinder.setGoal(null)
        this.followGoal=null
        this.log.warn('[Alice follow] repeated no progress; holding 20s, player can come closer; no block destruction')
      }
      return
    }
    this.configureMovement()
    if(this.bot.pathfinder.setGoal(createResponsiveFollowGoal(this.api.GoalFollow,entity,wantedRadius),true)===false){
      this.followGoal=null
      return
    }
    this.followGoal=player;this.followGoalRadius=wantedRadius;this.followSettingsDirty=false;this.followPosition=this.bot.entity.position.clone();this.lastFollowReportAt=this.clock()
    this.followProgress.reset(player,this.bot.entity.position,entity.position,this.clock())
    this.log.log('[Alice follow] active target',player,'(movement needs server position validation)')
  }
  async maintenanceTick(){
    // Read-only bed observations can happen while Alice is exploring, not
    // just when idle at home. They are paced to once per 60 seconds and must
    // never interrupt active safety/combat or force a new navigation task.
    if(this.ready()&&!this.bot.isSleeping&&!this.safetyBusy)
      this.observedBeds.observe(this.bot)
    if(!this.ready()||this.bot.isSleeping||this.job||this.safetyBusy||
       this.maintenanceBusy)return
    // Passive equipment maintenance is inventory-only. It is allowed in the
    // SURVIVE/low-health hold when no emergency action currently owns Alice;
    // otherwise threat_nearby + health<14 would permanently prevent using
    // weapons/armor that a player just handed her.
    if(this.clock()>=this.nextEquipAt){
      this.nextEquipAt=this.clock()+20000
      this.maintenanceBusy=true
      try{
        const result=await this.ops.equipAuto({chooseWeapon:this.p.equipment.chooseWeapon})
        const item=String(result?.item||'').replace(/[^a-z0-9_]/gi,'').slice(0,42)||null
        const reason=String(result?.reason||'unknown').replace(/[^a-z0-9_]/gi,'').slice(0,64)
        this.lastEquipObservation={ok:result?.ok===true,
          kind:['weapon','armor'].includes(result?.kind)?result.kind:'unknown',
          item,reason,at:this.clock()}
        if(result?.ok)this.log.log('[Alice equipment] equipped:',JSON.stringify(this.lastEquipObservation))
        else if(!['no_equipment_available','already_best'].includes(reason))
          this.log.warn('[Alice equipment] deferred:',JSON.stringify(this.lastEquipObservation))
      }catch(err){
        this.lastEquipObservation={ok:false,kind:'unknown',item:null,
          reason:classifyJobException(err),at:this.clock()}
        this.log.warn('[Alice equipment] deferred:',JSON.stringify(this.lastEquipObservation))
      }finally{this.maintenanceBusy=false}
    }
    // A nearby known bed has priority over optional crafting/shelter.
    // Minecraft can forbid sleeping near monsters even through solid walls.
    // Observe and explain the bed opportunity even while a safety gate holds.
    const phase=environment(this.bot)
    const known=phase.canSleep?this.observedBeds.nearby(this.bot):[]
    if(phase.canSleep&&known.length){
      const avoidBed=p=>!!this.failureMemory.blocked('bed',p)
      const survey=this.ops.inspectNightBeds?.(12,{avoidBed,knownPositions:known})||null
      const eligible=survey?survey.eligible>0:
        this.ops.hasNearbyBed(12,{avoidBed,knownPositions:known})
      const danger=this.threat(),here=this.bot.entity?.position
      const closest=here?known.reduce((d,p)=>Math.min(d,Math.hypot(
        p.x+.5-here.x,p.y-here.y,p.z+.5-here.z)),Infinity):Infinity
      const adjacent=Number.isFinite(closest)&&closest<=2.4
      const blocked=this.safetyBusy||this.job||this.core.hasFollowIntent()
      // At low health, never initiate a long walk to a bed. A bed already
      // within 2.4 blocks can be interacted with without any path movement.
      const travelOK=adjacent||this.bot.health>=14
      this.lastSleepOpportunity={status:!eligible?survey?.status||'bed_candidate_unverified':
          blocked?'deferred_for_active_owner_or_job':
          danger?'deferred_for_immediate_danger':
          !travelOK?'deferred_low_health_bed_too_far':
          this.clock()<this.nextSleepAt?'sleep_retry_cooldown':'safe_bed_candidate',
        phase:phase.phase,knownBeds:known.length,eligible:survey?.eligible??(eligible?1:0),
        hostile:survey?.hostile??null,occupied:survey?.occupied??null,
        unknown:survey?.unknown??null,adjacent}
      if(eligible&&!blocked&&!danger&&travelOK&&this.clock()>=this.nextSleepAt&&
         !this.failureMemory.blocked('sleep',this.bot.entity.position)){
        this.nextSleepAt=this.clock()+120000
        this.startJob('RECOVER','自主生存',
          signal=>this.ops.sleepNearby({signal,radius:12,avoidBed,knownPositions:known}),
          {label:'利用已发现的安全床位睡觉',announce:false})
        return
      }
    }else{
      this.lastSleepOpportunity={
        status:phase.canSleep?'no_observed_bed_currently_loaded':'outside_sleep_window',
        phase:phase.phase,knownBeds:known.length}
    }
    const opportunityKey=JSON.stringify(this.lastSleepOpportunity)
    if(opportunityKey!==this.lastSleepOpportunityKey){
      this.lastSleepOpportunityKey=opportunityKey
      this.log.log('[Alice sleep] opportunity:',JSON.stringify(this.lastSleepOpportunity))
    }
    // All other non-equipment work still obeys threat and low-HP gates.
    if(this.threat()||this.safetyBusy||this.job)return
    const health=this.bot.health,food=this.bot.food
    if(this.clock()>=this.nextFoodAt&&Number.isFinite(food)&&food<18){
      this.nextFoodAt=this.clock()+30000
      if(this.ops.inventory()?.some(i=>['bread','apple','baked_potato','cooked_beef','cooked_porkchop',
        'cooked_chicken','cooked_mutton','cooked_cod','cooked_salmon','carrot','golden_carrot'].includes(i.name))){
        this.cancelActive('safe food recovery')
        this.startJob('RECOVER','自主生存',async signal=>{
          const result=await this.ops.eatIfSafe({signal,underThreat:Boolean(this.threat())})
          return {ok:result.ok,message:'饥饿值 '+result.foodBefore+' → '+result.foodAfter,
            reason:result.reason||'饥饿值未确认增加'}
        },{label:'安全进食',announce:false})
        return
      }
    }
    if(health<14)return
  }
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
  }
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
  }
  async boundedScout(candidate,signal,{allowNightFallback=false}={}){
    // At night only a verified two-cell flat defensive reposition may run;
    // ordinary scouting still requires daytime safety.
    // Keep the initial route origin stable as Pathfinder advances, but
    // evaluate health, hostile proximity, weather and footing against the
    // live bot on every waypoint. Do not turn night into normal daytime scout.
    const initial=this.bot.entity?.position
    const routeOrigin=initial&&{x:initial.x,y:initial.y,z:initial.z}
    const phaseAllowed=()=>environment(this.bot).safeToExplore||
      allowNightFallback&&nightConditions(this.bot,candidate,{routeOrigin}).ok===true
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
    const p=candidate.target
    const checkpoint=this.movementEvidence?.checkpoint?.()||null
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
        for(const waypoint of candidate.waypoints){
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
          if(!geometry.ok){
            this.log.log('[Alice exploration] scout door passage:',
              JSON.stringify({reason:geometry.reason,attempted:false,
                failedWaypoint:doorway,doorOpenObserved,
                serverMovementVerified:false}))
            return {ok:false,reason:geometry.reason,attempted:false,
              failedWaypoint:doorway,serverMovementVerified:false,
              target:candidate.target,elevationChanges:candidate.elevationChanges}
          }
          const crossed=await crossDoor(this.bot,door,{
            signal,movementEvidence:this.movementEvidence,clock:this.clock,
            safe:()=>!this.verticalWatch.active()&&
              this.escapeApproachGuard(signal).ok&&
              environment(this.bot).safeToExplore===true&&
              this.liveBehavior.settings.agentMode==='autonomous'
          })
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
  }
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
  }
  async crossObservedDoor(door,signal){
    const find=()=>{
      const fresh=surveyEscape(this.bot,{radius:6,maxNodes:160})
      return fresh.doorCandidates.find(candidate=>
        candidate.position?.join(',')===door.position?.join(','))||null
    }
    let current=find()
    if(!current)return {ok:false,reason:'passage_door_not_in_fresh_survey',attempted:false,
      serverMovementVerified:false}
    // Do not attempt even a short approach if the observed opened door
    // leads to a blocked/unknown cell or lacks a verifiable upper half.
    const passage=validatePassageGeometry(this.bot,current)
    if(!passage.ok)return {...passage,attempted:false,serverMovementVerified:false}
    // The 1–2 safe cells that were previously skipped for door interaction
    // still require real navigation before crossing, not a distance guess.
    if(current.approach?.steps>0){
      if(current.approach.steps>2)
        return {ok:false,reason:'passage_approach_exceeds_short_recovery',attempted:false,
          serverMovementVerified:false}
      const moved=await approachDoor(this.bot,current,{
        signal,GoalNear:this.api?.GoalNear,Movements:this.api?.Movements,
        configureMoves:m=>this.p.terrain_policy.cautiousPathOptions(m),
        movementEvidence:this.movementEvidence,clock:this.clock,
        safe:()=>this.escapeApproachGuard(signal)
      })
      if(!moved.ok)return {ok:false,reason:'passage_approach:'+moved.reason,
        attempted:moved.attempted===true,serverMovementVerified:false}
      current=find()
      if(!current)return {ok:false,reason:'passage_door_missing_after_approach',
        attempted:true,serverMovementVerified:false}
    }
    return crossDoor(this.bot,current,{
      signal,GoalNear:this.api?.GoalNear,Movements:this.api?.Movements,
      configureMoves:m=>this.p.terrain_policy.cautiousPathOptions(m),
      movementEvidence:this.movementEvidence,clock:this.clock,
      safe:()=>this.escapeApproachGuard(signal)
    })
  }
  recordEscapePassage(door,outcome){
    this.lastEscapePassageAction={
      reason:outcome.reason,attempted:outcome.attempted===true,
      door:door.position,at:this.clock(),beyond:outcome.beyond||null,
      serverMovementVerified:outcome.serverMovementVerified===true,
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
  }
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
  }
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
  }
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
    }
    return 'handled'
  }
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
  }
  async idleTick(){
    // Spawn readiness and the periodic controller share one decision flight.
    if(this.idleBusy)return
    this.idleBusy=true
    try{return await this.runIdleDecision()}
    finally{this.idleBusy=false}
  }
  async runIdleDecision(){
    this.refreshBehavior()
    if(!this.liveBehavior.settings.autonomyEnabled)return
    if(this.liveBehavior.settings.agentMode==='companion'||this.goalPlanner.stoppedByHuman)return
    if(!this.ready()||this.bot.isSleeping||this.job||this.safetyBusy||this.threat()||this.bot.health<14||this.core.hasFollowIntent()||
       this.verticalWatch.active())return
    // A retreat/noPath cycle may clear briefly before the next 300ms safety
    // tick. Require the same stable post-threat window used by FOLLOW.
    if(this.lastSafetyAt>0&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS)return
    if(this.core.state!=='IDLE')return
    // Safety preemption is temporary; only explicit user STOP should keep
    // autonomy halted (checked above via stoppedByHuman). Re-enter the same
    // durable objective after the ordinary safety/health/human grace gates.
    this.continuousGoal.resume()
    this.lastWorldRoutine=environment(this.bot)
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
        return
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
        if(goalWood<2)return
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
         this.tryNightReposition('periodic_night_survival'))return
    }
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
      // Resource failure in a player-built room must FIRST examine observed
      // nondestructive exits, even if a natural-ground daytime SCOUT candidate
      // happens to exist. Existing STOP/FOLLOW/hostile/health gates still own
      // whether movement can start. WAIT's door executor below owns actions.
      if(woodFailure&&['WAIT','SCOUT'].includes(decision.action)&&
          this.clock()-this.lastEscapeSurveyAt>=90000)
        this.observeBlockedRoom()
      // Keep the actual surveyed candidate, NOT the boolean result of
      // the freshness comparison. A boolean has no approach.waypoints and
      // silently prevented valid indoor doors from outranking SCOUT.
      const freshDoor=woodFailure&&!movementFailure&&
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
      // A goal persists across idle evaluations until observations change,
      // instead of treating the last visible house door as a permanent mission.
      // The previous survey cannot be reused after Alice moves away from it.
      const survey=this.lastEscapeSurvey
      const origin=survey?.center,pos=this.bot.entity?.position
      const nearbySurvey=survey&&Array.isArray(origin)&&pos&&
        this.clock()-this.lastEscapeSurveyAt<=25000&&
        Math.hypot(pos.x-(origin[0]+0.5),pos.y-origin[1],
          pos.z-(origin[2]+0.5))<=2.25?survey:null
      const drive=selectDrive({decision,world:this.lastWorldRoutine,
        survey:nearbySurvey,doorExecutable,woodFailure:!!woodFailure,
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
      if(this.planner?.url){
        const actionEpoch=this.epoch
        const modelOutcome=await this.runAutonomousModelStep({wood,woodFailure,movementFailure,candidate,drive,terrainWork})
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
          return
        }
        if(this.maybeStartEarthwork(terrainWork,candidate,movementFailure))return
        const localSkillPermitted=!movementFailure&&(
          !!woodFailure&&decision.action==='SCOUT'&&decision.candidate?.ok===true||
          !!woodFailure&&decision.action==='WAIT'&&!!freshDoor&&
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
            return
          }
        }
      }
      if(this.maybeStartEarthwork(terrainWork,candidate,movementFailure))return
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
        if(woodFailure&&!movementFailure&&
            ['FIND_ROOM_EXIT','OBSERVE_ROOM'].includes(drive.driveGoal)&&
            door&&this.clock()-this.lastEscapeSurveyAt<=25000){
          const doorKey=door.position?.join(',')
          const attemptedRecently=doorKey===this.lastEscapeDoorAttemptKey&&
            this.clock()-this.lastEscapeDoorAttemptAt<600000
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
  }
}
module.exports={AliceBedrockRuntime,recognize,parseTask}
