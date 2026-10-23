'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {scoutStartProof}=require('../src/scout_start_proof.cjs')
const base=()=>({get:()=>({
  lastSource:'bds_querytarget',independentSamples:4,
  latestFeet:{x:.5,y:69,z:.5},lastAt:8000
})})
const bot=()=>({entity:{position:{x:.5,y:69,z:.5}}})
test('accepts aligned fresh independent witness with two or more samples',()=>{
 const s=scoutStartProof(bot(),base(),()=>10000)
 assert.equal(s.ok,true);assert.equal(s.distance,0)
})
test('rejects locally predicted 9m walk with BDS stationary without moving bot',()=>{
 const b=bot(),e=base();b.entity.position={x:7.5,y:72,z:5.5}
 const before=JSON.stringify(b)
 const result=scoutStartProof(b,e,()=>10000)
 assert.equal(result.ok,false);assert.equal(result.reason,'scout_client_server_position_diverged')
 assert.equal(JSON.stringify(b),before)
 assert(result.distance>9)
})
test('rejects untrusted missing stale future or single witness',()=>{
 for(const s of [
   {...base().get(),independentSamples:1},
   {...base().get(),lastSource:'correct_player_move_prediction'},
   {...base().get(),lastAt:5000},
   {...base().get(),lastAt:11000},
   {...base().get(),latestFeet:null}
 ]) {
   const result=scoutStartProof(bot(),{get:()=>s},()=>10000)
   assert.equal(result.ok,false)
   assert.equal(result.reason,'scout_bds_position_unavailable')
 }
})
test('rejects undefined client coordinates',()=>{
 const result=scoutStartProof({entity:{position:{x:NaN,y:69,z:0}}},base(),()=>10000)
 assert.equal(result.ok,false);assert.equal(result.reason,'scout_client_position_unavailable')
})

test('script API evidence can satisfy start only when fresh, multiple and position-aligned',()=>{
 const sample={...base().get(),lastSource:'bds_script_api'}
 assert.equal(scoutStartProof(bot(),{get:()=>sample},()=>10000).ok,true)
 assert.equal(scoutStartProof(bot(),{get:()=>({...sample,lastAt:1000})},()=>10000).ok,false)
 assert.equal(scoutStartProof(bot(),{get:()=>({...sample,independentSamples:1})},()=>10000).ok,false)
})

test('interleaved ordinary server corrections do not erase recent independent witness',()=>{
 const s={...base().get(),lastSource:'correct_player_move_prediction',
   latestFeet:{x:200,y:80,z:200},lastAt:10000,
   independentLatestFeet:{x:.5,y:69,z:.5},
   independentSource:'bds_script_api',independentAt:9800}
 assert.equal(scoutStartProof(bot(),{get:()=>s},()=>10000).ok,true)
 assert.equal(scoutStartProof(bot(),{get:()=>s},()=>14050).ok,false)
})
