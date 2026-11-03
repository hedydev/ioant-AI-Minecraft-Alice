'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createResourceStrategy}=require('../src/features/autonomy/resource_strategy.cjs')
const {createDoorStrategy}=require('../src/features/autonomy/door_strategy.cjs')
const {createIdleRuntimeMethods}=require('../src/features/autonomy/idle_methods.cjs')
test('resource strategy admits one bounded tree gather with original actor',()=>{
  let jobs=0
  const fn=createResourceStrategy({observedNaturalTree:()=>({ok:true}),selectResourceStep:()=>({action:'gather_one_log',reason:'verified_tree'}),siteKey:()=> 'site'})
  const ctx={bot:{entity:{position:{x:0,y:64,z:0}},health:20},failureMemory:{blocked:()=>null},lastWorldRoutine:{phase:'day',safeToExplore:true},clock:()=>100,nextAutonomousCraftAt:0,
    startJob(type,source,task){assert.equal(type,'GATHER');assert.equal(typeof task,'function');jobs++},log:{log(){}}}
  assert.deepEqual(fn.call(ctx,{plan:'COLLECT_WOOD',wood:0,weapon:false,night:false}),{handled:true})
  assert.equal(jobs,1);assert.equal(ctx.lastResourceOpportunity.treeVerified,true)
})
test('resource strategy does not bypass unverified motion for gather',()=>{
  const fn=createResourceStrategy({observedNaturalTree:()=>({ok:true}),selectResourceStep:()=>({action:'gather_one_log',reason:'tree'}),siteKey:()=> 'site'})
  const ctx={bot:{entity:{position:{x:0,y:64,z:0}},health:20},failureMemory:{blocked:(kind)=>kind==='motion'?{reason:'unverified'}:null},
    lastWorldRoutine:{phase:'day',safeToExplore:true},clock:()=>100,nextAutonomousCraftAt:0,
    startJob(){throw Error('unverified move')},log:{log(){}}}
  const result=fn.call(ctx,{plan:'COLLECT_WOOD',wood:0,weapon:false,night:false})
  assert.equal(result.handled,false);assert.equal(result.movementFailure.reason,'unverified')
})
test('door strategy refuses stale surveys without any job or geometry admission',()=>{
  let geometry=0
  const f=createDoorStrategy({validateApproach:()=>{geometry++;return {ok:true}},planDoorOpen:()=>{geometry++;return {ok:true}},
    selectDrive:({decision})=>({decision,driveGoal:'OBSERVE_ROOM'})})
  const ctx={clock:()=>100000,lastEscapeSurveyAt:0,lastWorldRoutine:{safeToExplore:true},
    bot:{entity:{position:{x:.5,y:64,z:.5}}},lastEscapeSurvey:{center:[0,64,0],status:'door_interaction_candidate',door:{position:[1,64,0]}},
    startJob(){throw Error('no job')}}
  const outcome=f.reviewDoorStrategy.call(ctx,{decision:{action:'WAIT'},night:false,resourceNeed:false,observedTree:null,woodFailure:false,movementFailure:false,plan:'OBSERVE',wood:0})
  assert.equal(outcome.freshDoor,null);assert.equal(outcome.indoorDoorPriority,false);assert.equal(geometry,0)
})
test('fresh observed indoor door is eligible for review but not permission to open',()=>{
  let validated=0
  const f=createDoorStrategy({validateApproach:()=>{validated++;return {ok:true}},
    planDoorOpen:()=>({ok:false,reason:'out_of_reach'}),
    selectDrive:({decision})=>({decision,driveGoal:'FIND_ROOM_EXIT'})})
  const ctx={clock:()=>100000,lastEscapeSurveyAt:99999,lastWorldRoutine:{safeToExplore:true},
    bot:{entity:{position:{x:.5,y:64,z:.5}}},lastEscapeSurvey:{center:[0,64,0],status:'door_interaction_candidate',
      door:{position:[1,64,0],approach:{waypoints:[1,2,3]}}},startJob(){throw Error('no job')}}
  const result=f.reviewDoorStrategy.call(ctx,{decision:{action:'SCOUT'},night:false,resourceNeed:true,observedTree:null,
    woodFailure:false,movementFailure:false,plan:'COLLECT_WOOD',wood:0})
  assert.equal(result.indoorDoorPriority,true);assert.equal(result.decision.action,'WAIT');assert.equal(validated,1)
})
test('door WAIT runner blocks unsafe motion and reports no server travel',()=>{
  const f=createDoorStrategy({planDoorOpen:()=>({ok:false,reason:'door_geometry_missing'})})
  const ctx={clock:()=>100000,lastEscapeSurveyAt:99999,lastEscapeSurvey:{door:{position:[1,64,0]}},
    bot:{entity:{position:{}}},startJob(){throw Error('door action unauthorized')},log:{log(){}}}
  assert.equal(f.runDoorWaitStrategy.call(ctx,{doorDriven:false,movementFailure:false,drive:{driveGoal:'FIND_ROOM_EXIT'}}),false)
  assert.equal(f.runDoorWaitStrategy.call(ctx,{doorDriven:true,movementFailure:{reason:'BDS_unverified'},drive:{driveGoal:'FIND_ROOM_EXIT'}}),false)
  assert.equal(f.runDoorWaitStrategy.call(ctx,{doorDriven:true,movementFailure:false,drive:{driveGoal:'FIND_ROOM_EXIT'}}),false)
  assert.equal(ctx.lastEscapeDoorAction.serverMovementVerified,false)
})
test('resource and door split preserves exactly one async IDLE scheduler entry',()=>{
  const m=createIdleRuntimeMethods({})
  assert.equal(m.idleTick.constructor.name,'AsyncFunction')
  assert.equal(m.runIdleDecision.constructor.name,'AsyncFunction')
})
