'use strict'
// Read-only scouting for genuinely natural logs. No unverified tree means
// NO digging permission. Actual pickup/craft is delegated to existing verified
// BedrockOperations that checks authoritative inventory changes.
const {inspectNaturalTree,WOOD_LOGS}=require('./operations.cjs')
function observedNaturalTree(bot,{radius=12,maxColumns=3}={}){
 if(!bot?.entity?.position||!bot?.findBlocks||!bot?.blockAt)
   return {ok:false,reason:'tree_observation_api_unavailable'}
 if(bot._bedrockWorldSupport?.supported===false)
   return {ok:false,reason:'world_block_data_unavailable'}
 let matches
 try{matches=bot.findBlocks({matching:b=>WOOD_LOGS.has(b?.name),
   maxDistance:Math.min(16,Math.max(3,radius)),count:24})||[]}catch{
   return {ok:false,reason:'tree_scan_failed'}
 }
 const columns=new Map()
 for(const p of matches){
   if(!p||![p.x,p.y,p.z].every(Number.isFinite))continue
   const key=p.x+','+p.z,old=columns.get(key)
   if(!old||p.y<old.y)columns.set(key,p)
 }
 const closest=[...columns.values()].sort((a,b)=>{
   const pos=bot.entity.position
   const dist=p=>Math.hypot(p.x-pos.x,p.y-pos.y,p.z-pos.z)
   return dist(a)-dist(b)
 }).slice(0,Math.max(1,Math.min(3,maxColumns)))
 let tested=0,reason='no_verified_natural_tree'
 for(const pos of closest){
   let block
   try{block=bot.blockAt(pos)}catch{block=null}
   if(!block||!WOOD_LOGS.has(block.name))continue
   tested++
   const audit=inspectNaturalTree(bot,block)
   if(audit.ok)return {ok:true,reason:'verified_natural_tree_nearby',
     columnsTested:tested,target:{x:pos.x,y:pos.y,z:pos.z}}
   reason=audit.reason
 }
 return {ok:false,reason:closest.length?reason:'no_visible_log_columns',
   columnsTested:tested}
}
function selectResourceStep({plan,hasWeapon=false,wood=0,woodFailure=false,
 craftDeferred=false,
 phase='unknown',safeToExplore=false,tree=null}={}){
 if(!['COLLECT_WOOD','LEARN_WEAPON'].includes(plan)||hasWeapon)
   return {action:'none',reason:'no_current_resource_need'}
 if(wood>=2)return craftDeferred?{action:'none',reason:'craft_recipe_cooldown'}:
   {action:'craft_wooden_sword',reason:'observed_inventory_materials'}
 if(woodFailure)return {action:'none',reason:'resource_site_in_cooldown'}
 if(phase!=='day'||!safeToExplore)return {action:'none',reason:'daylight_required'}
 if(tree?.ok)return {action:'gather_one_log',reason:'verified_natural_tree_nearby'}
 return {action:'none',reason:tree?.reason||'no_verified_natural_tree'}
}
module.exports={observedNaturalTree,selectResourceStep}
