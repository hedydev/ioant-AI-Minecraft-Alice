'use strict'
// Carefully bounded, non-destructive walk toward one observed indoor doorway.
// A connected local route is a proposal, NOT proof of server movement or exit.
const {knownAir}=require('./scout_routes.cjs')
const {fullSupport}=require('./escape_survey.cjs')
const MAX_WAYPOINTS=6
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
     !knownAir(at(bot,origin[0],origin[1],origin[2]))||
     !knownAir(at(bot,origin[0],origin[1]+1,origin[2])))
     return fail('approach_current_cell_unverified')
   for(const cell of route){
     if(cell[1]!==previous[1]||
        Math.abs(cell[0]-previous[0])+Math.abs(cell[2]-previous[2])!==1)
       return fail('approach_nonadjacent_or_vertical_segment')
     if(!fullSupport(at(bot,cell[0],cell[1]-1,cell[2]))||
       !knownAir(at(bot,cell[0],cell[1],cell[2]))||
       !knownAir(at(bot,cell[0],cell[1]+1,cell[2])))
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
 timeoutMs=12000,
 setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout
}={}){
 const gate=validateApproach(bot,door)
 if(!gate.ok)return {...gate,attempted:false,serverMovementVerified:false}
 if(!bot?.pathfinder?.goto||!bot.pathfinder.setMovements||
    typeof GoalNear!=='function'||typeof Movements!=='function'||
    typeof configureMoves!=='function')
   return {ok:false,reason:'approach_pathfinder_unavailable',attempted:false,serverMovementVerified:false}
 if(signal?.aborted)
   return {ok:false,reason:'approach_preempted',attempted:false,serverMovementVerified:false}
 const initialDenial=safetyDenial(safe)
 if(initialDenial)
   return {ok:false,reason:deniedReason('approach_preempted',initialDenial),
     attempted:false,serverMovementVerified:false}
 let done=false,timer,abortListener,last=null,attempted=false
 const checkpoint=movementEvidence?.checkpoint?.()||null
 const end=new Promise((_,reject)=>{
   timer=setTimeoutFn(()=>{done=true;reject(Error('approach_timeout'))},Math.min(15000,Math.max(3000,timeoutMs)))
   abortListener=()=>reject(Error('approach_aborted'))
   signal?.addEventListener?.('abort',abortListener,{once:true})
 })
 try{
   const moves=new Movements(bot)
   configureMoves(moves)
   moves.canDig=false;moves.allow1by1towers=false;moves.allowParkour=false
   moves.canOpenDoors=false;moves.openable?.clear?.()
   bot.pathfinder.setMovements(moves)
   const navigate=async()=>{
     for(const waypoint of gate.waypoints){
       if(done||signal?.aborted)throw Error('approach_conditions_changed')
       const beforeDenial=safetyDenial(safe)
       if(beforeDenial)throw Error(deniedReason('approach_conditions_changed',beforeDenial))
       const local=bot.entity?.position
       if(!local||Math.abs(local.y-waypoint.y)>0.55||bot.entity.onGround!==true)
         throw Error('approach_ground_changed')
       // Each target is still one known-adjacent full-support cell. Recheck
       // after prior movement because cached chunks may change in real time.
       if(Math.abs(Math.floor(local.x)-waypoint.x)+Math.abs(Math.floor(local.z)-waypoint.z)!==1||
          !fullSupport(at(bot,waypoint.x,waypoint.y-1,waypoint.z))||
          !knownAir(at(bot,waypoint.x,waypoint.y,waypoint.z))||
          !knownAir(at(bot,waypoint.x,waypoint.y+1,waypoint.z)))
         throw Error('approach_segment_no_longer_safe')
       last=waypoint;attempted=true
       await bot.pathfinder.goto(new GoalNear(waypoint.x,waypoint.y,waypoint.z,0))
       if(done||signal?.aborted)throw Error('approach_preempted_after_move')
       const afterDenial=safetyDenial(safe)
       if(afterDenial)throw Error(deniedReason('approach_preempted_after_move',afterDenial))
       const p=bot.entity?.position
       if(!p||bot.entity.onGround!==true||
          Math.hypot(p.x-waypoint.x-0.5,p.y-waypoint.y,p.z-waypoint.z-0.5)>0.95)
         throw Error('approach_waypoint_not_observed')
     }
   }
   await Promise.race([navigate(),end])
   const movement=movementEvidence?.progress?.(checkpoint)||{confirmed:false,reason:'server_position_not_observed'}
   const server=movementEvidence?.get?.()
   const s=server?.latestFeet,goal=gate.waypoints.at(-1)
   const age=Number.isFinite(server?.lastAt)?clock()-server.lastAt:Infinity
   const serverDistance=s&&[s.x,s.y,s.z].every(Number.isFinite)?
     Math.hypot(s.x-goal.x-0.5,s.y-goal.y,s.z-goal.z-0.5):Infinity
   const confirmed=movement.confirmed===true&&age>=0&&age<=5000&&serverDistance<=1.5
   return {ok:true,reason:confirmed?'approach_server_confirmed':'approach_local_only_server_unverified',
     attempted:true,steps:gate.steps,door:gate.door,
     lastWaypoint:last,serverMovementVerified:confirmed,
     serverEvidenceReason:movement.reason||null}
 }catch(err){
   return {ok:false,reason:String(err?.message||'approach_failed').slice(0,76),
     attempted,door:gate.door,lastWaypoint:last,serverMovementVerified:false}
 }finally{
   done=true;clearTimeoutFn(timer);signal?.removeEventListener?.('abort',abortListener)
   // Never stop a newer route started by STOP/FOLLOW/safety preemption.
   if(!signal?.aborted)bot.pathfinder.stop?.()
 }
}
module.exports={validateApproach,approachDoor,MAX_WAYPOINTS}
