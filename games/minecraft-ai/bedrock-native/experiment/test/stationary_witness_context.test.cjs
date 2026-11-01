'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {stationaryWitnessAfterActivity:check}=require('../src/stationary_witness_context.cjs')
const bot=summary=>({_aliceBedrockInputSync:{summary:()=>summary}})
test('both samples must follow input and authoritative state changes',()=>{
 assert.equal(check(bot({lastMotionInputAt:80,lastAuthoritativePositionAt:90}),{independentPreviousAt:100},200).ok,true)
 for(const key of ['lastMotionInputAt','lastAuthoritativePositionAt']){
  const v={lastMotionInputAt:null,lastAuthoritativePositionAt:null,[key]:100}
  assert.equal(check(bot(v),{independentPreviousAt:100},200).ok,false)
 }
})
test('unknown, future or invalid activity cannot authorize local mirroring',()=>{
 for(const v of [{},{lastMotionInputAt:201,lastAuthoritativePositionAt:null},
   {lastMotionInputAt:-1,lastAuthoritativePositionAt:null}])
  assert.equal(check(bot(v),{independentPreviousAt:100},200).reason,'local_mirror_activity_unknown')
 assert.equal(check({}, {independentPreviousAt:100},200).ok,false)
 assert.equal(check(bot({lastMotionInputAt:null,lastAuthoritativePositionAt:null}),{independentPreviousAt:100},NaN).ok,false)
})
