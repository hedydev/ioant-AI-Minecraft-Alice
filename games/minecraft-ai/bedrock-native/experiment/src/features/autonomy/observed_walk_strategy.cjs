'use strict'
// Deterministic, already-observed navigation is owned by the existing runtime,
// not by model latency. No new timer, movement primitive or evidence authority.
function createObservedWalkStrategy({environment,selectSafeWalkingCandidate,scoutStartProof,HOSTILES}){
 return function tryObservedWalk({initialSafeWalk,candidate,decision,voxel,
   allowVertical=false,reason='fresh_observed_walk_before_model'}={}){
  const supported=candidate?.kind==='observed_voxel_walking_only'||
   allowVertical&&candidate?.kind==='observed_one_cell_vertical'
  if(!initialSafeWalk||candidate?.ok!==true||!supported||
     !['WORK','OBSERVE','SCOUT'].includes(decision?.action))return false
  if(decision.action==='SCOUT'&&decision.candidate?.key!==candidate.key)return false
  if(this.closed||!this.ready()||this.job||this.safetyBusy||this.threat()||
     this.bot.health<16||this.bot.isSleeping||this.verticalWatch.active()||
     this.core.state!=='IDLE'||this.core.hasFollowIntent()||
     this.goalPlanner.stoppedByHuman||!this.liveBehavior.settings.autonomyEnabled||
     this.liveBehavior.settings.agentMode!=='autonomous'||
     environment(this.bot).safeToExplore!==true)return false
  const fresh=candidate.kind==='observed_one_cell_vertical'?
   {candidate:this.verifyVerticalTransition(candidate)?candidate:null}:
   selectSafeWalkingCandidate(voxel,{
    hostiles:Object.values(this.bot.entities||{})
     .filter(e=>HOSTILES.has(e?.name)&&e.position).map(e=>e.position),
    blocked:new Set([...this.failureMemory.activeRoutes(),...this.explorationProgress.excluded()]),
    visited:this.scoutVisited,origin:this.bot.entity?.position})
  if(fresh.candidate?.key!==candidate.key){
   // A route rejected during revalidation must end this decision. Do not
   // fall through to a stale model/earthwork/resource decision.
   this.log.log('[Alice exploration] flat route selection:',JSON.stringify({
    reason:'flat_route_changed_before_dispatch',checkedRoutes:fresh.checkedRoutes,
    threatRoutes:fresh.threatRoutes}))
   return true
  }
  if(!this.planner?.url)this.goalPlanner.goalSource='fixed-safety'
  this.log.log('[Alice autonomy] deterministic observed skill:',
   JSON.stringify({action:'SCOUT',reason,serverMovementVerified:false}))
  // startJob rechecks independent position, current owner/epoch and all
  // physical admission. A selected route is never server-confirmed progress.
  this.startJob('EXPLORE','自主探索',signal=>this.boundedScout(candidate,signal),{
   label:'独立探索已验证的短平路',announce:false,scoutCandidate:candidate})
  if(this.job?.type!=='EXPLORE'&&
     scoutStartProof(this.bot,this.movementEvidence,this.clock).reason===
       'scout_bds_position_unavailable')
   this.prepareDeferredScout(candidate,'自主探索')
  return true
 }
}
module.exports={createObservedWalkStrategy}
