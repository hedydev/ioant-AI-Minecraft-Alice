'use strict'
// One-transition Bedrock terrain adaptation. Observation is separate from
// world mutation; no unknown chunk, structure, lava, arbitrary dig or build.
const {boxes}=require('./voxel_actions.cjs')
const IS_AIR=new Set(['air','cave_air','void_air'])
const MATERIALS=new Set(['cobblestone','dirt'])
const DIGGABLE=new Set(['dirt','grass_block'])
const BAD=/(lava|water|fire|magma|cactus|campfire|powder_snow|cobweb|bubble_column|berry_bush)/
const BUILT=/(planks|stairs|slab|glass|chest|barrel|crafting_table|furnace|door|trapdoor|fence|wall|cobblestone|sign|ladder|torch|rail|redstone|bed|lectern|bookshelf|shulker|hopper|piston|observer|dispenser|dropper|workstation|bricks|concrete|terracotta|wool|carpet|banner|scaffolding)/
const valid=n=>typeof n==='number'&&Number.isFinite(n)
const vec=p=>p&&[p.x,p.y,p.z].every(valid)
const id=p=>p.x+','+p.y+','+p.z
const name=b=>String(b?.name||'').replace(/^minecraft:/,'')
const open=b=>b&&IS_AIR.has(name(b))&&b.boundingBox==='empty'
function full(b){
 const v=boxes(b)
 return Array.isArray(v)&&v.length===1&&v[0].every((n,i)=>Math.abs(n-[0,0,0,1,1,1][i])<.001)&&!BAD.test(name(b))
}
function pickVerticalStep(survey,{origin,hostiles=[],blocked=new Set(),visited=new Set(),minHostileDistance=9}={}){
 const opts=Array.isArray(survey?.verticalOptions)?survey.verticalOptions:[]
 if(survey?.status!=='route_candidate'||!vec(origin))return {candidate:null,reason:'vertical_origin_not_verified'}
 const mobs=hostiles.filter(vec)
 for(const opt of opts){
  const xyz=opt?.target
  if(!Array.isArray(xyz)||xyz.length!==3||!xyz.every(valid)||
      !['JUMP_UP','STEP_DOWN'].includes(opt.action))continue
  const target={x:xyz[0],y:xyz[1],z:xyz[2]},key=id(target)
  if(blocked.has(key)||visited.has(key))continue
  if(Math.abs(target.y-origin.y)>.999+0.01||
      Math.abs(Math.floor(origin.x)-target.x)+Math.abs(Math.floor(origin.z)-target.z)!==1)continue
  const dest={x:target.x+.5,y:target.y,z:target.z+.5}
  if(mobs.some(mob=>{
   const before=Math.hypot(origin.x-mob.x,origin.y-mob.y,origin.z-mob.z)
   const after=Math.hypot(dest.x-mob.x,dest.y-mob.y,dest.z-mob.z)
   return before<minHostileDistance?after<before-.05:after<minHostileDistance
  }))continue
  return {candidate:{ok:true,kind:'observed_one_cell_vertical',action:opt.action,
    target,waypoints:[target],key,distance:1,elevationChanges:1},
    reason:'collision_verified_one_cell_'+opt.action.toLowerCase()}
 }
 return {candidate:null,reason:opts.length?'vertical_steps_excluded_or_hostile':'no_verified_vertical_step'}
}
// Building candidates MUST have a fully observed floor behind and beyond the
// gap; digging candidates MUST look like a grass/dirt embankment, not a room.
function assessEarthwork(bot){
 const p=bot?.entity?.position
 if(!vec(p)||typeof p.offset!=='function'||bot.entity.onGround!==true||
   typeof bot.blockAt!=='function'||Math.abs(p.y-Math.round(p.y))>.06)
  return {candidate:null,reason:'terrain_position_or_blocks_unverified'}
 const x=Math.floor(p.x),y=Math.round(p.y),z=Math.floor(p.z),reads=new Map()
 const get=(a,b,c)=>{
  const k=[a,b,c].join(',')
  if(reads.has(k))return reads.get(k)
  let v=null
  try{v=bot.blockAt(p.offset(a-p.x,b-p.y,c-p.z))||null}catch{}
  reads.set(k,v)
  return v
 }
 if(!full(get(x,y-1,z))||!open(get(x,y,z))||!open(get(x,y+1,z)))
  return {candidate:null,reason:'home_footprint_unverified'}
 // Local natural-landscape proof for limited digging; adjacent constructions
 // veto BOTH digging and building, even if the candidate soil is natural.
 let natural=0,unknown=0,built=0
 for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
  for(const dy of [-1,0,1]){
   const b=get(x+dx,y+dy,z+dz)
   if(!b){unknown++;continue}
   if(BUILT.test(name(b)))built++
   if(dy===-1&&['grass_block','dirt','coarse_dirt','podzol'].includes(name(b)))natural++
  }
 }
 if(built)return {candidate:null,reason:'near_observed_player_construction'}
 if(unknown)return {candidate:null,reason:'terrain_neighborhood_unloaded'}
 const directions=[[1,0],[-1,0],[0,1],[0,-1]],candidates=[]
 for(const [dx,dz] of directions){
  const a=x+dx,c=z+dz,feet=get(a,y,c),head=get(a,y+1,c),floor=get(a,y-1,c)
  if(!feet||!head||!floor||BAD.test(name(feet))||BAD.test(name(head))||BAD.test(name(floor)))continue
  if(open(feet)&&open(head)&&open(floor)){
   // One isolated gap with a safe opposite landing and a visible deep bottom.
   if(!full(get(a+dx,y-1,c+dz))||!open(get(a,y-2,c)))continue
   const beneath=get(a,y-3,c)
   if(!beneath||!full(beneath))continue
   candidates.push({action:'PLACE_BRIDGE',target:{x:a,y:y-1,z:c},key:id({x:a,y:y-1,z:c}),
     material:MATERIALS.has(name(get(x,y-1,z)))?name(get(x,y-1,z)):'cobblestone'})
  }else if(DIGGABLE.has(name(feet))&&full(feet)&&open(head)&&full(floor)&&
    natural>=10&&unknown===0){
   // Never mine overhead or floor support. This clears ONE feet-height block
   // of a fully observed natural soil berm. No fluid, gravity, ore or wood.
   const behind=get(a+dx,y,c+dz),above=get(a,y+2,c)
   if(!behind||!above||BAD.test(name(behind))||!open(above))continue
   candidates.push({action:'DIG_SOIL',target:{x:a,y,z:c},key:id({x:a,y,z:c}),
     block:name(feet)})
  }
 }
 if(!candidates.length)return {candidate:null,reason:unknown?'terrain_neighborhood_unloaded':'no_safe_earthwork_candidate'}
 return {candidate:candidates[0],reason:'terrain_work_candidate_requires_server_position'}
}
function serverPositionProof(bot,evidence,clock=Date.now){
 const p=bot?.entity?.position,s=evidence?.get?.()
 if(!vec(p)||!vec(s?.latestFeet)||!Number.isFinite(s.lastAt)||
    clock()-s.lastAt<0||clock()-s.lastAt>5000||!Number.isSafeInteger(s.authoritativeSamples??s.received)||
    (s.authoritativeSamples??s.received)<2)
  return {ok:false,reason:'no_fresh_authoritative_self_position'}
 const d=Math.hypot(p.x-s.latestFeet.x,p.y-s.latestFeet.y,p.z-s.latestFeet.z)
 return {ok:d<=.75,reason:d<=.75?'recent_server_position_matches':'server_position_disagrees_with_client'}
}
const pause=ms=>new Promise(done=>setTimeout(done,ms))
async function executeEarthwork(bot,candidate,{signal,clock=Date.now,evidence,safe=()=>false,sleep=pause}={}){
 const deny=reason=>({ok:false,attempted:false,reason,worldModificationVerified:false})
 if(!candidate||!['PLACE_BRIDGE','DIG_SOIL'].includes(candidate.action))return deny('unregistered_terrain_action')
 if(signal?.aborted||!safe())return deny('terrain_action_preempted')
 const proof=serverPositionProof(bot,evidence,clock)
 if(!proof.ok)return deny(proof.reason)
 const fresh=assessEarthwork(bot)
 if(!fresh.candidate||fresh.candidate.key!==candidate.key||fresh.candidate.action!==candidate.action)
  return deny('terrain_action_changed_or_unverified')
 const inv=bot.inventory?.items?.()
 if(!Array.isArray(inv))return deny('inventory_not_synced')
 const original=bot.entity.position
 const xyz=candidate.target
 const targetPos=original.offset(xyz.x-original.x,xyz.y-original.y,xyz.z-original.z)
 const before=bot.blockAt(targetPos)
 const enough=(name)=>inv.find(i=>i?.name===name&&Number.isSafeInteger(i.count)&&i.count>0)
 let action,chosenMaterial=null
 const originalCount=inv.filter(i=>i.name==='dirt').reduce((n,i)=>n+i.count,0)
 if(candidate.action==='PLACE_BRIDGE'){
  if(!open(before)||typeof bot.placeBlock!=='function'||typeof bot.equip!=='function')
   return deny('place_api_or_gap_unverified')
  const item=['cobblestone','dirt'].map(enough).find(Boolean)
  if(!item)return deny('no_verified_safe_bridge_material')
  chosenMaterial=item.name
  const referencePos=original.offset(Math.floor(original.x)-original.x,
    Math.round(original.y)-1-original.y,Math.floor(original.z)-original.z)
  const reference=bot.blockAt(referencePos)
  if(!full(reference)||!reference.position?.offset||typeof reference.position.minus!=='function')
   return deny('place_reference_unverified')
  const face=reference.position.offset(xyz.x-Math.floor(original.x),0,xyz.z-Math.floor(original.z)).minus(reference.position)
  action=async()=>{await bot.equip(item,'hand');if(signal?.aborted||!safe())throw Error('terrain_action_preempted');await bot.placeBlock(reference,face)}
 }else{
  if(!DIGGABLE.has(name(before))||typeof bot.dig!=='function')return deny('dig_api_or_soil_unverified')
  action=async()=>{if(signal?.aborted||!safe())throw Error('terrain_action_preempted');await bot.dig(before)}
 }
 // One bounded attempt; never automatically repeat or chain a second block.
 let timer,abortFn
 try{
  await Promise.race([action(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('terrain_action_timeout')),4500)}),
    new Promise((_,reject)=>{abortFn=()=>reject(Error('terrain_action_preempted'));signal?.addEventListener('abort',abortFn,{once:true})})])
 }catch(err){
  if(candidate.action==='DIG_SOIL')try{bot.stopDigging?.()}catch{}
  return {ok:false,attempted:true,reason:/timeout/.test(String(err.message))?'terrain_action_timeout':'terrain_action_failed_or_preempted',
    worldModificationVerified:false}
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abortFn)}
 for(let i=0;i<10;i++){
  if(signal?.aborted||!safe())return {ok:false,attempted:true,reason:'terrain_confirmation_preempted',worldModificationVerified:false}
  await sleep(150)
  const after=bot.blockAt(targetPos)
  const updated=bot.inventory?.items?.()
  if(candidate.action==='DIG_SOIL'&&open(after)&&Array.isArray(updated)&&
    updated.filter(v=>v.name==='dirt').reduce((n,v)=>n+(v.count||0),0)>originalCount)
    return {ok:true,attempted:true,reason:'observed_soil_removed_and_inventory_pickup',
      worldModificationVerified:true,serverMovementVerified:false}
  if(candidate.action==='PLACE_BRIDGE'&&full(after)&&Array.isArray(updated)&&
    updated.filter(v=>v.name===chosenMaterial).reduce((n,v)=>n+(v.count||0),0)<
      inv.filter(v=>v.name===chosenMaterial).reduce((n,v)=>n+(v.count||0),0))
    return {ok:true,attempted:true,reason:'observed_support_and_inventory_consumption',
      worldModificationVerified:true,serverMovementVerified:false}
 }
 return {ok:false,attempted:true,reason:'terrain_block_result_unverified',
   worldModificationVerified:false,serverMovementVerified:false}
}
module.exports={pickVerticalStep,assessEarthwork,serverPositionProof,executeEarthwork}
