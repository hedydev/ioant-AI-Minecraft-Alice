'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {sceneFromSurvey,selectDrive,SelfDriveJournal}=require('../src/self_drive.cjs')
const oldDoor={position:[-1261,98,655],kind:'wooden_door',
 approach:{steps:10,waypoints:Array.from({length:10},(_,i)=>[-1256-i,98,651])}}
const openScene={center:[-1256,98,651],reachableCells:91,
 openFrontier:{target:[-1257,98,645],steps:7},door:oldDoor,
 passageAction:{door:[-1261,98,655],attempted:true,serverMovementVerified:false}}
const room={center:[-1261,98,653],reachableCells:18,
 openFrontier:null,door:{...oldDoor,approach:{steps:1,waypoints:[[-1261,98,654]]}}}
const scout={action:'SCOUT',goal:'FIND_NEW_RESOURCE_AREA',
 reason:'wood_site_rejected_find_new_area',candidate:{ok:true}}
const wait={action:'WAIT',goal:'FIND_NEW_RESOURCE_AREA',
 reason:'daylight_or_weather_prevents_safe_scout'}
test('outside-like wide reachable local area is evidence, NOT proof of outdoor/BDS position',()=>{
 const s=sceneFromSurvey(openScene)
 assert.equal(s.kind,'open_local_area')
 assert.equal(s.reason,'wide_loaded_reachable_area')
 assert.equal(s.reachableCells,91)
})
test('old house door behind her does not steal nighttime self-driven goal',()=>{
 const a=selectDrive({decision:wait,world:{phase:'night'},
   survey:openScene,woodFailure:true,doorExecutable:true})
 assert.equal(a.driveGoal,'PREPARE_DAYLIGHT')
 assert.equal(a.decision.goal,'PREPARE_DAYLIGHT')
 assert.equal(a.decision.action,'WAIT')
 assert.equal(a.decision.reason,'open_area_night_watch')
 assert.equal(a.physicalActionAuthorized,false)
})
test('new daylight with safe scout advances toward fresh resource territory, not back into house',()=>{
 const a=selectDrive({decision:scout,world:{phase:'day'},
   survey:openScene,woodFailure:true})
 assert.equal(a.driveGoal,'DISCOVER_RESOURCES')
 assert.equal(a.decision.action,'SCOUT')
 assert.equal(a.decision.candidate,scout.candidate)
 assert.equal(a.decision.reason,'explore_new_observed_area')
})
test('genuinely enclosed room with verified approachable wooden door still prioritizes exit',()=>{
 const a=selectDrive({decision:scout,world:{phase:'day'},
   survey:room,woodFailure:true,doorExecutable:true})
 assert.equal(a.driveGoal,'FIND_ROOM_EXIT')
 assert.equal(a.decision.action,'WAIT')
 assert.equal(a.decision.reason,'observed_indoor_wooden_door_first')
})
test('previously untried close actionable door can still outrank daytime scout on open grass',()=>{
 const surveyed={...openScene,door:{...oldDoor,approach:{steps:1,
   waypoints:[[-1261,98,654]]}},passageAction:null}
 const a=selectDrive({decision:scout,world:{phase:'day'},
   survey:surveyed,woodFailure:true,doorExecutable:true})
 assert.equal(a.driveGoal,'FIND_ROOM_EXIT')
})
test('unreachable room door never blocks legitimate safe scout',()=>{
 const a=selectDrive({decision:scout,world:{phase:'day'},
   survey:room,woodFailure:true,doorExecutable:false})
 assert.equal(a.decision.action,'SCOUT')
 assert.equal(a.driveGoal,'DISCOVER_RESOURCES')
})
test('unknown room door with nighttime wait remains observation, not blind movement',()=>{
 const a=selectDrive({decision:wait,world:{phase:'night'},
   survey:room,woodFailure:true,doorExecutable:false})
 assert.equal(a.driveGoal,'OBSERVE_ROOM')
 assert.equal(a.decision.action,'WAIT')
 assert.equal(a.physicalActionAuthorized,false)
})
test('movement-unverified wait remains authoritative regardless of open frontier',()=>{
 const noEvidence={action:'WAIT',goal:'FIND_NEW_RESOURCE_AREA',
   reason:'server_movement_unverified_cooldown'}
 const a=selectDrive({decision:noEvidence,world:{phase:'day'},
   survey:openScene,woodFailure:true,movementFailure:true,doorExecutable:true})
 assert.deepEqual(a.decision,noEvidence)
 assert.equal(a.driveGoal,'VERIFY_MOVEMENT')
 assert.equal(a.physicalActionAuthorized,false)
})
test('goal journal transitions only on meaningful evidence changes',()=>{
 let time=100000
 const events=[],journal=new SelfDriveJournal({clock:()=>time,
   log:{log:(...x)=>events.push(x)}})
 const a=selectDrive({decision:wait,world:{phase:'night'},survey:openScene})
 journal.observe(a)
 time+=1000;journal.observe(a)
 assert.equal(events.length,1)
 const b=selectDrive({decision:scout,world:{phase:'day'},survey:openScene})
 journal.observe(b)
 assert.equal(events.length,2)
 assert.equal(journal.get().previousGoal,'PREPARE_DAYLIGHT')
 assert.equal(journal.get().goal,'DISCOVER_RESOURCES')
})

