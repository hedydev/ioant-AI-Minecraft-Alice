'use strict'
// Single bounded, non-destructive wooden door action. No pathfinder, digging,
// placing, arbitrary interaction or claim of BDS-confirmed passage.
const {knownAir}=require('./scout_routes.cjs')
const {fullSupport}=require('./escape_survey.cjs')
const WOOD_DOOR=/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door$/
const xyz=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isSafeInteger)
// Vanilla Bedrock stores these bit states as 0/1; some Block adapters return
// booleans. Accept ONLY either documented representation. Never coerce.
function bit(value){
 if(value===false||value===0)return false
 if(value===true||value===1)return true
 return null
}
function bitKind(value){
 if(typeof value==='boolean')return 'boolean'
 if(value===0||value===1)return 'integer_bit'
 return value===undefined?'missing':'unsupported'
}
function observedDoorBits(block){
 let props
 try{props=block?.getProperties?.()}catch{return {open:null,upper:null,format:{openBit:'unavailable',upperBit:'unavailable'}}}
 return {open:bit(props?.open_bit),upper:bit(props?.upper_block_bit),
   format:{openBit:bitKind(props?.open_bit),upperBit:bitKind(props?.upper_block_bit)}}
}
function blockAt(bot,x,y,z){
 const p=bot.entity.position
 return bot.blockAt(p.offset(x-p.x,y-p.y,z-p.z))
}
function planDoorOpen(bot,survey){
 const fail=reason=>({ok:false,reason})
 const self=bot?.entity?.position,door=survey?.doorCandidates?.[0]
 if(!self||![self.x,self.y,self.z].every(Number.isFinite)||
    typeof self.offset!=='function'||bot.entity.onGround!==true||
    typeof bot.blockAt!=='function')return fail('own_position_or_ground_unverified')
 if(!door||door.kind!=='wooden_door'||door.permitted!==false||!xyz(door.position))
   return fail('no_bounded_wooden_door_candidate')
 const approach=door.approach,route=approach?.waypoints
 if(approach?.routeComplete!==true||approach?.serverVerified!==false||
    !Array.isArray(route)||route.length>2||route.length!==approach.steps||
    !xyz(approach.position)||approach.elevationChanges!==0||!route.every(xyz))
   return fail('door_approach_requires_navigation_or_terrain_verification')
 const [x,y,z]=door.position
 const horizontal=Math.hypot(self.x-x-0.5,self.z-z-0.5)
 if(Math.abs(self.y-y)>0.5||horizontal>3||horizontal<0.5)
   return fail('door_not_reachable_from_current_position')
 if(Math.abs(approach.position[0]-x)+Math.abs(approach.position[2]-z)!==1||
    approach.position[1]!==y)return fail('door_approach_not_adjacent')
 let previous=[Math.floor(self.x),Math.floor(self.y),Math.floor(self.z)]
 try{
   if(!route.length&&previous.join(',')!==approach.position.join(','))
     return fail('approach_not_connected')
   if(route.length&&route.at(-1).join(',')!==approach.position.join(','))
     return fail('approach_not_connected')
   for(const [cx,cy,cz] of route){
     if(cy!==previous[1]||Math.abs(cx-previous[0])+Math.abs(cz-previous[2])!==1)
       return fail('approach_requires_unverified_step')
     if(!fullSupport(blockAt(bot,cx,cy-1,cz))||
       !knownAir(blockAt(bot,cx,cy,cz))||
       !knownAir(blockAt(bot,cx,cy+1,cz)))
       return fail('approach_blocked_or_unloaded')
     previous=[cx,cy,cz]
   }
   const block=blockAt(bot,x,y,z)
   const name=String(block?.name||'').replace(/^minecraft:/,'')
   if(!WOOD_DOOR.test(name)||typeof block.getProperties!=='function')
     return fail('door_block_or_state_unavailable')
   const state=observedDoorBits(block)
   if(state.upper===null)return {ok:false,reason:'door_upper_bit_unverified',stateFormat:state.format}
   if(state.upper===true)return {ok:false,reason:'door_upper_half_unverified',stateFormat:state.format}
   if(state.open===null)return {ok:false,reason:'door_open_bit_unverified',stateFormat:state.format}
   if(state.open===true)return {ok:false,reason:'door_already_open',stateFormat:state.format}
   return {ok:true,door:door.position,block,stateFormat:state.format}
 }catch{return fail('door_observation_failed')}
}
async function attemptDoorOpen(bot,survey,{signal,sleep=ms=>new Promise(r=>setTimeout(r,ms)),safe=()=>true}={}){
 const gate=planDoorOpen(bot,survey)
 if(!gate.ok)return {...gate,attempted:false,openObserved:false}
 if(signal?.aborted||!safe())return {ok:false,reason:'door_action_preempted',attempted:false,openObserved:false}
 if(typeof bot.activateBlock!=='function')
   return {ok:false,reason:'door_interaction_api_unavailable',attempted:false,openObserved:false}
 const [x,y,z]=gate.door
 let attempted=false
 try{
   if(typeof bot.lookAt==='function'&&gate.block.position)
     await bot.lookAt(gate.block.position)
   if(signal?.aborted||!safe())return {ok:false,reason:'door_action_preempted',attempted:false,openObserved:false}
   attempted=true
   // Exactly one block activation, bounded by an independent deadline.
   let timer
   try{
     await Promise.race([
       Promise.resolve().then(()=>bot.activateBlock(gate.block)),
       new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('door_interaction_timeout')),2500)})
     ])
   }finally{clearTimeout(timer)}
   for(let i=0;i<4;i++){
     if(signal?.aborted||!safe())
       return {ok:false,reason:'door_verification_preempted',attempted,openObserved:false}
     await sleep(200)
     if(signal?.aborted||!safe())
       return {ok:false,reason:'door_verification_preempted',attempted,openObserved:false}
     const next=blockAt(bot,x,y,z)
     const nextName=String(next?.name||'').replace(/^minecraft:/,'')
     if(WOOD_DOOR.test(nextName)){
       const state=observedDoorBits(next)
       if(state.upper===false&&state.open===true)
         return {ok:true,reason:'door_open_observed_exit_unverified',attempted,
           openObserved:true,door:gate.door,serverMovementVerified:false,
           stateFormat:state.format}
     }
   }
   return {ok:false,reason:'door_state_change_not_observed',attempted,openObserved:false,
     door:gate.door,serverMovementVerified:false}
 }catch(e){
   return {ok:false,reason:e?.message==='door_interaction_timeout'?'door_interaction_timeout':'door_interaction_error',
     attempted,openObserved:false,door:gate.door,serverMovementVerified:false}
 }
}
module.exports={planDoorOpen,attemptDoorOpen,observedDoorBits}
