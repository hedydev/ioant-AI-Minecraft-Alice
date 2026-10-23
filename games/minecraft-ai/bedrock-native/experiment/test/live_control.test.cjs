'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {LiveSettings,LiveStatus,DEFAULTS,validate}=require('../src/live_control.cjs')
function withDir(f){const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-live-settings-'));try{f(root)}finally{fs.rmSync(root,{recursive:true,force:true})}}
test('strict runtime fields and bounds; safety cannot be disabled',()=>{
  assert.deepEqual(validate({...DEFAULTS}),DEFAULTS)
  assert.equal(validate({followDistance:3,occludedDistance:4,autonomyEnabled:true}).agentMode,'companion')
  assert.equal(validate({...DEFAULTS,agentMode:'autonomous'}).agentMode,'autonomous')
  assert.throws(()=>validate({...DEFAULTS,agentMode:'unsafe'}),/agentMode/)
  assert.throws(()=>validate({...DEFAULTS,followDistance:0}),/followDistance/)
  assert.throws(()=>validate({...DEFAULTS,occludedDistance:20}),/occludedDistance/)
  assert.throws(()=>validate({...DEFAULTS,autonomyEnabled:'false'}),/autonomyEnabled/)
  assert.throws(()=>validate({...DEFAULTS,safetyEnabled:false}),/settings keys/)
})
test('Alice picks up revisioned settings at runtime without restart',()=>withDir(root=>{
  const warnings=[]
  const reader=new LiveSettings({root,log:{warn:(...x)=>warnings.push(x.join(' '))}})
  assert.deepEqual(reader.read(),{revision:0,settings:{...DEFAULTS}})
  fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({revision:1,
    settings:{followDistance:2,occludedDistance:5,autonomyEnabled:false}}))
  assert.deepEqual(reader.read().settings,{followDistance:2,occludedDistance:5,autonomyEnabled:false,agentMode:'companion'})
  fs.writeFileSync(path.join(root,'settings.json'),'invalid-json')
  assert.equal(reader.read().revision,1)
  assert.equal(warnings.length,1)
  assert.equal(reader.read().revision,1)
  assert.equal(warnings.length,1)
  fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({revision:2,
    settings:{...DEFAULTS}}))
  assert.equal(reader.read().revision,2)
}))
test('status heartbeat records applied revision and is stored privately',()=>withDir(root=>{
  const pub=new LiveStatus({root})
  pub.publish({connected:true,revision:7,state:'FOLLOW',followTarget:'Steve',settings:{...DEFAULTS}})
  const file=path.join(root,'status.json')
  const status=JSON.parse(fs.readFileSync(file,'utf8'))
  assert.equal(status.revision,7)
  assert.equal(status.connected,true)
  assert(Number.isFinite(status.updatedAt))
  assert.equal(fs.statSync(file).mode&0o777,0o600)
}))
test('runtime rejects symlinked config without following it',()=>withDir(root=>{
  const external=path.join(root,'external')
  fs.writeFileSync(external,JSON.stringify({revision:99,settings:{...DEFAULTS}}))
  fs.symlinkSync(external,path.join(root,'settings.json'))
  const reader=new LiveSettings({root,log:{warn:()=>{}}})
  assert.equal(reader.read().revision,0)
}))

