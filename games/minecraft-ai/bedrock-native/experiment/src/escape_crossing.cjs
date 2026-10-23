'use strict'
// Bedrock indoor recovery: ONE bounded, non-destructive direct-input passage
// through an observed OPEN wooden door into a known safe cell on its far side.
// Pinned Mineflayer pathfinder can mark openable doors as 'useOne' interactions,
// which can toggle an already-open door CLOSED. Never pathfind/activate here.
// Fixed Bedrock fork exposes setControlState('forward') -> player_auth_input.
// Local physics is NOT Bedrock-server-confirmed location or proof of outdoors.
const {knownAir}=require('./scout_routes.cjs')
const {fullSupport}=require('./escape_survey.cjs')
const {observedDoorBits}=require('./escape_door_action.cjs')
const {createDoorMotionProbe}=require('./door_motion_diagnostics.cjs')
const {planOpenDoorLane}=require('./door_lane.cjs')
const DOOR=/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door$/
const cell=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isSafeInteger)
const flat=p=>[Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)]
function at(bot,x,y,z){
 const p=bot.entity.position
 return bot.blockAt(p.offset(x-p.x,y-p.y,z-p.z))
}
function clearDoorway(bot,a,d,beyond){
 try{
   if(!fullSupport(at(bot,a[0],a[1]-1,a[2]))||
      !fullSupport(at(bot,d[0],d[1]-1,d[2]))||
      !fullSupport(at(bot,beyond[0],beyond[1]-1,beyond[2])))
     return 'crossing_full_floor_unverified'
   if(!knownAir(at(bot,a[0],a[1],a[2]))||
      !knownAir(at(bot,a[0],a[1]+1,a[2]))||
      !knownAir(at(bot,beyond[0],beyond[1],beyond[2]))||
      !knownAir(at(bot,beyond[0],beyond[1]+1,beyond[2])))
     return 'crossing_opposite_side_blocked_or_unknown'
   const lower=at(bot,d[0],d[1],d[2]),upper=at(bot,d[0],d[1]+1,d[2])
   const lowerName=String(lower?.name||'').replace(/^minecraft:/,'')
   const upperName=String(upper?.name||'').replace(/^minecraft:/,'')
   if(!DOOR.test(lowerName)||!DOOR.test(upperName)||lowerName!==upperName)
     return 'crossing_complete_door_unverified'
   const low=observedDoorBits(lower),high=observedDoorBits(upper)
   if(low.upper!==false||low.open!==true||high.upper!==true)
     return 'crossing_open_door_state_unverified'
   return null
 }catch{return 'crossing_block_read_failed'}
}
// Check the entire known two-block passage BEFORE approaching an open
// door. A door can open onto a wall, hole or unloaded chunk: never walk toward
// an already-proven dead end merely because the near side looks navigable.
function validatePassageGeometry(bot,door){
 const fail=reason=>({ok:false,reason})
 const self=bot?.entity?.position
 if(!self||![self.x,self.y,self.z].every(Number.isFinite)||!self.offset||
    typeof bot.blockAt!=='function')
   return fail('crossing_position_or_block_data_unavailable')
 if(door?.kind!=='wooden_door'||door?.permitted!==false||!cell(door.position)||
    !cell(door.approach?.position)||door.approach?.routeComplete!==true||
    door.approach?.elevationChanges!==0)
   return fail('crossing_door_proposal_invalid')
 const a=door.approach.position,d=door.position
 if(a[1]!==d[1]||Math.abs(a[0]-d[0])+Math.abs(a[2]-d[2])!==1)
   return fail('crossing_door_approach_not_adjacent')
 const beyond=[2*d[0]-a[0],d[1],2*d[2]-a[2]]
 const obstacle=clearDoorway(bot,a,d,beyond)
 if(obstacle)return fail(obstacle)
 return {ok:true,door:d.slice(),from:a.slice(),beyond,steps:2,
   serverMovementVerified:false}
}
function validateCrossing(bot,door){
 const fail=reason=>({ok:false,reason})
 const self=bot?.entity?.position
 if(!self||![self.x,self.y,self.z].every(Number.isFinite)||!self.offset||
    bot.entity.onGround!==true||typeof bot.blockAt!=='function')
   return fail('crossing_ground_or_position_unverified')
 const geometry=validatePassageGeometry(bot,door)
 if(!geometry.ok)return geometry
 const a=geometry.from
 if(flat(self).join(',')!==a.join(','))
   return fail('crossing_not_at_observed_door_side')
 if(Math.hypot(self.x-a[0]-.5,self.y-a[1],self.z-a[2]-.5)>0.95)
   return fail('crossing_approach_pose_not_centered')
 return geometry
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function crossDoor(bot,door,{
 signal,safe=()=>({ok:true}),movementEvidence,clock=Date.now,
 sleep=wait,setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout,
 timeoutMs=5000,pulseMs=120,maxPulses=8
}={}){
 const initial=validateCrossing(bot,door)
 if(!initial.ok)return {...initial,attempted:false,serverMovementVerified:false}
 if(typeof bot.lookAt!=='function'||typeof bot.setControlState!=='function')
   return {ok:false,reason:'crossing_bedrock_input_unavailable',
     attempted:false,serverMovementVerified:false}
 const safety=()=>{
   if(signal?.aborted)return 'crossing_aborted'
   try{
     const result=safe()
     if(result===true||result?.ok===true)return null
     const reason=result&&typeof result.reason==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(result.reason)?
       result.reason:'safety_gate_rejected'
     return 'crossing_preempted:'+reason
   }catch{return 'crossing_safety_gate_error'}
 }
 const denied=safety()
 if(denied)return {ok:false,reason:denied,attempted:false,serverMovementVerified:false}
 const checkpoint=movementEvidence?.checkpoint?.()||null
 const lane=planOpenDoorLane(bot,initial)
 const probe=createDoorMotionProbe(bot,initial.door,movementEvidence,{clock})
 let timer,listener,done=false,attempted=false,pulses=0
 const deadline=new Promise((_,reject)=>{
   timer=setTimeoutFn(()=>{done=true;reject(Error('crossing_timeout'))},Math.min(6000,Math.max(1500,timeoutMs)))
   listener=()=>{
     try{bot.setControlState('forward',false)}catch{}
     reject(Error('crossing_aborted'))
   }
   signal?.addEventListener?.('abort',listener,{once:true})
 })
 const a=initial.from,d=initial.door,b=initial.beyond,ux=d[0]-a[0],uz=d[2]-a[2]
 let lanePulses=0,laneAligned=false
 const movement=()=>{
   const p=bot.entity?.position
   if(!p||![p.x,p.y,p.z].every(Number.isFinite)||bot.entity.onGround!==true||
      Math.abs(p.y-a[1])>0.55)return {ok:false,reason:'crossing_local_ground_lost'}
   const dx=p.x-a[0]-.5,dz=p.z-a[2]-.5
   const forward=dx*ux+dz*uz
   const lateral=Math.abs(-dx*uz+dz*ux)
   if(lateral>0.34||forward<-.25||forward>2.58)
     return {ok:false,reason:'crossing_outside_bounded_corridor'}
   return {ok:true,forward,arrived:flat(p).join(',')===b.join(',')&&
     forward>=1.6&&forward<=2.58}
 }
 try{
   const walk=async()=>{
     const before=safety()
     if(before)throw Error(before)
     // An observed open door with no collision-free player-width interval
     // is NOT a traversable doorway. No forward input or fake geometry.
     if(lane.reason==='door_lane_no_body_width_clearance')
       throw Error('crossing_collision_lane_blocked')
     // The genuine open-door shape in Bedrock 1.26 may obstruct a 0.6-wide
     // player when the pathfinder stops a few cm off the passable strip.
     // Only if both observed door halves expose valid shapes, make at most
     // four 65ms sideways *physical* corrections inside the known floor cell.
     // Do not rewrite collision data, teleport, or extend forward blind travel.
     const eye=Number.isFinite(bot.entity?.eyeHeight)?bot.entity.eyeHeight:1.62
     if(lane.ok){
       const safeLateral=p=>Number.isFinite(p?.[lane.axis])&&
         p[lane.axis]>=lane.validMin+.008&&p[lane.axis]<=lane.validMax-.008
       const atOriginalTile=p=>p?.onGround!==false&&
         flat(p).join(',')===a.join(',')
       for(let i=0;i<4&&!safeLateral(bot.entity?.position);i++){
         if(done)throw Error('crossing_timeout')
         const stopped=safety()
         if(stopped)throw Error(stopped)
         const p=bot.entity?.position
         if(!p||!atOriginalTile(p)||bot.entity.onGround!==true||
            Math.abs(lane.target-p[lane.axis])>.26||
            clearDoorway(bot,a,d,b))
           throw Error('crossing_lateral_alignment_unverified')
         const direction=Math.sign(lane.target-p[lane.axis])
         if(!direction)break
         const next={x:p.x,y:p.y+eye,z:p.z}
         next[lane.axis]+=direction
         await bot.lookAt(next)
         lanePulses++
         try{
           bot.setControlState('forward',true)
           await sleep(65)
         }finally{bot.setControlState('forward',false)}
       }
       if(!safeLateral(bot.entity?.position))
         throw Error('crossing_lateral_alignment_unverified')
       laneAligned=true
     }
     const orientation=safety()
     if(orientation)throw Error(orientation)
     await bot.lookAt({x:b[0]+.5,y:b[1]+eye,z:b[2]+.5})
     let previous=0,still=0
     for(let i=0;i<Math.max(1,Math.min(8,maxPulses));i++){
       if(done)throw Error('crossing_timeout')
       const stopped=safety()
       if(stopped)throw Error(stopped)
       const hazard=clearDoorway(bot,a,d,b)
       if(hazard)throw Error(hazard)
       const position=movement()
       if(!position.ok)throw Error(position.reason)
       if(position.arrived)return
       if(position.forward-previous<.04&&i>0)still++
       else still=0
       if(still>=3)throw Error('crossing_no_local_forward_progress')
       previous=position.forward
       attempted=true;pulses++
       try{
         bot.setControlState('forward',true)
         await sleep(Math.min(160,Math.max(60,pulseMs)))
       }finally{bot.setControlState('forward',false)}
     }
     if(!movement().arrived)throw Error('crossing_local_endpoint_unverified')
   }
   await Promise.race([walk(),deadline])
   const evidence=movementEvidence?.progress?.(checkpoint)||{confirmed:false,reason:'no_server_position_delta'}
   const server=movementEvidence?.get?.()
   const p=server?.latestFeet
   const age=Number.isFinite(server?.lastAt)?clock()-server.lastAt:Infinity
   const serverNear=p&&[p.x,p.y,p.z].every(Number.isFinite)&&
     Math.hypot(p.x-b[0]-.5,p.y-b[1],p.z-b[2]-.5)<=1.1
   const confirmed=Boolean(evidence.confirmed===true&&age>=0&&age<=5000&&serverNear)
   return {ok:confirmed,attempted:attempted||lanePulses>0,door:initial.door,beyond:initial.beyond,pulses,
     doorLane:{reason:lane.reason||'observed_collision_shape',alignmentPulses:lanePulses,
       aligned:laneAligned,axis:lane.ok?lane.axis:null},
     serverMovementVerified:confirmed,
     reason:confirmed?'door_passage_server_confirmed_room_exit_unverified':
       'door_passage_local_only_server_unverified',
     serverEvidenceReason:evidence.reason||null}
 }catch(err){
   const reason=String(err?.message||'crossing_failed').slice(0,85)
   const diagnostic=/^crossing_(no_local_forward_progress|local_endpoint_unverified|outsi?de_bounded_corridor|lateral_alignment_unverified|collision_lane_blocked)$/.test(reason)?
     probe.finish(reason):null
   return {ok:false,reason,attempted:attempted||lanePulses>0,door:initial.door,beyond:initial.beyond,pulses,
     doorLane:{reason:lane.reason||'observed_collision_shape',alignmentPulses:lanePulses,
       aligned:laneAligned,axis:lane.ok?lane.axis:null},
     serverMovementVerified:false,...(diagnostic?{movementDiagnostic:diagnostic}:{})}
 }finally{
   done=true;clearTimeoutFn(timer);signal?.removeEventListener?.('abort',listener)
   try{bot.setControlState('forward',false)}catch{}
   probe.finish('crossing_finalized')
 }
}
module.exports={validatePassageGeometry,validateCrossing,crossDoor}
