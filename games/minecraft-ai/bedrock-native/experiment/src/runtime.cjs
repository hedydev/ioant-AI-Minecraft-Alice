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

const {createCommandRuntimeMethods}=require('./features/commands/runtime_methods.cjs')
const commandRuntimeMethods=createCommandRuntimeMethods({WOOD_LOGS,LOG_GROUP,resolveItem,acquisitionStrategy,inRange,compact,recognize,parseTask})
const {createWorkRuntimeMethods}=require('./features/tasks/work_methods.cjs')
const workRuntimeMethods=createWorkRuntimeMethods({qty,WOOD_LOGS,safeShelteredFood,scoutStartProof,navigationHoldReason,classifyScoutFailure,classifyJobException})
const {createScoutRuntimeMethods}=require('./features/navigation/scout_methods.cjs')
const scoutRuntimeMethods=createScoutRuntimeMethods({verifyScoutStep,nightConditions,probeFlatInput,selectFailedFlatStep,observedDoorBits,validateCrossing,environment})

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
  // Command feature: original Alice instance; no second state owner.
  onChat(...args){return commandRuntimeMethods.onChat.apply(this,args)}
  askModel(...args){return commandRuntimeMethods.askModel.apply(this,args)}
  acceptAcquire(...args){return commandRuntimeMethods.acceptAcquire.apply(this,args)}
  acquireItem(...args){return commandRuntimeMethods.acquireItem.apply(this,args)}
  acceptGather(...args){return commandRuntimeMethods.acceptGather.apply(this,args)}
  // Work feature: original Alice instance; no second state owner.
  startJob(...args){return workRuntimeMethods.startJob.apply(this,args)}
  gatherCount(...args){return workRuntimeMethods.gatherCount.apply(this,args)}
  runVerifiedResourceStep(...args){return workRuntimeMethods.runVerifiedResourceStep.apply(this,args)}
  craftWeaponOrTable(...args){return workRuntimeMethods.craftWeaponOrTable.apply(this,args)}

  // Follow feature: retains original Alice instance and safety policy.
  stopDirectFollow(...args){return followRuntimeMethods.stopDirectFollow.apply(this,args)}
  tryShortFollow(...args){return followRuntimeMethods.tryShortFollow.apply(this,args)}
  followTick(...args){return followRuntimeMethods.followTick.apply(this,args)}
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
  // Scout feature: original Alice instance; no second state owner.
  settlePendingScoutStepOnWitness(...args){return scoutRuntimeMethods.settlePendingScoutStepOnWitness.apply(this,args)}
  boundedScout(...args){return scoutRuntimeMethods.boundedScout.apply(this,args)}
  // Model feature: retains original Alice instance and safety policy.
  recordAutonomousDecision(...args){return modelRuntimeMethods.recordAutonomousDecision.apply(this,args)}
  runAutonomousModelStep(...args){return modelRuntimeMethods.runAutonomousModelStep.apply(this,args)}
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
  idleTick(...args){return idleRuntimeMethods.idleTick.apply(this,args)}
  runIdleDecision(...args){return idleRuntimeMethods.runIdleDecision.apply(this,args)}
}
module.exports={AliceBedrockRuntime,recognize,parseTask}