test('oversized follow and escape survey still publish fresh 4 KiB-safe status',()=>withDir(root=>{
  const warnings=[]
  const pub=new LiveStatus({root,log:{warn:(...args)=>warnings.push(args)}})
  const footprint=Array.from({length:5},(_,i)=>({
    direction:['self','north','east','south','west'][i],
    below:{state:'loaded',name:'oak_planks',solid:true,type:25},
    feet:{state:'loaded',name:'air',solid:false,type:0},
    head:{state:'loaded',name:'air',solid:false,type:0},
    supported:true,uncertain:false
  }))
  const state={connected:true,revision:5,settings:{...DEFAULTS,agentMode:'autonomous'},
    state:'FOLLOW',followTarget:'Steve',position:{x:-1260.84,y:98,z:653.62},
    health:20,food:20,agent:{modelStatus:'ready',mode:'autonomous',
      planningRequests:1,acceptedProposals:1,goalSource:'model'},
    followDiagnostic:{pathStatus:'noPath',deltaY:1,footprint,blockReason:'known blocks'},
    worldRoutine:{phase:'night',weather:'clear',tick:13000,
      scouting:{details:'a'.repeat(1600)},
      decision:{goal:'OBSERVE_ROOM',action:'WAIT',reason:'indoor_door_needs_verification'},
      cooldowns:{wood:{reason:'no_verified_natural_tree',remainingMs:100000}},
      escapeSurvey:{status:'door_interaction_candidate',reason:'try_non_destructive',
        reachableCells:36,unknownCells:0,blockedCells:114,center:[-1259,99,652],
        door:{position:[-1261,98,655],kind:'wooden_door',permitted:false,openState:'open',
          approach:{position:[-1261,98,654],steps:4,elevationChanges:1,
            routeComplete:true,serverVerified:false,
            waypoints:[[-1260,98,652],[-1261,98,652],[-1261,98,653],[-1261,98,654]]}},
        obstacle:{position:[-1258,99,652],block:'cobblestone',reason:'x'.repeat(1200)}}}
  }
  pub.publish(state)
  const file=path.join(root,'status.json')
  const data=JSON.parse(fs.readFileSync(file,'utf8'))
  assert.equal(data.connected,true)
  assert.equal(data.revision,5)
  assert.equal(data.followTarget,'Steve')
  assert.deepEqual(data.position,state.position)
  assert.equal(data.agent.goalSource,'model')
  assert.equal(data.followDiagnostic.pathStatus,'noPath')
  assert.equal(data.worldRoutine.escapeSurvey.door.approach.elevationChanges,1)
  assert.equal(data.statusCompacted,true)
  assert(Buffer.byteLength(fs.readFileSync(file))<=4096)
  assert.equal(warnings.length,0)
  assert.equal(fs.statSync(file).mode&0o777,0o600)
}))

test('oversize terrain still exposes voxel blockers without exceeding status limit',()=>withDir(root=>{
  const pub=new LiveStatus({root})
  pub.publish({connected:true,worldRoutine:{scouting:{data:'x'.repeat(5500)},
    voxelNavigation:{status:'blocked',reason:'no_verified_route',center:[1,65,1],
      candidate:{steps:3,actions:['WALK','JUMP_UP']}},
    escapeSurvey:{door:{position:[1,65,0]},reason:'unverified'}}})
  const saved=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
  assert.equal(saved.statusCompacted,true)
  assert.equal(saved.worldRoutine.voxelNavigation.reason,'no_verified_route')
  assert(Buffer.byteLength(JSON.stringify(saved))<=4096)
}))

test('4KiB status compaction retains the autonomous vertical safety hold',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:true,worldRoutine:{
   scouting:{data:'x'.repeat(6000)},
   verticalSafety:{active:true,remainingSeconds:71,
     lastIncident:{reason:'rapid_unverified_vertical_displacement',
       dropBlocks:24.94,toY:73,positionTrust:'local_prediction_not_server_proof'}},
   voxelNavigation:{status:'route_candidate',
     candidate:{steps:3,actions:['WALK']}},
   escapeSurvey:{reason:'door_pending'}}})
 const saved=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(saved.statusCompacted,true)
 assert.equal(saved.worldRoutine.verticalSafety.active,true)
 assert.equal(saved.worldRoutine.verticalSafety.remainingSeconds,71)
 assert(saved.worldRoutine.verticalSafety.lastIncident.dropBlocks>24)
 assert(Buffer.byteLength(JSON.stringify(saved))<=4096)
}))

test('live 4KiB status compaction retains tracked death, unverified respawn and online targets',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:true,revision:1,life:{
   deathsSinceTracking:3,trackingSince:1792520000000,deathCountIsLifetime:false,
   respawnPoint:null,respawnStatus:'not_verified'},
   onlinePlayers:['Steve','MolarParsley191'],
   worldRoutine:{scouting:{huge:'x'.repeat(6000)},
     phase:'day',tick:6000,weather:'clear',
     voxelNavigation:{status:'route_candidate',candidate:{steps:6,actions:['WALK']}}}})
 const result=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(result.life.deathsSinceTracking,3)
 assert.equal(result.life.respawnStatus,'not_verified')
 assert.deepEqual(result.onlinePlayers,['Steve','MolarParsley191'])
 assert.equal(result.worldRoutine.phase,'day')
 assert(Buffer.byteLength(JSON.stringify(result))<=4096)
}))

test('bounded exploration and resource progress are visible in ordinary live status',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:true,worldRoutine:{phase:'day',tick:6000,weather:'clear',
  explorationProgress:{entries:3,attempted:0,unverified:2,confirmed:1},
  resourceOpportunity:{action:'none',reason:'no_verified_natural_tree',inventoryWood:0}}})
 const value=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(value.worldRoutine.explorationProgress.unverified,2)
 assert.equal(value.worldRoutine.resourceOpportunity.inventoryWood,0)
 assert(Buffer.byteLength(JSON.stringify(value))<=4096)
}))


