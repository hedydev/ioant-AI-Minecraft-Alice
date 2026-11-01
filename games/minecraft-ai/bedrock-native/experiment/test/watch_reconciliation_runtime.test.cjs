'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {observe}=require('../scripts/watch_reconciliation_runtime.cjs')
function fixture(){
 let elapsed=0,calls=0
 const data={now:100000,core:{producerPid:123,producerStartToken:'456',updatedAt:100000,
   connected:true,sessionEstablished:true,world:'Bedrock level',serverPort:17879,state:'IDLE',
   position:{x:3.02,y:65,z:5},movementEvidence:{loginAt:90000,lifeEpochAt:90000,
     independentSamples:2,independentSource:'bds_querytarget',independentLatestFeet:{x:3,y:65,z:5},
     independentAt:99500,independentPreviousAt:99000,independentPairTravelBlocks:0}},
   wire:{kind:'queue_only_not_network_or_BDS_proof',updatedAt:100000,
     syncCorrectionReplays:2,syncReplayedFrames:4,syncCorrectionFallbacks:0,
     syncCorrectionsRejected:0,syncHistoryFrames:40,currentMovingRun:0,
     syncLastCorrectionReason:'correction_replayed'}}
 return {data,options:{seconds:1,clock:()=>elapsed,sleep:async ms=>{elapsed+=ms},
   snapshot:()=>{calls++;return data}},calls:()=>calls}
}
test('finite observer deduplicates a fresh window and exports distances, never coordinates',async()=>{
 const f=fixture(),r=await observe(f.options)
 assert.equal(r.state,'fresh_relative_samples_observed');assert.equal(r.ownerPid,123)
 assert.equal(r.observations,4);assert.equal(r.windows.length,1)
 assert.equal(r.windows[0].observations,4);assert.equal(r.windows[0].maxDistance,.02)
 assert.equal(r.firstCounters.correctionReplays,2)
 assert.equal(r.elapsedMs,1000)
 assert(!JSON.stringify(r).includes('"x":'));assert(!JSON.stringify(r).includes('producerStartToken'))
})
test('stale samples never form a convergence window',async()=>{
 const f=fixture();f.data.core.movementEvidence.independentAt=2000
 const r=await observe(f.options)
 assert.equal(r.state,'no_fresh_samples');assert.deepEqual(r.windows,[])
})
test('owner transition stops observation before mixing two processes',async()=>{
 const f=fixture(),snapshot=f.options.snapshot
 f.options.snapshot=()=>{const d=snapshot();if(f.calls()>1)d.core.producerPid=999;return d}
 const r=await observe(f.options)
 assert.equal(r.state,'owner_changed');assert.equal(r.observations,1);assert.equal(r.ownerPid,123)
})
test('real qualified errors remain visible rather than clamped to an acceptance threshold',async()=>{
 const f=fixture();f.data.core.position.x=5
 const r=await observe(f.options)
 assert.equal(r.windows[0].maxDistance,2)
})
test('unavailable or wrong-world evidence cannot claim a successful observation',async()=>{
 const a=fixture();a.options.snapshot=()=>{throw Error('movement_report_stale')}
 const r=await observe(a.options)
 assert.equal(r.state,'snapshot_unavailable');assert.equal(r.snapshotFailure,'movement_report_stale')
 const b=fixture();b.data.core.serverPort=17880
 assert.equal((await observe(b.options)).state,'session_unverified')
 await assert.rejects(observe({...b.options,seconds:211}),/invalid_observation_duration/)
})
