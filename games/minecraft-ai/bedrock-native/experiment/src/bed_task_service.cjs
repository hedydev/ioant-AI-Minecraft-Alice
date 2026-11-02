'use strict'
// Shared typed bed request from Minecraft chat or localhost dashboard.
// No movement or bed interaction without the current-life independent BDS pair.
const {selectAdjacentBed,useBedForSpawn}=require('./bed_spawnpoint.cjs')
const {scoutStartProof}=require('./scout_start_proof.cjs')
const {environment}=require('./world_routine.cjs')
const {outcome,message}=require('./bed_request_outcome.cjs')
const TIMEOUT=240000
const TYPES=new Set(['sleep','set_spawnpoint'])
const hasSpawn=r=>r.currentRespawnStatus?.()==='observed_server_player_spawn_packet'||
  r.homeBed.summary().status!=='not_verified'
function cancelBed(r,reason='bed_request_cancelled'){
 const p=r.pendingBedRequest
 if(!p)return false
 r.pendingBedRequest=null
 clearTimeout(p.timer)
 p.report?.('failed',reason,message({reason}))
 return true
}
function requestBed(r,action,source,report=null){
 const reply=(status,reason,text)=>({status,reason,message:text})
 if(!TYPES.has(action))return reply('rejected','unsupported_bed_action','不支持此床任务')
 if(r.pendingBedRequest||r.job)return reply('rejected','job_in_progress','已有任务在进行')
 if(r.closed||!r.ready())return reply('rejected','bed_runtime_not_ready','尚未同步可靠生命和背包')
 if(r.bot.isSleeping)return reply('completed','already_sleeping','Alice 已经在睡觉')
 if(r.core.hasFollowIntent()||r.safetyBusy||r.threat()||
    r.goalPlanner.stoppedByHuman||r.bot.health<14)
   return reply('rejected','bed_safety_or_follow_priority','当前有危险、跟随或停止指令，暂不启动床任务')
 if(r.bot.game?.dimension!=='overworld')
   return reply('rejected','bed_wrong_dimension','这个维度不能使用普通床')
 if(action==='set_spawnpoint'&&hasSpawn(r))
   return reply('completed','existing_personal_spawn','已有服务器确认过的重生点')
 // Only loaded, verified bed cells; a farther candidate is NOT a safe route.
 const positions=r.observedBeds.nearby(r.bot,{radius:12})
 const choice=selectAdjacentBed(r.bot,positions,{radius:12})
 if(!choice.bed)return reply('rejected',choice.reason,message({reason:choice.reason}))
 const now=r.clock(),ev=r.movementEvidence?.get?.()
 const p={action,source,report,at:now,expiresAt:now+TIMEOUT,
   epoch:r.epoch,loginAt:ev?.loginAt??null,lifeEpochAt:ev?.lifeEpochAt??null,
   dimension:r.bot.game?.dimension,
   position:{x:choice.bed.position.x,y:choice.bed.position.y,z:choice.bed.position.z},
   timer:null}
 p.timer=setTimeout(()=>{
  if(r.pendingBedRequest===p)cancelBed(r,'bed_request_expired')
 },TIMEOUT)
 p.timer.unref?.()
 r.pendingBedRequest=p
 const next=resumeBed(r)
 if(next.state==='started')return reply('started','bed_interaction_started','已找到床，正在等待服务器确认')
 if(next.state==='completed')return reply('completed',next.reason,next.message)
 if(next.state==='rejected')return reply('rejected',next.reason,message({reason:next.reason}))
 return reply('started','awaiting_bds_bed_proof',
   '找到可触及的床；等待新鲜 BDS 双坐标证明，不会擅自移动')
}
function resumeBed(r){
 const p=r.pendingBedRequest
 if(!p)return {state:'none'}
 const deny=(reason)=>{
  if(r.pendingBedRequest===p)cancelBed(r,reason)
  return {state:'rejected',reason}
 }
 const now=r.clock(),ev=r.movementEvidence?.get?.()
 if(now<p.at||now>p.expiresAt||r.epoch!==p.epoch||
    r.bot.game?.dimension!==p.dimension||
    (ev?.loginAt??null)!==p.loginAt||
    (ev?.lifeEpochAt??null)!==p.lifeEpochAt)
   return deny('bed_request_context_changed')
 if(!r.ready()||r.closed||r.job||r.bot.isSleeping||r.safetyBusy||
    r.threat()||r.core.hasFollowIntent()||
    r.goalPlanner.stoppedByHuman||r.bot.health<14)
   return deny('bed_safety_or_follow_priority')
 const proof=scoutStartProof(r.bot,r.movementEvidence,r.clock)
 if(!proof.ok)return proof.reason==='scout_bds_position_unavailable'?
   {state:'waiting',reason:proof.reason}:deny(proof.reason)
 const choice=selectAdjacentBed(r.bot,[p.position],{radius:2})
 if(!choice.bed||['x','y','z'].some(k=>choice.bed.position[k]!==p.position[k]))
   return deny('bed_changed_or_no_longer_adjacent')
 r.pendingBedRequest=null;clearTimeout(p.timer)
 const known=hasSpawn(r)
 if(p.action==='set_spawnpoint'&&known){
  p.report?.('completed','existing_personal_spawn','已有确认过的个人重生点')
  return {state:'completed',reason:'existing_personal_spawn',message:'已有确认过的个人重生点'}
 }
 r.startJob('RECOVER',p.source,async signal=>{
  const safe=()=>!signal.aborted&&!r.closed&&r.ready()&&!r.threat()&&
    !r.core.hasFollowIntent()&&r.bot.health>=14
  let spawnConfirmed=known,sleepEntered=false,woke=false
  let reason='bed_interaction_unconfirmed'
  try{
   const proof2=scoutStartProof(r.bot,r.movementEvidence,r.clock)
   const current=selectAdjacentBed(r.bot,[p.position],{radius:2})
   if(!proof2.ok||!current.bed||!safe())
    reason=!proof2.ok?proof2.reason:'bed_interaction_preempted'
   else{
    if(!spawnConfirmed){
     const result=await useBedForSpawn(r.bot,current.bed,{
       evidence:r.movementEvidence,clock:r.clock,signal,safe})
     spawnConfirmed=result.serverConfirmed===true&&r.homeBed.confirm(result)
     sleepEntered=result.rest?.entered===true
     woke=result.rest?.woke===true
     reason=result.reason
    }
    // Never invoke the pathfinder from this explicit bed command.
    // Distant beds must first be reached by a separately admitted route.
    if(p.action==='sleep'&&!sleepEntered&&safe()&&
       environment(r.bot).canSleep&&
       scoutStartProof(r.bot,r.movementEvidence,r.clock).ok){
     const rest=await r.ops.sleepNearby({
       signal,radius:2,knownPositions:[p.position],
       forbidNavigation:true,requireBdsProof:true})
     sleepEntered=rest?.entered===true||rest?.alreadySleeping===true
     woke=rest?.woke===true
     reason=rest?.reason||reason
    }
   }
  }catch(err){reason='bed_task_exception'}
  const result=outcome(p.action,{spawnConfirmed,sleepEntered,woke,
    sleepWindow:environment(r.bot).canSleep,reason,bed:p.position})
  if(!signal.aborted){
   r.lastSleepOpportunity={status:result.reason,action:p.action,
     spawnConfirmed:result.spawnConfirmed,sleepEntered:result.sleepEntered,
     nightSkipped:false,at:r.clock()}
   p.report?.(result.ok?'completed':'failed',result.reason,message(result))
  }
  return result
 },{label:p.action==='sleep'?'使用床睡觉':'设置床的重生点',announce:false})
 if(!r.job){
  p.report?.('failed','bed_job_start_denied','安全条件不允许与床交互')
  return {state:'rejected',reason:'bed_job_start_denied'}
 }
 return {state:'started',reason:'bed_interaction_started'}
}
module.exports={requestBed,resumeBed,cancelBed,TIMEOUT}
