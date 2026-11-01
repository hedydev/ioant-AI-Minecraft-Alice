'use strict'
// Finite observation of EXISTING files only. No BDS query, input, process
// control or model call. Catch the four-second evidence window without SSH
// timing becoming the measurement. Actual server ticks remain uncorrelated.
const {liveSnapshots}=require('./inspect_movement_sync.cjs')
const {summarizeReconciliation}=require('./inspect_reconciliation_runtime.cjs')
const MAX_SECONDS=210,MAX_WINDOWS=6
async function observe({snapshot=liveSnapshots,seconds=MAX_SECONDS,
  clock=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(!Number.isInteger(seconds)||seconds<1||seconds>MAX_SECONDS)throw Error('invalid_observation_duration')
  const started=clock(),windows=new Map()
  let identity=null,firstCounters=null,lastCounters=null
  const report={audit:'ALICE_RECONCILIATION_FINITE_OBSERVATION',schemaVersion:1,
    readOnly:true,bdsCommandSent:false,clientRestarted:false,worldModified:false,
    state:'no_fresh_samples',ownerPid:null,elapsedMs:0,observations:0,
    telemetryPresent:false,comparisonReasons:{},windows:[],firstCounters:null,lastCounters:null}
  const counters=r=>Object.fromEntries(['correctionReplays','replayedFrames',
    'correctionFallbacks','correctionsRejected','historyFrames'].map(k=>[k,r[k]]))
  while(clock()-started<seconds*1000){
    let data
    try{data=snapshot()}catch{report.state='snapshot_unavailable';break}
    const core=data.core
    if(!core||!Number.isSafeInteger(core.producerPid)||core.producerPid<=1||
      typeof core.producerStartToken!=='string'||core.world!=='Bedrock level'||
      core.serverPort!==17879||core.connected!==true||core.sessionEstablished!==true){
      report.state='session_unverified';break
    }
    const current=core.producerPid+':'+core.producerStartToken
    if(identity!==null&&current!==identity){report.state='owner_changed';break}
    identity=current;report.ownerPid=core.producerPid
    const r=summarizeReconciliation(data)
    report.observations++
    report.telemetryPresent=r.telemetryPresent
    if(r.telemetryPresent){firstCounters??=counters(r);lastCounters=counters(r)}
    report.comparisonReasons[r.coordinateComparison]=(report.comparisonReasons[r.coordinateComparison]||0)+1
    if(r.coordinateComparison==='fresh_relative_sample'&&r.clientBdsDistance!==null){
      const sample=core.movementEvidence.independentAt
      if(!windows.has(sample)&&windows.size<MAX_WINDOWS)windows.set(sample,{
        firstObservedAfterMs:Math.round(clock()-started),observations:0,
        minDistance:r.clientBdsDistance,maxDistance:r.clientBdsDistance,
        lastDistance:r.clientBdsDistance,bdsPairTravel:r.bdsPairTravel,
        idleOnly:true,movementInputsObserved:false,maxSampleSkewMs:0})
      const w=windows.get(sample)
      if(w){
        w.observations++;w.minDistance=Math.min(w.minDistance,r.clientBdsDistance)
        w.maxDistance=Math.max(w.maxDistance,r.clientBdsDistance)
        w.lastDistance=r.clientBdsDistance
        w.idleOnly=w.idleOnly&&core.state==='IDLE'&&core.job==null
        w.movementInputsObserved=w.movementInputsObserved||data.wire.currentMovingRun>0
        w.maxSampleSkewMs=Math.max(w.maxSampleSkewMs,r.comparisonSkewMs)
      }
    }
    await sleep(250)
  }
  report.elapsedMs=Math.round(clock()-started)
  report.windows=[...windows.values()];report.firstCounters=firstCounters;report.lastCounters=lastCounters
  if(report.state==='no_fresh_samples'&&windows.size)report.state='fresh_relative_samples_observed'
  return report
}
if(require.main===module){
  if(process.argv.slice(2).join(' ')!=='--observe')throw Error('usage: --observe')
  observe().then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(()=>{process.exitCode=1})
}
module.exports={observe,MAX_SECONDS}
