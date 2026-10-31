'use strict'
// Register BEFORE emitting any production logs. Simulation/check invocations
// and the independent operator CLI retain their existing output contracts.
if(process.argv.includes('--production-start'))
  require('./timestamped_stdio.cjs').installProductionTimestamps()
// Bedrock edition runtime: Paper AliceCore / policy sources plus Bedrock Mineflayer actions.
// Explicit startup gate selects 17879 verified live world or isolated 17880 laboratory.
const fs=require('node:fs')
const path=require('node:path')
const os=require('node:os')
const {pathToFileURL}=require('node:url')
const {gate,productionGate}=require('./gate.cjs')
const {AliceBedrockRuntime}=require('./runtime.cjs')
const {environment}=require('./world_routine.cjs')
const {OllamaPlanner}=require('./planner.cjs')
const {checkChunkImplementation}=require('./chunk_preflight.cjs')
const {attachConnectionDiagnostics}=require('./connection_diagnostics.cjs')
const {clientOptions,connectionSummary}=require('./client_options.cjs')
const {connectionMode,createLegacyNativeClient,BASELINE_MODE}=require('./connection_strategy.cjs')
const {attachBedrockPlayerCoordinates}=require('./bedrock_player_coordinates.cjs')
const {LiveSettings,LiveStatus}=require('./live_control.cjs')
const {snapshot,ViewRecorder,ViewPublisher}=require('./world_view.cjs')
const {AcceptanceJournal}=require('./acceptance_log.cjs')
const {CommandMailbox,resumeArmedProbe,cancelArmedProbe}=require('./console_commands.cjs')
const {LifeObserver}=require('./life_observer.cjs')
const {attachRespawnRecovery}=require('./respawn_recovery.cjs')
const {attachConnectionAudit}=require('../../connection_audit.cjs')
const {attachMovementEvidence}=require('./movement_evidence.cjs')
const {attachOutboundInputPipeline}=require('./outbound_input_pipeline.cjs')
const {OutboundInputStatus}=require('./outbound_input_status.cjs')
const {applyInstalled:applyProtocol2193InputCompat}=require('./input_flag_compat.cjs')
const {ENABLE:ANALOG_2193_MODE}=require('./analog_move_compat.cjs')
const {BdsWitnessReader}=require('./bds_witness.cjs')
const aliceClientInputSync=require('./bedrock_client_input_sync.cjs')
const {installNavigationPositionGuard}=require('./navigation_position_guard.cjs')
const {reconcileRespawnMirror}=require('./respawn_position_mirror.cjs')
const {acquireAliceInstanceLock}=require('../../instance_lock.cjs')
const {installSignalShutdown}=require('../../session_lifecycle.cjs')
const {assertBdsSessionReleased}=require('../../server_session_guard.cjs')
const MODULES=path.resolve(__dirname,'..','..','..','runtime','alice_modules')

