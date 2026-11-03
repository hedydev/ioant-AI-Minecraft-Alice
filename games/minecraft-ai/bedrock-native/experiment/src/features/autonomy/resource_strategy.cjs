'use strict'
// Synchronous resource work admission: same Alice state and existing verified actions.
function createResourceStrategy({observedNaturalTree,selectResourceStep,siteKey}){
  return function reviewResourceStrategy({plan,wood,weapon,night}){
      const place=this.bot.entity.position
      const woodFailure=this.failureMemory.blocked('wood',place)
      const movementFailure=this.failureMemory.blocked('motion',place)
      // Deterministic resource-first mission step: a nearby tree must pass
      // the SAME strict canopy/structure check as the eventual dig executor.
      // Inventory-only crafting is allowed without an outdoor scout. Actual
      // success is still the inventory-change verification, never the prompt.
      const observedTree=plan==='COLLECT_WOOD'||plan==='LEARN_WEAPON'&&wood<2?
        !woodFailure&&this.lastWorldRoutine.safeToExplore?
          observedNaturalTree(this.bot,{radius:12,maxColumns:3}):null:null
      const resourceStep=selectResourceStep({plan,hasWeapon:weapon,wood,
        craftDeferred:this.clock()<this.nextAutonomousCraftAt,
        woodFailure:!!woodFailure,phase:this.lastWorldRoutine.phase,
        safeToExplore:this.lastWorldRoutine.safeToExplore,
        tree:observedTree})
      const proofKey=[siteKey(place),resourceStep.action,resourceStep.reason].join('|')
      this.lastResourceOpportunity={action:resourceStep.action,
        reason:resourceStep.reason,treeVerified:observedTree?.ok===true,
        inventoryWood:wood,observedAt:this.clock()}
      if(this.lastResourceOpportunityKey!==proofKey){
        this.lastResourceOpportunityKey=proofKey
        this.log.log('[Alice mission] resource opportunity:',
          JSON.stringify(this.lastResourceOpportunity))
      }
      // Explicit user STOP/FOLLOW and safety gates were checked at idleTick
      // entry; no awaited model step can interleave before this startJob.
      if(resourceStep.action==='gather_one_log'&&!movementFailure&&this.bot.health>=16){
        this.startJob('GATHER','自主任务',signal=>this.runVerifiedResourceStep('GATHER',signal),{
          label:'天然树木：实际收集一块原木',announce:false})
        return {handled:true}
      }
      if(resourceStep.action==='craft_wooden_sword'){
        this.startJob('CRAFT','自主任务',
          signal=>this.runVerifiedResourceStep('CRAFT',signal),{
            label:'背包材料：实际制作木剑',announce:false})
        return {handled:true}
      }
      // Night is an active survival phase. After bed/shelter/inventory work,
      // attempt only an observed, equal-height, two-cell safe reposition.
      if(night&&this.tryNightReposition('no_safe_shelter_or_bed'))return {handled:true}
    return {handled:false,place,woodFailure,movementFailure,observedTree}
  }
}
module.exports={createResourceStrategy}
