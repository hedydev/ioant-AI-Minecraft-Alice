'use strict'
// Carefully bounded, non-destructive walk toward one observed indoor doorway.
// A connected local route is a proposal, NOT proof of server movement or exit.
const {fullSupport,knownWalkingClear}=require('./escape_survey.cjs')
const {verifyFlatFirstStep}=require('./direct_flat_step.cjs')
const {scoutStartProof}=require('./scout_start_proof.cjs')
// Survey may observe up to 12 cells, while the physical executor still
// admits exactly ONE step per independent BDS endpoint. This bound controls
// observation only, not the distance driven by a single action.
const MAX_WAYPOINTS=12
const xyz=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isSafeInteger)
// The owner may supply an {ok,reason} gate for actionable diagnostics.
// Legacy boolean gates keep their original generic error strings.
function safetyDenial(safe){
 try{
   const result=safe()
   if(result===true||result?.ok===true)return null
   const reason=result&&typeof result==='object'?result.reason:null
   return typeof reason==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(reason)?
     reason:'safety_gate_rejected'
 }catch{return 'safety_gate_error'}
}
function deniedReason(prefix,denial){
 return denial==='safety_gate_rejected'?prefix:prefix+':'+denial
}
function at(bot,x,y,z){
 const p=bot.entity.position
 return bot.blockAt(p.offset(x-p.x,y-p.y,z-p.z))
}
function validateApproach(bot,door,{maxSteps=MAX_WAYPOINTS}={}){
 const fail=reason=>({ok:false,reason})
 const self=bot?.entity?.position,route=door?.approach?.waypoints
 if(!self||![self.x,self.y,self.z].every(Number.isFinite)||!self.offset||
    bot.entity.onGround!==true||typeof bot.blockAt!=='function')
   return fail('approach_position_or_ground_unverified')
 if(door?.kind!=='wooden_door'||door?.permitted!==false||!xyz(door.position)||
    door.approach?.routeComplete!==true||door.approach?.serverVerified!==false||
    door.approach?.elevationChanges!==0||!xyz(door.approach.position)||
    !Array.isArray(route)||!route.length||route.length>Math.min(maxSteps,MAX_WAYPOINTS)||
    route.length!==door.approach.steps||!route.every(xyz))
   return fail('approach_route_not_eligible')
 const origin=[Math.floor(self.x),Math.floor(self.y),Math.floor(self.z)]
 const [dx,dy,dz]=door.position
 const end=route[route.length-1]
 if(end.join(',')!==door.approach.position.join(',')||
    dy!==end[1]||Math.abs(end[0]-dx)+Math.abs(end[2]-dz)!==1)
   return fail('approach_not_adjacent_to_door')
 let previous=origin
 try{
   if(!fullSupport(at(bot,origin[0],origin[1]-1,origin[2]))||
     !knownWalkingClear(at(bot,origin[0],origin[1],origin[2]))||
     !knownWalkingClear(at(bot,origin[0],origin[1]+1,origin[2])))
     return fail('approach_current_cell_unverified')
   for(const cell of route){
     if(cell[1]!==previous[1]||
        Math.abs(cell[0]-previous[0])+Math.abs(cell[2]-previous[2])!==1)
       return fail('approach_nonadjacent_or_vertical_segment')
     if(!fullSupport(at(bot,cell[0],cell[1]-1,cell[2]))||
       !knownWalkingClear(at(bot,cell[0],cell[1],cell[2]))||
       !knownWalkingClear(at(bot,cell[0],cell[1]+1,cell[2])))
       return fail('approach_cell_blocked_or_unloaded')
     previous=cell
   }
 }catch{return fail('approach_block_read_failed')}
 return {ok:true,waypoints:route.map(([x,y,z])=>({x,y,z})),
   door:door.position.slice(),steps:route.length,serverVerified:false}
}