async function loadPolicies(){
  const names=['autonomy_policy','safety_policy','terrain_policy','wood_policy','social_policy','inventory_policy','equipment']
  const modules=await Promise.all(names.map(n=>import(pathToFileURL(path.join(MODULES,n+'.js')).href)))
  return Object.fromEntries(names.map((n,i)=>[n,modules[i]]))
}
async function main(args=process.argv.slice(2)){
  if(Number(process.versions.node.split('.')[0])<24)throw Error('Use isolated Node24 for Bedrock autonomy')
  if(args.length!==1||!['--check','--start','--production-check','--production-start'].includes(args[0]))
    throw Error('Usage: node src/main.cjs --check | --start | --production-check | --production-start')
  const live=args[0].startsWith('--production-'),check=args[0].endsWith('-check')
  const c=live?productionGate():gate()
  const tag=live?'[Alice Bedrock live]':'[Alice Bedrock lab]'
  console.log(tag,'verified destination:',c.dir,'port',c.port)
  // Confirm the same chunk dependency used by Mineflayer can read 1.26 blocks
  // before connecting to the player's real world.
  checkChunkImplementation()
  const policies=await loadPolicies()
  if(check){
    if(live){
      const session=assertBdsSessionReleased()
      console.log('[Alice BDS session] startup check:',session.status)
    }
    console.log(tag,'Paper shared policies loaded; no network/actions attempted');return
  }

  const store=path.join(os.homedir(),live?'.alice-bedrock-autonomy-state':'.alice-bedrock-experiment-state')
  fs.mkdirSync(store,{recursive:true,mode:0o700})
  process.chdir(store) // Keep edition-specific learning separate from Paper Mindcraft.
  const {AliceCore}=await import(pathToFileURL(path.join(MODULES,'core.js')).href)
  // Validate the stable BDS mapping before serializer compilation. The legacy
  // opt-in now validates only: enum array offsets must not replace wire IDs.
  if(process.env.ALICE_BEDROCK_INPUT_FLAG_COMPAT!==undefined){
    const compat=applyProtocol2193InputCompat()
    console.log('[Alice Bedrock] protocol 2193 input mapping validation:',
      JSON.stringify({status:compat.status,applied:compat.applied}))
  }
  const mineflayer=require('mineflayer')
  const {pathfinder,Movements,goals}=require('mineflayer-pathfinder')
  const tickMode=process.env.ALICE_BEDROCK_INPUT_TICK_MODE
  if(tickMode!==undefined&&tickMode!=='client_local_1')
    throw Error('invalid_ALICE_BEDROCK_INPUT_TICK_MODE')
  const options={...clientOptions(c),
    ...(tickMode?{aliceInputTickMode:tickMode}:{})}
  const mode=connectionMode()
  console.log(tag,'connection options:',JSON.stringify({...connectionSummary(options),connectionMode:mode}))
  if(tickMode)console.log('[Alice Bedrock] input tick A/B experiment:',tickMode,
    '(client frame 1 at spawn; not server-verified)')
  const onMsaCode=info=>{
    console.error(tag,'Xbox authorization requested. Open',info?.verification_uri||'https://www.microsoft.com/link')
    console.error(tag,'Device code (private terminal only):',info?.user_code||'see login prompt')
  }
  // A/B diagnostic only. The native mode uses the exact old, visually verified
  // bedrock-protocol login path, then hands that SINGLE client to Mineflayer.
  // It does not start a second connection or change auth/server state.
  // Acquire BEFORE constructing any authenticated transport; the legacy
  // chat-only client uses the same exclusive guard. No server/world mutation.
  // Reject incompatible experiment flags BEFORE opening an authenticated
  // client or reserving the single-login process lock.
  const analogFlag=process.env.ALICE_BEDROCK_INPUT_ANALOG_COMPAT
  if(analogFlag!==undefined&&analogFlag!==ANALOG_2193_MODE)
    throw Error('invalid_ALICE_BEDROCK_INPUT_ANALOG_COMPAT')
  if(analogFlag&&process.env.ALICE_BEDROCK_INPUT_FLAG_COMPAT!=='official_2193')
    throw Error('analog_2193_requires_official_input_flags')
  const releaseLogin=acquireAliceInstanceLock()
  let bot
  try{
    if(live){
      const session=assertBdsSessionReleased()
      if(session.status==='unconfigured') console.warn('[Alice BDS session] strict server session check NOT configured; local PID lock alone cannot prove server logout')
      else console.log('[Alice BDS session] verified most recent configured player event:',session.status)
    }
    const suppliedClient=mode===BASELINE_MODE
      ? createLegacyNativeClient(c,{createClient:require('bedrock-protocol').createClient,onMsaCode})
      : null
    // Replace the pinned Bedrock fork's input plugin through Mineflayer's
    // public plugin override. No node_modules patch or extra login.
    bot=mineflayer.createBot({...options,plugins:{
      ...(options.plugins||{}),client_input:aliceClientInputSync
    },...(suppliedClient?{client:suppliedClient}:{}),onMsaCode})
  }catch(err){releaseLogin();throw err}
  bot._client.once('close',releaseLogin)
  // Register raw Bedrock handshake diagnostics before gameplay and without dumping
  // Xbox certificates/tokens or any arbitrary authentication packet.
  const connectionDiagnostics=attachConnectionDiagnostics(bot)
  attachConnectionAudit(bot._client,{mode})
  // Operator-only experiment on the pinned 1.26.51 fork. Correct its
  // contradictory zero analog input only when raw and desired direction agree.
  // No physical action is generated and no server/world state is touched.
  const {analogCompat,outboundInputAudit}=attachOutboundInputPipeline(bot._client,{
    analog:analogFlag===ANALOG_2193_MODE,
    audit:live&&process.env.ALICE_BEDROCK_INPUT_AUDIT==='1'
  })
  if(analogCompat.enabled)console.log('[Alice Bedrock] official 2193 analog input compatibility enabled (opt-in)')
  const movementEvidence=attachMovementEvidence(bot._client,{eyeHeight:()=>bot.entity?.eyeHeight||1.62})
  const bdsWitness=live?new BdsWitnessReader({name:()=>bot.username}):null
  // Bedrock add_player reports Y with the player eye-height offset. The pinned
  // Mineflayer fork does not subtract this on spawn (it does on move_player),
  // so align the initial remote player entity to pathfinder feet coordinates.
  attachBedrockPlayerCoordinates(bot)
  bot.loadPlugin(pathfinder)
  // One shared admission gate, not merely EXPLORE. Protect GATHER/FOLLOW
  // and direct Pathfinder operations from using an unconfirmed local origin.
  let navigationGuard=null
  if(live)bot.once('inject_allowed',()=>{
    // Mineflayer defers ALL plugins until inject_allowed. The internal
    // listener was registered before ours, so Pathfinder exists now.
    navigationGuard=installNavigationPositionGuard(bot,movementEvidence,{
      onReject:reason=>console.log('[Alice navigation] BDS start rejected:',JSON.stringify({
        reason:reason.reason,distance:reason.distance
      }))
    })
  })
  const core=new AliceCore({name:live?'AliceAI-Bedrock':'AliceAI-Bedrock-Lab',memoryRoot:store})
  console.log('[Alice Bedrock] durable learning:',JSON.stringify(core.learning.summary()))
  const plannerUrl=process.env.ALICE_OLLAMA_URL||''
  const planner=plannerUrl?new OllamaPlanner({
    url:plannerUrl,
    model:process.env.ALICE_OLLAMA_MODEL||'gpt-oss:20b',
    jsonMode:process.env.ALICE_OLLAMA_JSON_MODE||'strict',
    timeoutMs:process.env.ALICE_OLLAMA_TIMEOUT_MS===undefined?12000:
      Number(process.env.ALICE_OLLAMA_TIMEOUT_MS),
    numPredict:process.env.ALICE_OLLAMA_NUM_PREDICT===undefined?160:
      Number(process.env.ALICE_OLLAMA_NUM_PREDICT)
  }):null
  const settingsReader=live?new LiveSettings():null
  // A recycled PID must not resurrect an earlier Alice heartbeat. Linux
  // /proc/self/stat field 22 is the immutable process start tick; the
  // operator independently checks it against /proc/<lock PID>/stat.
  const producerStartToken=live&&process.platform==='linux'?(()=>{
    const stat=fs.readFileSync('/proc/self/stat','utf8')
    return stat.slice(stat.lastIndexOf(')')+1).trim().split(/\s+/)[19]
  })():null
  const statusWriter=live?new LiveStatus():null
  const outboundStatusWriter=outboundInputAudit?new OutboundInputStatus():null
  const viewWriter=live?new ViewPublisher():null
  const viewRecorder=new ViewRecorder()
  const viewLogger=viewRecorder.logger(console)
  const acceptance=live?new AcceptanceJournal():null
  const life=live?new LifeObserver():null
  const runtimeLogger={
    log:(...args)=>{acceptance?.event('info',args);viewLogger.log(...args)},
    warn:(...args)=>{acceptance?.event('warn',args);viewLogger.warn(...args)},
    error:(...args)=>{acceptance?.event('error',args);viewLogger.error(...args)}
  }
  // Track actual native transport separately from spawned/ready state: a dead
  // player can keep an authenticated Bedrock session without a new spawn.
  let networkSessionEstablished=false
  // Connection-loss facts use a fixed, credential-free vocabulary. Losing
  // spawn readiness on death alone is NOT a transport disconnection.
  let sessionExit={kind:'none',at:null,phase:'created',serverDisconnectSeen:false}
  const noteExit=kind=>{
    if(sessionExit.kind==='server_disconnect'||sessionExit.kind==='operator_shutdown')return
    if(sessionExit.kind==='server_kicked'&&kind==='transport_closed')return
    sessionExit={kind,at:Date.now(),
      phase:connectionDiagnostics.getPhase(),
      serverDisconnectSeen:connectionDiagnostics.getDisconnect()!==null}
    runtimeLogger.warn('[Alice session] lifecycle:',JSON.stringify(sessionExit))
  }
  bot._client.on('start_game',()=>{
    networkSessionEstablished=true
    sessionExit={kind:'none',at:null,phase:'start_game_received',serverDisconnectSeen:false}
  })
  bot._client.on('disconnect',()=>noteExit('server_disconnect'))
  bot._client.on('close',()=>{
    networkSessionEstablished=false
    if(sessionExit.kind==='none')noteExit('transport_closed')
  })
  const respawnRecovery=attachRespawnRecovery(bot,{log:runtimeLogger})
  const runtime=new AliceBedrockRuntime({bot,core,policies,planner,settingsReader,log:runtimeLogger,
    label:live?'正式基岩世界':'独立基岩实验世界',experienceFile:path.join(store,'routine-failures.json'),movementEvidence,
    requireBdsAlignedExplore:live,
    api:{Movements,GoalNear:goals.GoalNear,GoalFollow:goals.GoalFollow}})
  runtime.currentRespawnStatus=()=>life?.summary()?.respawnStatus||null
  const commands=live?new CommandMailbox({runtime,log:runtimeLogger}):null
  const commandTimer=commands?setInterval(()=>commands.poll(),900):null
  commandTimer?.unref?.()
  const publishStatus=(connected=runtime.seenSpawn&&!runtime.closed)=>{
    if(!statusWriter)return
    const self=bot.entity?.position
    const pos=self&&[self.x,self.y,self.z].every(Number.isFinite)
      ?{x:Math.round(self.x*100)/100,y:Math.round(self.y*100)/100,z:Math.round(self.z*100)/100}:null
    const health=Number.isFinite(bot.health)?bot.health:null
    const food=Number.isFinite(bot.food)?bot.food:null
    const outboundSummary=outboundInputAudit?{
      ...outboundInputAudit.get(),
      ...Object.fromEntries(Object.entries(bot._aliceBedrockInputSync?.summary?.()||{})
        .filter(([key])=>['tickMode','emitted','catchupFrames','maxBatchFrames','overruns',
          'skippedTicks','lastBatchFrames','controlsChangedInsideFrame',
          'callbackPositionMutationsPrevented','callbackVelocityMutationsPrevented',
          'callbackContactMutationsPrevented'].includes(key))
        .map(([key,value])=>['sync'+key[0].toUpperCase()+key.slice(1),value])),
      analogCompatEnabled:analogCompat.enabled,
      analogCompatCorrected:analogCompat.summary().corrected,
      analogCompatSkipped:analogCompat.summary().skipped
    }:null
    const state={
      // Bind every heartbeat to its producing Node process. The operator
      // must refuse a prior session's status after an orderly restart.
      producerPid:process.pid,producerStartToken,
      connected:!!connected,sessionEstablished:networkSessionEstablished,
      sessionExit,deathRecovery:respawnRecovery.get(),
      revision:runtime.liveBehavior.revision,
      settings:runtime.liveBehavior.settings,world:'Bedrock level',serverPort:c.port,
      state:String(core.state||'unknown').slice(0,32),
      job:runtime.action?.label||null,
      longTermGoal:runtime.continuousGoal.snapshot({
        mode:runtime.liveBehavior.settings.agentMode,
        humanOverride:!runtime.liveBehavior.settings.autonomyEnabled||
          core.hasFollowIntent()||runtime.goalPlanner.stoppedByHuman,
        nextReviewAt:runtime.nextIdleAt
      }),
      followTarget:core.intent?.data?.playerName||null,
       lastFollowEnd:runtime.lastFollowEnd,
      position:pos,health,food,dimension:String(bot.game?.dimension??'unknown').slice(0,24),
      life:life?.summary()||null,
      deathLearning:runtime.deathExperience.summary(),
      currentJobTiming:runtime.job?{startedAt:runtime.job.startedAt,
        elapsedMs:Math.max(0,Date.now()-runtime.job.startedAt)}:null,
      // Only currently observed, entity-backed player entries are offered as
      // explicit console targets. An offline/stale roster is not permission.
      onlinePlayers:Object.entries(bot.players||{}).filter(([name,player])=>
        /^[A-Za-z0-9_]{3,16}$/.test(name)&&player?.entity?.position&&
        name.toLowerCase()!==String(bot.username||'').toLowerCase())
        .slice(0,12).map(([name])=>name),
      safetyEnabled:true,followDiagnostic:runtime.lastFollowDiagnostic,
      escort:runtime.lastEscortDecision&&{
        reason:runtime.lastEscortDecision.reason,
        barrier:runtime.lastEscortDecision.barrier,
        ownerMoving:runtime.lastEscortDecision.ownerMoving,
        followPermitted:runtime.lastEscortDecision.allowFollow},
      equipment:runtime.equipmentEvidence(),
      agent:runtime.goalPlanner.snapshot(runtime.liveBehavior.settings.agentMode),
      movementEvidence:{...movementEvidence.get(),witnessStatus:bdsWitness?.lastStatus||'disabled'},
      ...(outboundSummary?{outboundInput:outboundSummary}:{}),
      worldRoutine:{...environment(bot),idleGate:runtime.idleGateReason(),
        verticalSafety:runtime.verticalWatch.summary(),
        cooldowns:runtime.failureMemory.summary(self),
        explorationProgress:runtime.explorationProgress.summary(),
        resourceOpportunity:runtime.lastResourceOpportunity,
        shelterOpportunity:runtime.lastShelterOpportunity,
        idleHold:runtime.lastIdleHold,
        nightSurvival:runtime.lastNightPlan||null,
        terrainAdaptation:runtime.lastTerrainAdaptation,
        decision:runtime.lastIdleDecision,
        scouting:runtime.lastScoutProgress?{
          ...runtime.lastScoutProgress,confirmedSegments:runtime.scoutConfirmedSegments}:null,
        lastBedFailure:runtime.lastBedFailure,
        sleepOpportunity:runtime.lastSleepOpportunity,
        rememberedBeds:runtime.observedBeds.summary(),
        homeBed:runtime.homeBed.summary(),lastSpawnpointAttempt:runtime.lastSpawnpointAttempt,
        homeBase:runtime.homeBase.summary(),homeAgenda:runtime.lastHomeAgenda,
        // Compact read-only escape survey; status heartbeat is capped at 4 KiB.
        escapeSurvey:runtime.lastEscapeSurvey,
        voxelNavigation:runtime.lastVoxelNavigation}
    }
    statusWriter.publish(state)
    // A separate opt-in 0600 diagnostic survives 4KiB heartbeat compaction.
    if(outboundSummary)outboundStatusWriter?.publish(outboundSummary)
    // Keep ten-second evidence independently of the dashboard's latest-only snapshot.
    if(acceptance&&(!publishStatus.lastSampleAt||Date.now()-publishStatus.lastSampleAt>=10000)){
      acceptance.sample(state);publishStatus.lastSampleAt=Date.now()
    }
  }
  // Persistent IDLE is not proof that Alice is hung. Record the actual
  // autonomy gate once per minute, or immediately when the reason changes.
  let lastIdleGateReason=null,lastIdleGateAt=0
  const reportIdleGate=()=>{
    if(!runtime.started||runtime.closed||String(core.state)!=='IDLE'){
      lastIdleGateReason=null;return
    }
    const reason=runtime.idleGateReason(),t=Date.now()
    if(reason!==lastIdleGateReason||t-lastIdleGateAt>=60000){
      lastIdleGateReason=reason;lastIdleGateAt=t
      runtimeLogger.log('[Alice autonomy] idle gate:',JSON.stringify({
        reason,state:'IDLE',mode:runtime.liveBehavior.settings.agentMode}))
    }
  }
  // Independent querytarget is written as an atomic, short-lived 4s file.
  // Read it faster than the status heartbeat so two distinct operator-scoped
  // samples cannot silently overwrite one another between 2s status ticks.
  // This is file read ONLY: it never sends MCSManager commands or runs --loop.
  // Passive reader only. Actual MCSManager querytarget is separately
  // authorized and strictly bounded, never a polling loop.
  let mirroredRespawnCycle=0
  const witnessTimer=live&&bdsWitness?setInterval(()=>{
    if(!bdsWitness.poll(movementEvidence))return
    // Complete a preauthorized short-lived probe on THIS SAME 250ms
    // validated BDS witness event, before the 4s pair expires over SSH.
    const probe=resumeArmedProbe(runtime)
    if(probe.state==='started'||probe.state==='rejected')
      runtimeLogger.log('[Alice probe] BDS-triggered operator probe:',JSON.stringify(probe))
    // Never query BDS continuously. An operator-approved, fresh, witnessed
    // position pair can immediately unlock an already-adjacent bed interaction.
    runtime.spawnpointTick().catch(err=>
      runtimeLogger.warn('[Alice home] bed check:',String(err?.message||err).slice(0,70)))
    const recovery=respawnRecovery.get()
    const r=reconcileRespawnMirror({bot,evidence:movementEvidence,
      phase:recovery.phase,cycle:recovery.cycles,mirroredCycle:mirroredRespawnCycle})
    if(r.ok){
      mirroredRespawnCycle=r.cycle
      runtime.followGoal=null;runtime.followProgress.reset()
      runtimeLogger.log('[Alice movement] respawn BDS-verified LOCAL mirror restored:',JSON.stringify({
        cycle:r.cycle,correctionBlocks:r.distance,bdsTeleport:false,
        bdsQuerySentByAlice:false}))
    }
  },250):null
  witnessTimer?.unref?.()
  const statusTimer=live?setInterval(()=>{
    runtime.refreshBehavior();publishStatus();reportIdleGate()
  },2000):null
  statusTimer?.unref?.()
  let lastView=null,lastState=null
  const publishView=(connected=runtime.seenSpawn&&!runtime.closed)=>{
    if(!viewWriter)return
    try{
      if(connected&&String(core.state)!==lastState){
        viewRecorder.add('info',['[Alice autonomy] state:',String(core.state)])
        lastState=String(core.state)
      }
      const data=snapshot(bot,{connected,movement:movementEvidence,
        state:core.state,job:runtime.action?.label,
        jobStartedAt:runtime.job?.startedAt,events:viewRecorder.rows,
        cachedTerrain:lastView})
      viewWriter.publish(data)
      lastView=data
    }catch(err){console.warn('[Alice view] snapshot collection failed:',err.message)}
  }
  const viewTimer=live?setInterval(()=>publishView(),1000):null
  viewTimer?.unref?.()
  publishStatus(false);publishView(false)
  // In Bedrock an empty inventory array before inventory_content is NOT a
  // trustworthy empty bag. Never move/harvest/craft until the server syncs it.
  bot._client.on('inventory_content',pkt=>runtime.noteInventory(pkt))
  bot.on('health',()=>runtime.noteHealth())
  bot.on('death',()=>{
    cancelArmedProbe(runtime,'probe_cancelled_by_death')
    movementEvidence.beginRespawnEpoch()
    runtime.noteDeath()
    if(life?.death())runtimeLogger.log('[Alice life] death observed:',
      JSON.stringify({deathsSinceTracking:life.deaths}))
    runtime.noteHealth()
  })
  bot._client.on('set_spawn_position',packet=>{
    if(life?.playerSpawnPacket(packet))runtimeLogger.log(
      '[Alice life] personal spawn packet observed:',
      JSON.stringify({respawnStatus:'observed_server_player_spawn_packet'}))
  })
  bot.on('spawn',()=>{
    life?.spawn()
    runtime.deathNoted=false
    // start_game is server-origin; record its initial player coordinate
    // without treating it as a post-login movement acknowledgement.
    const login=movementEvidence.get()
    const self=bot.entity?.position
    runtimeLogger.log('[Alice movement] Bedrock login coordinate:',
      JSON.stringify({loginFeet:login.loginFeet,loginSource:login.loginSource,
        clientFeet:self&&[self.x,self.y,self.z].every(Number.isFinite)?
          {x:Math.round(self.x*100)/100,y:Math.round(self.y*100)/100,
            z:Math.round(self.z*100)/100}:null,
        serverCorrections:login.received,authority:login.authority}))
    acceptance?.event('info',['[Alice Bedrock] spawn confirmed'])
    runtime.start();runtime.noteHealth();publishStatus(true);publishView(true)
    console.log(tag,'spawn confirmed; waiting for life/inventory sync before acting')
  })
  bot.on('chat',(name,message)=>runtime.onChat(name,message).catch(err=>console.error(tag,'chat:',err.message)))
  bot.on('error',err=>console.error(tag,'error:',err.stack||err))
  bot.on('kicked',why=>{noteExit('server_kicked');console.error(tag,'kicked:',String(why||'').trim().slice(0,180)||'(empty message; see [Alice wire] server_disconnect)')})
  // The low-level close can occur without the Mineflayer end callback. Mark
  // the owned runtime stopped and preserve the final disconnect classification
  // in the private heartbeat, rather than reporting online indefinitely.
  bot._client.once('close',()=>{
    networkSessionEstablished=false
    if(!runtime.closed)runtime.stop('Bedrock transport closed')
    clearInterval(witnessTimer);clearInterval(statusTimer);clearInterval(viewTimer);clearInterval(commandTimer)
    publishStatus(false);publishView(false)
  })
  bot.on('end',why=>{networkSessionEstablished=false
    if(sessionExit.kind==='none')noteExit('transport_ended')
    acceptance?.event('warn',['[Alice Bedrock] disconnected'])
    runtime.stop('network ended');clearInterval(witnessTimer);clearInterval(statusTimer);clearInterval(viewTimer);clearInterval(commandTimer);
    publishStatus(false);publishView(false);console.log(tag,'connection ended:',String(why||''))})
  installSignalShutdown({client:bot._client,stop:()=>{
    noteExit('operator_shutdown')
    respawnRecovery.stop()
    runtime.stop('operator interrupted');clearInterval(witnessTimer);clearInterval(statusTimer);clearInterval(viewTimer);clearInterval(commandTimer)
    publishStatus(false);publishView(false)
  }})
}
if(require.main===module)main().catch(e=>{console.error('[Alice Bedrock autonomy]',e.stack||e);process.exitCode=1})
module.exports={loadPolicies,main}
