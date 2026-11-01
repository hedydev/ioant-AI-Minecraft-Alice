'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {summarizeReconciliation,COUNTERS}=require('../scripts/inspect_reconciliation_runtime.cjs')
function fixture(){
 const now=100000
 const core={connected:true,sessionEstablished:true,world:'Bedrock level',
   serverPort:17879,position:{x:4,y:65,z:5},
   movementEvidence:{independentSamples:2,independentSource:'bds_querytarget',
     independentLatestFeet:{x:3,y:65,z:5},
     independentPreviousAt:99000,independentAt:99500,
     independentPairTravelBlocks:0,independentTravelBlocks:0}}
 const wire={kind:'queue_only_not_network_or_BDS_proof',
   updatedAt:99500,lastMovingAgeMs:100,serialized:15,movingQueued:4,
   syncCorrectionReplays:0,syncReplayedFrames:0,
   syncCorrectionFallbacks:1,syncCorrectionsRejected:0,
   syncHistoryFrames:40,syncLastCorrectionReason:'correction_history_miss'}
 return {core,wire,now}
}
test('current-process movement counters are observed with only relative distance',()=>{
 const snapshot=fixture(),r=summarizeReconciliation(snapshot)
 assert.equal(r.currentOwnerEvidence,true)
 assert.equal(r.telemetryPresent,true)
 assert.equal(r.evidenceLevel,'runtime_counters_observed')
 assert.equal(r.correctionFallbacks,1)
 assert.equal(r.bdsFreshPair,true)
 assert.equal(r.clientBdsDistance,1)
 assert.equal(r.bdsPairTravel,0)
 const raw=JSON.stringify(r)
 assert(!raw.includes('independentLatestFeet'))
 assert(!raw.includes('"x":'))
 assert(!raw.includes('"z":'))
 assert(!raw.includes('playerName'))
})
test('missing current-run counters never claim that new runtime was loaded',()=>{
 const v=fixture()
 delete v.wire.syncCorrectionReplays
 const r=summarizeReconciliation(v)
 assert.equal(r.telemetryPresent,false)
 assert.equal(r.evidenceLevel,'runtime_counters_unavailable')
 assert.equal(r.correctionReplays,null)
})
test('malicious reasons and fractional or negative counters are discarded',()=>{
 const v=fixture()
 v.wire.syncLastCorrectionReason='secret coordinates 1000,1000,1000'
 v.wire.syncHistoryFrames=-3
 v.wire.syncReplayedFrames=2.4
 const r=summarizeReconciliation(v)
 assert.equal(r.lastCorrectionReason,'unknown')
 assert.equal(r.telemetryPresent,false)
 assert.equal(r.historyFrames,null)
 assert.equal(r.replayedFrames,null)
 assert.equal(COUNTERS.length,5)
})
test('missing owner-approved snapshot is rejected',()=>{
 assert.throws(()=>summarizeReconciliation({}),/reconciliation_snapshot_unavailable/)
})