async function approachDoor(bot,door,{
 signal,safe=()=>true,GoalNear,Movements,configureMoves,
 movementEvidence,clock=Date.now,
 timeoutMs=12000,setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout
}={}){
 const fail=(reason,extra={})=>({ok:false,reason,attempted:false,
   serverMovementVerified:false,...extra})
 const gate=validateApproach(bot,door)
 if(!gate.ok)return fail(gate.reason)
 if(!bot?.pathfinder?.goto||!bot.pathfinder.setMovements||
    typeof GoalNear!=='function'||typeof Movements!=='function'||
    typeof configureMoves!=='function')
   return fail('approach_pathfinder_unavailable')
 if(signal?.aborted)return fail('approach_preempted')
 const initialDenial=safetyDenial(safe)
 if(initialDenial)return fail(deniedReason('approach_preempted',initialDenial))
 // The caller may observe up to twelve reachable cells, but must NEVER drive
 // more than ONE unverified waypoint. The NEXT cell requires an entirely
 // new independent BDS post-input pair plus a new collision/goal survey.
 const witness=scoutStartProof(bot,movementEvidence,clock)
 if(!witness.ok)return fail(witness.reason)
 const baseline=movementEvidence.get(),first=gate.waypoints[0]
 const start=bot.entity.position
 if(!Number.isSafeInteger(baseline.independentAt)||
    baseline.independentAt>=clock()||
    !baseline.independentLatestFeet)
   return fail('approach_bds_start_unavailable')
 const sweep=verifyFlatFirstStep(bot,{kind:'observed_voxel_walking_only',
    waypoints:[first]})
 if(!sweep.ok)return fail(sweep.reason)
 const context={
   from:{x:baseline.independentLatestFeet.x,y:baseline.independentLatestFeet.y,
     z:baseline.independentLatestFeet.z},
   target:{x:first.x,y:first.y,z:first.z},
   independentAt:baseline.independentAt,
   independentSamples:baseline.independentSamples,
   loginAt:baseline.loginAt??null,lifeEpochAt:baseline.lifeEpochAt??null
 }
 let done=false,timer,abortListener,attempted=false
 const end=new Promise((_,reject)=>{
   timer=setTimeoutFn(()=>{done=true;reject(Error('approach_timeout'))},
     Math.min(15000,Math.max(3000,timeoutMs)))
   abortListener=()=>reject(Error('approach_aborted'))
   signal?.addEventListener?.('abort',abortListener,{once:true})
 })
 try{
   const moves=new Movements(bot)
   configureMoves(moves)
   moves.canDig=false;moves.allow1by1towers=false;moves.allowParkour=false
   moves.canOpenDoors=false;moves.openable?.clear?.()
   bot.pathfinder.setMovements(moves)
   const before=safetyDenial(safe)
   if(before)throw Error(deniedReason('approach_conditions_changed',before))
   // Re-sweep immediately before sending movement input. A loaded block,
   // nearby hazard, changed ground/ceiling, or even a door blocks admission.
   const fresh=verifyFlatFirstStep(bot,{kind:'observed_voxel_walking_only',
      waypoints:[first]})
   if(!fresh.ok)throw Error(fresh.reason)
   const startedAt=clock()
   if(startedAt<=context.independentAt)throw Error('approach_bds_start_expired')
   attempted=true
   await Promise.race([bot.pathfinder.goto(
      new GoalNear(first.x,first.y,first.z,0)),end])
   if(done||signal?.aborted)throw Error('approach_preempted_after_move')
   const after=safetyDenial(safe)
   if(after)throw Error(deniedReason('approach_preempted_after_move',after))
   const p=bot.entity?.position
   if(!p||bot.entity.onGround!==true||
      Math.hypot(p.x-first.x-.5,p.y-first.y,p.z-first.z-.5)>.95)
     throw Error('approach_waypoint_not_observed')
   // This local result is deliberately NOT a success. The owner must retain
   // the pre-input witness context and verify a completely NEW BDS pair.
   return {ok:false,reason:'approach_first_cell_awaits_independent_bds_pair',
     attempted:true,steps:1,remainingSteps:gate.steps-1,
     door:gate.door,lastWaypoint:first,startedAt,
     witnessStart:context,serverMovementVerified:false}
 }catch(err){
   return {ok:false,reason:String(err?.message||'approach_failed').slice(0,76),
     attempted,door:gate.door,lastWaypoint:attempted?first:null,
     serverMovementVerified:false}
 }finally{
   done=true;clearTimeoutFn(timer);signal?.removeEventListener?.('abort',abortListener)
   if(!signal?.aborted)bot.pathfinder.stop?.()
 }
}

module.exports={validateApproach,approachDoor,MAX_WAYPOINTS}
