'use strict'
// Original AliceBedrockRuntime methods extracted without behavior changes.
// The original Alice instance remains sole owner of tasks, safety and witnesses.
function createFollowRuntimeMethods({createResponsiveFollowGoal,observedLineOfSight,followProximity,safeFollowStep,THREAT_CLEAR_MS,LAST_SEEN_MS}){
  return {
  stopDirectFollow(reason='cancelled'){
    if(!this.directFollowActive)return
    this.directFollowActive=false
    if(this.directFollowTimer){clearTimeout(this.directFollowTimer);this.directFollowTimer=null}
    // Only clear this controller's own forward intent. Do not touch newer
    // SURVIVE/FOLLOW control after they take the body.
    try{this.bot.setControlState?.('forward',false)}catch{}
    this.log.log('[Alice movement] short follow recovery stopped:',reason)
  },
  async tryShortFollow(target,radius){
    if(this.directFollowActive||this.clock()<this.directFollowNextAt)return false
    if(this.job||this.threat()||this.safetyBusy||this.bot.health<16||!this.core.hasFollowIntent()||
       typeof this.bot.setControlState!=='function'||typeof this.bot.look!=='function')return false
    const candidate=safeFollowStep(this.bot,target,{radius})
    if(!candidate.ok){
      this.directFollowNextAt=this.clock()+12000
      this.log.log('[Alice movement] noPath direct recovery unavailable:',candidate.reason)
      return false
    }
    this.directFollowNextAt=this.clock()+16000
    const checkpoint=this.movementEvidence?.checkpoint?.()||null
    const start=this.bot.entity.position.clone?.()||{...this.bot.entity.position}
    const epoch=this.epoch
    try{
      // Release only the failed A* path before controlling the Bedrock input
      // lane. The pinned fork transmits player_auth_input from setControlState.
      this.bot.pathfinder.setGoal(null)
      await this.bot.look(candidate.yaw,0,true)
      if(this.epoch!==epoch||!this.core.hasFollowIntent()||this.threat()||this.job)return false
      this.directFollowActive=true
      this.bot.setControlState('forward',true)
      this.directFollowTimer=setTimeout(()=>{
        if(!this.directFollowActive)return
        this.stopDirectFollow('bounded_400ms_finished')
        const evidence=this.movementEvidence?.progress?.(checkpoint)||
          {confirmed:false,reason:'server_position_not_observed'}
        const local=Math.hypot(
          this.bot.entity.position.x-start.x,this.bot.entity.position.y-start.y,this.bot.entity.position.z-start.z)
        this.log.log('[Alice movement] short follow recovery result:',JSON.stringify({
          attempted:true,stepLimit:candidate.stepBlocks,
          localEstimateBlocks:Number.isFinite(local)?Math.round(local*100)/100:null,
          serverEvidence:evidence,source:'bedrock_server_packets_only_if_observed'
        }))
        if(!evidence.confirmed)this.directFollowNextAt=Math.max(this.directFollowNextAt,this.clock()+30000)
      },400)
      this.directFollowTimer.unref?.()
      this.log.log('[Alice movement] short noPath follow input started:',JSON.stringify({
        stepLimit:candidate.stepBlocks,sampledBlocks:candidate.sampled,
        serverEvidenceRequired:true}))
      return true
    }catch(e){
      this.stopDirectFollow('input_error')
      this.log.warn('[Alice movement] short follow recovery unavailable:',String(e.message).slice(0,90))
      return false
    }
  },
  async followTick(){
    this.refreshBehavior()
    const danger=this.threat()
    const escort=this.escortDecision(danger)
    if(!this.ready()||this.bot.isSleeping||this.job||this.safetyBusy||
      (danger&&!escort.allowFollow)||(this.bot.health<14&&!escort.allowFollow)||
      (['SURVIVE','COMBAT','GUARD'].includes(this.core.state)&&!escort.allowFollow)||
      (this.lastSafetyAt>0&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS&&
       (!danger||!escort.allowFollow)))return
    if(!this.core.hasFollowIntent()){
      if(this.followGoal){this.bot.pathfinder.setGoal(null);this.followGoal=null}
      return
    }
    const player=this.core.intent?.data?.playerName
    const entity=this.visiblePlayer(player)
    const dimension=String(this.bot.game?.dimension??'unknown')
    if(!entity){
      const last=this.lastSeenPlayer
      const fresh=last&&last.name===player&&last.dimension===dimension&&
        this.clock()-last.at>=0&&this.clock()-last.at<=LAST_SEEN_MS
      const p=fresh?last.position:null
      // Paper tracks a last-seen waypoint for 30s, NEVER an imagined distant position.
      const far=p&&this.bot.entity.position.distanceTo(p)>6
      if(far){
        const goalKey=player+'@last_seen'
        if(this.followGoal!==goalKey&&this.api.GoalNear){
          this.configureMovement()
          if(this.bot.pathfinder.setGoal(new this.api.GoalNear(p.x,p.y,p.z,5),false)===false){
            this.followGoal=null
            return
          }
          this.followGoal=goalKey
          this.log.log('[Alice follow] player out of entity range; going only to observed last-seen waypoint',player)
        }
      }else if(this.followGoal){this.bot.pathfinder.setGoal(null);this.followGoal=null}
      if(!fresh&&this.clock()-this.lastTargetLostAt>10000){
        this.lastTargetLostAt=this.clock()
        this.log.warn('[Alice follow] target not visible, no fresh same-dimension waypoint; holding safely',player)
      }
      return
    }
    this.lastSeenPlayer={name:player,position:entity.position.clone?.()||{...entity.position},
      dimension,at:this.clock()}
    if(this.followProgress.onHold(this.clock()))return
    let visible=null
    try{visible=typeof this.bot.canSeeEntity==='function'?this.bot.canSeeEntity(entity):null}
    catch(e){this.log.warn('[Alice follow] sight unavailable:',String(e.message).slice(0,80))}
    // The Bedrock adapter may not expose entity visibility. Read-only world
    // samples detect a known wooden wall and shorten range to reach the door.
    const worldSight=observedLineOfSight(this.bot,entity)
    if(worldSight===false)visible=false
    else if(visible==null)visible=worldSight
    const wantedRadius=visible===false?this.liveBehavior.settings.occludedDistance:this.liveBehavior.settings.followDistance
    if((visible===false)!==this.lastSightBlocked){
      this.lastSightBlocked=visible===false
      this.log.log('[Alice follow] target visual contact:',this.lastSightBlocked?'occluded':'visible_or_unconfirmed',
        'desiredRadius:',wantedRadius)
    }
    // Actual foot distance controls arrival, not floored Pathfinder nodes.
    // A player on a different floor still needs a collision-safe route.
    const proximity=followProximity(this.bot.entity?.position,entity.position,wantedRadius)
    if(proximity.inside){
      if(this.followGoal){
        this.bot.pathfinder.setGoal(null)
        this.followGoal=null
        this.followProgress.reset()
      }
      if(this.directFollowActive)this.stopDirectFollow('owner_inside_follow_radius')
      // Looking never authorizes movement, combat or interacting with a block.
      if(visible===true&&typeof this.bot.lookAt==='function'&&
         typeof entity.position.offset==='function'&&
         this.clock()-this.lastFollowFaceAt>=1000){
        this.lastFollowFaceAt=this.clock()
        try{await this.bot.lookAt(entity.position.offset(0,1.4,0),true)}
        catch{this.log.warn('[Alice follow] owner look unavailable')}
      }
      return
    }
    this.followProgress.safeRadius=wantedRadius
    const changed=this.followGoal===player&&this.followGoalRadius!==wantedRadius&&
      (this.followSettingsDirty||this.clock()-this.lastFollowRadiusChange>5000)
    if(changed){
      this.followGoalRadius=wantedRadius;this.lastFollowRadiusChange=this.clock()
      this.followSettingsDirty=false
      this.configureMovement()
      if(this.bot.pathfinder.setGoal(createResponsiveFollowGoal(this.api.GoalFollow,entity,wantedRadius),true)===false){
        this.followGoal=null
        return
      }
      this.log.log('[Alice follow] visibility range:',wantedRadius,'sighted:',visible)
    }
    if(this.followGoal===player){
      if(this.directFollowActive)return
      if(this.followProgress.lastPathStatus==='noPath'){
        const stepStarted=await this.tryShortFollow(entity,wantedRadius)
        // An asynchronous Bedrock look may yield to a new human command or
        // emergency safety controller. Do not resume the obsolete follow goal.
        if(stepStarted||!this.core.hasFollowIntent()||this.job||this.safetyBusy||
           (this.core.state==='SURVIVE'&&!this.escortDecision().allowFollow)||
           (this.threat()&&!this.escortDecision().allowFollow))return
      }
      const pathMoving=this.bot.pathfinder.isMoving?.()??null
      const result=this.followProgress.observe({name:player,now:this.clock(),
        self:this.bot.entity.position,target:entity.position,pathMoving})
      if(result.observation){
        const control=this.followInputObservation.take()
        const delta=this.bot.entity.position
        const owner=entity.position
        const elevation=Math.round((owner.y-delta.y)*100)/100
        this.log.log('[Alice follow] movement observation:',JSON.stringify({...result.observation,
          pathMoving:pathMoving??'unknown',targetDeltaY:elevation,
          horizontalDistance:Math.round(Math.hypot(owner.x-delta.x,owner.z-delta.z)*100)/100,
          selfOnGround:this.bot.entity.onGround??null,
          ...control}))
        if(result.observation.stalledWindows>0)
          this.log.warn('[Alice follow] outside follow radius without valid progress:',
            JSON.stringify({distance:result.observation.localDistanceToTarget,
              wantedRadius:this.followProgress.safeRadius,
              pathMoving:pathMoving??'unknown',
              falseGoalSuccess:result.observation.falseGoalSuccess,
              targetDeltaY:elevation,
              jumpEdges:control.jumpEdges,forwardPressedTicks:control.forwardPressedTicks,
              physicsSamples:control.physicsSamples}))
      }
      if(result.action==='repath'){
        // Paper-like, non-destructive recovery. Never blind-jump or dig buildings.
        this.log.warn('[Alice follow] non-destructive re-path to visible player; status=',this.followProgress.lastPathStatus)
        this.configureMovement()
        if(this.bot.pathfinder.setGoal(createResponsiveFollowGoal(this.api.GoalFollow,entity,wantedRadius),true)===false){
          this.followGoal=null
          return
        }
      }else if(result.action==='hold'){
        this.bot.pathfinder.setGoal(null)
        this.followGoal=null
        this.log.warn('[Alice follow] repeated no progress; holding 20s, player can come closer; no block destruction')
      }
      return
    }
    this.configureMovement()
    if(this.bot.pathfinder.setGoal(createResponsiveFollowGoal(this.api.GoalFollow,entity,wantedRadius),true)===false){
      this.followGoal=null
      return
    }
    this.followGoal=player;this.followGoalRadius=wantedRadius;this.followSettingsDirty=false;this.followPosition=this.bot.entity.position.clone();this.lastFollowReportAt=this.clock()
    this.followProgress.reset(player,this.bot.entity.position,entity.position,this.clock())
    this.log.log('[Alice follow] active target',player,'(movement needs server position validation)')
  },
  }
}
module.exports={createFollowRuntimeMethods}
