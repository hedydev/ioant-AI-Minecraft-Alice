'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {AcceptanceJournal,event,sample}=require('../src/acceptance_log.cjs')
const withDir=fn=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-acceptance-'))
  try{fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('writes model event and ten-second snapshot without raw chat or secrets',()=>withDir(root=>{
  const log=new AcceptanceJournal({root,clock:()=>123456})
  log.event('info',['[Alice agent] Ollama proposed tool:',JSON.stringify({
    tool:'observe',trigger:'environment_changed',access_token:'SECRET',prompt:'PRIVATE'})])
  log.event('info',['[Alice connection audit] login evidence:',JSON.stringify({token:'PASSWORD'})])
  log.sample({connected:true,state:'IDLE',position:{x:-1260.84,y:98,z:653.62},
    movementEvidence:{received:0},agent:{mode:'autonomous',planningRequests:2},
    worldRoutine:{voxelNavigation:{status:'blocked',reason:'no_verified_route'}}})
  const f=path.join(root,'events.jsonl'),text=fs.readFileSync(f,'utf8')
  assert.equal(text.trim().split('\n').length,2)
  assert(!/SECRET|PASSWORD|PRIVATE|access_token/.test(text))
  const rows=text.trim().split('\n').map(JSON.parse)
  assert.equal(rows[0].detail.tool,'observe')
  assert.equal(rows[1].voxel.reason,'no_verified_route')
  assert.equal(rows[1].positionTrust,'local_prediction_not_server_proof')
  assert.equal(fs.statSync(f).mode&0o777,0o600)
}))
test('rotates bounded evidence files and does not follow symlinks',()=>withDir(root=>{
  const writer=new AcceptanceJournal({root,maxBytes:4096,log:{warn:()=>{}}})
  for(let i=0;i<260;i++)writer.sample({state:'FOLLOW',position:{x:i,y:65,z:1}})
  const all=fs.readdirSync(root).filter(f=>f.endsWith('.jsonl'))
  assert(all.length<=5)
  for(const f of all)assert(fs.statSync(path.join(root,f)).size<=4096)
  const external=path.join(root,'external')
  fs.writeFileSync(external,'unchanged')
  const linked=path.join(root,'linked');fs.mkdirSync(linked)
  fs.symlinkSync(external,path.join(linked,'events.jsonl'))
  const errors=[]
  new AcceptanceJournal({root:linked,log:{warn:(...x)=>errors.push(x)}}).sample({state:'IDLE'})
  assert.equal(fs.readFileSync(external,'utf8'),'unchanged')
  assert.equal(errors.length,1)
}))
test('event whitelist excludes direct chats and connection audits',()=>{
  assert.equal(event('info',['[Alice chat] hello','private']),null)
  assert.equal(event('info',['[Alice connection audit] evidence:', '{}']),null)
  const e=event('warn',['[Alice follow] path planner:',JSON.stringify({
    status:'noPath',pathLength:0,username:'not-saved'})])
  assert.equal(e.detail.status,'noPath')
  assert(!JSON.stringify(e).includes('not-saved'))
  assert.equal(sample({state:'IDLE'}).connected,false)
})

test('bounded noPath evidence preserves ground/height and block identities, not chat',()=>withDir(root=>{
 const j=new AcceptanceJournal({root,clock:()=>5000})
 j.event('info',['[Alice follow] noPath terrain evidence:',JSON.stringify({
   pathStatus:'noPath',deltaY:1,centerSupported:true,fooToken:'NEVER',
   footprint:[{direction:'north',supported:false,
     below:{name:'stone_stairs',state:'loaded',solid:true},
     feet:{name:'oak_door',state:'loaded',solid:true}}]})])
 const row=JSON.parse(fs.readFileSync(path.join(root,'events.jsonl'),'utf8'))
 assert.equal(row.detail.deltaY,1)
 assert.equal(row.detail.footprint[0].below.name,'stone_stairs')
 assert(!JSON.stringify(row).includes('NEVER'))
}))

test('known retreat no-path code is retained without arbitrary raw console text',()=>{
 const e=event('warn',['[Alice safety] retreat:','No path to the goal!'])
 assert.equal(e.detail.reason,'pathfinder_no_path')
 const x=event('warn',['[Alice safety] retreat:','PRIVATE token xyz'])
 assert.deepEqual(x.detail,{})
})

test('acceptance journal keeps route-denial cause rather than only generic noPath',()=>withDir(root=>{
 const j=new AcceptanceJournal({root,clock:()=>1000})
 j.event('info',['[Alice exploration] flat route selection:',JSON.stringify({
   reason:'all_eligible_flat_routes_near_hostiles',checkedRoutes:16,
   threatRoutes:16,knownHostiles:1,privateChat:'NEVER'})])
 const saved=JSON.parse(fs.readFileSync(path.join(root,'events.jsonl'),'utf8'))
 assert.equal(saved.detail.reason,'all_eligible_flat_routes_near_hostiles')
 assert.equal(saved.detail.threatRoutes,16)
 assert(!JSON.stringify(saved).includes('NEVER'))
}))

test('door-passage evidence records only approved state, failed waypoint and safety result',()=>withDir(root=>{
 const j=new AcceptanceJournal({root,clock:()=>1000})
 j.event('info',['[Alice exploration] scout door passage:',JSON.stringify({
   reason:'crossing_open_door_state_unverified',attempted:false,
   failedWaypoint:{x:-1261,y:98,z:655},doorOpenObserved:false,
   token:'NEVER_COPY'})])
 const data=JSON.parse(fs.readFileSync(path.join(root,'events.jsonl'),'utf8'))
 assert.equal(data.detail.doorOpenObserved,false)
 assert.equal(data.detail.failedWaypoint.z,655)
 assert(!JSON.stringify(data).includes('NEVER_COPY'))
}))

test('vertical anomaly event and status use filtered fields and never claim BDS proof',()=>withDir(root=>{
 const j=new AcceptanceJournal({root,clock:()=>1000})
 j.event('info',['[Alice safety] vertical displacement observation:',JSON.stringify({
   reason:'rapid_unverified_vertical_displacement',dropBlocks:25,
   fromY:98,toY:73,elapsedMs:6500,onGround:false,nearbyClimbable:true,
   serverPositionPackets:0,positionTrust:'local_prediction_not_server_proof',
   secret:'NEVER_CAPTURE'})])
 j.sample({state:'IDLE',worldRoutine:{verticalSafety:{active:true,remainingSeconds:90,
   lastIncident:{reason:'rapid_unverified_vertical_displacement',dropBlocks:25,
     fromY:98,toY:73,positionTrust:'local_prediction_not_server_proof'}}}})
 const lines=fs.readFileSync(path.join(root,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
 assert.equal(lines[0].detail.dropBlocks,25)
 assert.equal(lines[0].detail.nearbyClimbable,true)
 assert(!JSON.stringify(lines).includes('NEVER_CAPTURE'))
 assert.equal(lines[1].verticalSafety.active,true)
 assert.equal(lines[1].verticalSafety.lastIncident.toY,73)
 assert.equal(lines[1].verticalSafety.lastIncident.positionTrust,'local_prediction_not_server_proof')
}))

test('tracked death/respawn provenance and typed command results are kept without player chat',()=>withDir(root=>{
 const logger=new AcceptanceJournal({root,clock:()=>3000})
 logger.event('info',['[Alice life] death observed:',JSON.stringify({deathsSinceTracking:2,token:'SECRET'})])
 logger.event('info',['[Alice control] typed command result:',JSON.stringify({action:'follow',status:'started',reason:'follow_intent_set',target:'Steve',chat:'PRIVATE'})])
 logger.sample({connected:true,life:{deathsSinceTracking:2,trackingSince:1000,
   deathCountIsLifetime:false,respawnPoint:null,respawnStatus:'not_verified'}})
 const records=fs.readFileSync(path.join(root,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
 assert.equal(records[0].detail.deathsSinceTracking,2)
 assert.equal(records[1].detail.status,'started')
 assert.equal(records[2].life.respawnStatus,'not_verified')
 assert(!JSON.stringify(records).includes('SECRET'))
 assert(!JSON.stringify(records).includes('PRIVATE'))
}))

test('progress attempts and inventory milestone stay distinct from server-verified completion',()=>withDir(root=>{
 const j=new AcceptanceJournal({root,clock:()=>6000})
 j.event('info',['[Alice exploration] endpoint feedback:',JSON.stringify({
  key:'-1261,98,656',outcome:'unverified',serverMovementVerified:false,
  chat:'SECRET_PLAYER_CHAT'})])
 j.event('info',['[Alice mission] inventory milestone:',JSON.stringify({
  phase:'wood_pickup',verified:true,verifiedDelta:1,
  proof:'server_inventory_delta_observed',privateToken:'SECRET'})])
 j.sample({connected:true,worldRoutine:{
  explorationProgress:{entries:2,unverified:2,confirmed:0,
    trust:'attempted_is_not_server_verified'},
  resourceOpportunity:{action:'gather_one_log',treeVerified:true,inventoryWood:0}}})
 const rows=fs.readFileSync(path.join(root,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
 assert.equal(rows[0].detail.outcome,'unverified')
 assert.equal(rows[0].detail.serverMovementVerified,false)
 assert.equal(rows[1].detail.verifiedDelta,1)
 assert.equal(rows[2].explorationProgress.confirmed,0)
 assert.equal(rows[2].resourceOpportunity.treeVerified,true)
 assert(!JSON.stringify(rows).includes('SECRET'))
}))


test('idle diagnostic is allowlisted and hides extra sensitive fields',()=>withDir(root=>{
 const j=new AcceptanceJournal({root,clock:()=>123456})
 j.sample({state:'IDLE',worldRoutine:{idleHold:{
   goal:'DISCOVER_RESOURCES',reason:'flat_routes_not_executable',
   nextReviewAt:153456,privateToken:'SECRET'}}})
 const row=JSON.parse(fs.readFileSync(path.join(root,'events.jsonl'),'utf8'))
 assert.equal(row.idleHold.reason,'flat_routes_not_executable')
 assert.equal(row.idleHold.nextReviewAt,153456)
 assert(!JSON.stringify(row).includes('SECRET'))
}))


test('terrain choices appear in snapshots without material or other private fields',()=>{
 const s=sample({worldRoutine:{terrainAdaptation:{
   vertical:{action:'JUMP_UP',target:{x:1,y:66,z:0}},
   earthwork:{action:'PLACE_BRIDGE',target:{x:2,y:64,z:0}},
   positionProof:'no_fresh_authoritative_self_position',
   secret:'NOT_FOR_LOG'}}})
 assert.equal(s.terrainAdaptation.vertical.action,'JUMP_UP')
 assert.equal(s.terrainAdaptation.earthwork.action,'PLACE_BRIDGE')
 assert.equal(s.terrainAdaptation.positionProof,'no_fresh_authoritative_self_position')
 assert(!JSON.stringify(s).includes('NOT_FOR_LOG'))
})


test('captures start_game login coordinate without exposing identity or inferring travel',()=>{
  const record=event('info',['[Alice movement] Bedrock login coordinate:',
    JSON.stringify({loginFeet:{x:-1260.84,y:98,z:653.62},
      loginSource:'start_game_player_position',serverCorrections:0,
      xuid:'PRIVATE_ID',access_token:'SECRET'})])
  assert.deepEqual(record.detail.loginFeet,{x:-1260.84,y:98,z:653.62})
  assert.equal(record.detail.serverCorrections,0)
  assert(!JSON.stringify(record).includes('PRIVATE_ID'))
  assert(!JSON.stringify(record).includes('SECRET'))
  const row=sample({position:{x:-1255.5,y:98,z:650.55},
    movementEvidence:{received:0,loginFeet:{x:-1260.84,y:98,z:653.62},
      loginSource:'start_game_player_position'}})
  assert.deepEqual(row.loginFeet,{x:-1260.84,y:98,z:653.62})
  assert.equal(row.clientFeet.x,-1255.5)
  assert.equal(row.serverPackets,0)
  assert.equal(row.positionTrust,'local_prediction_not_server_proof')
})

test('threat type/tactic and evidence-gap cooldown are visible without player identity',()=>{
 const alert=event('info',['[Alice safety] threat context:',JSON.stringify({
   kind:'creeper',tactic:'COMBAT',health:20,distanceBlocks:7.8,
   xuid:'PRIVATE',playerName:'SECRET'})])
 assert.equal(alert.detail.kind,'creeper')
 assert.equal(alert.detail.tactic,'COMBAT')
 assert.equal(alert.detail.distanceBlocks,7.8)
 const unverified=event('info',['[Alice exploration] server position evidence missing:',
   JSON.stringify({reason:'scout_server_endpoint_unconfirmed',
     localEstimateBlocks:3.03,nextReviewMs:90000,
     endpointExcluded:true,worldPassword:'SECRET'})])
 assert.equal(unverified.detail.nextReviewMs,90000)
 assert.equal(unverified.detail.endpointExcluded,true)
 assert(!JSON.stringify([alert,unverified]).includes('SECRET'))
 assert(!JSON.stringify([alert,unverified]).includes('PRIVATE'))
})


test('bed diagnostic includes only bounded terrain/occupancy facts without secrets',()=>{
 const observation=event('info',['[Alice sleep] bed task outcome:',JSON.stringify({
   ok:false,reason:'bed_sleep_unconfirmed_no_state_ack',
   bedPosition:{x:-1258,y:99,z:651},bedDiagnosis:{
     phase:'night',sleepWindow:true,hostileNear:false,observedSleeping:false,
     selfSleepingFlag:false,bedOccupied:false,distance:1.4},
   xuid:'PRIVATE',serverSessionToken:'SECRET'
 })])
 assert.equal(observation.detail.reason,'bed_sleep_unconfirmed_no_state_ack')
 assert.equal(observation.detail.bedDiagnosis.phase,'night')
 assert.equal(observation.detail.bedDiagnosis.hostileNear,false)
 assert(!JSON.stringify(observation).includes('PRIVATE'))
 assert(!JSON.stringify(observation).includes('SECRET'))
 const sampleRow=sample({worldRoutine:{phase:'night',sleepOpportunity:{
   status:'all_candidate_beds_in_cooldown',phase:'night',
   found:1,eligible:0,excluded:1,hostile:0,occupied:0}}})
 assert.equal(sampleRow.sleepOpportunity.status,'all_candidate_beds_in_cooldown')
 assert.equal(sampleRow.sleepOpportunity.excluded,1)
})

test('FOLLOW stalled-outside-range event retains jump/control evidence but not identities',()=>{
 const r=event('info',['[Alice follow] movement observation:',JSON.stringify({
   localMovedBlocks:0,localDistanceToTarget:4.15,withinFollowRadius:false,
   pathStatus:'success',pathNodes:4,pathMoving:false,falseGoalSuccess:true,
   stalledWindows:2,targetDeltaY:1,horizontalDistance:4.03,selfOnGround:true,
   physicsSamples:130,jumpPressedTicks:0,jumpEdges:0,forwardPressedTicks:0,
   groundedTicks:130,inputTrust:'client_pathfinder_control_only',
   accessToken:'SENSITIVE',xuid:'PERSONAL'
 })])
 assert.equal(r.detail.falseGoalSuccess,true)
 assert.equal(r.detail.jumpEdges,0)
 assert.equal(r.detail.forwardPressedTicks,0)
 assert.equal(r.detail.targetDeltaY,1)
 assert(!JSON.stringify(r).includes('SENSITIVE'))
 assert(!JSON.stringify(r).includes('PERSONAL'))
})

test('autonomous GATHER exception category is retained, never arbitrary error text or identity',()=>{
 const record=event('warn',['[Alice job] exception:',JSON.stringify({
   taskType:'GATHER',source:'autonomous',reason:'pathfinder_no_path',
   stage:'task_rejected',verified:false,
   username:'PRIVATE_NAME',access_token:'SECRET'
 })])
 assert.equal(record.level,'warn')
 assert.deepEqual(record.detail,{
   taskType:'GATHER',source:'autonomous',
   reason:'pathfinder_no_path',stage:'task_rejected',verified:false
 })
 assert(!JSON.stringify(record).includes('PRIVATE_NAME'))
 assert(!JSON.stringify(record).includes('SECRET'))
})

test('long-term goal evidence remains after action Core IDLE, strips any injected identity',()=>{
 const status=sample({
   state:'IDLE',connected:true,agent:{mode:'autonomous'},
   longTermGoal:{goal:'LEARN_WEAPON',step:'DISCOVER_RESOURCES',
     phase:'BLOCKED',reason:'server_position_unconfirmed',revision:2,
     activeTask:null,verifiedWood:0,attempts:3,nextReviewAt:130000,
     username:'PRIVATE',token:'CREDENTIAL'}
 })
 assert.equal(status.state,'IDLE')
 assert.equal(status.continuousGoal.goal,'LEARN_WEAPON')
 assert.equal(status.continuousGoal.phase,'BLOCKED')
 assert.equal(status.continuousGoal.step,'DISCOVER_RESOURCES')
 assert.equal(status.continuousGoal.reason,'server_position_unconfirmed')
 assert.equal(status.continuousGoal.nextReviewAt,130000)
 assert(!JSON.stringify(status).includes('PRIVATE'))
 assert(!JSON.stringify(status).includes('CREDENTIAL'))
 const evt=event('info',['[Alice goal] transition:',JSON.stringify({
   event:'action_blocked',goal:'LEARN_WEAPON',step:'DISCOVER_RESOURCES',
   phase:'BLOCKED',reason:'server_position_unconfirmed',revision:2,
   username:'PRIVATE'
 })])
 assert.equal(evt.detail.event,'action_blocked')
 assert.equal(evt.detail.phase,'BLOCKED')
 assert(!JSON.stringify(evt).includes('PRIVATE'))
})

test('night shelter proposal and building diagnostic are anonymous and never claim safety',()=>{
 const a=sample({connected:true,state:'IDLE',longTermGoal:{
   goal:'SECURE_SHELTER',step:'BUILD_SHELTER',phase:'WAITING',
   reason:'shelter_position_unconfirmed'},
   worldRoutine:{phase:'night',shelterOpportunity:{
     status:'placement_candidate',reason:'shelter_one_verified_block_candidate',
     remaining:24,material:'dirt',positionProof:'no_fresh_authoritative_self_position',
     canBuildWithCurrentProof:false,username:'SECRET'}}})
 assert.equal(a.continuousGoal.goal,'SECURE_SHELTER')
 assert.equal(a.shelterOpportunity.remaining,24)
 assert.equal(a.shelterOpportunity.canBuildWithCurrentProof,false)
 assert(!JSON.stringify(a).includes('SECRET'))
 const ev=event('info',['[Alice shelter] no placement authorized:',JSON.stringify({
   reason:'shelter_position_unconfirmed',worldModification:false,
   serverPositionVerified:false,username:'SECRET'})])
 assert.equal(ev.detail.reason,'shelter_position_unconfirmed')
 assert.equal(ev.detail.worldModification,false)
 assert(!JSON.stringify(ev).includes('SECRET'))
})

test('respawn diagnostics keep fixed state only and discard injected private fields',()=>withDir(root=>{
 const journal=new AcceptanceJournal({root})
 journal.event('info',['[Alice life] respawn recovery:',
   JSON.stringify({phase:'respawn_stalled',reason:'no_server_ready_or_spawn',
      retrySent:true,serverReadyObserved:false,
      runtime_entity_id:'SECRET_RUNTIME_ID',
      auth:'SECRET_AUTH'})])
 const rows=JSON.parse(fs.readFileSync(path.join(root,'events.jsonl'),'utf8').trim().split('\n')[0])
 assert.equal(rows.kind,'[Alice life] respawn recovery:')
 assert.equal(rows.detail.reason,'no_server_ready_or_spawn')
 assert.equal(rows.detail.retrySent,true)
 assert.equal(rows.detail.runtime_entity_id,undefined)
 assert.equal(rows.detail.auth,undefined)
}))


test('combat tactic journal keeps bounded decision facts, never actor secrets',()=>{
 const detail=event('info',['[Alice safety] combat decision:',JSON.stringify({
   kind:'creeper',tactic:'RETREAT_AFTER_HIT',health:18,distanceBlocks:7.3,
   recentSelfDamage:true,serverMovementVerified:false,
   playerId:'SECRET_PLAYER',token:'SECRET_TOKEN'
 })])
 assert.equal(detail?.kind,'[Alice safety] combat decision:')
 assert.equal(detail?.detail?.recentSelfDamage,true)
 assert.equal(detail?.detail?.tactic,'RETREAT_AFTER_HIT')
 assert.equal(detail?.detail?.token,undefined)
 assert.equal(detail?.detail?.playerId,undefined)
})


test('night WAIT retains precise safety blocker without leaking unrelated fields',()=>{
 const row=event('info',['[Alice autonomy] world-aware decision:',JSON.stringify({
   goal:'PREPARE_DAYLIGHT',action:'WAIT',reason:'defer_nonurgent_raw_materials_at_night',
   nightSafetyReason:'night_hostile_within_12',phase:'night',
   token:'SENSITIVE_SECRET',playerName:'PRIVATE_NAME'
 })])
 assert.equal(row.kind,'[Alice autonomy] world-aware decision:')
 assert.equal(row.detail.reason,'defer_nonurgent_raw_materials_at_night')
 assert.equal(row.detail.nightSafetyReason,'night_hostile_within_12')
 assert.equal(row.detail.token,undefined)
 assert.equal(row.detail.playerName,undefined)
})


test('session close classification keeps reason type but no raw server message',()=>{
 const row=event('warn',['[Alice session] lifecycle:',JSON.stringify({
  kind:'transport_closed',phase:'spawn_confirmed',serverDisconnectSeen:false,
  at:12345678,token:'SECRET',fullKickReason:'PII'
 })])
 assert.equal(row.kind,'[Alice session] lifecycle:')
 assert.equal(row.detail.kind,'transport_closed')
 assert.equal(row.detail.serverDisconnectSeen,false)
 assert.equal(row.detail.token,undefined)
 assert.equal(row.detail.fullKickReason,undefined)
})