test('goal task feedback distinguishes actual verified result from local-only movement',()=>{
 const events=[],journal=new SelfDriveJournal({clock:()=>100000,
   log:{log:(...x)=>events.push(x)}})
 journal.observe(selectDrive({decision:scout,world:{phase:'day'},
   survey:openScene,woodFailure:true}))
 const movement=journal.recordOutcome({type:'EXPLORE',source:'自主探索',
   result:{ok:false,reason:'scout_server_endpoint_unconfirmed',localEstimateBlocks:4.66}})
 assert.equal(movement.result,'unverified')
 assert.equal(movement.goal,'DISCOVER_RESOURCES')
 const blocked=journal.recordOutcome({type:'GATHER',source:'自主任务',
   result:{ok:false,reason:'no_verified_natural_tree'}})
 assert.equal(blocked.result,'blocked')
 const confirmed=journal.recordOutcome({type:'CRAFT',source:'自主任务',
   result:{ok:true,reason:'inventory_increased'}})
 assert.equal(confirmed.result,'confirmed')
 assert.equal(journal.lastOutcome.reason,'inventory_increased')
 assert.equal(events.filter(e=>e[0]==='[Alice drive] task feedback:').length,3)
 assert.equal(journal.recordOutcome({type:'EXPLORE',source:'玩家指令',result:{ok:true}}),null)
})

test('night defers nonurgent raw-material search, but may still craft inventory resources',()=>{
 const work={action:'WORK',goal:'LEARN_WEAPON',reason:'site_not_rejected'}
 const night=selectDrive({decision:work,world:{phase:'night'},
   needsRawMaterials:true})
 assert.equal(night.driveGoal,'PREPARE_DAYLIGHT')
 assert.equal(night.decision.action,'WAIT')
 assert.equal(night.decision.reason,'defer_nonurgent_raw_materials_at_night')
 assert.equal(night.physicalActionAuthorized,false)
 const crafting=selectDrive({decision:work,world:{phase:'night'},
   needsRawMaterials:false})
 assert.equal(crafting.decision.action,'WORK')
 assert.equal(crafting.driveGoal,'ACQUIRE_MATERIALS')
 const daytime=selectDrive({decision:work,world:{phase:'day'},
   needsRawMaterials:true})
 assert.equal(daytime.decision.action,'WORK')
})

test('a verified terrain edit is not a confirmed exploration/movement outcome',()=>{
 const j=new SelfDriveJournal({clock:()=>500000,log:{log:()=>{}}})
 j.observe({driveGoal:'DISCOVER_RESOURCES',driveReason:'blocked gap',scene:{kind:'limited_or_unknown'}})
 const r=j.recordOutcome({type:'EXPLORE',source:'自主地形',
   result:{ok:true,worldModificationVerified:true,
     reason:'observed_support_and_inventory_consumption'}})
 assert.equal(r.result,'terrain_modified_not_travel_verified')
 assert.notEqual(r.result,'confirmed')
})
