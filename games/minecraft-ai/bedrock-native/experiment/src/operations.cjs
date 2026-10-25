'use strict'
const life=require('./life_actions.cjs')
const storage=require('./storage_actions.cjs')
const {planSafeRetreat}=require('./retreat_routes.cjs')
// Bedrock action adapter: same Paper policy decisions, Mineflayer-compatible
// execution surface, and authoritative before/after observations.
const FOOD = new Set(['bread','apple','baked_potato','cooked_beef','cooked_porkchop',
  'cooked_chicken','cooked_mutton','cooked_rabbit','cooked_cod','cooked_salmon','carrot',
  'golden_carrot','pumpkin_pie','melon_slice','cookie'])
const WOOD_LOGS = new Set(['oak_log','spruce_log','birch_log','jungle_log','acacia_log',
  'dark_oak_log','mangrove_log','cherry_log','pale_oak_log'])
const BAD_FLOOR = new Set(['lava','magma_block','fire','soul_fire','cactus','campfire','soul_campfire','powder_snow'])
const NON_SOLID = new Set(['air','cave_air','void_air','grass','tall_grass','water'])
const isFiniteNumber = x => typeof x === 'number' && Number.isFinite(x)
const qty=(bot,name)=>(bot.inventory?.items?.()||[]).filter(item=>item?.name===name).reduce((sum,item)=>sum+(Number(item.count)||0),0)
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const cancelled=signal=>{if(signal?.aborted)throw Error('action interrupted by newer command or danger')}
// Stage errors remain anonymous. The complete adapter exception never enters a
// journal, prompt or public status. Do not infer success from a thrown API call.
const GATHER_STAGES=new Set(['tree_scan','pathfinder','dig','pickup'])
function gatherFailureCode(error){
  const message=String(error?.message||'')
  // Preserve the precise shared BDS/navigation admission failure rather
  // than erasing it as an unclassified GATHER exception.
  if(message.includes('navigation_scout_client_server_position_diverged'))
    return 'navigation_bds_position_diverged'
  if(message.includes('navigation_scout_bds_position_unavailable'))
    return 'navigation_bds_position_unavailable'
  if(message.includes('navigation_scout_client_position_unavailable'))
    return 'navigation_local_position_unavailable'
  if(/timed?\s*out|timeout|deadline/i.test(message))return 'action_timeout'
  if(/no\s*path|noPath/i.test(message))return 'pathfinder_no_path'
  if(/cancel|interrupt|abort/i.test(message))return 'action_cancelled'
  if(error instanceof TypeError||/not\s*a\s*function|cannot read properties/i.test(message))
    return 'adapter_api_exception'
  if(/inventory|slot|stack/i.test(message))return 'inventory_adapter_exception'
  if(/chunk|unloaded|block|world/i.test(message))return 'world_observation_exception'
  return 'unclassified_job_exception'
}
class GatherStageError extends Error{
  constructor(stage,reason){super(reason);this.stage=stage;this.reasonCode=reason}
}
function gatherStageReporter(callback){
  let active=null,startedAt=0
  const report=(stage,status,reason=null)=>{
    if(!GATHER_STAGES.has(stage))return
    if(status==='started'){active=stage;startedAt=Date.now()}
    const elapsedMs=Math.max(0,Math.round(Date.now()-startedAt))
    try{callback?.({stage,status,reason,elapsedMs})}catch{}
  }
  return {
    async run(stage,fn){
      report(stage,'started')
      try{
        const result=await fn()
        if(result?.ok===false)report(stage,'failed',
          result.reason==='no_confirmed_pickup'?'no_confirmed_pickup':'stage_result_not_ok')
        else report(stage,'completed')
        return result
      }
      catch(error){
        const code=error?.reasonCode||gatherFailureCode(error)
        report(stage,'failed',code)
        throw new GatherStageError(stage,code)
      }
    },
    decline(stage,reason){report(stage,'failed',reason)}
  }
}
async function bounded(operation,{signal,timeoutMs=15000,onAbort=()=>{}}={}){
  cancelled(signal)
  let timer,listener,aborted=false
  const stop=()=>{if(aborted)return;aborted=true;onAbort()}
  const cancel=new Promise((_,reject)=>{
    listener=()=>{stop();reject(Error('action cancelled'))}
    signal?.addEventListener('abort',listener,{once:true})
  })
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{stop();reject(Error('action timed out'))},timeoutMs)})
  try{return await Promise.race([Promise.resolve().then(operation),cancel,deadline])}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',listener)}
}
function validInventory(bot){return typeof bot.inventory?.items==='function' && Array.isArray(bot.inventory.items())}
function foodCandidate(bot){return (bot.inventory?.items?.()||[]).find(i=>FOOD.has(i?.name)&&i.count>0)||null}
function safeTile(bot,position){
  if(!position||typeof bot.blockAt!=='function'||typeof position.offset!=='function')return false
  const floor=bot.blockAt(position.offset(0,-1,0)),feet=bot.blockAt(position),head=bot.blockAt(position.offset(0,1,0))
  if(!floor||!feet||!head)return false // unloaded blocks are NOT safe
  const solid=b=>!NON_SOLID.has(b.name) && b.boundingBox!=='empty'
  return solid(floor)&&!BAD_FLOOR.has(floor.name)&&
    !solid(feet)&&!BAD_FLOOR.has(feet.name)&&!solid(head)&&!BAD_FLOOR.has(head.name)
}
function chooseRetreat(bot,enemy){
  // Keep the legacy location-or-null API for callers, but obtain its
  // candidate ONLY from the fully verified collision-aware retreat graph.
  const plan=planSafeRetreat(bot,enemy)
  const here=bot.entity?.position
  if(!plan.ok||!here?.offset)return null
  const w=plan.firstWaypoint
  return here.offset(w.x-here.x,w.y-here.y,w.z-here.z).floored()
}

