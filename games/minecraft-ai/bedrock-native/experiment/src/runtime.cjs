'use strict'
// Alice shared policy brain running on Bedrock Mineflayer action interface.
// Paper's canonical AliceCore + autonomy/safety/wood/social/inventory policy files
// are loaded by the entrypoint. The game actions are Bedrock-specific adapters.
const {BedrockOperations,qty,WOOD_LOGS} = require('./operations.cjs')
const {stationaryDefense,defenseDelay}=require('./defensive_melee.cjs')
const {equipmentSnapshot}=require('./life_actions.cjs')
const {observedHostileBarrier,OwnerMotion,escortAssessment}=require('./escort_threat.cjs')
const {HostileEngagement}=require('./hostile_engagement.cjs')
const {OllamaPlanner} = require('./planner.cjs')
const {FollowProgress} = require('./follow_progress.cjs')
const {FollowInputObservation}=require('./follow_input_observation.cjs')
const {ContinuousGoal}=require('./continuous_goal.cjs')
const {evaluateShelter,placeShelterBlock}=require('./night_shelter.cjs')
const {ObservedBeds}=require('./observed_beds.cjs')
const {HomeBedMemory,selectAdjacentBed,useBedForSpawn}=require('./bed_spawnpoint.cjs')
const {verifyBedStep}=require('./bed_step_witness.cjs')
const {verifyScoutStep}=require('./scout_step_witness.cjs')
const {verifyDoorCrossing}=require('./door_crossing_witness.cjs')
const {verifyRaisedDoorLanding}=require('./raised_door_landing_witness.cjs')
const {planRaisedDoorThreshold,performRaisedDoorThreshold,verifyRaisedDoorThreshold}=require('./raised_door_threshold.cjs')
const {selectDirectionalBedStep}=require('./bed_directional_step.cjs')
const {chooseAdjacentMovement}=require('./adjacent_motion_decision.cjs')
const {candidateOneBlockJump,performOneBlockJump}=require('./one_block_jump.cjs')
const {requestBed,resumeBed,cancelBed}=require('./bed_task_service.cjs')
const {HomeBaseMemory,homeAgenda}=require('./home_base.cjs')
const {planNightReposition,nightConditions}=require('./night_survival.cjs')
const {configureDoors,createResponsiveFollowGoal,observedLineOfSight}=require('./follow_navigation.cjs')
const {followProximity}=require('./follow_proximity.cjs')
const {safeShelteredFood}=require('./food_safety.cjs')
const {parseStorage}=require('./storage_actions.cjs')
const {DEFAULTS}=require('./live_control.cjs')
const {localFollowDiagnostic}=require('./follow_diagnostics.cjs')
const {safeFollowStep}=require('./safe_follow_step.cjs')
const {VerticalMotionWatch}=require('./vertical_motion_watch.cjs')
const {ExplorationProgress}=require('./exploration_progress.cjs')
const {observedNaturalTree,selectResourceStep}=require('./resource_opportunity.cjs')
const {probeFlatInput,selectFailedFlatStep}=require('./direct_flat_step.cjs')
const {scoutStartProof}=require('./scout_start_proof.cjs')
const {PreparedScout,equalPath}=require('./prepared_scout.cjs')
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
  return /^(?:睡觉|去睡觉|上床睡觉|去床上睡觉|找床睡觉|休息一下|设置重生点|设置重置点|设定重生点|去设置重生点|设置床位)$/.test(text)?text:/^(?:状态|帮助|你在干嘛[?？]?|你在哪里[?？]?|背包(?:有什么|里有什么)?|跟着我|跟紧我|紧跟我|跟随我|跟我走|保护我|停止|别跟了|记忆|学习状态|学到了什么|吃东西|回血|收集|采集|搜集|获取|挖|砍|找来|去找|记住|制作木剑|起床|起来|从(?:附近的?)?(?:箱子|储物箱|木桶)|(?:箱子|储物箱|木桶)(?:里|中)?(?:存入|存|放入)|(?:存入|放入|放进|放到)(?:附近的?)?(?:箱子|储物箱|木桶))/.test(text)?text:null
}
function parseTask(cmd) {
  const c=compact(cmd)
  const storage=parseStorage(c)
  if(storage)return storage
  if(/^(?:起床|起来|醒来)$/.test(c))return {type:'WAKE'}
  if(/^(?:睡觉|去睡觉|上床睡觉|去床上睡觉|找床睡觉|休息一下)$/.test(c))return {type:'SLEEP'}
  if(/^(?:设置重生点|设置重置点|设定重生点|去设置重生点|设置床位)$/.test(c))return {type:'SET_SPAWNPOINT'}
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
const {createBedRuntimeMethods}=require('./features/bed/runtime_methods.cjs')
const {createDoorRuntimeMethods}=require('./features/door/runtime_methods.cjs')
const bedRuntimeMethods=createBedRuntimeMethods({requestBed,resumeBed,scoutStartProof,selectAdjacentBed,surveyEscape,useBedForSpawn,verifyBedStep,chooseAdjacentMovement,HOSTILES,candidateOneBlockJump,selectDirectionalBedStep,performOneBlockJump})
const doorRuntimeMethods=createDoorRuntimeMethods({verifyScoutStep,scoutStartProof,surveyEscape,validateCrossing,planRaisedDoorThreshold,performRaisedDoorThreshold,crossDoor,verifyRaisedDoorThreshold,verifyRaisedDoorLanding,verifyDoorCrossing,chooseAdjacentMovement,performOneBlockJump,THREAT_CLEAR_MS})

const {createSafetyRuntimeMethods}=require('./features/safety/runtime_methods.cjs')
const safetyRuntimeMethods=createSafetyRuntimeMethods({stationaryDefense,defenseDelay,observedHostileBarrier,escortAssessment,HOSTILES,THREAT_CLEAR_MS,ATTACK_UNCONFIRMED_MAX_MS,ATTACK_OUT_OF_RANGE_MS,attackKey})
const {createFollowRuntimeMethods}=require('./features/navigation/follow_methods.cjs')
const followRuntimeMethods=createFollowRuntimeMethods({createResponsiveFollowGoal,observedLineOfSight,followProximity,safeFollowStep,THREAT_CLEAR_MS,LAST_SEEN_MS})
const {createModelRuntimeMethods}=require('./features/autonomy/model_methods.cjs')
const modelRuntimeMethods=createModelRuntimeMethods({scoutStartProof,environment,siteKey})
const {createNightRuntimeMethods}=require('./features/autonomy/night_methods.cjs')
const nightRuntimeMethods=createNightRuntimeMethods({planNightReposition,scoutStartProof,surveyVoxelActions,environment})
const {createIdleRuntimeMethods}=require('./features/autonomy/idle_methods.cjs')
const idleRuntimeMethods=createIdleRuntimeMethods({WOOD_LOGS,evaluateShelter,placeShelterBlock,homeAgenda,observedNaturalTree,selectResourceStep,scoutStartProof,startupTerrainObserved,surveyVoxelActions,selectSafeWalkingCandidate,pickVerticalStep,assessEarthwork,serverPositionProof,planDoorOpen,attemptDoorOpen,validateApproach,approachDoor,selectDrive,environment,candidateScout,decideAutonomousResponse,siteKey,simpleReason,HOSTILES,THREAT_CLEAR_MS,recognize})

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
    this.preparedScout=new PreparedScout({clock})
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
    this.lastFollowFaceAt=Number.NEGATIVE_INFINITY
    this.followGoalRadius=this.liveBehavior.settings.followDistance;this.lastFollowRadiusChange=0
    this.nextSleepAt=0;this.nextEquipAt=0;this.maintenanceBusy=false
    this.nextSpawnpointAt=0;this.pendingBedRequest=null;this.lastSpawnpointAttempt=null;this.lastBedApproach=null
    this.lastBedApproachAction=null;this.pendingBedStep=null;this.nextBedApproachStepAt=0
    this.lastEquipObservation=null
    this.lastSleepOpportunity=null;this.lastSleepOpportunityKey=null
    this.observedBeds=new ObservedBeds({clock,log,
      file:experienceFile?require('node:path').join(
        require('node:path').dirname(experienceFile),'observed-beds.json'):null})
    this.homeBed=new HomeBedMemory({clock,
      file:experienceFile?require('node:path').join(
        require('node:path').dirname(experienceFile),'home-bed.json'):null})
    this.homeBase=new HomeBaseMemory({clock,
      file:experienceFile?require('node:path').join(
        require('node:path').dirname(experienceFile),'home-base.json'):null})
    this.lastHomeAgenda=null;this.lastHomeAgendaKey=null
    this.currentRespawnStatus=()=>null
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
    this.lastEscapePassageAction=null;this.pendingDoorCrossing=null;this.verifiedRaisedThreshold=null;this.pendingScoutStep=null;
    this.pendingDoorApproachStep=null;this.lastEscapePassageAttemptKey=null
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
    this.hostileEngagement=new HostileEngagement({clock})
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
      this.hostileEngagement.reset()
      this.verticalWatch.reset();return}
    this.started=true;this.closed=false;this.seenSpawn=true
    this.lastSelfDamageAt=0
    this.hostileEngagement.reset()
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
  // A saved intent is only a plan. It cannot query BDS, emit physics input,
  // create a navigation task or prolong the original 4-second proof window.
  prepareDeferredScout(candidate,source='自主探索'){
    const observation=this.movementEvidence?.get?.()
    const env=environment(this.bot)
    const accepted=this.preparedScout.prepare(candidate,{
      source,position:this.bot.entity?.position,epoch:this.epoch,
      loginAt:observation?.loginAt,lifeEpochAt:observation?.lifeEpochAt??null,
      dimension:this.bot.game?.dimension,phase:env.phase,weather:env.weather,
      eligibleAt:Math.max(0,this.nextIdleAt)
    })
    if(accepted)this.log.log('[Alice autonomy] read-only scout staged:',
      JSON.stringify({reason:'waiting_for_new_independent_bds_pair',movementAuthorized:false}))
    return accepted
  }
  prepareAutonomousScoutPreview(goal,wood){
    if(!this.requireBdsAlignedExplore||this.preparedScout.has()||
       !['LEARN_WEAPON','COLLECT_WOOD','OBSERVE'].includes(goal)||
       goal==='LEARN_WEAPON'&&wood>=2||
       !this.ready()||this.core.state!=='IDLE'||this.goalPlanner.stoppedByHuman||
       this.core.hasFollowIntent()||this.safetyBusy||this.threat()||
       this.bot.isSleeping||this.bot.health<16||this.verticalWatch.active())return false
    const env=environment(this.bot)
    if(env.safeToExplore!==true||env.phase!=='day'||env.weather!=='clear')return false
    // Reuse the same bounded voxel scanner and all-WALK choice as normal
    // autonomy. No fresh BDS proof is needed for this read-only preview.
    const voxel=surveyVoxelActions(this.bot,{radius:4,maxNodes:96,maxReads:640})
    const selected=selectSafeWalkingCandidate(voxel,{
      hostiles:Object.values(this.bot.entities||{})
        .filter(e=>HOSTILES.has(e?.name)&&e.position).map(e=>e.position),
      blocked:new Set([...this.failureMemory.activeRoutes(),
        ...this.explorationProgress.excluded()]),visited:this.scoutVisited,
      origin:this.bot.entity?.position})
    return this.prepareDeferredScout(selected.candidate,'自主探索')
  }
  resumePreparedScoutOnWitness(){
    if(!this.preparedScout.has())return {state:'none'}
    // A single newly accepted sample cannot consume the pending intent.
    const proof=scoutStartProof(this.bot,this.movementEvidence,this.clock)
    if(!proof.ok){
      if(proof.reason==='scout_client_server_position_diverged')
        this.preparedScout.clear()
      return {state:'blocked',reason:proof.reason}
    }
    if(!this.requireBdsAlignedExplore||!this.ready()||this.closed||
       // idleBusy may mean an in-flight slow LLM suggestion; a successful
       // guarded startJob advances epoch and makes that stale reply invalid.
       this.core.state!=='IDLE'||this.job||this.safetyBusy||
       this.bot.isSleeping||this.threat()||this.bot.health<16||
       this.verticalWatch.active()||this.goalPlanner.stoppedByHuman||
       this.core.hasFollowIntent()||
       this.liveBehavior.settings.agentMode!=='autonomous'||
       this.liveBehavior.settings.autonomyEnabled!==true||
       this.clock()-this.lastHumanAt<this.p.autonomy_policy.AUTONOMY_GRACE_MS||
       this.lastSafetyAt>0&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS){
      this.preparedScout.clear()
      return {state:'blocked',reason:'survival_or_human_priority'}
    }
    const env=environment(this.bot),owner=this.movementEvidence?.get?.()
    const saved=this.preparedScout.take({
      position:this.bot.entity?.position,epoch:this.epoch,
      loginAt:owner?.loginAt,lifeEpochAt:owner?.lifeEpochAt??null,
      dimension:this.bot.game?.dimension,phase:env.phase,weather:env.weather
    })
    if(!saved.ok)return {state:'blocked',reason:saved.reason}
    if(env.safeToExplore!==true||env.phase!=='day'||env.weather!=='clear')
      return {state:'blocked',reason:'environment_no_longer_safe'}
    // An old daytime plan cannot supersede newer inventory, resource,
    // HOME, or movement-failure decisions even when the position is aligned.
    if(this.failureMemory.blocked('motion',this.bot.entity.position)||
       this.lastHomeAgenda?.objective==='return_home'&&env.tick>=8500)
      return {state:'blocked',reason:'autonomous_priority_or_motion_hold'}
    const inventory=this.ops.inventory()||[]
    const wood=inventory.filter(i=>WOOD_LOGS.has(i.name)||i.name.endsWith('_planks'))
      .reduce((n,i)=>n+i.count,0)
    const hasWeapon=inventory.some(i=>i.name.endsWith('_sword')||i.name.endsWith('_axe'))
    const goal=this.p.autonomy_policy.decideIdleWork({
      hasUsableWeapon:hasWeapon,woodResources:wood})
    if(!['LEARN_WEAPON','COLLECT_WOOD','OBSERVE'].includes(goal)||
       goal==='LEARN_WEAPON'&&wood>=2)
      return {state:'blocked',reason:'autonomous_goal_changed'}
    const voxel=surveyVoxelActions(this.bot,{radius:4,maxNodes:96,maxReads:640})
    const chosen=selectSafeWalkingCandidate(voxel,{
      hostiles:Object.values(this.bot.entities||{})
        .filter(e=>HOSTILES.has(e?.name)&&e.position).map(e=>e.position),
      blocked:new Set([...this.failureMemory.activeRoutes(),
        ...this.explorationProgress.excluded()]),visited:this.scoutVisited,
      origin:this.bot.entity?.position})
    if(!equalPath(chosen.candidate,saved.candidate))
      return {state:'blocked',reason:'staged_route_changed'}
    // No new navigation mechanism. This original startJob rechecks the
    // independent BDS proof and preemption, then boundedScout rechecks
    // terrain, pathfinder and danger before sending any input.
    this.startJob('EXPLORE',saved.source,
      signal=>this.boundedScout(saved.candidate,signal),{
        label:'自主生存：观察已验证的短平路',announce:false,
        scoutCandidate:saved.candidate})
    return this.job?.type==='EXPLORE'&&this.action?.source===saved.source?
      {state:'started',reason:'fresh_bds_pair_admitted'}:
      {state:'blocked',reason:'original_job_gate_rejected'}
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
    this.hostileEngagement.reset()
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
    this.pendingDoorCrossing=null
    this.verifiedRaisedThreshold=null
    this.pendingDoorApproachStep=null
    this.pendingBedStep=null
    this.pendingScoutStep=null
    cancelBed(this,'bed_request_cancelled')
    this.preparedScout.clear()
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
        this.hostileEngagement.reset()
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
  // Safety feature: retains original Alice instance and safety policy.
  threat(...args){return safetyRuntimeMethods.threat.apply(this,args)}
  escortDecision(...args){return safetyRuntimeMethods.escortDecision.apply(this,args)}
  safetyTick(...args){return safetyRuntimeMethods.safetyTick.apply(this,args)}
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
    if(task.type==='SLEEP'||task.type==='SET_SPAWNPOINT'){
      const requested=task.type==='SLEEP'?'sleep':'set_spawnpoint'
      const response=this.requestBedTask(requested,sender,(status,reason,message)=>{
        if(status==='completed'||status==='failed')this.say(message)
      })
      this.say(response.message)
      return
    }
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

  // Follow feature: retains original Alice instance and safety policy.
  stopDirectFollow(...args){return followRuntimeMethods.stopDirectFollow.apply(this,args)}
  async tryShortFollow(...args){return followRuntimeMethods.tryShortFollow.apply(this,args)}
  async followTick(...args){return followRuntimeMethods.followTick.apply(this,args)}
  // Bed/spawnpoint implementation is delegated to features/bed/.
  requestBedTask(...args){return bedRuntimeMethods.requestBedTask.apply(this,args)}
  resumeBedRequestOnWitness(...args){return bedRuntimeMethods.resumeBedRequestOnWitness.apply(this,args)}
  async spawnpointTick(...args){return bedRuntimeMethods.spawnpointTick.apply(this,args)}
  settlePendingBedStepOnWitness(...args){return bedRuntimeMethods.settlePendingBedStepOnWitness.apply(this,args)}
  resumeBedApproachOnWitness(...args){return bedRuntimeMethods.resumeBedApproachOnWitness.apply(this,args)}
  resumeAutonomousBedApproachOnWitness(...args){return bedRuntimeMethods.resumeAutonomousBedApproachOnWitness.apply(this,args)}
  observeHomeTick(){
    if(!this.ready()||this.bot.isSleeping||this.safetyBusy||this.threat())return
    const known=this.observedBeds.nearby(this.bot,{radius:12})
    const home=this.homeBed.summary()
    const confirmed=home.status!=='not_verified'&&!!home.bed
    // Prefer the actually server-confirmed bed, not whichever loose bed
    // happens to be first in the local cache.
    const candidate=confirmed?known.find(p=>Math.hypot(
      p.x-home.bed.x,p.y-home.bed.y,p.z-home.bed.z)<=1.5):known[0]
    if(!candidate)return
    const result=this.homeBase.observe(this.bot,candidate,{
      spawnConfirmed:confirmed&&Math.hypot(
        candidate.x-home.bed.x,candidate.y-home.bed.y,
        candidate.z-home.bed.z)<=1.5})
    const key=[result.status,result.reason,this.homeBase.summary().status].join('|')
    if(this.lastHomeSurveyKey!==key){
      this.lastHomeSurveyKey=key
      this.log.log('[Alice home] observed structure:',JSON.stringify({
        status:result.status,reason:result.reason,
        bedKnown:true,spawnConfirmed:confirmed,
        persistedHome:this.homeBase.summary().status!=='not_established',
        doorPassageVerified:false,returnRouteVerified:false}))
    }
  }
  async maintenanceTick(){
    // Read-only bed observations can happen while Alice is exploring, not
    // just when idle at home. They are paced to once per 60 seconds and must
    // never interrupt active safety/combat or force a new navigation task.
    if(this.ready()&&!this.bot.isSleeping&&!this.safetyBusy)
      this.observedBeds.observe(this.bot)
    this.observeHomeTick()
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
    // Bed-based respawn is a fundamental need even in companion mode;
    // it is independent of sleep/night cooldown and never interrupts humans.
    if(await this.spawnpointTick())return
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
      const blocked=this.safetyBusy||this.job||this.core.hasFollowIntent()||
        !!this.pendingBedRequest
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
          signal=>this.ops.sleepNearby({signal,radius:12,avoidBed,knownPositions:known,
            requireBdsProof:this.requireBdsAlignedExplore,
            forbidNavigation:this.requireBdsAlignedExplore,clock:this.clock}),
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
    // Food is a survival need, not optional exploration. A positively
    // observed wall can isolate a distant mob; unknown/close danger cannot.
    const foodDanger=this.threat()
    const foodSafe=safeShelteredFood({danger:foodDanger,
      escort:this.escortDecision(foodDanger),health:this.bot.health,
      recentHurtAt:this.lastSelfDamageAt,now:this.clock()})
    const health=this.bot.health,food=this.bot.food
    if(foodSafe&&this.clock()>=this.nextFoodAt&&Number.isFinite(food)&&food<18){
      this.nextFoodAt=this.clock()+30000
      if(this.ops.inventory()?.some(i=>['bread','apple','baked_potato','cooked_beef','cooked_porkchop',
        'cooked_chicken','cooked_mutton','cooked_rabbit','cooked_cod','cooked_salmon','carrot',
        'golden_carrot','pumpkin_pie','melon_slice','cookie'].includes(i.name))){
        this.cancelActive('safe food recovery')
        this.startJob('RECOVER','自主生存',async signal=>{
          const stillDanger=this.threat()
          const safe=safeShelteredFood({danger:stillDanger,
            escort:this.escortDecision(stillDanger),health:this.bot.health,
            recentHurtAt:this.lastSelfDamageAt,now:this.clock()})
          const result=await this.ops.eatIfSafe({signal,underThreat:!safe})
          if(result.ok)this.nextEquipAt=0 // Re-equip best weapon after food replaced hand.
          return {ok:result.ok,message:'饥饿值 '+result.foodBefore+' → '+result.foodAfter,
            reason:result.reason||'饥饿值未确认增加'}
        },{label:'安全进食',announce:false})
        return
      }
    }
    // Explicit bed intent may wait for the next naturally available BDS pair.
    // Keep passive equipment and emergency food possible, but do not begin
    // unrelated optional work while an accepted bed request owns the plan.
    if(this.pendingBedRequest)return
    // All remaining non-equipment work remains blocked by any nearby danger.
    if(foodDanger||this.safetyBusy||this.job)return
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
  // One-cell door approach is delegated to features/door/.
  settlePendingDoorApproachOnWitness(...args){return doorRuntimeMethods.settlePendingDoorApproachOnWitness.apply(this,args)}
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
  }
  // Model feature: retains original Alice instance and safety policy.
  recordAutonomousDecision(...args){return modelRuntimeMethods.recordAutonomousDecision.apply(this,args)}
  async runAutonomousModelStep(...args){return modelRuntimeMethods.runAutonomousModelStep.apply(this,args)}
  // Door passage, witness and room surveys are delegated to features/door/.
  async crossObservedDoor(...args){return doorRuntimeMethods.crossObservedDoor.apply(this,args)}
  settlePendingDoorCrossingOnWitness(...args){return doorRuntimeMethods.settlePendingDoorCrossingOnWitness.apply(this,args)}
  resumeRaisedDoorLandingOnWitness(...args){return doorRuntimeMethods.resumeRaisedDoorLandingOnWitness.apply(this,args)}
  recordEscapePassage(...args){return doorRuntimeMethods.recordEscapePassage.apply(this,args)}
  escapeApproachGuard(...args){return doorRuntimeMethods.escapeApproachGuard.apply(this,args)}
  observeBlockedRoom(...args){return doorRuntimeMethods.observeBlockedRoom.apply(this,args)}

  // Night feature: retains original Alice instance and safety policy.
  tryNightReposition(...args){return nightRuntimeMethods.tryNightReposition.apply(this,args)}
  // Idle feature: retains original Alice instance and safety policy.
  async idleTick(...args){return idleRuntimeMethods.idleTick.apply(this,args)}
  async runIdleDecision(...args){return idleRuntimeMethods.runIdleDecision.apply(this,args)}
}
module.exports={AliceBedrockRuntime,recognize,parseTask}
