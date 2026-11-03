'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {AliceBedrockRuntime}=require('../src/runtime.cjs')
const {createCommandRuntimeMethods}=require('../src/features/commands/runtime_methods.cjs')
const {createWorkRuntimeMethods}=require('../src/features/tasks/work_methods.cjs')
const {createScoutRuntimeMethods}=require('../src/features/navigation/scout_methods.cjs')
test('command, work, and scout modules retain original runtime instance API',()=>{
 const entries=[
  [createCommandRuntimeMethods,["onChat","askModel","acceptAcquire","acquireItem","acceptGather"]],
  [createWorkRuntimeMethods,["startJob","gatherCount","runVerifiedResourceStep","craftWeaponOrTable"]],
  [createScoutRuntimeMethods,["settlePendingScoutStepOnWitness","boundedScout"]]]
 for(const [factory,names] of entries){
  const methods=factory({})
  for(const name of names){
   assert.equal(typeof methods[name],'function',name)
   assert.equal(typeof AliceBedrockRuntime.prototype[name],'function',name)
  }
 }
})
test('new scout cannot start during unverified previous step',()=>{
 const methods=createWorkRuntimeMethods({})
 const ctx={pendingScoutStep:{epoch:1},ready(){throw Error('must not reach readiness')}}
 assert.equal(methods.startJob.call(ctx,'EXPLORE','test',async()=>{}),false)
 assert.equal(methods.startJob.call(ctx,'GATHER','test',async()=>{}),false)
})
test('empty scout pending record is not an independent BDS acceptance',()=>{
 const methods=createScoutRuntimeMethods({})
 assert.deepEqual(methods.settlePendingScoutStepOnWitness.call({pendingScoutStep:null}),{state:'none'})
})
test('chat command on closed Alice does not issue any game action',async()=>{
 const methods=createCommandRuntimeMethods({})
 await methods.onChat.call({closed:true},'Player','AliceAI 跟着我')
})
