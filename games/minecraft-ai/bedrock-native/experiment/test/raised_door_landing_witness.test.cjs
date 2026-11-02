'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {verifyRaisedDoorLanding}=require('../src/raised_door_landing_witness.cjs')
const p=()=>({kind:'raised_landing',door:[1,65,0],beyond:[2,65,0],
 initialBdsFeet:{x:1.5,y:65,z:.5},createdAt:100000,
 startedAt:100120,epoch:6,independentSamples:8,loginAt:3,lifeEpochAt:9})
const s=()=>({independentSource:'bds_querytarget',independentSamples:10,
 independentPreviousAt:280000,independentAt:280300,loginAt:3,
 lifeEpochAt:9,independentLatestFeet:{x:2.5,y:66,z:.5}})
test('later BDS pair confirms raised endpoint only, never room exit',()=>{
 const r=verifyRaisedDoorLanding(p(),s(),{x:2.5,y:66,z:.5},280500)
 assert.equal(r.ok,true)
 assert.equal(r.raisedLandingVerified,true)
 assert.equal(r.roomExitVerified,false)
})
test('old, packet-origin, incomplete and other-life pairs cannot confirm',()=>{
 const a=s()
 for(const o of [{...a,independentSource:'packet_self'},
  {...a,independentSamples:9},{...a,independentPreviousAt:100120},
  {...a,lifeEpochAt:12},{...a,independentPreviousAt:274000}]){
  assert.equal(verifyRaisedDoorLanding(p(),o,{x:2.5,y:66,z:.5},280500).ok,false)
 }
})
test('door tile, raised mismatch, drift, changed target and late deadline reject',()=>{
 for(const v of [{x:1.5,y:65,z:.5},{x:2.5,y:65,z:.5},{x:2.5,y:67,z:.5}]){
  assert.equal(verifyRaisedDoorLanding(p(),{...s(),independentLatestFeet:v},v,280500).ok,false)
 }
 assert.equal(verifyRaisedDoorLanding(p(),s(),{x:8,y:66,z:8},280500).ok,false)
 assert.equal(verifyRaisedDoorLanding({...p(),beyond:[3,65,0]},s(),{x:2.5,y:66,z:.5},280500).ok,false)
 assert.equal(verifyRaisedDoorLanding(p(),s(),{x:2.5,y:66,z:.5},340121).ok,false)
})
