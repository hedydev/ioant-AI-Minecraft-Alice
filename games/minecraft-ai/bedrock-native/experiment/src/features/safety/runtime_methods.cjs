'use strict'
// Original AliceBedrockRuntime methods extracted without behavior changes.
// The original Alice instance remains sole owner of tasks, safety and witnesses.
function createSafetyRuntimeMethods({stationaryDefense,defenseDelay,observedHostileBarrier,escortAssessment,HOSTILES,THREAT_CLEAR_MS,ATTACK_UNCONFIRMED_MAX_MS,ATTACK_OUT_OF_RANGE_MS,attackKey}){
  return {
  threat(){
    if(!this.ready())return null
    const self=this.bot.entity.position
    const entities=Object.values(this.bot.entities||{})
    const mobs=entities.filter(e=>HOSTILES.has(e?.name)&&e?.position&&
      Number.isFinite(e.position.x)&&Number.isFinite(e.position.y)&&
      Number.isFinite(e.position.z)&&
      Math.hypot(e.position.x-self.x,e.position.y-self.y,e.position.z-self.z)<=18
    ).slice(0,24)
    const owner=this.core.intent?.data?.playerName||this.lastGuardedPlayer
    const namedOwner=this.visiblePlayer(owner)?.position
    // Autonomous survival may protect a genuine nearby player even without
    // a FOLLOW order. Only observed player entities qualify, never a name
    // from the player list without a synchronized location.
    const nearbyPlayers=Object.values(this.bot.players||{})
      .filter(p=>p?.entity?.position&&
        typeof p.entity.position.distanceTo==='function')
      .map(p=>p.entity.position)
      .filter(p=>p.distanceTo(self)<=12)
      .sort((a,b)=>a.distanceTo(self)-b.distanceTo(self))
    const protect=namedOwner?.distanceTo?.(self)<=12?namedOwner:
      nearbyPlayers[0]||null
    const projectiles=entities.filter(e=>e?.position&&e?.velocity&&
      ['arrow','spectral_arrow','trident','small_fireball','fireball',
        'wither_skull','shulker_bullet','thrown_potion'].includes(e?.name)
    ).slice(0,24)
    return this.hostileEngagement.select({
      hostiles:mobs,projectiles,selfPosition:self,ownerPosition:protect,
      lastSelfDamageAt:this.lastSelfDamageAt,
      health:this.bot.health,
      barrierFor:(mob,point,role)=>role==='owner'?
        observedHostileBarrier({
          entity:{position:point},blockAt:p=>this.bot.blockAt(p)
        },mob,{maxDistance:12}):
        observedHostileBarrier(this.bot,mob,{maxDistance:12})
    })
  },
  escortDecision(danger=this.threat(),{observeOwner=true}={}){
    const owner=this.core.intent?.data?.playerName
    const entity=this.core.hasFollowIntent?.()?this.visiblePlayer(owner):null
    const now=this.clock()
    const moving=entity&&observeOwner?this.ownerMotion.observe(entity.position,now):
      this.ownerMotion.lastMoveAt>-Infinity&&now-this.ownerMotion.lastMoveAt<=1800
    const recentHurt=this.lastSelfDamageAt>0&&now-this.lastSelfDamageAt<=6500
    const barrier=danger?.target?observedHostileBarrier(this.bot,danger.target):'unknown'
    const result=escortAssessment({hasIntent:!!entity&&this.core.hasFollowIntent(),
      health:this.bot.health,danger,barrier,ownerMoving:!!moving,
      recentSelfHurt:recentHurt,self:this.bot.entity?.position,target:danger?.target?.position})
    this.lastEscortDecision={reason:result.reason,allowFollow:result.allowFollow,
      barrier,ownerMoving:!!moving,at:now}
    return result
  },
  safetyTick(){
    if(!this.ready())return
    // A local 4+ block vertical displacement in <=12s may be an actual fall,
    // deliberate ladder travel, or a Bedrock physics correction. We cannot
    // distinguish those without independent server data, so only suspend
    // *autonomous* exploration and resurvey. Human orders and SURVIVE remain.
    const vertical=this.verticalWatch.observe(this.bot,{
      dimension:this.bot.game?.dimension,
      serverPacketCount:this.movementEvidence?.get?.()?.received||0})
    if(vertical){
      this.log.log('[Alice safety] vertical displacement observation:',
        JSON.stringify(vertical))
      this.nextIdleAt=Math.max(this.nextIdleAt,this.clock()+90000)
      this.lastVoxelKey=null
      this.goalPlanner.cancel('safety')
      if(this.job?.type==='EXPLORE'&&
         /^自主/.test(String(this.action?.source||''))){
        this.cancelActive('vertical_position_unverified')
        // cancelActive invalidates stale job epochs but does not by itself
        // transition Core out of EXPLORE (the old job finally is discarded).
        this.core.resumeIntent('vertical observation hold')
      }
    }
    const observedDanger=this.threat()
    const escort=this.escortDecision(observedDanger)
    const danger=escort.allowFollow?null:observedDanger
    const critical=this.bot.health<=8
    const lowHealthHold=this.bot.health<14&&!escort.allowFollow
    if(danger||critical||lowHealthHold)this.goalPlanner.cancel('safety')
    if(!danger&&this.job?.type==='RECOVER')return
    if(!danger&&!critical&&!lowHealthHold){
      // Do not bypass the 4.5-second cooldown when a hostile disappears.
      // Immediate escorted movement is allowed only with a positive ongoing
      // observation that the known danger is distant or behind a barrier.
      if(observedDanger&&escort.allowFollow&&this.core.hasFollowIntent()){
        this.lastSafetyAt=0;this.lastDanger=null
        if(['SURVIVE','COMBAT','GUARD'].includes(this.core.state))
          this.core.resumeIntent('escort past distant or blocked hostile')
        return
      }
      // Spatial threat boundaries are noisy: a single missing entity update or
      // 0.5m movement must not start another path while safety is intervening.
      if(this.lastSafetyAt&&this.clock()-this.lastSafetyAt<THREAT_CLEAR_MS)return
      if(this.lastSafetyAt&&['SURVIVE','GUARD','COMBAT'].includes(this.core.state)){
        this.lastSafetyAt=0;this.lastDanger=null;this.core.resumeIntent('threat absent for stable 4.5s')}
      return
    }
    this.lastSafetyAt=this.clock();this.lastDanger=danger?.target||null
    if(danger?.target)this.lastThreatObservedAt=this.clock()
    const vulnerable=this.bot.health<14||danger?.type==='SURVIVE'
    const state=vulnerable?'SURVIVE':(danger?.type==='GUARD'?'GUARD':'COMBAT')
    if(this.job||this.followGoal){this.cancelActive('safety overrides lower priority task')}
    if(this.core.state!==state){
      // Only mob category and rounded distance, not identity or chat contents.
      const mob=String(danger?.target?.name||'unknown').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30)
      const near=danger?.target?.position?.distanceTo?.(this.bot.entity.position)
      this.log.log('[Alice safety] threat context:',JSON.stringify({
        kind:mob||'unknown',tactic:state,
        distanceBlocks:Number.isFinite(near)?Math.round(near*10)/10:null,
        health:this.bot.health,retreatPathVerified:false
      }))
      this.core.transition(state,'urgent safety intervention')
    }
    if(!danger||this.safetyBusy)return
    const t=danger.target
    if(!t?.position)return
    const targetDistance=this.bot.entity.position.distanceTo(t.position)
    const lastDamageMs=this.lastSelfDamageAt>0?this.clock()-this.lastSelfDamageAt:Infinity
    const tactic=this.p.safety_policy.decideCombatTactic({health:this.bot.health,
      enemyType:t.name,distance:targetDistance,lastDamageMs})
    const recentHitOutsideMelee=
      lastDamageMs<=6500&&targetDistance>3.5||
      danger?.evidence==='incoming_projectile'&&targetDistance>3
    const mobType=String(t.name||'unknown').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30)
    const learned=this.deathExperience.assess(mobType)
    // A repeated unsafe encounter changes the next combat choice, not
    // the trust level of movement or collision evidence.
    const observedTactic=recentHitOutsideMelee?'RETREAT_AFTER_HIT':
      learned.repeatedRisk?'LEARNED_AVOID_REPEAT_DEATH':tactic
    const tacticKey=mobType+'|'+observedTactic+'|'+(vulnerable?'low':'normal')
    if(tacticKey!==this.lastCombatDecisionKey||this.clock()-this.lastCombatDecisionAt>10000){
      this.lastCombatDecisionKey=tacticKey;this.lastCombatDecisionAt=this.clock()
      this.log.log('[Alice safety] combat decision:',JSON.stringify({
        kind:mobType,tactic:observedTactic,health:this.bot.health,
        distanceBlocks:Math.round(targetDistance*10)/10,
        recentSelfDamage:lastDamageMs<=6500,serverMovementVerified:false}))
    }
    if(vulnerable||t.name==='creeper'||tactic==='RETREAT'||tactic==='KITE_RECOVER'||
       tactic==='EVADE_COUNTER'||recentHitOutsideMelee||learned.repeatedRisk){
      if(this.clock()-this.lastRetreatAt<4500)return
      this.lastRetreatAt=this.clock();this.safetyBusy=true
      const controller=new AbortController()
      const retreatStartedAt=this.clock()
       this.ops.retreatFrom(t,{signal:controller.signal}).then(async r=>{
         this.log.log('[Alice safety] action duration:',JSON.stringify({
           kind:mobType,action:'retreat',result:r.ok===true?'verified':'unverified',
           durationMs:Math.max(0,this.clock()-retreatStartedAt)}))
        this.log.log('[Alice safety] retreat observed result:',JSON.stringify(r))
        if(!r.ok)this.log.warn('[Alice safety] retreat not independently confirmed:',
          JSON.stringify({reason:r.reason||'unknown',
            attempted:r.attempted===true,localMovedBlocks:r.localMovedBlocks??null,
            serverMovementVerified:r.serverMovementVerified===true}))
        // A failed retreat must not trap Alice without any defensive swing.
        // This guard never moves: a stopped failed Pathfinder, a known blocked
        // corridor, or a fresh server-packet-aligned STATIC witness refusal can
        // permit ONE bounded melee attempt. Divergent position cannot.
        const defenseGate=stationaryDefense({
          retreat:r,bot:this.bot,target:t,hostiles:HOSTILES,
          ready:this.ready(),now:this.clock(),movementEvidence:this.movementEvidence})
        // Unattributed recent damage allows cautious escape, not retaliation
        // against a mob merely occupying the same block or nearby space.
        if(!defenseGate.ok||danger.evidence==='unattributed_close_damage')return
        const key=attackKey(t),previous=key!=null?this.attackBackoff.get(key):null
        if(this.clock()-this.lastCombatAt<1250||
           (previous&&this.clock()<previous.nextAt))return
        this.lastCombatAt=this.clock()
        const defenseStartedAt=this.clock()
        if(key!=null){
          this.recentAttackAttempts.set(key,defenseStartedAt)
          if(this.recentAttackAttempts.size>32)
            this.recentAttackAttempts.delete(this.recentAttackAttempts.keys().next().value)
        }
         const defense=await this.ops.attackOnce(t,{signal:controller.signal})
         this.log.log('[Alice safety] action duration:',JSON.stringify({
           kind:mobType,action:'cornered_defense',
           result:defense.verifiedDamage===true?'verified':'unverified',
           durationMs:Math.max(0,this.clock()-defenseStartedAt)}))
        const misses=defense.verifiedDamage?0:Math.min((previous?.misses||0)+1,5)
        const delay=defenseDelay(misses,{health:this.bot.health,
          distance:this.bot.entity?.position?.distanceTo?.(t.position)})
        if(key!=null)this.attackBackoff.set(key,{misses,
          nextAt:this.clock()+delay})
        if(key!=null&&defense.attempted!==true)this.recentAttackAttempts.delete(key)
        this.log.log('[Alice safety] cornered defense:',JSON.stringify({
          kind:mobType,retreatReason:r.reason,defenseReason:defenseGate.reason,
          attempted:defense.attempted===true,verifiedDamage:defense.verifiedDamage===true,
          nextAttemptAfterMs:delay,serverMovementVerified:false}))
      }).catch(e=>this.log.warn('[Alice safety] retreat:',e.message)).finally(()=>{this.safetyBusy=false})
    }else{
      // GUARD can identify a threat to another player through a doorway,
      // but Alice must not swing if SHE is too far away or blocked.
      if(targetDistance>3||observedHostileBarrier(this.bot,t)!=='clear')return
      // An attack cooldown must never suppress a newly urgent retreat.
      if(this.clock()-this.lastCombatAt<1250)return
      const key=attackKey(t)
      const previous=key!=null?this.attackBackoff.get(key):null
      if(previous&&this.clock()<previous.nextAt)return
      this.lastCombatAt=this.clock();this.safetyBusy=true
      const attackStartedAt=this.clock()
      if(key!=null){
        this.recentAttackAttempts.set(key,attackStartedAt)
        if(this.recentAttackAttempts.size>32)
          this.recentAttackAttempts.delete(this.recentAttackAttempts.keys().next().value)
      }
       this.ops.attackOnce(t).then(r=>{
        if(key!=null&&r.attempted!==true)this.recentAttackAttempts.delete(key)
         this.log.log('[Alice safety] action duration:',JSON.stringify({
           kind:mobType,action:'attack',result:r.verifiedDamage===true?'verified':'unverified',
           durationMs:Math.max(0,this.clock()-attackStartedAt)}))
        if(key!=null){
          // No attacker identity on target hurt events: never count them as
          // confirmed damage or silently clear an unverified attack backoff.
          const prev=previous?.misses||0
          const misses=r.verifiedDamage?0:Math.min(prev+1,5)
          const delay=r.reason==='out_of_reach'?ATTACK_OUT_OF_RANGE_MS:
            Math.min(ATTACK_UNCONFIRMED_MAX_MS,1750*2**Math.max(0,misses-1))
          this.attackBackoff.set(key,{misses,nextAt:this.clock()+delay})
          if(this.attackBackoff.size>32)this.attackBackoff.delete(this.attackBackoff.keys().next().value)
          this.log.log('[Alice safety] attack observation:',JSON.stringify({target:t.name||key,
            attempted:!!r.attempted,verifiedDamage:!!r.verifiedDamage,
            reason:r.reason||'unknown',nextAttemptAfterMs:delay}))
        }else this.log.log('[Alice safety] attack target lacks stable ID; no hit claimed:',JSON.stringify(r))
      }).catch(e=>this.log.warn('[Alice safety] attack:',e.message)).finally(()=>{this.safetyBusy=false})
    }
  },
  }
}
module.exports={createSafetyRuntimeMethods}