test('compacted status preserves safe idle explanation next review',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:true,worldRoutine:{
   phase:'day',decision:{goal:'DISCOVER_RESOURCES',action:'WAIT'},
   idleHold:{goal:'DISCOVER_RESOURCES',reason:'flat_routes_not_executable',
     nextReviewAt:180000},
   scouting:{huge:'x'.repeat(6000)},
   voxelNavigation:{status:'blocked',reason:'no_verified_route'}}})
 const data=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(data.statusCompacted,true)
 assert.equal(data.worldRoutine.idleHold.reason,'flat_routes_not_executable')
 assert.equal(data.worldRoutine.idleHold.nextReviewAt,180000)
 assert(Buffer.byteLength(JSON.stringify(data))<=4096)
}))


test('terrain adaptation observations survive the compacted private status heartbeat',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:true,worldRoutine:{
   terrainAdaptation:{vertical:{action:'JUMP_UP',target:{x:1,y:66,z:0}},
     earthwork:{reason:'near_observed_player_construction'},
     positionProof:'no_fresh_authoritative_self_position'},
   scouting:{data:'a'.repeat(6000)},decision:{goal:'DISCOVER_RESOURCES',action:'WAIT'}
 }})
 const data=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(data.statusCompacted,true)
 assert.equal(data.worldRoutine.terrainAdaptation.vertical.action,'JUMP_UP')
 assert(Buffer.byteLength(JSON.stringify(data))<=4096)
}))


test('night bed diagnostics survive a compacted 4 KiB control status',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:true,worldRoutine:{
   sleepOpportunity:{status:'nearby_hostile_bed_unavailable',phase:'night',
     found:2,eligible:0,hostile:2},
   escapeSurvey:{reason:'room',door:{approach:{waypoints:Array.from({length:200},()=>[0,0,0])}}},
   decision:{action:'WAIT',goal:'PREPARE_DAYLIGHT'}
 }})
 const data=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(data.worldRoutine.sleepOpportunity.status,'nearby_hostile_bed_unavailable')
 assert(Buffer.byteLength(JSON.stringify(data))<=4096)
}))

test('read-only continuous goal survives status snapshots and compact revisions',()=>withDir(root=>{
 const p=new LiveStatus({root})
 p.publish({connected:true,revision:1,settings:{...DEFAULTS},
   state:'IDLE',longTermGoal:{goal:'LEARN_WEAPON',step:'DISCOVER_RESOURCES',
     phase:'BLOCKED',reason:'server_position_unconfirmed',revision:3,
     verifiedWood:0,attempts:2,activeTask:null,nextReviewAt:125000}})
 const status=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(status.state,'IDLE')
 assert.equal(status.longTermGoal.goal,'LEARN_WEAPON')
 assert.equal(status.longTermGoal.phase,'BLOCKED')
 assert.equal(status.longTermGoal.nextReviewAt,125000)
 assert(fs.statSync(path.join(root,'status.json')).size<=4096)
}))

test('night shelter summary survives compact private heartbeat',()=>withDir(root=>{
 const writer=new LiveStatus({root})
 writer.publish({connected:true,revision:1,settings:{...DEFAULTS},
   state:'IDLE',longTermGoal:{goal:'SECURE_SHELTER',step:'BUILD_SHELTER',
     phase:'WAITING',reason:'shelter_position_unconfirmed'},
   worldRoutine:{phase:'night',shelterOpportunity:{
     status:'placement_candidate',reason:'shelter_one_verified_block_candidate',
     remaining:24,material:'dirt',canBuildWithCurrentProof:false,
     positionProof:'no_fresh_authoritative_self_position'}}})
 const result=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(result.longTermGoal.goal,'SECURE_SHELTER')
 assert.equal(result.worldRoutine.shelterOpportunity.remaining,24)
 assert.equal(result.worldRoutine.shelterOpportunity.canBuildWithCurrentProof,false)
 assert(fs.statSync(path.join(root,'status.json')).size<=4096)
}))

test('optional movement packet queue audit appears only as diagnostics in private status',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:true,position:{x:1.5,y:66,z:2.5},
   outboundInput:{kind:'queue_only_not_network_or_BDS_proof',
     loginTickPresent:false,queued:120,movingQueued:40,corrections:0}})
 const file=path.join(root,'status.json'),s=JSON.parse(fs.readFileSync(file,'utf8'))
 assert.equal(s.outboundInput.queued,120)
 assert.equal(s.outboundInput.kind,'queue_only_not_network_or_BDS_proof')
 assert.equal(s.connected,true)
 assert.equal(fs.statSync(file).mode&0o777,0o600)
}))

