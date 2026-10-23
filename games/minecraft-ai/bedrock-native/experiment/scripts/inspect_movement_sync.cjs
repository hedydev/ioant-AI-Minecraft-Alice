'use strict'
// Read-only operator report. Do not log MCSManager credentials or packet bodies.
// Compares local prediction, authenticated same-instance BDS witness and the
// anonymous 20Hz input-sync telemetry after a single controlled Alice run.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const root=path.join(os.homedir(),'.alice-bedrock-control')
const read=(name,max=4096)=>{
 const file=path.join(root,name)
 let st
 try{st=fs.lstatSync(file)}catch(e){if(e.code==='ENOENT')return null;throw e}
 if(!st.isFile()||st.isSymbolicLink()||st.size>max)throw Error('unsafe_movement_report_source')
 return JSON.parse(fs.readFileSync(file,'utf8'))
}
try{
 const core=read('status.json'),wire=read('outbound-input-audit.json',2048)
 if(!core||!wire)throw Error('movement_report_files_missing')
 const m=core.movementEvidence||{},now=Date.now()
 const feet=(v)=>v&&[v.x,v.y,v.z].every(Number.isFinite)?v:null
 const client=feet(core.position),bds=feet(m.latestFeet),login=feet(m.loginFeet)
 const distance=(a,b)=>a&&b?Math.round(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*100)/100:null
 const serverTravel=Number.isFinite(m.travelBlocks)?m.travelBlocks:null
 const fresh=Number.isFinite(m.lastAt)&&now-m.lastAt>=0&&now-m.lastAt<=5000
 const accepted=m.lastSource==='bds_querytarget'&&fresh&&m.independentSamples>=2
 const actualMove=accepted&&serverTravel>=0.25
 const attempted=wire.movingQueued>0
 const verdict=actualMove?'BDS_MOVEMENT_CONFIRMED':
   !accepted?'BDS_POSITION_NOT_FRESH':
   !attempted?'NO_MOVEMENT_INPUT_ATTEMPTED':'MOVEMENT_NOT_CONFIRMED'
 console.log(JSON.stringify({
   verdict,connected:core.connected,world:core.world,serverPort:core.serverPort,
   originalLoginFeet:login,clientFeet:client,bdsFeet:bds,
   clientBdsDivergence:distance(client,bds),bdsDistanceFromLogin:distance(login,bds),
   bdsVerifiedTravel:serverTravel,bdsAcceptedSamples:m.independentSamples,
   bdsWitnessFresh:fresh,inputPackets:wire.serialized,
   movementInputs:wire.movingQueued,analogCorrections:wire.analogCompatCorrected,
   syncTickMode:wire.syncTickMode,
   wireProbeFrames:wire.wireProbeFrames,wireProbeMatched:wire.wireProbeMatched,
   wireProbeMismatches:wire.wireProbeMismatches,
   wireProbeUnavailable:wire.wireProbeUnavailable,
   wireProbeFirstIssue:wire.wireProbeFirstIssue,
   movementBursts:wire.movingBurstCount,
   maxConsecutiveMovingTicks:wire.maxConsecutiveMovingTicks,
   currentMovingRun:wire.currentMovingRun,
   lastMovingAgeMs:wire.lastMovingAgeMs,
   syncFrames:wire.syncEmitted,syncCatchupFrames:wire.syncCatchupFrames,
   syncMaxBatchFrames:wire.syncMaxBatchFrames,
   syncOverruns:wire.syncOverruns,syncSkippedTicks:wire.syncSkippedTicks,
   syncControlsChangedInsideFrame:wire.syncControlsChangedInsideFrame,
   syncCallbackPositionMutationsPrevented:wire.syncCallbackPositionMutationsPrevented,
   syncCallbackVelocityMutationsPrevented:wire.syncCallbackVelocityMutationsPrevented,
   syncCallbackContactMutationsPrevented:wire.syncCallbackContactMutationsPrevented,
   dataSource:'same-instance querytarget + anonymous outbound telemetry'
 },null,2))
 if(!actualMove)process.exitCode=2
}catch(e){
 console.error('movement_sync_inspection_unavailable:',
   /^[a-z_]+$/.test(String(e.message))?e.message:'io_error')
 process.exitCode=3
}
