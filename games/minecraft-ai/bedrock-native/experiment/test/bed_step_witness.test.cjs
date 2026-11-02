'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {verifyBedStep}=require('../src/bed_step_witness.cjs')
const step=()=>({createdAt:100,startedAt:150,epoch:7,loginAt:20,
  lifeEpochAt:12,independentAt:120,independentSamples:10,
  from:{x:.5,y:65,z:.5},target:{x:1,y:65,z:0}})
const fresh=()=>({independentSource:'bds_querytarget',
  independentAt:200000,independentPreviousAt:199000,
  independentSamples:12,loginAt:20,lifeEpochAt:12,
  independentLatestFeet:{x:1.5,y:65,z:.5}})
const local=()=>({x:1.5,y:65,z:.5})
test('independent new post-motion double sample confirms ONE known flat bed cell',()=>{
 const s=step(),b=fresh(),t=200100
 assert.equal(verifyBedStep(s,b,local(),t).ok,true)
 assert.equal(verifyBedStep(s,b,local(),t).serverMovementVerified,true)
})
test('client packet-only evidence or earlier single BDS sample never confirms movement',()=>{
 const s=step(),b=fresh()
 assert.equal(verifyBedStep(s,{...b,independentSamples:11},local(),200100).ok,false)
 assert.equal(verifyBedStep(s,{...b,independentPreviousAt:149},local(),200100).ok,false)
 assert.equal(verifyBedStep(s,{...b,independentSource:'self_move_player'},local(),200100).ok,false)
})
test('stale or reordered BDS samples never extend a 4-second proof',()=>{
 const s=step(),b=fresh()
 assert.equal(verifyBedStep(s,{...b,independentPreviousAt:195000},local(),200100).ok,false)
 assert.equal(verifyBedStep(s,{...b,independentPreviousAt:200001},local(),200100).ok,false)
 assert.equal(verifyBedStep(s,{...b,independentAt:200102},local(),200100).ok,false)
})
test('new BDS proof for different login or life cannot validate old path',()=>{
 const s=step(),b=fresh()
 assert.equal(verifyBedStep(s,{...b,loginAt:21},local(),200100).ok,false)
 assert.equal(verifyBedStep(s,{...b,lifeEpochAt:13},local(),200100).ok,false)
})
test('new BDS samples without destination travel cannot declare success',()=>{
 const s=step(),b=fresh()
 assert.equal(verifyBedStep(s,{...b,independentLatestFeet:s.from},local(),200100).ok,false)
 assert.equal(verifyBedStep(s,{...b,independentLatestFeet:{x:4.5,y:65,z:.5}},local(),200100).ok,false)
 assert.equal(verifyBedStep(s,b,{x:4,y:65,z:0},200100).ok,false)
})
test('a witness after 240-second bounded request expires even if BDS matches',()=>{
 const s=step(),b=fresh()
 assert.equal(verifyBedStep(s,b,local(),240151).ok,false)
})
test('invalid, missing or ungrounded bed targets are always rejected',()=>{
 assert.equal(verifyBedStep(null,fresh(),local(),200100).ok,false)
 assert.equal(verifyBedStep({...step(),target:{x:NaN,y:65,z:0}},fresh(),local(),200100).ok,false)
 assert.equal(verifyBedStep(step(),null,local(),200100).ok,false)
})
