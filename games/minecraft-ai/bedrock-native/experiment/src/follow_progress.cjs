'use strict'
// Pure diagnostic/recovery decision layer for Paper-style FOLLOW on Bedrock.
// Never issues commands; the runtime alone controls Pathfinder and safety.
const finitePos=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
const copy=p=>({x:p.x,y:p.y,z:p.z})
const round=n=>Math.round(n*100)/100
class FollowProgress {
  constructor({safeRadius=3,reportInterval=6500,retryCooldown=15000,holdDuration=20000}={}) {
    this.safeRadius=safeRadius;this.reportInterval=reportInterval
    this.retryCooldown=retryCooldown;this.holdDuration=holdDuration
    this.reset()
  }
  reset(name=null,self=null,target=null,now=0){
    this.name=name;this.self=finitePos(self)?copy(self):null
    this.target=finitePos(target)?copy(target):null
    this.distance=this.self&&this.target?dist(this.self,this.target):null
    this.lastAt=now;this.stalledWindows=0;this.retries=0;this.nextRetryAt=0;this.pauseUntil=0
    this.lastPathStatus='unknown';this.lastPathLength=0
  }
  pathUpdate(result){
    const status=String(result?.status??'unknown')
    this.lastPathStatus=/^[a-zA-Z_]{1,32}$/.test(status)?status:'unknown'
    this.lastPathLength=Array.isArray(result?.path)?result.path.length:0
    return {status:this.lastPathStatus,pathLength:this.lastPathLength}
  }
  onHold(now){return now<this.pauseUntil}
  observe({name,now,self,target,pathMoving=null}) {
    if(!finitePos(self)||!finitePos(target))return {action:null,observation:null}
    if(this.name!==name||!this.self||!this.target){this.reset(name,self,target,now);return {action:null,observation:null}}
    if(now-this.lastAt<this.reportInterval)return {action:null,observation:null}
    const moved=dist(this.self,self),targetMoved=dist(this.target,target)
    const distance=dist(self,target),closing=this.distance-distance
    const withinFollowRadius=distance<=this.safeRadius
    // A 2-block extra dead-zone made repeated 4.15-block FOLLOW failures
    // invisible with the usual 3-block radius. The pathfinder can also
    // report "success" and isMoving=false after ending on a rounded block
    // coordinate, while the actual target remains outside the desired radius.
    const outside=distance>this.safeRadius+0.2
    const falseGoalSuccess=outside&&pathMoving===false&&
      this.lastPathStatus==='success'
    const isStalled=outside&&(falseGoalSuccess||
      moved<0.45||(targetMoved<1&&closing<0.2))
    this.stalledWindows=isStalled?this.stalledWindows+1:0
    if(withinFollowRadius||closing>0.5)this.retries=0
    const observation={target:name,localMovedBlocks:round(moved),localDistanceToTarget:round(distance),
      targetMovedBlocks:round(targetMoved),closingBlocks:round(closing),withinFollowRadius,
      pathStatus:this.lastPathStatus,pathNodes:this.lastPathLength,
      pathMoving:pathMoving===false?false:pathMoving===true?true:null,
      falseGoalSuccess,stalledWindows:this.stalledWindows,
      source:'mineflayer_local_estimate_not_server_confirmed'}
    this.self=copy(self);this.target=copy(target);this.distance=distance;this.lastAt=now
    if(this.stalledWindows>=2&&now>=this.nextRetryAt){
      this.stalledWindows=0
      this.nextRetryAt=now+this.retryCooldown
      this.retries++
      if(this.retries<=2)return {action:'repath',observation}
      this.retries=0;this.pauseUntil=now+this.holdDuration
      return {action:'hold',observation}
    }
    return {action:null,observation}
  }
}
module.exports={FollowProgress}