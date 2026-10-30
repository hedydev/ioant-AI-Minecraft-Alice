'use strict'
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const {environment}=require('./world_routine.cjs')
const ranks={netherite:7,diamond:6,iron:5,chainmail:4,golden:3,leather:2,turtle:3}
const armorParts={helmet:['head',5],chestplate:['torso',6],leggings:['legs',7],boots:['feet',8]}
const bedName=n=>typeof n==='string'&&(n==='bed'||n.endsWith('_bed'))
const safeQty=(it)=>it&&Number.isSafeInteger(it.count)&&it.count>0
const bedHostiles=new Set(['zombie','husk','drowned','skeleton','stray','bogged','creeper','spider',
 'cave_spider','witch','pillager','ravager','phantom','silverfish','endermite'])
function monstersNearBed(bot,bed){
 if(!bed?.position)return true // unknown isn't evidence that sleeping is safe
 return Object.values(bot?.entities||{}).some(e=>{
  const p=e?.position
  if(!p||!(bedHostiles.has(e.name)||e.kind==='Hostile mobs'))return false
  // Bedrock forbids rest near a monster regardless of a separating wall.
  // Range is 8 horizontal blocks (axis aligned), 5 vertically from bed head.
  return Math.abs(p.y-bed.position.y)<=5&&
   Math.abs(p.x-bed.position.x)<=8&&Math.abs(p.z-bed.position.z)<=8
 })
}
function armorScore(name,part){
 if(typeof name!=='string')return 0
 const found=Object.keys(ranks).find(t=>name===t+'_'+part)
 if(found)return ranks[found]
 return part==='helmet'&&name==='turtle_helmet'?ranks.turtle:0
}
function isNight(bot){return environment(bot).phase==='night'&&environment(bot).canUseBed}
function canSleepNow(bot){return environment(bot).canSleep}
function bestArmorChoice(bot){
 const items=bot.inventory?.items?.()||[]
 for(const [part,[slot,destSlot]] of Object.entries(armorParts)){
   const current=bot.inventory?.slots?.[destSlot]
   const best=items.filter(i=>safeQty(i)&&armorScore(i.name,part)>armorScore(current?.name,part))
     .sort((a,b)=>armorScore(b.name,part)-armorScore(a.name,part))[0]
   if(best)return {part,destination:slot,item:best,slot:destSlot}
 }
 return null
}
async function equipBetterArmor(bot,{signal}={}){
 if(signal?.aborted)return {ok:false,reason:'cancelled'}
 const choice=bestArmorChoice(bot)
 if(!choice)return {ok:false,reason:'no_better_armor'}
 if(typeof bot.equip!=='function')return {ok:false,reason:'equip_unavailable'}
 await bot.equip(choice.item,choice.destination)
 if(signal?.aborted)return {ok:false,reason:'cancelled'}
 for(let i=0;i<7;i++){
   if(bot.inventory?.slots?.[choice.slot]?.name===choice.item.name)
     return {ok:true,item:choice.item.name,destination:choice.destination}
   await wait(100)
 }
 return {ok:false,reason:'armor_slot_not_confirmed',item:choice.item.name}
}
async function equipBestHeldWeapon(bot,chooseWeapon,{signal}={}){
 if(signal?.aborted)return {ok:false,reason:'cancelled'}
 if(typeof chooseWeapon!=='function')return {ok:false,reason:'missing_policy'}
 const candidate=chooseWeapon(bot.inventory?.items?.()||[])
 if(!candidate)return {ok:false,reason:'no_weapon'}
 if(bot.heldItem?.name===candidate.name)return {ok:false,reason:'already_best'}
 if(typeof bot.equip!=='function')return {ok:false,reason:'equip_unavailable'}
 await bot.equip(candidate,'hand')
 if(signal?.aborted)return {ok:false,reason:'cancelled'}
 for(let i=0;i<7;i++){
   if(bot.heldItem?.name===candidate.name)return {ok:true,item:candidate.name}
   await wait(100)
 }
 return {ok:false,reason:'held_item_not_confirmed',item:candidate.name}
}
function equipmentSnapshot(bot,chooseWeapon){
  // Read-only observation; never infer possession from a dropped ground item
  // or claim a successful equip without a server-backed held/armor update.
  const name=item=>typeof item?.name==='string'&&/^[a-z0-9_]{1,48}$/.test(item.name)?
    item.name:null
  const items=bot.inventory?.items?.()
  const known=Array.isArray(items)
  const stock=known?items.filter(safeQty):[]
  const expected=typeof chooseWeapon==='function'?chooseWeapon(stock):null
  const armorNames=stock.filter(item=>Object.keys(armorParts).some(p=>armorScore(item.name,p)>0))
    .slice(0,8).map(name).filter(Boolean)
  const slots=bot.inventory?.slots
  const worn=slots&&typeof slots==='object'?
    Object.fromEntries(Object.entries(armorParts).map(([part,[,index]])=>[part,name(slots[index])])):
    null
  return {inventoryKnown:known,weaponInInventory:name(expected),
    heldItem:name(bot.heldItem),armorInInventory:armorNames,wornArmor:worn}
}
function inspectNightBeds(bot,radius=12,{avoidBed=()=>false,knownPositions=null}={}){
  const phase=environment(bot).phase
  const result={status:'unavailable',phase,found:0,eligible:0,
    occupied:0,hostile:0,excluded:0,unknown:0,beds:[]}
  if(!canSleepNow(bot)){result.status='outside_sleep_window';return result}
  if(!bot.entity?.position||
     (knownPositions===null&&typeof bot.findBlocks!=='function')||
     typeof bot.parseBedMetadata!=='function'){
    result.status='bed_observation_api_unavailable';return result
  }
  let found
  try{found=Array.isArray(knownPositions)?knownPositions.slice(0,24):
    bot.findBlocks({matching:b=>bedName(b?.name),maxDistance:radius,count:24})||[]}
  catch{result.status='bed_scan_failed';return result}
  const seen=new Map()
  for(const point of found){
    let block,meta
    try{
      const at=typeof bot.entity.position.offset==='function'?
        bot.entity.position.offset(point.x-bot.entity.position.x,
          point.y-bot.entity.position.y,point.z-bot.entity.position.z):point
      block=bot.blockAt?.(at)
      if(!block||!bedName(block.name)||!block.position?.distanceTo||
         block.position.distanceTo(bot.entity.position)>radius){result.unknown++;continue}
      meta=bot.parseBedMetadata(block)
    }catch{result.unknown++;continue}
    if(meta?.occupied!==0){result.occupied++;continue}
    // Bedrock may expose both bed halves; one physical bed is one retry site.
    const pos=block.position,h=meta?.headOffset,part=meta?.part===true
    const anchor=part&&h&&[h.x,h.y,h.z].every(Number.isFinite)?
      {x:pos.x-h.x,y:pos.y-h.y,z:pos.z-h.z}:pos
    const key=[anchor.x,anchor.y,anchor.z].join(',')
    if(seen.has(key)){
      if(!part)seen.set(key,{block,anchor})
      continue
    }
    seen.set(key,{block,anchor})
  }
  result.found=seen.size+result.occupied+result.unknown
  for(const {block,anchor} of seen.values()){
    if(avoidBed(anchor)||avoidBed(block.position)){result.excluded++;continue}
    if(monstersNearBed(bot,block)){result.hostile++;continue}
    result.beds.push(block)
  }
  result.beds.sort((a,b)=>a.position.distanceTo(bot.entity.position)-
    b.position.distanceTo(bot.entity.position))
  result.eligible=result.beds.length
  result.status=result.eligible?'safe_bed_candidate':
    result.hostile?'nearby_hostile_bed_unavailable':
    result.excluded?'all_candidate_beds_in_cooldown':
    result.occupied?'all_beds_occupied':
    result.unknown?'bed_blocks_unverified':'no_bed_within_radius'
  return result
}
function hasNearbyBed(bot,radius=12,{avoidBed=()=>false,knownPositions=null}={}){
  return inspectNightBeds(bot,radius,{avoidBed,knownPositions}).eligible>0
}
async function sleepNearby(bot,api,{signal,radius=12,avoidBed=()=>false,
  knownPositions=null}={}){
 if(signal?.aborted)return {ok:false,reason:'cancelled'}
 if(!canSleepNow(bot))return {ok:false,reason:'not_night_or_thunderstorm_or_wrong_dimension'}
 if(typeof bot.parseBedMetadata!=='function')return {ok:false,reason:'bed_occupancy_unknown'}
 if(bot.isSleeping)return {ok:true,alreadySleeping:true}
 if(typeof bot.sleep!=='function'||!bot.pathfinder?.goto||
    (knownPositions===null&&typeof bot.findBlocks!=='function'))
   return {ok:false,reason:'unsupported_sleep_or_navigation'}
 const pos=bot.entity?.position
 if(!pos)return {ok:false,reason:'unknown_position'}
 const scan=inspectNightBeds(bot,radius,{avoidBed,knownPositions})
 if(!scan.eligible)return {ok:false,reason:'no_unblocked_safe_bed_in_radius',
   bedDiagnosis:{status:scan.status,phase:scan.phase,found:scan.found,
     eligible:scan.eligible,hostile:scan.hostile,excluded:scan.excluded,
     occupied:scan.occupied,unknown:scan.unknown}}
 const bed=scan.beds[0]
 const bedPosition={x:Math.floor(bed.position.x),y:Math.floor(bed.position.y),z:Math.floor(bed.position.z)}
 let phase='navigate',timer,listener
 const diagnosis=()=>({
   phase:environment(bot).phase,sleepWindow:canSleepNow(bot),
   distance:Math.round(bot.entity.position.distanceTo(bed.position)*100)/100,
   hostileNear:monstersNearBed(bot,bed),
   observedSleeping:bot.isSleeping===true,
   selfSleepingFlag:Boolean((Number(bot.entity?.metadata?.player_flags)||0)&2),
   bedOccupied:(()=>{try{return bot.parseBedMetadata(bed)?.occupied===1}catch{return null}})()
 })
 const race=(p,ms,onStop)=>Promise.race([p,new Promise((_,reject)=>{
   listener=()=>{onStop();reject(Error('cancelled'))}
   signal?.addEventListener('abort',listener,{once:true})
   timer=setTimeout(()=>{onStop();reject(Error('timeout'))},ms)
 })]).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',listener)})
 try{
   // A bed already in reach should never require an unnecessary
   // navigation action (especially while Alice is injured indoors).
   const adjacent=bot.entity.position.distanceTo(bed.position)<=2.4
   if(!adjacent){
     if(Number.isFinite(bot.health)&&bot.health<14)
       return {ok:false,reason:'low_health_bed_not_adjacent',bedPosition}
     await race(Promise.resolve().then(()=>bot.pathfinder.goto(
       new api.GoalNear(bed.position.x,bed.position.y,bed.position.z,2))),
       14000,()=>bot.pathfinder.stop?.())
   }
   if(signal?.aborted)return {ok:false,reason:'cancelled'}
   if(bot.entity.position.distanceTo(bed.position)>3.5)return {ok:false,reason:'bed_not_reached',bedPosition}
   if(!canSleepNow(bot))return {ok:false,reason:'sleep_window_ended',bedPosition}
   if(monstersNearBed(bot,bed))return {ok:false,reason:'hostile_mob_near_bed',bedPosition}
   phase='sleep'
   await race(Promise.resolve().then(()=>bot.sleep(bed)),5500,()=>{})
   return {ok:bot.isSleeping===true,
     reason:bot.isSleeping===true?'sleep_confirmed':'sleep_not_confirmed',
     bedPosition,bedDiagnosis:diagnosis()}
 }catch(e){
   const message=String(e?.message||e).slice(0,90)
   // The fork times out waiting for the sleeping state event; this does NOT
   // identify whether BDS refused sleep, or whether the event was not mirrored.
   const unconfirmed=phase==='sleep'&&/bot did not sleep/.test(message)
   return {ok:false,reason:unconfirmed?'bed_sleep_unconfirmed_no_state_ack':
     (phase==='navigate'?'bed_navigation_failed:':'bed_sleep_rejected:')+message,
     bedPosition,bedDiagnosis:diagnosis()}
 }
}
module.exports={isNight,canSleepNow,hasNearbyBed,inspectNightBeds,monstersNearBed,armorScore,bestArmorChoice,equipBetterArmor,equipBestHeldWeapon,equipmentSnapshot,sleepNearby}
