'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {verifyDoorCrossing}=require('../src/door_crossing_witness.cjs')
const planned=()=>({door:[0,65,1],from:[0,65,0],beyond:[0,65,2],
 initialBdsFeet:{x:.5,y:65,z:.5},createdAt:100000,
 startedAt:100100,epoch:3,independentSamples:4,
 loginAt:6,lifeEpochAt:2})
const sample=()=>({independentSource:'bds_querytarget',
 independentSamples:6,independentPreviousAt:279000,
 independentAt:279800,loginAt:6,lifeEpochAt:2,
 independentLatestFeet:{x:.5,y:65,z:2.5}})
const local=()=>({x:.5,y:65,z:2.5})
test('only NEW independent BDS double witness after door motion confirms opposite-side cell',()=>{
 const v=verifyDoorCrossing(planned(),sample(),local(),280000)
 assert.equal(v.ok,true)
 assert.equal(v.serverMovementVerified,true)
 assert.equal(v.roomExitVerified,false)
 assert.equal(v.reason,'door_crossing_new_independent_bds_confirmed')
})
test('packet position and first fresh sample can never prove door crossing',()=>{
 const s=sample()
 assert.equal(verifyDoorCrossing(planned(),{...s,independentSource:'packet_self'},local(),280000).ok,false)
 assert.equal(verifyDoorCrossing(planned(),{...s,independentSamples:5},local(),280000).ok,false)
 assert.equal(verifyDoorCrossing(planned(),{...s,independentPreviousAt:100100},local(),280000).ok,false)
})
test('a matching BDS sample before input is never fresh post-input proof',()=>{
 const s=sample()
 assert.equal(verifyDoorCrossing(planned(),{...s,
  independentAt:100099,independentPreviousAt:99990},local(),100100).ok,false)
})
test('different login or respawn invalidates otherwise matching endpoint',()=>{
 const s=sample()
 assert.equal(verifyDoorCrossing(planned(),{...s,loginAt:8},local(),280000).ok,false)
 assert.equal(verifyDoorCrossing(planned(),{...s,lifeEpochAt:3},local(),280000).ok,false)
})
test('stale second witness, future clock or expired action all fail closed',()=>{
 const s=sample()
 assert.equal(verifyDoorCrossing(planned(),{...s,independentPreviousAt:274000},local(),280000).ok,false)
 assert.equal(verifyDoorCrossing(planned(),{...s,independentAt:280010},local(),280000).ok,false)
 assert.equal(verifyDoorCrossing(planned(),s,local(),340101).ok,false)
})
test('being at door center rather than far side is not a successful crossing',()=>{
 const s=sample()
 assert.equal(verifyDoorCrossing(planned(),{...s,
  independentLatestFeet:{x:.5,y:65,z:1.5}},local(),280000).ok,false)
 assert.equal(verifyDoorCrossing(planned(),{...s,
  independentLatestFeet:{x:.5,y:65,z:.5}},local(),280000).ok,false)
})
test('BDS versus local drift cannot be used as independent success',()=>{
 assert.equal(verifyDoorCrossing(planned(),sample(),{x:5,y:65,z:9},280000).ok,false)
})
test('incorrect side geometry, start and malicious room-exit claim are rejected',()=>{
 const p=planned()
 assert.equal(verifyDoorCrossing({...p,beyond:[0,65,-2]},sample(),local(),280000).ok,false)
 assert.equal(verifyDoorCrossing({...p,initialBdsFeet:{x:8,y:65,z:8}},sample(),local(),280000).ok,false)
})
