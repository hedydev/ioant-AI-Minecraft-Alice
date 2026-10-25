'use strict'
// Read-only operator report. Do not log MCSManager credentials or packet bodies.
// Compares local prediction, authenticated same-instance BDS witness and the
// anonymous 20Hz input-sync telemetry after a single controlled Alice run.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const root=path.join(os.homedir(),'.alice-bedrock-control')
// Bind operator telemetry to the exact running, owner-checked Alice process.
// A stale status.json or wire audit can never attest live BDS movement.
const guardRoot=root
function reject(code){throw Error(code)}
function privateFile(file,limit){
 const st=fs.lstatSync(file)
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
    (st.mode&0o077)!==0||st.size>limit)reject('unsafe_movement_report_source')
 return st
}
function liveOwner({controlRoot=guardRoot,procRoot='/proc',now=Date.now()}={}){
 const home=path.dirname(controlRoot),locked=path.join(controlRoot,'active-alice-client.lock')
 const rootStat=fs.lstatSync(controlRoot),lockStat=fs.lstatSync(locked)
 if([rootStat,lockStat].some(st=>!st.isDirectory()||st.isSymbolicLink()||
      st.uid!==process.getuid()||(st.mode&0o077)!==0))reject('unsafe_movement_report_source')
 const ownerFile=path.join(locked,'owner.json')
 privateFile(ownerFile,512)
 const owner=JSON.parse(fs.readFileSync(ownerFile,'utf8'))
 if(!owner||!Number.isSafeInteger(owner.pid)||owner.pid<=1||
    typeof owner.nonce!=='string'||!/^[a-f0-9]{32}$/.test(owner.nonce))reject('movement_process_identity_unavailable')
 const proc=path.join(procRoot,String(owner.pid))
 const pst=fs.statSync(proc)
 if(pst.uid!==process.getuid())reject('movement_process_identity_unavailable')
 const args=fs.readFileSync(path.join(proc,'cmdline')).toString('utf8').split('\0').filter(Boolean)
 if(args.length!==3||path.basename(args[0])!=='node'||
     args[1]!=='src/main.cjs'||args[2]!=='--production-start')
   reject('movement_process_identity_unavailable')
 const exe=fs.realpathSync(path.join(proc,'exe'))
 const nodeRoot=fs.realpathSync(path.join(home,'.local','share','alice-bedrock','node24'))
 if(!exe.startsWith(nodeRoot+path.sep))reject('movement_process_identity_unavailable')
 const cwd=fs.realpathSync(path.join(proc,'cwd'))
 const expected=fs.realpathSync(path.join(home,'minecraft-ai','bedrock-native','experiment'))
 const alternate=path.join(home,'.alice-bedrock-autonomy-state')
 const state=fs.existsSync(alternate)?fs.realpathSync(alternate):null
 if(cwd!==expected&&cwd!==state)reject('movement_process_identity_unavailable')
 const content=fs.readFileSync(path.join(proc,'stat'),'utf8')
 const end=content.lastIndexOf(')')
 const tail=end>0?content.slice(end+1).trim().split(/\s+/):[]
 const token=tail[19]
 if(!token||!/^[0-9]+$/.test(token))reject('movement_process_identity_unavailable')
 return {pid:owner.pid,token,now}
}
function liveSnapshots({controlRoot=guardRoot,procRoot='/proc',now=Date.now()}={}){
 const owner=liveOwner({controlRoot,procRoot,now})
 const statusFile=path.join(controlRoot,'status.json')
 const wireFile=path.join(controlRoot,'outbound-input-audit.json')
 const st=privateFile(statusFile,8192),wt=privateFile(wireFile,2048)
 const core=JSON.parse(fs.readFileSync(statusFile,'utf8'))
 const wire=JSON.parse(fs.readFileSync(wireFile,'utf8'))
 const fresh=(at,seconds)=>Number.isFinite(at)&&at<=now&&now-at<=seconds
 if(core?.producerPid!==owner.pid||core?.producerStartToken!==owner.token)
   reject('movement_process_identity_mismatch')
 if(!fresh(st.mtimeMs,15000)||!fresh(wt.mtimeMs,15000)||
    wire?.version!==1||wire?.kind!=='queue_only_not_network_or_BDS_proof'||
    !fresh(wire.updatedAt,15000))
   reject('movement_report_stale')
 if(Math.abs(wire.updatedAt-st.mtimeMs)>15000)
   reject('movement_report_stale')
 return {core,wire,now}
}
function main(){
try{
 const {core,wire,now}=liveSnapshots()
 if(!core||!wire)throw Error('movement_report_files_missing')
 const m=core.movementEvidence||{}

 const feet=(v)=>v&&[v.x,v.y,v.z].every(Number.isFinite)?v:null
 const client=feet(core.position),bds=feet(m.latestFeet),login=feet(m.loginFeet)
 const distance=(a,b)=>a&&b?Math.round(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*100)/100:null
 const serverTravel=Number.isFinite(m.travelBlocks)?m.travelBlocks:null
 const fresh=Number.isFinite(m.lastAt)&&now-m.lastAt>=0&&now-m.lastAt<=5000
 const accepted=core.connected===true&&core.sessionEstablished===true&&core.world==='Bedrock level'&&core.serverPort===17879&&m.lastSource==='bds_querytarget'&&fresh&&m.independentSamples>=2
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
}
if(require.main===module)main()
module.exports={liveOwner,liveSnapshots}
