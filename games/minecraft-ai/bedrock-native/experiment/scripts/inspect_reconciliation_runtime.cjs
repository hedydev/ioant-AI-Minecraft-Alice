'use strict'
// A bounded read-only, current-process diagnostic of movement-rewind telemetry.
// Never disclose player coordinates, the private operator log, input packets
// or account identifiers. Telemetry is NOT independent BDS movement proof.
const {liveSnapshots,evaluateMovement}=require('./inspect_movement_sync.cjs')
const COUNTERS=Object.freeze([
  'syncCorrectionReplays','syncReplayedFrames','syncCorrectionFallbacks',
  'syncCorrectionsRejected','syncHistoryFrames'
])
const REASONS=new Set([
  'correction_replayed','correction_history_miss','correction_context_changed',
  'correction_replay_unavailable','invalid_player_correction',
  'prior_life_correction','future_input_correction','stale_input_correction',
  'prediction_context_changed','collision_world_changed','death','spawn',
  'mount','dismount','server_self_position','forced_move',
  'dimension_changed','catchup_window_exceeded','movement_authority_changed',
  'creative_flight','vehicle_frame','physics_disabled'
])
const safeCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9?n:null
function summarizeReconciliation({core,wire,now}={}){
  if(!core||!wire||!Number.isFinite(now))
    throw Error('reconciliation_snapshot_unavailable')
  const movement=evaluateMovement({core,wire,now})
  const clean=Object.fromEntries(COUNTERS.map(key=>[key,safeCount(wire[key])]))
  const telemetryComplete=COUNTERS.every(key=>clean[key]!==null)
  const reason=wire.syncLastCorrectionReason
  const distance=movement.clientBdsDivergence
  return {
    audit:'ALICE_RECONCILIATION_LIVE_READONLY',schemaVersion:1,
    readOnly:true,worldModified:false,bdsCommandSent:false,
    currentOwnerEvidence:true,
    telemetryPresent:telemetryComplete,
    // This proves the currently owner-verified process publishes the new
    // counters, not its exact code hash or that the physics matches BDS.
    evidenceLevel:telemetryComplete?'runtime_counters_observed':'runtime_counters_unavailable',
    correctionReplays:clean.syncCorrectionReplays,
    replayedFrames:clean.syncReplayedFrames,
    correctionFallbacks:clean.syncCorrectionFallbacks,
    correctionsRejected:clean.syncCorrectionsRejected,
    historyFrames:clean.syncHistoryFrames,
    lastCorrectionReason:typeof reason==='string'&&REASONS.has(reason)?reason:'unknown',
    bdsFreshPair:movement.bdsWitnessFresh===true,
    bdsPairTravel:movement.bdsLastPairTravel==null?null:
      Math.max(0,Math.round(movement.bdsLastPairTravel*100)/100),
    clientBdsDistance:distance==null?null:Math.min(10000,distance)
  }
}
function main(){
  try{
    const state=liveSnapshots()
    process.stdout.write(JSON.stringify(summarizeReconciliation(state))+'\n')
  }catch(err){
    const code=String(err?.message||'')
    const reason=/^[a-z_]{1,60}$/.test(code)?code:'inspection_unavailable'
    process.stdout.write(JSON.stringify({
      audit:'ALICE_RECONCILIATION_LIVE_READONLY',schemaVersion:1,
      readOnly:true,worldModified:false,bdsCommandSent:false,
      currentOwnerEvidence:false,telemetryPresent:false,
      evidenceLevel:'unavailable',reason})+'\n')
  }
}
if(require.main===module)main()
module.exports={summarizeReconciliation,COUNTERS}
