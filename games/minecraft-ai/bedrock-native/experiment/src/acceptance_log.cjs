'use strict'
// Private, credential-free Alice behavior journal; no chat, auth packets or console dump.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const DEFAULT_ROOT=()=>path.join(os.homedir(),'.alice-bedrock-control','acceptance')
const ALLOWED=/^\[Alice (?:session|bed memory|voxel|follow|movement|autonomy|agent|goal|shelter|safety|sleep|night|drive|exploration|Bedrock|control|life|wood|mission|job|gather|equipment)\]/
const FIELDS=new Set(['goal','event','step','shelterOpportunity','remaining','blocksRequired','material','canBuildWithCurrentProof','serverPositionVerified','nearbyHostiles','worldModification','part','revision','createdAt','changedAt','verifiedWood','attempts','activeTask','at','lastCompleted','status','reason','serverDisconnectSeen','newBeds','knownBeds','nightSafetyReason','tool','trigger','kind','tactic','nextReviewMs','endpointExcluded','action','phase','result','ok','taskType','stage','elapsedMs','pathStatus','pathLength','pathNodes','reachableCells','unknownBlocks','center','blockers','candidate','steps','actions','target','distanceBlocks','attempted','serverMovementVerified','serverEvidenceReason','received','health','recentSelfDamage','elevationChanges','modelStatus','planningRequests','acceptedProposals','localEstimateBlocks','serverMovedBlocks','source','physicsTicks','pulses','localEstimateBlocks','firstWaypoint','failedWaypoint','probeWaypoint','selectedIndex','doorOpenObserved','lastAfter','before','localMovedBlocks','totalLocalEstimateBlocks','completedLocalWaypoints','bdsWitnessSamples','distanceToWaypoint','withinWaypoint','serverPositionSamples','flatCandidate','walkSelection','checkedRoutes','totalRoutes','threatRoutes','blockedRoutes','knownHostiles','deltaY','centerSupported','nearbySupported','positionEvidence','footprint','direction','below','feet','head','name','solid','supported','uncertain','blockReason','selfOnGround','targetVerticalGapForShortRecovery','selfFeet','playerFeet','x','y','z','type','distanceXZ','selfEyeHeight','pathMoving','falseGoalSuccess','targetDeltaY','horizontalDistance','wantedRadius','physicsSamples','jumpPressedTicks','jumpEdges','forwardPressedTicks','groundedTicks','inputTrust','stalledWindows','centerUncertain','nearbyUncertain','blockDataSupported','verticalSafety','lastIncident','active','remainingSeconds','dropBlocks','elapsedMs','fromY','toY','nearbyClimbable','holdSeconds','serverPositionPackets','positionTrust','onGround','deathsSinceTracking','durationMs','planningLatencyMs','observations','learnedRisk','repeatedRisk','strategy','verifiedCause','verifiedDamage','evidence','retreatReason','defenseReason','nextAttemptAfterMs','lastConclusion','nearbyMob','observedDeaths','lastDeathAt','repeatedThreats','deadSeconds','retrySent','serverReadyObserved','cycles','deathCountIsLifetime','trackingSince','respawnStatus','respawnPoint','key','outcome','entries','excludedEndpoints','confirmed','unverified','blocked','persistenceError','trust','explorationProgress','resourceOpportunity','treeVerified','inventoryWood','observedAt','verified','verifiedDelta','proof','retryAfterMs','candidates','candidateSteps','gain','firstWaypoint','verifiedCorridor','localMovedBlocks','idleHold','nextReviewAt','loginFeet','loginSource','clientFeet','serverCorrections','authority','sleepOpportunity','bedDiagnosis','diagnosis','sleepWindow','hostileNear','observedSleeping','selfSleepingFlag','bedOccupied','distance','bedPosition','afterMs','failedBedScoped','eligible','found','occupied','hostile','excluded','unknown','terrainAdaptation','vertical','earthwork','positionProof','worldModificationVerified','material','block'])
const finite=n=>typeof n==='number'&&Number.isFinite(n)
function filter(obj,depth=0){
  if(depth>5)return null
  if(finite(obj)||typeof obj==='boolean')return obj
  if(typeof obj==='string')return obj.length<=120&&/^[\p{L}\p{N} _.:,|()+/-]*$/u.test(obj)?obj:null
  if(Array.isArray(obj))return obj.slice(0,8).map(x=>filter(x,depth+1)).filter(x=>x!==null)
  if(obj&&typeof obj==='object'){
    const out={}
    for(const [key,value] of Object.entries(obj))if(FIELDS.has(key)){
      const v=filter(value,depth+1);if(v!==null)out[key]=v
    }
    return out
  }
  return null
}
function event(level,args){
  const kind=String(args?.[0]||'')
  if(!ALLOWED.test(kind)||kind.length>98||/[\r\n]/.test(kind))return null
  let detail={}
  for(const arg of args.slice(1))if(typeof arg==='string'&&arg.startsWith('{')&&arg.length<=8192){
    try{detail=filter(JSON.parse(arg))||{}}catch{}
    break
  }
  // Never log arbitrary raw text. Recognize only one fixed pathfinder failure.
  if(!Object.keys(detail).length&&kind==='[Alice safety] retreat:'&&
     args.slice(1).some(x=>x==='No path to the goal!'))
    detail={reason:'pathfinder_no_path'}
  return {kind:kind.trim(),level:level==='warn'||level==='error'?level:'info',detail}
}
const round=n=>finite(n)?Math.round(n*100)/100:null
function sample(status){
  const a=status?.agent||{},w=status?.worldRoutine||{},m=status?.movementEvidence||{}
  const p=status?.position,v=w.voxelNavigation||{}
  return {kind:'sample',connected:status?.connected===true,
    state:String(status?.state||'unknown').slice(0,24),jobActive:!!status?.job,
    followActive:!!status?.followTarget,followEnd:String(status?.lastFollowEnd?.reason||'').slice(0,40),
    clientFeet:p&&[p.x,p.y,p.z].every(finite)?{x:round(p.x),y:round(p.y),z:round(p.z)}:null,
    positionTrust:'local_prediction_not_server_proof',
    serverPackets:Number.isSafeInteger(m.received)?m.received:0,
    bdsWitnessSamples:Number.isSafeInteger(m.independentSamples)?m.independentSamples:0,
    authoritativeSamples:Number.isSafeInteger(m.authoritativeSamples)?m.authoritativeSamples:0,
    serverEvidenceSource:String(m.source||'unknown').slice(0,40),
    witnessStatus:String(m.witnessStatus||'unknown').slice(0,40),
    // This is an authoritative login location only, not a proof of walking.
    loginFeet:m.loginFeet&&[m.loginFeet.x,m.loginFeet.y,m.loginFeet.z].every(finite)?
      {x:round(m.loginFeet.x),y:round(m.loginFeet.y),z:round(m.loginFeet.z)}:null,
    loginSource:String(m.loginSource||'').slice(0,40),
    serverFeet:m.latestFeet&&[m.latestFeet.x,m.latestFeet.y,m.latestFeet.z].every(finite)?
      {x:round(m.latestFeet.x),y:round(m.latestFeet.y),z:round(m.latestFeet.z)}:null,
    health:round(status?.health),food:round(status?.food),
    mode:String(a.mode||'').slice(0,24),modelStatus:String(a.modelStatus||'').slice(0,32),
    planningRequests:Number.isSafeInteger(a.planningRequests)?a.planningRequests:0,
    acceptedProposals:Number.isSafeInteger(a.acceptedProposals)?a.acceptedProposals:0,
    life:filter(status?.life||null),
    deathLearning:filter(status?.deathLearning||null),
    currentJobTiming:filter(status?.currentJobTiming||null),
    continuousGoal:filter(status?.longTermGoal||null),
    explorationProgress:filter(w.explorationProgress||null),
    resourceOpportunity:filter(w.resourceOpportunity||null),
    shelterOpportunity:filter(w.shelterOpportunity||null),
    idleHold:filter(w.idleHold||null),
    nightSurvival:filter(w.nightSurvival||null),
    sleepOpportunity:filter(w.sleepOpportunity||null),
    terrainAdaptation:filter(w.terrainAdaptation||null),
    phase:String(w.phase||'').slice(0,24),
    verticalSafety:filter(w.verticalSafety||null),goal:String(w.decision?.goal||'').slice(0,56),
    decision:String(w.decision?.action||'').slice(0,32),
    followDiagnostic:status?.followDiagnostic?{
      pathStatus:String(status.followDiagnostic.pathStatus||'').slice(0,30),
      deltaY:round(status.followDiagnostic.deltaY),
      centerSupported:status.followDiagnostic.centerSupported===true,
      positionEvidence:String(status.followDiagnostic.positionEvidence||'').slice(0,48)
    }:null,
    voxel:filter({status:v.status,reason:v.reason,center:v.center,
      reachableCells:v.reachableCells,unknownBlocks:v.unknownBlocks,
      blockers:v.blockers,candidate:v.candidate,flatCandidate:v.flatCandidate,walkSelection:v.walkSelection})}
}
class AcceptanceJournal{
  constructor({root=DEFAULT_ROOT(),clock=Date.now,maxBytes=1048576,log=console}={}){
    this.root=root;this.clock=clock;this.maxBytes=Math.min(1048576,Math.max(4096,maxBytes))
    this.log=log;this.lastError=null
  }
  write(payload){
    if(!payload)return
    try{
      if(fs.lstatSync(this.root,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('unsafe_journal_root')
      fs.mkdirSync(this.root,{mode:0o700,recursive:true})
      const file=path.join(this.root,'events.jsonl'),st=fs.lstatSync(file,{throwIfNoEntry:false})
      if(st&&(!st.isFile()||st.isSymbolicLink()))throw Error('unsafe_journal_file')
      const bytes=Buffer.from(JSON.stringify({at:this.clock(),...payload})+'\n')
      if(bytes.length>4096)throw Error('journal_row_too_large')
      if((st?.size||0)+bytes.length>this.maxBytes){
        for(let n=1;n<=4;n++){
          const rotated=fs.lstatSync(path.join(this.root,'events.'+n+'.jsonl'),{throwIfNoEntry:false})
          if(rotated&&(!rotated.isFile()||rotated.isSymbolicLink()))throw Error('unsafe_rotation')
        }
        for(let n=3;n>=1;n--){
          const from=path.join(this.root,'events.'+n+'.jsonl')
          if(fs.existsSync(from))fs.renameSync(from,path.join(this.root,'events.'+(n+1)+'.jsonl'))
        }
        fs.renameSync(file,path.join(this.root,'events.1.jsonl'))
      }
      const fd=fs.openSync(file,fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_WRONLY|
        (fs.constants.O_NOFOLLOW||0),0o600)
      try{fs.writeSync(fd,bytes)}finally{fs.closeSync(fd)}
      this.lastError=null
    }catch(err){
      if(this.lastError!==err.message)this.log.warn('[Alice acceptance] journal unavailable:',err.message)
      this.lastError=err.message
    }
  }
  event(level,args){this.write(event(level,args))}
  sample(state){this.write(sample(state))}
}
module.exports={AcceptanceJournal,event,sample,filter}
