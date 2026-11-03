'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {AliceBedrockRuntime}=require('../src/runtime.cjs')
const {createBedRuntimeMethods}=require('../src/features/bed/runtime_methods.cjs')
const {createDoorRuntimeMethods}=require('../src/features/door/runtime_methods.cjs')
test('feature modules preserve existing runtime method names',()=>{
  const bed=createBedRuntimeMethods({}),door=createDoorRuntimeMethods({})
  for(const n of ["requestBedTask","resumeBedRequestOnWitness","spawnpointTick","settlePendingBedStepOnWitness","resumeBedApproachOnWitness","resumeAutonomousBedApproachOnWitness"]){
    assert.equal(typeof bed[n],'function',n);assert.equal(typeof AliceBedrockRuntime.prototype[n],'function',n)
  }
  for(const n of ["settlePendingDoorApproachOnWitness","crossObservedDoor","settlePendingDoorCrossingOnWitness","resumeRaisedDoorLandingOnWitness","recordEscapePassage","escapeApproachGuard","observeBlockedRoom"]){
    assert.equal(typeof door[n],'function',n);assert.equal(typeof AliceBedrockRuntime.prototype[n],'function',n)
  }
})
test('bed one-cell endpoint stays pending until fresh independent BDS result',()=>{
  const step={epoch:7,createdAt:100,startedAt:110,action:'WALK'},ctx={epoch:7,closed:false,clock:()=>200,
    bot:{game:{dimension:'overworld'},entity:{position:{}}},movementEvidence:{get:()=>({})},pendingBedStep:step,log:{log(){}}}
  const waiting=createBedRuntimeMethods({verifyBedStep:()=>({ok:false,reason:'bed_step_new_independent_pair_missing'})})
  assert.equal(waiting.settlePendingBedStepOnWitness.call(ctx).state,'waiting');assert.equal(ctx.pendingBedStep,step)
  const passed=createBedRuntimeMethods({verifyBedStep:()=>({ok:true,reason:'verified',travelledBlocks:1})})
  assert.equal(passed.settlePendingBedStepOnWitness.call(ctx).state,'verified')
  assert.equal(ctx.pendingBedStep,null);assert.equal(ctx.lastBedApproachAction.serverMovementVerified,true)
})
test('door one-cell BDS approach cannot claim door opened or crossed',()=>{
  const ctx={epoch:8,closed:false,clock:()=>200,bot:{entity:{position:{}}},movementEvidence:{get:()=>({})},
    pendingDoorApproachStep:{epoch:8,startedAt:100,door:[1,2,3]},nextIdleAt:9999,log:{log(){}}}
  const m=createDoorRuntimeMethods({verifyScoutStep:()=>({ok:true,reason:'verified'})})
  assert.equal(m.settlePendingDoorApproachOnWitness.call(ctx).state,'verified')
  assert.equal(ctx.lastEscapeDoorAction.openObserved,false)
  assert.equal(ctx.lastEscapeDoorAction.serverMovementVerified,true)
  assert.equal(ctx.pendingDoorApproachStep,null)
})
