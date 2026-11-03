'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {AliceBedrockRuntime}=require('../src/runtime.cjs')
const {createMaintenanceRuntimeMethods}=require('../src/features/survival/maintenance_methods.cjs')
const {createTerrainRuntimeMethods}=require('../src/features/navigation/terrain_methods.cjs')
test('maintenance and terrain feature methods preserve Alice runtime API and Promise type',()=>{
  const groups=[
    [createMaintenanceRuntimeMethods,['observeHomeTick','maintenanceTick']],
    [createTerrainRuntimeMethods,['verifyVerticalTransition','maybeStartEarthwork']]]
  for(const [factory,names] of groups){
    const methods=factory({})
    for(const n of names){
      assert.equal(typeof methods[n],'function',n)
      assert.equal(typeof AliceBedrockRuntime.prototype[n],'function',n)
    }
  }
  assert.equal(createMaintenanceRuntimeMethods({}).maintenanceTick.constructor.name,'AsyncFunction')
})
test('maintenance must not start new equipment or bed tasks before readiness',async()=>{
  let jobs=0
  const ctx={ready:()=>false,bot:{isSleeping:false},safetyBusy:false,
    observeHomeTick(){},startJob(){jobs++},ops:{equipAuto(){throw Error('unready equipment')}}}
  await createMaintenanceRuntimeMethods({}).maintenanceTick.call(ctx)
  assert.equal(jobs,0)
})
test('home observation has no effects on unready Alice',()=>{
  const ctx={ready:()=>false,bot:{},observedBeds:{nearby(){throw Error('unready scan')}}}
  createMaintenanceRuntimeMethods({}).observeHomeTick.call(ctx)
})
test('vertical and terrain jobs reject unsupported input before world reads',()=>{
  const methods=createTerrainRuntimeMethods({})
  assert.equal(methods.verifyVerticalTransition.call({},null),false)
  const ctx={clock:()=>1000000,lastTerrainWorkAttemptAt:0,ready:()=>true,
    startJob(){throw Error('no terrain work allowed')}}
  assert.equal(methods.maybeStartEarthwork.call(ctx,null,null,null),false)
})