test('optional audit never blocks mandatory server witness status when oversized',()=>withDir(root=>{
 const warnings=[]
 const pub=new LiveStatus({root,log:{warn:(...x)=>warnings.push(x.join(' '))}})
 pub.publish({connected:true,position:{x:0.5,y:69,z:0.5},
   movementEvidence:{independentSamples:22,latestFeet:{x:0.5,y:69,z:0.5},
     witnessStatus:'accepted'},
   outboundInput:{kind:'queue_only_not_network_or_BDS_proof',
     diagnosticPadding:'x'.repeat(10000)},
   worldRoutine:{phase:'day',decision:{goal:'OBSERVE',action:'WAIT'}}})
 const file=path.join(root,'status.json'),s=JSON.parse(fs.readFileSync(file,'utf8'))
 assert.equal(s.connected,true)
 assert.equal(s.movementEvidence.independentSamples,22)
 assert.equal(s.movementEvidence.witnessStatus,'accepted')
 assert.equal(s.outboundInput,undefined)
 assert.equal(warnings.length,0)
 assert(Buffer.byteLength(fs.readFileSync(file))<=4096)
}))

test('dead Alice heartbeat distinguishes spawned readiness from established transport and one respawn retry',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:false,sessionEstablished:true,health:0,state:'SURVIVE',
   deathRecovery:{phase:'respawn_action_retried_once',deadSeconds:12,
      serverReadyObserved:false,retrySent:true,cycles:11},
   worldRoutine:{phase:'night',scouting:{large:'x'.repeat(4500)}},
   outboundInput:{padding:'y'.repeat(4000)}})
 const result=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(result.connected,false)
 assert.equal(result.sessionEstablished,true)
 assert.equal(result.health,0)
 assert.equal(result.deathRecovery.phase,'respawn_action_retried_once')
 assert.equal(result.deathRecovery.retrySent,true)
 assert(fs.statSync(path.join(root,'status.json')).size<=4096)
}))


test('last disconnect cause and remembered bed count survive 4KiB status compaction',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({connected:false,sessionEstablished:false,
   sessionExit:{kind:'server_disconnect',phase:'spawn_confirmed',
     serverDisconnectSeen:true,at:123456},
   deathRecovery:{phase:'transport_closed_during_respawn'},
   worldRoutine:{rememberedBeds:{knownBeds:2},phase:'night',
     escapeSurvey:{unbounded:'x'.repeat(4800)}},
   outboundInput:{padding:'y'.repeat(4000)}})
 const data=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(data.sessionExit.kind,'server_disconnect')
 assert.equal(data.sessionExit.serverDisconnectSeen,true)
 assert.equal(data.worldRoutine.rememberedBeds.knownBeds,2)
 assert(fs.statSync(path.join(root,'status.json')).size<=4096)
}))

test('status compaction retains producer PID and process start identity',()=>withDir(root=>{
 const pub=new LiveStatus({root})
 pub.publish({producerPid:3125378,producerStartToken:'773624025',
   connected:false,sessionEstablished:false,health:null,
   worldRoutine:{escapeSurvey:{blob:'x'.repeat(4900)}},
   outboundInput:{blob:'y'.repeat(5000)}})
 const data=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
 assert.equal(data.producerPid,3125378)
 assert.equal(data.producerStartToken,'773624025')
 assert.equal(data.connected,false)
 assert.equal(data.sessionEstablished,false)
 assert(fs.statSync(path.join(root,'status.json')).size<=4096)
}))

test('death memory and job timers cannot displace producer PID and health',()=>withDir(root=>{
  const pub=new LiveStatus({root})
  pub.publish({connected:true,producerPid:1234,producerStartToken:'99999',
    revision:9,health:17,food:12,
    deathLearning:{observedDeaths:2,lastDeathAt:123456,
      lastConclusion:'hostile_nearby_unconfirmed',nearbyMob:'spider',
      repeatedThreats:[{kind:'spider',observations:2}]},
    currentJobTiming:{startedAt:1234,elapsedMs:1000},
    worldRoutine:{scouting:{data:'x'.repeat(5500)},
      phase:'night',weather:'clear',voxelNavigation:{reason:'no_safe_route'}}})
  const saved=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'))
  assert.equal(saved.producerPid,1234)
  assert.equal(saved.producerStartToken,'99999')
  assert.equal(saved.health,17)
  assert.equal(saved.connected,true)
  assert(Buffer.byteLength(JSON.stringify(saved))<=4096)
}))
