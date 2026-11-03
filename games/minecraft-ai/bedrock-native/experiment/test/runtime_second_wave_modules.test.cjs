'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {AliceBedrockRuntime}=require('../src/runtime.cjs')
const {createSafetyRuntimeMethods}=require('../src/features/safety/runtime_methods.cjs')
const {createFollowRuntimeMethods}=require('../src/features/navigation/follow_methods.cjs')
const {createModelRuntimeMethods}=require('../src/features/autonomy/model_methods.cjs')
const {createNightRuntimeMethods}=require('../src/features/autonomy/night_methods.cjs')
const {createIdleRuntimeMethods}=require('../src/features/autonomy/idle_methods.cjs')
test('five feature factories expose original runtime method contracts',()=>{
 const specs=[
 [createSafetyRuntimeMethods,["threat","escortDecision","safetyTick"]],
 [createFollowRuntimeMethods,["stopDirectFollow","tryShortFollow","followTick"]],
 [createModelRuntimeMethods,["recordAutonomousDecision","runAutonomousModelStep"]],
 [createNightRuntimeMethods,["tryNightReposition"]],
 [createIdleRuntimeMethods,["idleTick","runIdleDecision"]]
 ]
 for(const [factory,names] of specs){
   const parts=factory({})
   for(const name of names){
     assert.equal(typeof parts[name],'function',name)
     assert.equal(typeof AliceBedrockRuntime.prototype[name],'function',name)
   }
 }
})
test('safety method refuses to assert threat when Alice is not ready',()=>{
 let touched=false
 const methods=createSafetyRuntimeMethods({})
 const ctx={ready:()=>false,bot:{get entities(){touched=true;throw Error('unready-read')}}}
 assert.equal(methods.threat.call(ctx),null);assert.equal(touched,false)
})
test('follow feature clears only its own forward input',()=>{
 const changes=[]
 const methods=createFollowRuntimeMethods({})
 const ctx={directFollowActive:true,directFollowTimer:null,bot:{setControlState:(key,value)=>changes.push([key,value])},log:{log(){}}}
 methods.stopDirectFollow.call(ctx,'test')
 assert.equal(ctx.directFollowActive,false)
 assert.deepEqual(changes,[['forward',false]])
})
test('autonomy night refuses a daytime reposition without movement',()=>{
 const methods=createNightRuntimeMethods({environment:()=>({phase:'day'})})
 const ctx={bot:{},startJob(){throw Error('should not start')} }
 assert.equal(methods.tryNightReposition.call(ctx),false)
})
test('autonomy idleTick preserves one-inflight gate and releases it',async()=>{
 const methods=createIdleRuntimeMethods({})
 let resolve;let calls=0
 const ctx={idleBusy:false,runIdleDecision(){calls++;return new Promise(r=>{resolve=r})}}
 const first=methods.idleTick.call(ctx),second=methods.idleTick.call(ctx)
 assert.equal(ctx.idleBusy,true);assert.equal(calls,1)
 assert.equal(await second,undefined)
 resolve('done')
 assert.equal(await first,'done')
 assert.equal(ctx.idleBusy,false)
})