// Only harvest a plausible loaded tree, never an arbitrary log in a player's build.
// This is a conservative heuristic, not a protection-plugin/claim system.
const BUILT=new Set(['chest','trapped_chest','barrel','crafting_table','furnace','blast_furnace',
  'smoker','enchanting_table','lectern','bookshelf','ladder','glass','glass_pane'])
// Bedrock often supplies partial subchunks around a live player. Require POSITIVE
// evidence of a canopy and a natural vertical trunk; do not require all 200+
// surrounding positions to be loaded. Unknown blocks are not evidence of air.
// Return distinct reasons so missing chunks are not mistaken for "no trees".
function inspectNaturalTree(bot,block){
  if(!block?.position?.offset||typeof bot.blockAt!=='function')return {ok:false,reason:'missing_block_api'}
  if(bot._bedrockWorldSupport?.supported===false)
    return {ok:false,reason:'world_block_data_unavailable'}
  let leaves=0,unknown=0,logs=0,builds=0,known=0,baseKnown=0;const buildTypes=new Set()
  const p=block.position
  for(let y=-1;y<=12;y++)for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
    if(x*x+z*z>5)continue // Dense crown/trunk area; ignore unrelated diagonal corners.
    let b
    try{b=bot.blockAt(p.offset(x,y,z))}catch{b=null}
    if(!b){unknown++;continue}
    known++
    if(y>=-1&&y<=3&&Math.abs(x)<=1&&Math.abs(z)<=1)baseKnown++
    const name=b.name||''
    if(y>=0 && name.endsWith('_leaves'))leaves++
    if(x===0&&z===0&&y>=0&&y<=6&&WOOD_LOGS.has(name))logs++
    if(y>=-1&&y<=4&&(BUILT.has(name)||name.endsWith('_planks')||name.endsWith('_door')||
       name.endsWith('_sign')||name.endsWith('_fence')||name.endsWith('_stairs')||
       name.endsWith('_slab')||name.startsWith('stripped_'))){builds++;buildTypes.add(name)}
  }
  const result={ok:false,reason:'no_canopy_evidence',leaves,unknown,logs,builds,buildTypes:[...buildTypes].slice(0,6),known,baseKnown}
  if(builds){result.reason='near_player_structure';return result}
  if(baseKnown<26){result.reason='insufficient_loaded_proximity';return result}
  if(logs<2){result.reason='insufficient_trunk_evidence';return result}
  if(leaves<3){result.reason=unknown>known?'insufficient_loaded_crown':'no_canopy_evidence';return result}
  result.ok=true;result.reason='verified_tree_shape';return result
}
function likelyNaturalTree(bot,block){return inspectNaturalTree(bot,block).ok}
function chooseTool(bot,block){
  const items=bot.inventory?.items?.()||[]
  if(!block||!WOOD_LOGS.has(block.name))return null
  const axes=items.filter(i=>i?.name?.endsWith('_axe')&&!i.name.endsWith('_pickaxe'))
  const tiers=['netherite_axe','diamond_axe','iron_axe','stone_axe','wooden_axe','golden_axe']
  return tiers.map(t=>axes.find(a=>a.name===t)).find(Boolean)||null
}
class BedrockOperations {
  constructor({bot,api,log=console,sleep=wait,movementEvidence=null}){
    this.bot=bot;this.api=api;this.log=log;this.sleep=sleep
    this.movementEvidence=movementEvidence
  }
  isNight(){return life.isNight(this.bot)}
  hasNearbyBed(radius=12,options={}){return life.hasNearbyBed(this.bot,radius,options)}
  inspectNightBeds(radius=12,options={}){return life.inspectNightBeds(this.bot,radius,options)}
  async sleepNearby(args){
    const r=await life.sleepNearby(this.bot,this.api,args)
    return r.ok?{...r,message:'服务器确认 Alice 已进入睡眠'}:r
  }
  async transferNearby(args){
    const r=await storage.transferNearby(this.bot,this.api,args)
    return r.ok?{...r,message:(r.direction==='withdraw'?'从箱子取出 ':'存入箱子 ')+r.item+' ×'+r.moved}:r
  }
  async equipAuto({chooseWeapon}={}){
    const armor=await life.equipBetterArmor(this.bot)
    if(armor.ok||armor.reason!=='no_better_armor')return armor
    return life.equipBestHeldWeapon(this.bot,chooseWeapon)
  }
  inventory(){
    if(!validInventory(this.bot))return null
    return this.bot.inventory.items().map(i=>({name:i.name,count:i.count}))
      .filter(i=>typeof i.name==='string'&&Number.isSafeInteger(i.count)&&i.count>0)
  }
  async equipForBlock(block,signal){
    cancelled(signal)
    const tool=chooseTool(this.bot,block)
    if(tool&&typeof this.bot.equip==='function')await this.bot.equip(tool,'hand')
    cancelled(signal)
    return tool?.name||'bare_hand'
  }
  async gatherOne({signal,maxDistance=28,origin=null,targetItem=null,onStage=null}={}){
    const stages=gatherStageReporter(onStage)
    if(targetItem!==null&&!WOOD_LOGS.has(targetItem))return {ok:false,reason:'unsupported_natural_tree_item'}
    const eligible=name=>WOOD_LOGS.has(name)&&(targetItem===null||name===targetItem)
    cancelled(signal)
    if(!validInventory(this.bot)||typeof this.bot.findBlocks!=='function'||typeof this.bot.dig!=='function'||!this.bot.pathfinder?.goto)
      return {ok:false,reason:'unsupported_inventory_or_dig'}
    const here=this.bot.entity?.position?.clone?.()
    const workOrigin=origin||here
    if(!here||!workOrigin)return {ok:false,reason:'unknown_position'}
    const found=await stages.run('tree_scan',()=>this.bot.findBlocks({
      matching:b=>eligible(b?.name),maxDistance,count:maxDistance>18?256:128})||[])
    const observed=found.map(p=>this.bot.blockAt(p)).filter(b=>b&&eligible(b.name))
      .filter(b=>b.position?.distanceTo(here)<=maxDistance&&b.position?.distanceTo(workOrigin)<=maxDistance)
      .sort((a,b)=>a.position.distanceTo(here)-b.position.distanceTo(here))
    const audits=new Map()
    let block=null
    // Base-most known log in a column gives a better canopy sampling window.
    const lowestByColumn=new Map()
    for(const b of observed){const k=`${b.position.x},${b.position.z}`;const old=lowestByColumn.get(k);
      if(!old||b.position.y<old.position.y)lowestByColumn.set(k,b)}
    for(const b of [...lowestByColumn.values()].sort((a,b)=>a.position.distanceTo(here)-b.position.distanceTo(here))){
      // Logs from a single trunk share canopy evidence; group checks to avoid
      // spending a full local block scan on every vertical log in one tree.
      const key=`${b.position.x},${b.position.z}`
      let audit=audits.get(key)
      if(!audit){audit=inspectNaturalTree(this.bot,b);audits.set(key,audit)}
      if(audit.ok){block=b;break}
    }
    if(!block){
      const reasons={}
      for(const a of audits.values())reasons[a.reason]=(reasons[a.reason]||0)+1
      const support=this.bot._bedrockWorldSupport
      // Read-only foliage probe: houses may contain wood, but a nearby natural
      // canopy must be observed before any dig is permitted.
      let visibleLeaves='unavailable'
      try {
        const candidates=this.bot.findBlocks({matching:b=>b?.name?.endsWith('_leaves'),maxDistance,count:96})||[]
        visibleLeaves=candidates.map(p=>this.bot.blockAt(p)).filter(b=>b?.name?.endsWith('_leaves')).length
      } catch {}
      this.log.log('[Alice wood] tree search:',JSON.stringify({visibleLogs:observed.length,visibleLeaves,searchRadius:maxDistance,originalWorkBound:!!origin,
        treeColumns:audits.size,rejected:reasons,
        evidence:[...audits.values()].slice(0,3).map(({reason,leaves,logs,builds,buildTypes,unknown,baseKnown})=>
          ({reason,leaves,logs,builds,buildTypes,unknown,baseKnown})),
        blockData:support?.supported??'unknown',blockReason:support?.reason||null}))
      return {ok:false,reason:support?.supported===false?'world_block_data_unavailable':
        !observed.length?'no_visible_log':'no_verified_natural_tree'}
    }
    const before=this.inventory()
    const total=before.filter(i=>eligible(i.name)).reduce((n,i)=>n+i.count,0)
    const goal=new this.api.GoalNear(block.position.x,block.position.y,block.position.z,2)
    cancelled(signal)
    // Pathfinding cannot dig/place while walking through someone's property.
    await stages.run('pathfinder',()=>bounded(()=>this.bot.pathfinder.goto(goal),{
      signal,timeoutMs:18000,
      onAbort:()=>{try{this.bot.pathfinder.stop?.()}catch{}}}))
    cancelled(signal)
    if(this.bot.entity.position.distanceTo(block.position)>4.5){
      stages.decline('pathfinder','out_of_reach')
      return {ok:false,reason:'out_of_reach'}
    }
    const current=this.bot.blockAt(block.position)
    if(!current||!eligible(current.name))return {ok:false,reason:'changed_block'}
    await stages.run('dig',async()=>{
      await this.equipForBlock(current,signal)
      cancelled(signal)
      return bounded(()=>this.bot.dig(current),{signal,timeoutMs:12000,
        onAbort:()=>{try{this.bot.stopDigging?.()}catch{}}})
    })
    cancelled(signal)
    // Mining ACK is not pickup; server inventory event must increase.
    return stages.run('pickup',async()=>{
      for(let n=0;n<8;n++){
        await this.sleep(250)
        cancelled(signal)
        const after=(this.inventory()||[]).filter(i=>eligible(i.name)).reduce((sum,i)=>sum+i.count,0)
        if(after>total)return {ok:true,gained:after-total,block:current.name}
      }
      return {ok:false,reason:'no_confirmed_pickup'}
    })
  }
  async craftVerified(name,{signal,craftingTable=null}={}){
    cancelled(signal)
    if(!/^[a-z_]{2,50}$/.test(name))throw Error('Invalid canonical item name')
    const type=this.bot.registry?.itemsByName?.[name]?.id
    if(!Number.isInteger(type)||!validInventory(this.bot)||typeof this.bot.recipesFor!=='function'||typeof this.bot.craft!=='function')
      return {ok:false,reason:'unsupported_recipe_or_inventory'}
    const prior=qty(this.bot,name)
    const recipes=this.bot.recipesFor(type,null,1,Boolean(craftingTable))||[]
    const recipe=recipes.find(r=>r&&(!r.requiresTable||craftingTable))
    if(!recipe)return {ok:false,reason:'missing_ingredients_or_crafting_table'}
    // Never speculate about a recipe, inject arbitrary items, or craft repeatedly.
    await bounded(()=>this.bot.craft(recipe,1,craftingTable),{signal,timeoutMs:15000})
    cancelled(signal)
    for(let i=0;i<8;i++){
      await this.sleep(250)
      cancelled(signal)
      if(qty(this.bot,name)>prior)return {ok:true,gained:qty(this.bot,name)-prior}
    }
    return {ok:false,reason:'craft_result_not_observed'}
  }
  async eatIfSafe({signal,underThreat=false}={}){
    cancelled(signal)
    const bot=this.bot
    if(underThreat||!isFiniteNumber(bot.health)||bot.health<=0||!isFiniteNumber(bot.food)||bot.food>=18)
      return {ok:false,reason:'not_safe_or_hungry'}
    const item=foodCandidate(bot)
    if(!item||typeof bot.equip!=='function'||typeof bot.consume!=='function')return {ok:false,reason:'no_food_or_consume_api'}
    const before=bot.food
    await bot.equip(item,'hand');cancelled(signal)
    await bounded(()=>bot.consume(),{signal,timeoutMs:6500});cancelled(signal)
    return {ok:isFiniteNumber(bot.food)&&bot.food>before,foodBefore:before,foodAfter:bot.food}
  }
  async retreatFrom(target,{signal,deadlineMs=3000}={}){
    cancelled(signal)
    const plan=planSafeRetreat(this.bot,target)
    if(!plan.ok)return {ok:false,reason:plan.reason,attempted:false,
      serverMovementVerified:false,reachableCells:plan.reachableCells||0,
      candidates:plan.candidates||0}
    if(!this.bot.pathfinder?.goto||!this.api?.GoalNear)return {
      ok:false,reason:'retreat_pathfinder_unavailable',attempted:false}
    const before=this.bot.entity.position.clone()
    const checkpoint=this.movementEvidence?.checkpoint?.()||null
    const tile=plan.firstWaypoint
    // The one-cell target was collision/surface verified. Never allow A* to
    // solve a distant unsafe detour or dig/open doors while in emergency mode.
    if(this.api.Movements&&this.bot.pathfinder.setMovements){
      const moves=new this.api.Movements(this.bot)
      moves.canDig=false;moves.allow1by1towers=false;moves.allowParkour=false
      moves.canOpenDoors=false;moves.openable?.clear?.()
      this.bot.pathfinder.setMovements(moves)
    }
    try{
      await bounded(()=>this.bot.pathfinder.goto(
        new this.api.GoalNear(tile.x,tile.y,tile.z,0)),{
        signal,timeoutMs:Math.min(3000,deadlineMs),
        onAbort:()=>{try{this.bot.pathfinder.stop?.()}catch{}}})
    }catch(e){
      // The shared independent-BDS admission guard rejects BEFORE the native
      // Pathfinder sends any movement. Do not mislabel this as an attempted
      // path or obscure its exact safe refusal behind pathfinder_error.
      const admission={
        navigation_scout_bds_position_unavailable:'retreat_bds_position_unavailable',
        navigation_scout_client_server_position_diverged:'retreat_bds_client_position_diverged',
        navigation_scout_client_position_unavailable:'retreat_client_position_unavailable'
      }[String(e?.message||'')]
      // Pathfinder may leave controls active after a failed goto. On an
      // actual attempted route, explicitly request synchronous stop before
      // considering any subsequent close-range stationary self-defense.
      // A guard rejection is never an attempted route and is not stopped.
      let pathfinderStopRequested=false
      if(!admission&&signal?.aborted!==true&&
         typeof this.bot.pathfinder?.stop==='function'){
        try{
          await this.bot.pathfinder.stop()
          pathfinderStopRequested=
            typeof this.bot.pathfinder.isMoving!=='function'||
            this.bot.pathfinder.isMoving()===false
        }catch{}
      }
      return {ok:false,reason:admission||
        (/No path to the goal!/.test(String(e?.message||''))?
          'retreat_pathfinder_no_path':'retreat_pathfinder_error'),
        attempted:!admission,serverMovementVerified:false,
        pathfinderStopRequested,
        candidates:plan.candidates,firstWaypoint:tile}
    }
    cancelled(signal)
    const distance=this.bot.entity.position.distanceTo(before)
    // Only the server-origin movement tracker can upgrade local pathfinder
    // success into verified movement; a client coordinate alone never does.
    const proof=checkpoint?this.movementEvidence?.progress?.(checkpoint):null
    const latest=this.movementEvidence?.get?.()||null
    const serverFeet=latest?.latestFeet
    const enemy=target.position
    const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
    // Require both BDS motion AND separation from the actual hostile.
    // A teleport/correction toward danger is not a successful retreat.
    const observedAway=valid(serverFeet)&&valid(checkpoint?.position)&&valid(enemy)?
      Math.hypot(serverFeet.x-enemy.x,serverFeet.y-enemy.y,serverFeet.z-enemy.z)-
      Math.hypot(checkpoint.position.x-enemy.x,checkpoint.position.y-enemy.y,
        checkpoint.position.z-enemy.z):null
    const aligned=valid(serverFeet)&&
      Math.hypot(serverFeet.x-this.bot.entity.position.x,
        serverFeet.y-this.bot.entity.position.y,
        serverFeet.z-this.bot.entity.position.z)<=0.85
    const fresh=Number.isFinite(latest?.lastAt)&&latest.lastAt<=Date.now()&&
      Date.now()-latest.lastAt<=4000
    const verified=proof?.confirmed===true&&proof.movedBlocks>=0.25&&
      fresh&&aligned&&observedAway>=0.2
    const evidenceReason=!proof?.confirmed?'server_movement_not_observed':
      !fresh?'server_sample_stale':!aligned?'client_server_position_diverged':
      !(observedAway>=0.2)?'server_move_not_away_from_enemy':
      'server_away_movement_confirmed'
    return {ok:verified,reason:verified?'retreat_server_movement_verified':
      distance>.2?'retreat_local_only_server_unverified':'retreat_no_local_movement',
      attempted:true,serverMovementVerified:verified,serverEvidenceReason:evidenceReason,
      serverMovedBlocks:verified?proof.movedBlocks:0,
      localMovedBlocks:Number.isFinite(distance)?Math.round(distance*100)/100:null,
      verifiedCorridor:true,firstWaypoint:tile,candidates:plan.candidates}
  }

