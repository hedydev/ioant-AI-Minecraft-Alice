'use strict'
// One bounded, non-destructive movement-input diagnosis after A* says noPath.
// It is NOT an A* replacement and NEVER chains an unverified local position.
const {boxes}=require('./voxel_actions.cjs')
const HAZARD=/(lava|fire|magma|cactus|campfire|powder_snow|water|bubble_column|sweet_berry_bush)/
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const fail=(reason,extra={})=>({ok:false,reason,attempted:false,serverMovementVerified:false,...extra})
const waypointCenter=w=>({x:w.x+.5,y:w.y,z:w.z+.5})
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
// A* may successfully traverse one or more voxels before throwing on a
// later GoalNear. Never blindly probe candidate.waypoints[0] again.
// Select at most ONE adjacent, geometry-rechecked target from local evidence;
// selection itself is NOT proof the BDS server accepted earlier movement.
function selectFailedFlatStep(candidate,failedWaypoint,current){
  if(candidate?.kind!=='observed_voxel_walking_only'||
     !Array.isArray(candidate.waypoints)||!candidate.waypoints.length||
     !finite(current))return fail('direct_flat_selection_unavailable')
  const list=candidate.waypoints
  const idx=failedWaypoint?list.findIndex(w=>w.x===failedWaypoint.x&&
    w.y===failedWaypoint.y&&w.z===failedWaypoint.z):-1
  if(failedWaypoint&&idx<0)return fail('direct_flat_failed_waypoint_not_in_route')
  if(!list.every(w=>finite(w)&&[w.x,w.y,w.z].every(Number.isSafeInteger)))
    return fail('direct_flat_route_geometry_unverified')
  const startIndex=idx>=0?idx:0
  // If the failed cell is already locally reached, do not keep probing it.
  // Only the immediately following voxel is eligible, with no skipped gap.
  const probeIndex=dist(current,waypointCenter(list[startIndex]))<=.4?
    startIndex+1:startIndex
  if(probeIndex>=list.length)return fail('direct_flat_last_waypoint_already_local')
  const target=list[probeIndex]
  const feet={x:Math.floor(current.x),y:current.y,z:Math.floor(current.z)}
  if(Math.abs(current.y-target.y)>.12||
    Math.abs(feet.x-target.x)+Math.abs(feet.z-target.z)!==1)
    return fail('direct_flat_failed_waypoint_not_adjacent')
  if(probeIndex>0&&dist(current,waypointCenter(list[probeIndex-1]))>.55)
    return fail('direct_flat_route_prefix_unverified')
  const tail={...candidate,waypoints:list.slice(probeIndex)}
  return {ok:true,candidate:tail,selectedWaypoint:target,
    selectedIndex:probeIndex,failedIndex:idx,
    reason:'adjacent_failed_waypoint_selected_from_local_geometry',
    serverPositionVerified:false}
}
function verifyFlatFirstStep(bot,candidate){
  const from=bot?.entity?.position
  if(!finite(from)||!from.offset||bot.entity.onGround!==true||typeof bot.blockAt!=='function')
    return fail('direct_flat_ground_unverified')
  if(candidate?.kind!=='observed_voxel_walking_only'||
     !Array.isArray(candidate.waypoints)||candidate.waypoints.length<1||
     !candidate.waypoints.every(p=>finite(p)&&Math.abs(p.y-from.y)<.12))
    return fail('direct_flat_nonlevel_candidate')
  const first=candidate.waypoints[0],cx=first.x+.5,cz=first.z+.5
  if(![first.x,first.y,first.z].every(Number.isSafeInteger)||
     Math.abs(Math.floor(from.x)-first.x)+Math.abs(Math.floor(from.z)-first.z)>1)
    return fail('direct_flat_first_waypoint_not_adjacent')
  if(Math.abs(from.x-cx)>1.6||Math.abs(from.z-cz)>1.6)
    return fail('direct_flat_waypoint_too_far')
  let rejectedBlockReason='direct_flat_unknown_block'
  const hazard=b=>HAZARD.test(String(b?.name||''))
  const read=(x,y,z)=>{
    const block=bot.blockAt(from.offset(x-from.x,y-from.y,z-from.z))
    if(!block){rejectedBlockReason='direct_flat_unknown_block';return null}
    if(hazard(block)){rejectedBlockReason='direct_flat_hazard';return null}
    // Opening an already-open door requires the independently verified
    // door executor, not a permissive collision-shaped forward pulse.
    if(/(?:_door|trapdoor)$/.test(String(block.name||''))){
      rejectedBlockReason='direct_flat_stateful_door';return null
    }
    const shape=boxes(block)
    if(shape===null)rejectedBlockReason='direct_flat_collision_shape_unverified'
    return shape
  }
  const stepDist=Math.hypot(cx-from.x,cz-from.z)
  const samples=Math.max(2,Math.ceil(stepDist/.16))
  try{
    for(let i=0;i<=samples;i++){
      const fraction=i/samples,x=from.x+(cx-from.x)*fraction,
        z=from.z+(cz-from.z)*fraction,y=from.y
      for(const dx of [-.29,0,.29])for(const dz of [-.29,0,.29]){
        const px=x+dx,pz=z+dz,by=Math.floor(y-.001),shape=read(Math.floor(px),by,Math.floor(pz))
        if(!shape)return fail(rejectedBlockReason)
        if(!shape.some(a=>Math.abs(by+a[4]-y)<.015&&
          px-Math.floor(px)>=a[0]-.0001&&px-Math.floor(px)<=a[3]+.0001&&
          pz-Math.floor(pz)>=a[2]-.0001&&pz-Math.floor(pz)<=a[5]+.0001))
          return fail('direct_flat_unsupported_footprint')
      }
      for(let bx=Math.floor(x-.3);bx<=Math.floor(x+.3);bx++)
        for(let bz=Math.floor(z-.3);bz<=Math.floor(z+.3);bz++)
          for(let by=Math.floor(y);by<Math.ceil(y+1.8);by++){
            const shapes=read(bx,by,bz)
            if(!shapes)return fail(rejectedBlockReason)
            if(shapes.some(a=>bx+a[0]<x+.3-.001&&bx+a[3]>x-.3+.001&&
               bz+a[2]<z+.3-.001&&bz+a[5]>z-.3+.001&&
               by+a[1]<y+1.8-.001&&by+a[4]>y+.001))
              return fail('direct_flat_collision_observed')
          }
    }
    return {ok:true,first,center:{x:cx,y:first.y,z:cz},sampleCount:samples+1}
  }catch{return fail('direct_flat_block_read_failed')}
}
function safeReason(safe){
  try{
    const r=safe()
    if(r===true||r?.ok===true)return null
    return r&&typeof r.reason==='string'&&/^[a-z][a-z0-9_]{1,64}$/.test(r.reason)?
      r.reason:'safety_gate_denied'
  }catch{return 'safety_gate_failed'}
}
async function probeFlatInput(bot,candidate,{
  signal,safe=()=>true,movementEvidence,clock=Date.now,sleep=wait,
  maxPulses=5,pulseMs=100
}={}){
  const gate=verifyFlatFirstStep(bot,candidate)
  if(!gate.ok)return gate
  if(typeof bot.lookAt!=='function'||typeof bot.setControlState!=='function')
    return fail('direct_flat_input_api_unavailable')
  let denied=safeReason(safe)
  if(signal?.aborted||denied)return fail(denied||'direct_flat_aborted')
  const start={...bot.entity.position},checkpoint=movementEvidence?.checkpoint?.()||null
  let pulses=0,physicsTicks=0,attempted=false,lastLocal=0
  const onTick=()=>physicsTicks++
  bot.on?.('physicsTick',onTick)
  const max=Math.min(6,Math.max(1,Number.isSafeInteger(maxPulses)?maxPulses:5)),
    duration=Math.min(125,Math.max(75,pulseMs))
  try{
    await bot.lookAt({x:gate.center.x,y:gate.center.y+(bot.entity.eyeHeight||1.62),
      z:gate.center.z},true)
    for(let i=0;i<max;i++){
      denied=safeReason(safe)
      if(signal?.aborted||denied)return fail('direct_flat_preempted_'+(denied||'abort'),
        {attempted,pulses,physicsTicks})
      // The chosen corridor can change during any tick: verify observed
      // blocks again and never continue from unknown or dangerous geometry.
      const fresh=verifyFlatFirstStep(bot,candidate)
      if(!fresh.ok&&i===0)return fresh
      // Once the first cell is entered, the original first waypoint is not
      // "adjacent" anymore. Recheck a fresh stationary radius instead of
      // authorizing a second block or another path.
      if(!fresh.ok)
        return fail('direct_flat_geometry_changed',{attempted,pulses,physicsTicks})
      const before=bot.entity.position
      if(!finite(before)||bot.entity.onGround!==true||
         Math.abs(before.y-start.y)>.15||
         Math.hypot(before.x-start.x,before.z-start.z)>1.15)
        return fail('direct_flat_left_verified_first_step',{attempted,pulses,physicsTicks})
      const goalDistance=Math.hypot(before.x-gate.center.x,before.z-gate.center.z)
      if(goalDistance<=.4){
        // A* may have already placed Alice at the first cell's center,
        // while returning noPath for a later goal/recalculation. Not pressing
        // forward is NOT evidence of a failed native player_auth_input.
        if(!attempted)return {ok:false,
          reason:'direct_flat_first_waypoint_already_local',
          attempted:false,pulses:0,physicsTicks,
          localEstimateBlocks:0,serverMovementVerified:false,
          firstWaypoint:gate.first,
          serverEvidenceReason:'no_new_physical_input_was_sent'}
        break
      }
      // No continuous held keys across timer/action ownership transitions.
      attempted=true;pulses++
      try{bot.setControlState('forward',true);await sleep(duration)}
      finally{bot.setControlState('forward',false)}
      const now=bot.entity?.position
      if(!finite(now))return fail('direct_flat_local_position_lost',{attempted,pulses,physicsTicks})
      lastLocal=Math.hypot(now.x-start.x,now.y-start.y,now.z-start.z)
      if(lastLocal>.95||Math.abs(now.y-start.y)>.15||bot.entity.onGround!==true)
        break
      // Failed physics simulation => stop quickly instead of spamming inputs.
      if(i>=2&&lastLocal<.06)break
    }
    const movement=movementEvidence?.progress?.(checkpoint)||{confirmed:false,reason:'no_server_packet_checkpoint'}
    const evidence=movementEvidence?.get?.()
    const feet=evidence?.latestFeet,age=Number.isFinite(evidence?.lastAt)?clock()-evidence.lastAt:Infinity
    const serverAtFirst=finite(feet)&&
      Math.hypot(feet.x-gate.center.x,feet.y-gate.center.y,feet.z-gate.center.z)<.9
    const confirmed=movement.confirmed===true&&age>=0&&age<5000&&serverAtFirst
    return {ok:confirmed,reason:confirmed?'direct_flat_step_server_confirmed':
        lastLocal>=.12?'scout_local_movement_not_server_verified':'direct_flat_no_local_motion',
      attempted,pulses,physicsTicks,localEstimateBlocks:Math.round(lastLocal*100)/100,
      serverMovementVerified:confirmed,serverEvidenceReason:String(movement.reason||'unknown').slice(0,70),
      firstWaypoint:gate.first}
  }catch(e){
    return fail('direct_flat_input_error',{attempted,pulses,physicsTicks,
      detail:String(e.message||'error').slice(0,60)})
  }finally{
    try{bot.setControlState('forward',false)}catch{}
    bot.off?.('physicsTick',onTick)
  }
}
module.exports={verifyFlatFirstStep,probeFlatInput,selectFailedFlatStep}
