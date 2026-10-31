'use strict'
// Live settings/status exchange with the Mac Alice Dashboard over Mint's
// existing SSH transport. No HTTP listener, arbitrary action dispatch,
// Minecraft packet injection or modification of Xbox/world/learning files.
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const DEFAULTS=Object.freeze({followDistance:3,occludedDistance:4,autonomyEnabled:true,agentMode:'companion'})
const rootDefault=()=>path.join(os.homedir(),'.alice-bedrock-control')
function validate(settings){
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||
      !['autonomyEnabled,followDistance,occludedDistance','agentMode,autonomyEnabled,followDistance,occludedDistance'].includes(Object.keys(settings).sort().join(',')))
    throw Error('Invalid Alice dashboard settings keys')
  for(const k of ['followDistance','occludedDistance']){
    if(!Number.isInteger(settings[k])||settings[k]<2||settings[k]>12)
      throw Error('Invalid Alice dashboard '+k)
  }
  if(typeof settings.autonomyEnabled!=='boolean')
    throw Error('Invalid Alice dashboard autonomyEnabled')
  if(settings.agentMode!==undefined&&!['companion','autonomous'].includes(settings.agentMode))
    throw Error('Invalid Alice dashboard agentMode')
  return {...DEFAULTS,...settings}
}
function safeRead(file){
  let st
  try{st=fs.lstatSync(file)}catch(err){if(err.code==='ENOENT')return null;throw err}
  if(!st.isFile()||st.isSymbolicLink()||st.size>4096)throw Error('Unsafe Alice control file')
  return JSON.parse(fs.readFileSync(file,'utf8'))
}
class LiveSettings {
  constructor({root=rootDefault(),log=console}={}){this.root=root;this.log=log;this.current={revision:0,settings:{...DEFAULTS}};this.lastError=null}
  read(){
    try{
      const obj=safeRead(path.join(this.root,'settings.json'))
      if(obj!==null){
        if(!obj||!Number.isSafeInteger(obj.revision)||obj.revision<0)throw Error('Invalid Alice settings revision')
        validate(obj.settings)
        // Do not regress to a stale revision after another writer updates it.
        if(obj.revision>=this.current.revision)
          this.current={revision:obj.revision,settings:validate(obj.settings)}
      }
      this.lastError=null
    }catch(err){
      if(this.lastError!==err.message)this.log.warn('[Alice control] retaining last valid settings:',err.message)
      this.lastError=err.message
    }
    return this.current
  }
}
// The Mac SSH control reader enforces a hard 4 KiB limit. Large read-only
// terrain surveys must not prevent fresh online/position/safety heartbeats.
const STATUS_MAX_BYTES=4096
function compactStatus(state){
  const data={...state,updatedAt:Date.now()}
  const encode=()=>JSON.stringify(data)
  if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  data.statusCompacted=true
  const diag=data.followDiagnostic
  if(diag?.footprint){
    const short=b=>b&&{state:b.state,name:b.name,solid:b.solid}
    data.followDiagnostic={...diag,footprint:diag.footprint.slice(0,5).map(c=>({
      direction:c.direction,below:short(c.below),feet:short(c.feet),
      head:short(c.head),supported:c.supported,uncertain:c.uncertain
    }))}
  }
  const world=data.worldRoutine
  if(world?.escapeSurvey){
    const s=world.escapeSurvey,d=s.door,a=d?.approach
    const action=v=>v&&{reason:String(v.reason||'').slice(0,80),
      attempted:v.attempted===true,serverMovementVerified:v.serverMovementVerified===true}
    data.worldRoutine={...world,escapeSurvey:{
      status:s.status,reason:s.reason,center:s.center,
      reachableCells:s.reachableCells,unknownCells:s.unknownCells,
      blockedCells:s.blockedCells,openFrontier:s.openFrontier,
      door:d&&{position:d.position,kind:d.kind,permitted:d.permitted,
        ...(d.openState?{openState:d.openState}:{}),
        approach:a&&{position:a.position,steps:a.steps,elevationChanges:a.elevationChanges,
          routeComplete:a.routeComplete,serverVerified:a.serverVerified,
          waypoints:Array.isArray(a.waypoints)?a.waypoints.slice(0,6):[]}},
      vertical:s.vertical&&{position:s.vertical.position,kind:s.vertical.kind},
      obstacle:s.obstacle&&{position:s.obstacle.position,block:s.obstacle.block},
      doorAction:action(s.doorAction),passageAction:action(s.passageAction)
    }}
  }
  if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  if(data.followDiagnostic?.footprint){
    const {footprint,...summary}=data.followDiagnostic
    data.followDiagnostic=summary
  }
  if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  if(data.longTermGoal){
    const g=data.longTermGoal
    data.longTermGoal={goal:g.goal,step:g.step,phase:g.phase,
      reason:g.reason,revision:g.revision,nextReviewAt:g.nextReviewAt}
  }
  if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  if(data.worldRoutine){
    const w=data.worldRoutine
    data.worldRoutine={phase:w.phase,tick:w.tick,weather:w.weather,
      idleGate:w.idleGate,safeToExplore:w.safeToExplore,decision:w.decision,
      cooldowns:w.cooldowns,escapeSurvey:w.escapeSurvey,
      explorationProgress:w.explorationProgress,
      resourceOpportunity:w.resourceOpportunity,
      shelterOpportunity:w.shelterOpportunity,
      idleHold:w.idleHold,nightSurvival:w.nightSurvival,
      sleepOpportunity:w.sleepOpportunity,
      rememberedBeds:w.rememberedBeds,
      homeBed:w.homeBed&&{status:w.homeBed.status,bed:w.homeBed.bed},
      lastSpawnpointAttempt:w.lastSpawnpointAttempt&&{
        reason:w.lastSpawnpointAttempt.reason,
        attempted:w.lastSpawnpointAttempt.attempted===true,
        at:w.lastSpawnpointAttempt.at},
      homeBase:w.homeBase&&{status:w.homeBase.status,bed:w.homeBase.bed,
        door:w.homeBase.door,exitVerified:w.homeBase.exitVerified===true,
        returnVerified:w.homeBase.returnVerified===true,
        lastSurvey:w.homeBase.lastSurvey,lastReason:w.homeBase.lastReason},
      homeAgenda:w.homeAgenda&&{phase:w.homeAgenda.phase,
        objective:w.homeAgenda.objective,reason:w.homeAgenda.reason,
        returnRouteVerified:false},
      terrainAdaptation:w.terrainAdaptation,
      verticalSafety:w.verticalSafety&&{active:w.verticalSafety.active,
        remainingSeconds:w.verticalSafety.remainingSeconds,
        lastIncident:w.verticalSafety.lastIncident&&{
          dropBlocks:w.verticalSafety.lastIncident.dropBlocks,
          toY:w.verticalSafety.lastIncident.toY,
          reason:w.verticalSafety.lastIncident.reason}},
      voxelNavigation:w.voxelNavigation&&{status:w.voxelNavigation.status,
        reason:w.voxelNavigation.reason,center:w.voxelNavigation.center,
        reachableCells:w.voxelNavigation.reachableCells,
        candidate:w.voxelNavigation.candidate}}
  }
  if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  // Preserve actionable diagnostic reason and core model status; full raw
  // observations remain in the bounded Mint logs.
  if(data.worldRoutine){
    const w=data.worldRoutine,d=w.escapeSurvey?.door
    data.worldRoutine={phase:w.phase,tick:w.tick,weather:w.weather,
      idleGate:w.idleGate,decision:w.decision,idleHold:w.idleHold,nightSurvival:w.nightSurvival,
      sleepOpportunity:w.sleepOpportunity,
      rememberedBeds:w.rememberedBeds,
      homeBed:w.homeBed&&{status:w.homeBed.status,bed:w.homeBed.bed},
      lastSpawnpointAttempt:w.lastSpawnpointAttempt&&{
        reason:w.lastSpawnpointAttempt.reason},
      homeBase:w.homeBase&&{status:w.homeBase.status,bed:w.homeBase.bed,
        door:w.homeBase.door,returnVerified:false,
        lastSurvey:w.homeBase.lastSurvey,lastReason:w.homeBase.lastReason},
      homeAgenda:w.homeAgenda&&{objective:w.homeAgenda.objective,
        reason:w.homeAgenda.reason,returnRouteVerified:false},
      shelterOpportunity:w.shelterOpportunity&&{status:w.shelterOpportunity.status,
        reason:w.shelterOpportunity.reason,remaining:w.shelterOpportunity.remaining,
        material:w.shelterOpportunity.material,
        positionProof:w.shelterOpportunity.positionProof},
      terrainAdaptation:w.terrainAdaptation,escapeSurvey:w.escapeSurvey&&{
        status:w.escapeSurvey.status,reason:w.escapeSurvey.reason,
        door:d&&{position:d.position,openState:d.openState,
          approach:d.approach&&{steps:d.approach.steps,
            elevationChanges:d.approach.elevationChanges,position:d.approach.position}}},
      voxelNavigation:w.voxelNavigation&&{status:w.voxelNavigation.status,
        reason:w.voxelNavigation.reason,center:w.voxelNavigation.center,
        candidate:w.voxelNavigation.candidate&&{
          steps:w.voxelNavigation.candidate.steps,
          actions:w.voxelNavigation.candidate.actions}}}
  }
  if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  // Optional outbound queue audit must never prevent fresh Alice heartbeat.
  // Retain connected/position/server witness/health even under 4 KiB pressure.
  if(data.outboundInput){
    delete data.outboundInput
    if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  }
  // New optional learning/timing must not displace essential heartbeat fields.
  if(data.deathLearning?.repeatedThreats?.length){
    const m=data.deathLearning
    data.deathLearning={observedDeaths:m.observedDeaths,
      lastDeathAt:m.lastDeathAt,lastConclusion:m.lastConclusion,
      nearbyMob:m.nearbyMob,verifiedCause:false,
      repeatedThreats:m.repeatedThreats.slice(0,1)}
    if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  }
  if(data.currentJobTiming){
    delete data.currentJobTiming
    if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  }
  // New observability is helpful, never allowed to break the 2-second
  // essential status heartbeat if the client has a large world view.
  if(data.equipment||data.escort){
    delete data.equipment
    delete data.escort
    if(Buffer.byteLength(encode())<=STATUS_MAX_BYTES)return encode()
  }
  throw Error('Alice essential status too large')
}
class LiveStatus {
  constructor({root=rootDefault(),log=console}={}){this.root=root;this.log=log}
  publish(state){
    try{
      if(fs.existsSync(this.root)&&fs.lstatSync(this.root).isSymbolicLink())throw Error('Unsafe Alice control root')
      fs.mkdirSync(this.root,{recursive:true,mode:0o700})
      const output=path.join(this.root,'status.json')
      if(fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw Error('Unsafe Alice status file')
      const data=compactStatus(state)
      const tmp=path.join(this.root,'.status-'+process.pid+'.tmp')
      fs.writeFileSync(tmp,data,{encoding:'utf8',mode:0o600,flag:'w'})
      fs.renameSync(tmp,output)
    }catch(err){this.log.warn('[Alice control] status write failed:',err.message)}
  }
}
module.exports={DEFAULTS,LiveSettings,LiveStatus,validate,rootDefault,compactStatus}