  async attackOnce(target,{signal}={}){
    cancelled(signal)
    const bot=this.bot
    if(!target||!target.position||typeof bot.attack!=='function'||!bot.entity?.position)return {ok:false,reason:'missing_attack_api_or_target'}
    if(bot.entity.position.distanceTo(target.position)>3.5)return {ok:false,reason:'out_of_reach'}
    const sword=(bot.inventory?.items?.()||[]).filter(i=>i.name?.endsWith('_sword')).sort((a,b)=>
      ['netherite','diamond','iron','stone','wooden','golden'].indexOf(a.name.split('_')[0])-
      ['netherite','diamond','iron','stone','wooden','golden'].indexOf(b.name.split('_')[0]))[0]
    if(sword&&typeof bot.equip==='function')await bot.equip(sword,'hand')
    cancelled(signal)
    if(typeof bot.lookAt!=='function')return {ok:false,reason:'aim_api_unavailable'}
    const aim=typeof target.position.offset==='function'
      ?target.position.offset(0,Math.max(0.5,Math.min(1.3,Number(target.height||1.7)*0.6)),0)
      :target.position
    await bounded(()=>bot.lookAt(aim,true),{signal,timeoutMs:1200})
    cancelled(signal)
    await bot.attack(target)
    return {ok:false,attempted:true,aimAttempted:true,verifiedDamage:false,reason:'damage_not_yet_verified'} // Attack not verified hit
  }
}
module.exports={BedrockOperations,qty,chooseRetreat,safeTile,inspectNaturalTree,likelyNaturalTree,FOOD,WOOD_LOGS}