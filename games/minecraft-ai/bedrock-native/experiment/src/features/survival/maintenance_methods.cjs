'use strict'
// Original Alice Bedrock instance methods, no second client or timer.
// Explicitly injected policy dependencies preserve BDS and safety admission.
function createMaintenanceRuntimeMethods({classifyJobException,environment,safeShelteredFood}){
  return {
  observeHomeTick(){
    if(!this.ready()||this.bot.isSleeping||this.safetyBusy||this.threat())return
    const known=this.observedBeds.nearby(this.bot,{radius:12})
    const home=this.homeBed.summary()
    const confirmed=home.status!=='not_verified'&&!!home.bed
    // Prefer the actually server-confirmed bed, not whichever loose bed
    // happens to be first in the local cache.
    const candidate=confirmed?known.find(p=>Math.hypot(
      p.x-home.bed.x,p.y-home.bed.y,p.z-home.bed.z)<=1.5):known[0]
    if(!candidate)return
    const result=this.homeBase.observe(this.bot,candidate,{
      spawnConfirmed:confirmed&&Math.hypot(
        candidate.x-home.bed.x,candidate.y-home.bed.y,
        candidate.z-home.bed.z)<=1.5})
    const key=[result.status,result.reason,this.homeBase.summary().status].join('|')
    if(this.lastHomeSurveyKey!==key){
      this.lastHomeSurveyKey=key
      this.log.log('[Alice home] observed structure:',JSON.stringify({
        status:result.status,reason:result.reason,
        bedKnown:true,spawnConfirmed:confirmed,
        persistedHome:this.homeBase.summary().status!=='not_established',
        doorPassageVerified:false,returnRouteVerified:false}))
    }
  },
  async maintenanceTick(){
    // Read-only bed observations can happen while Alice is exploring, not
    // just when idle at home. They are paced to once per 60 seconds and must
    // never interrupt active safety/combat or force a new navigation task.
    if(this.ready()&&!this.bot.isSleeping&&!this.safetyBusy)
      this.observedBeds.observe(this.bot)
    this.observeHomeTick()
    if(!this.ready()||this.bot.isSleeping||this.job||this.safetyBusy||
       this.maintenanceBusy)return
    // Passive equipment maintenance is inventory-only. It is allowed in the
    // SURVIVE/low-health hold when no emergency action currently owns Alice;
    // otherwise threat_nearby + health<14 would permanently prevent using
    // weapons/armor that a player just handed her.
    if(this.clock()>=this.nextEquipAt){
      this.nextEquipAt=this.clock()+20000
      this.maintenanceBusy=true
      try{
        const result=await this.ops.equipAuto({chooseWeapon:this.p.equipment.chooseWeapon})
        const item=String(result?.item||'').replace(/[^a-z0-9_]/gi,'').slice(0,42)||null
        const reason=String(result?.reason||'unknown').replace(/[^a-z0-9_]/gi,'').slice(0,64)
        this.lastEquipObservation={ok:result?.ok===true,
          kind:['weapon','armor'].includes(result?.kind)?result.kind:'unknown',
          item,reason,at:this.clock()}
        if(result?.ok)this.log.log('[Alice equipment] equipped:',JSON.stringify(this.lastEquipObservation))
        else if(!['no_equipment_available','already_best'].includes(reason))
          this.log.warn('[Alice equipment] deferred:',JSON.stringify(this.lastEquipObservation))
      }catch(err){
        this.lastEquipObservation={ok:false,kind:'unknown',item:null,
          reason:classifyJobException(err),at:this.clock()}
        this.log.warn('[Alice equipment] deferred:',JSON.stringify(this.lastEquipObservation))
      }finally{this.maintenanceBusy=false}
    }
    // Bed-based respawn is a fundamental need even in companion mode;
    // it is independent of sleep/night cooldown and never interrupts humans.
    if(await this.spawnpointTick())return
    if(this.sleepTick())return
    // Food is a survival need, not optional exploration. A positively
    // observed wall can isolate a distant mob; unknown/close danger cannot.
    const foodDanger=this.threat()
    const foodSafe=safeShelteredFood({danger:foodDanger,
      escort:this.escortDecision(foodDanger),health:this.bot.health,
      recentHurtAt:this.lastSelfDamageAt,now:this.clock()})
    const health=this.bot.health,food=this.bot.food
    if(foodSafe&&this.clock()>=this.nextFoodAt&&Number.isFinite(food)&&food<18){
      this.nextFoodAt=this.clock()+30000
      if(this.ops.inventory()?.some(i=>['bread','apple','baked_potato','cooked_beef','cooked_porkchop',
        'cooked_chicken','cooked_mutton','cooked_rabbit','cooked_cod','cooked_salmon','carrot',
        'golden_carrot','pumpkin_pie','melon_slice','cookie'].includes(i.name))){
        this.cancelActive('safe food recovery')
        this.startJob('RECOVER','自主生存',async signal=>{
          const stillDanger=this.threat()
          const safe=safeShelteredFood({danger:stillDanger,
            escort:this.escortDecision(stillDanger),health:this.bot.health,
            recentHurtAt:this.lastSelfDamageAt,now:this.clock()})
          const result=await this.ops.eatIfSafe({signal,underThreat:!safe})
          if(result.ok)this.nextEquipAt=0 // Re-equip best weapon after food replaced hand.
          return {ok:result.ok,message:'饥饿值 '+result.foodBefore+' → '+result.foodAfter,
            reason:result.reason||'饥饿值未确认增加'}
        },{label:'安全进食',announce:false})
        return
      }
    }
    // Explicit bed intent may wait for the next naturally available BDS pair.
    // Keep passive equipment and emergency food possible, but do not begin
    // unrelated optional work while an accepted bed request owns the plan.
    if(this.pendingBedRequest)return
    // All remaining non-equipment work remains blocked by any nearby danger.
    if(foodDanger||this.safetyBusy||this.job)return
    if(health<14)return
  },
  }
}
module.exports={createMaintenanceRuntimeMethods}
