'use strict'
// Bounded emergency shelter planning. Client voxels are observations, not
// authoritative permission to edit a Minecraft world. Build at most one
// non-destructive placement per task, under the existing server-position gate.
const {serverPositionProof}=require('./terrain_adaptation.cjs')
const NATURAL=new Set(['grass_block','dirt','coarse_dirt','podzol','stone','deepslate',
 'tuff','gravel','sand','red_sand','mycelium','mud','clay','moss_block'])
const SUPPLIES=['cobblestone','dirt']
const FULL_SUPPLIES=new Set(SUPPLIES)
const DOORS=new Set(['oak_door','spruce_door','birch_door','jungle_door','acacia_door',
 'dark_oak_door','mangrove_door','cherry_door','bamboo_door'])
const protectedName=n=>/(chest|barrel|door|trapdoor|fence|glass|planks|crafting_table|furnace|bed|sign|lantern|torch|stairs|slab|redstone|tnt|spawner|beacon)/.test(n)
const name=b=>typeof b?.name==='string'?b.name:'unknown'
const empty=b=>b?.name==='air'&&b.boundingBox!=='block'
const full=b=>b?.boundingBox==='block'
const safeCoord=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
function blueprint(x,y,z){
 const out=[]
 // Natural footprint (3x3), an accessible north entrance at z-1.
 // Do not automatically seal Alice inside or remove any owned block.
 for(let h=0;h<2;h++)
   for(let dx=-1;dx<=1;dx++)
     for(let dz=-1;dz<=1;dz++)
       if(Math.abs(dx)===1||Math.abs(dz)===1)
         if(!(dx===0&&dz===-1))
           out.push({x:x+dx,y:y+h,z:z+dz,part:'wall'})
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
   out.push({x:x+dx,y:y+2,z:z+dz,part:'roof'})
 return out
}
function evaluateShelter(bot){
 const p=bot?.entity?.position
 if(!safeCoord(p)||typeof bot?.blockAt!=='function')
   return {status:'blocked',reason:'shelter_world_unavailable',site:null,candidate:null}
 const site={x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)}
 const {x,y,z}=site,cache=new Map()
 let unknown=0
 const block=(x,y,z)=>{
   const key=[x,y,z].join(',')
   if(cache.has(key))return cache.get(key)
   const at=p.offset?.(x-p.x,y-p.y,z-p.z)
   let b=null
   try{if(at)b=bot.blockAt(at)}catch{}
   if(!b)unknown++
   cache.set(key,b)
   return b
 }
 const deny=(reason,extra={})=>({status:'blocked',reason,site,candidate:null,
   unknownBlocks:unknown,blocksRequired:23,...extra})
 // No overwriting known players' builds or bot's occupied feet/head.
 if(!empty(block(x,y,z))||!empty(block(x,y+1,z)))
   return deny('shelter_self_space_not_clear')
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
   const floor=block(x+dx,y-1,z+dz)
   if(!floor)return deny('shelter_terrain_unloaded')
   if(!NATURAL.has(name(floor))||!full(floor))
     return deny('shelter_not_natural_ground')
 }
 // No structure modification: built landmarks in a 5x5 ring mean this
 // natural ground might already be someone's yard or a house entrance.
 for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
   if(Math.abs(dx)<=1&&Math.abs(dz)<=1)continue
   for(let dy=0;dy<=1;dy++){
     const b=block(x+dx,y+dy,z+dz)
     if(!b)return deny('shelter_terrain_unloaded')
     if(protectedName(name(b)))return deny('shelter_existing_structure_nearby')
   }
 }
 let occupied=0,missing=[]
 for(const target of blueprint(x,y,z)){
   const b=block(target.x,target.y,target.z)
   if(!b)return deny('shelter_terrain_unloaded')
   if(full(b)&&FULL_SUPPLIES.has(name(b))){occupied++;continue}
   if(!empty(b))return deny('shelter_footprint_obstructed')
   missing.push(target)
 }
 // This is only a 3x3 roof-and-wall frame. Until a verified closable door
 // exists at the entrance it is NOT a monster-proof house.
 if(!missing.length){
   const lower=block(x,y,z-1),upper=block(x,y+1,z-1)
   if(DOORS.has(name(lower))&&DOORS.has(name(upper)))
     return {status:'frame_with_door_observed',
       reason:'shelter_door_open_state_unverified',site,candidate:null,
       unknownBlocks:unknown,blocksRequired:24,placedOrExisting:24,remaining:0}
   if(!empty(lower)||!empty(upper))
     return deny('shelter_entrance_obstructed')
   const doors=bot.inventory?.items?.()||[]
   const door=doors.find(i=>DOORS.has(i?.name)&&Number.isSafeInteger(i.count)&&i.count>0)
   if(!door)return {status:'partial_cover_complete',
     reason:'shelter_door_material_missing',site,candidate:null,
     unknownBlocks:unknown,blocksRequired:24,placedOrExisting:23,remaining:1}
   return {status:'placement_candidate',reason:'shelter_door_candidate',
     site,candidate:{x,y,z:z-1,part:'door'},material:door.name,
     blocksRequired:24,placedOrExisting:23,remaining:1,
     unknownBlocks:unknown,trust:'client_geometry_only_not_server_position'}
 }
 const supplies=bot.inventory?.items?.()
 const supply=Array.isArray(supplies)?
   SUPPLIES.map(n=>supplies.find(i=>i?.name===n&&Number.isSafeInteger(i.count)&&i.count>0))
     .find(Boolean):null
 if(!supply)return {status:'blocked',reason:'shelter_materials_missing',
   site,candidate:null,unknownBlocks:unknown,
   blocksRequired:24,placedOrExisting:occupied,remaining:missing.length+1}
 // First build lower walls, then upper walls, then roof. Roof center needs
 // another attached roof tile. Never authorize placement with no solid face.
 const target=missing.find(t=>[
   [t.x,t.y-1,t.z],[t.x-1,t.y,t.z],[t.x+1,t.y,t.z],
   [t.x,t.y,t.z-1],[t.x,t.y,t.z+1],[t.x,t.y+1,t.z]
 ].some(([a,b,c])=>full(block(a,b,c))))
 if(!target)return deny('shelter_support_face_missing',{remaining:missing.length})
 return {status:'placement_candidate',reason:'shelter_one_verified_block_candidate',
   site,candidate:target,material:supply.name,
   blocksRequired:24,placedOrExisting:occupied,remaining:missing.length+1,
   unknownBlocks:unknown,trust:'client_geometry_only_not_server_position'}
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function placeShelterBlock(bot,proposal,{signal,evidence,clock=Date.now,safe=()=>false,sleep=wait}={}){
 const reject=(reason,attempted=false)=>({ok:false,reason,attempted,
   worldModificationVerified:false,serverMovementVerified:false})
 if(!proposal||proposal.status!=='placement_candidate'||!proposal.candidate)
   return reject('shelter_no_authorized_candidate')
 if(signal?.aborted||!safe())return reject('shelter_interrupted')
 const proof=serverPositionProof(bot,evidence,clock)
 if(!proof.ok)return reject(proof.reason)
 const fresh=evaluateShelter(bot)
 if(fresh.status!=='placement_candidate'||!fresh.candidate||
    JSON.stringify(fresh.site)!==JSON.stringify(proposal.site)||
    JSON.stringify(fresh.candidate)!==JSON.stringify(proposal.candidate)||
    fresh.material!==proposal.material)
   return reject('shelter_plan_changed')
 if(typeof bot.equip!=='function'||typeof bot.placeBlock!=='function')
   return reject('shelter_place_api_unavailable')
 const supply=bot.inventory?.items?.()?.find(i=>
   i.name===fresh.material&&Number.isSafeInteger(i.count)&&i.count>0)
 if(!supply)return reject('shelter_materials_missing')
 const beforeCount=supply.count
 const p=bot.entity.position,t=fresh.candidate
 const at=(x,y,z)=>p.offset(x-p.x,y-p.y,z-p.z)
 const destination=at(t.x,t.y,t.z),pairs=[
   [t.x,t.y-1,t.z],[t.x-1,t.y,t.z],[t.x+1,t.y,t.z],
   [t.x,t.y,t.z-1],[t.x,t.y,t.z+1],[t.x,t.y+1,t.z]]
 const reference=pairs.map(([x,y,z])=>bot.blockAt(at(x,y,z)))
   .find(b=>full(b)&&safeCoord(b?.position)&&typeof b.position.offset==='function')
 if(!reference)return reject('shelter_support_face_missing')
 const face=reference.position.offset(t.x-reference.position.x,
   t.y-reference.position.y,t.z-reference.position.z).minus(reference.position)
 let timer,abortFn
 try{
   await bot.equip(supply,'hand')
   if(signal?.aborted||!safe())return reject('shelter_interrupted')
   await Promise.race([
     Promise.resolve().then(()=>bot.placeBlock(reference,face)),
     new Promise((_,no)=>{timer=setTimeout(()=>no(Error('timeout')),4500)}),
     new Promise((_,no)=>{abortFn=()=>no(Error('cancelled'));signal?.addEventListener('abort',abortFn,{once:true})})
   ])
 }catch(error){return reject('shelter_place_failed_or_timeout',true)}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abortFn)}
 for(let i=0;i<8;i++){
   if(signal?.aborted||!safe())return reject('shelter_confirmation_interrupted',true)
   await sleep(150)
   const after=bot.blockAt(destination)
   const count=bot.inventory?.items?.()?.filter(v=>v.name===supply.name)
     .reduce((a,v)=>a+(v.count||0),0)||0
   if((t.part==='door'?
        DOORS.has(name(after))&&DOORS.has(name(bot.blockAt(at(t.x,t.y+1,t.z)))):
        full(after)&&after.name===supply.name)&&count<beforeCount)
     return {ok:true,reason:t.part==='door'?
       'shelter_door_and_inventory_verified':'shelter_block_and_inventory_verified',attempted:true,
       worldModificationVerified:true,serverMovementVerified:false,
       material:supply.name,part:t.part,remaining:Math.max(0,fresh.remaining-1)}
 }
 return reject('shelter_block_result_unverified',true)
}
module.exports={evaluateShelter,placeShelterBlock,blueprint}
