'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {verifyScoutStep}=require('../src/scout_step_witness.cjs')
const start={from:{x:0.5,y:70,z:0.5},target:{x:1,y:70,z:0},
  startedAt:20000,epoch:5,independentAt:15000,independentSamples:4,
  loginAt:10000,lifeEpochAt:11000}
const observation={independentSource:'bds_querytarget',
  independentLatestFeet:{x:1.5,y:70,z:0.5},
  independentAt:20500,independentPreviousAt:20100,
  independentSamples:6,loginAt:10000,lifeEpochAt:11000}
const local={x:1.5,y:70,z:0.5}
test('only independent post-input pair proves one-step server endpoint',()=>{
 const o=verifyScoutStep(start,observation,local,20700)
 assert.equal(o.ok,true)
 assert.equal(o.serverMovementVerified,true)
 assert.equal(o.travelledBlocks,1)
})
test('one sample or stale/pre-input pair never proves endpoint',()=>{
 for(const [other,now] of [
   [{...observation,independentSamples:5},20700],
   [{...observation,independentPreviousAt:19999},20700],
   [observation,25001]
 ]) {
   const o=verifyScoutStep(start,other,local,now)
   assert.equal(o.ok,false)
   assert.equal(o.reason,'scout_step_new_independent_pair_missing')
 }
 const single={...observation,independentSamples:5}
 assert.equal(verifyScoutStep(start,single,local,20700).reason,
   'scout_step_new_independent_pair_missing')
})
test('no cross-session or cross-life reuse',()=>{
 for(const obs of [{...observation,loginAt:9999},{...observation,lifeEpochAt:11111},
   {...observation,independentSource:'correct_player_move_prediction'}])
   assert.equal(verifyScoutStep(start,obs,local,20700).reason,
     'scout_step_independent_owner_mismatch')
})
test('cannot fabricate movement from current local position',()=>{
 assert.equal(verifyScoutStep(start,{...observation,
   independentLatestFeet:{x:.5,y:70,z:.5}},local,20700).ok,false)
 assert.equal(verifyScoutStep(start,observation,{x:3,y:70,z:.5},20700).ok,false)
 assert.equal(verifyScoutStep(start,{...observation,
   independentLatestFeet:{x:2.9,y:70,z:.5}},local,20700).ok,false)
})
test('owner, timestamp, deadline must remain valid',()=>{
 assert.equal(verifyScoutStep({...start,epoch:NaN},observation,local,20700).ok,false)
 assert.equal(verifyScoutStep({...start,independentAt:21000},observation,local,20700).ok,false)
 assert.equal(verifyScoutStep(start,observation,local,260001).ok,false)
 assert.equal(verifyScoutStep(start,{...observation,independentAt:20600,independentPreviousAt:20900},local,20700).ok,false)
})
