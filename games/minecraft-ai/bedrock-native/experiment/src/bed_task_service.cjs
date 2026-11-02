'use strict'
// Shared typed bed request from Minecraft chat or localhost dashboard.
// No movement or bed interaction without the current-life independent BDS pair.
const {selectAdjacentBed,useBedForSpawn}=require('./bed_spawnpoint.cjs')
const {scoutStartProof}=require('./scout_start_proof.cjs')
const {environment}=require('./world_routine.cjs')
const {surveyEscape}=require('./escape_survey.cjs')
const {selectDirectionalBedStep}=require('./bed_directional_step.cjs')
const {outcome,message}=require('./bed_request_outcome.cjs')
const TIMEOUT=240000
const TYPES=new Set(['sleep','set_spawnpoint'])
const hasSpawn=r=>r.currentRespawnStatus?.()==='observed_server_player_spawn_packet'||
  r.homeBed.summary().status==='server_confirmed_current_session'
// A discovered bed behind a door, step, wall, water or unknown geometry
// must never be treated as an ordinary flat WALK path. Validate the whole
// grid chain AND the exact intended bed-side standing cell before staging.
function flatBedRoute(plan,position){
 if(!plan||plan.status!=='observed_route_candidate'||
    plan.routeComplete!==true||plan.permitted!==false||
    plan.serverVerified!==false||!Number.isSafeInteger(plan.steps)||
    plan.steps<1||plan.steps>8||
    !Array.isArray(plan.waypoints)||plan.waypoints.length!==plan.steps||
    !Array.isArray(plan.bed)||plan.bed.length!==3||
    !plan.bed.every(Number.isSafeInteger)||!position)return false
 let prev=[Math.floor(position.x),Math.floor(position.y),Math.floor(position.z)]
 for(const point of plan.waypoints){
  if(!Array.isArray(point)||point.length!==3||!point.every(Number.isSafeInteger)||
     point[1]!==prev[1]||
     Math.abs(point[0]-prev[0])+Math.abs(point[2]-prev[2])!==1)
    return false
  prev=point
 }
 return Math.hypot(prev[0]+.5-plan.bed[0],
   prev[1]-plan.bed[1],prev[2]+.5-plan.bed[2])<=1.95
}
// An explicit request gets one bounded, read-only live world scan. The
// passive 60-second remembered-bed timer must not hide a newly visible bed.
function observedBedPositions(r){
 const bot=r.bot,self=bot?.entity?.position
 const found=new Map()
 const add=p=>{
  if(!p||![p.x,p.y,p.z].every(Number.isFinite)||!self||
     Math.hypot(p.x-self.x,p.y-self.y,p.z-self.z)>17)return
  const c={x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)}
  if(found.size>=24)return
  const loc=typeof self.offset==='function'?
    self.offset(c.x-self.x,c.y-self.y,c.z-self.z):c
  let b
  try{b=bot.blockAt?.(loc)}catch{return}
  if(!(b?.name==='bed'||String(b?.name||'').endsWith('_bed')))return
  found.set([c.x,c.y,c.z].join(','),c)
 }
 for(const p of r.observedBeds.nearby(bot,{radius:16})||[])add(p)
 try{
  for(const p of (bot.findBlocks?.({
    matching:b=>b?.name==='bed'||String(b?.name||'').endsWith('_bed'),
    maxDistance:16,count:24})||[]).slice(0,24))add(p)
 }catch{}
 return [...found.values()]
}
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
 const positions=observedBedPositions(r)
 const choice=selectAdjacentBed(r.bot,positions,{radius:16})
 let bedPosition=choice.bed?.position||null,needsApproach=false
 if(!bedPosition&&choice.reason==='bed_needs_verified_approach'){
  try{
   const survey=surveyEscape(r.bot,{radius:7,maxNodes:100,bedPositions:positions})
   r.lastBedApproach=survey?.bedApproach||null
   const plan=r.lastBedApproach
   if(flatBedRoute(plan,r.bot.entity?.position)){
    bedPosition={x:plan.bed[0],y:plan.bed[1],z:plan.bed[2]}
    needsApproach=true
   }
  }catch{r.lastBedApproach=null}
  if(!bedPosition){
   // Loaded bed outside the seven-cell local corridor: a one-cell observed
   // flat direction is still a useful *candidate*. Only the BDS-witnessed
   // executor can issue input, then the next independent pair must accept
   // the endpoint. A wall/door/step yields no candidate.
   const sorted=positions.slice().sort((a,b)=>
     Math.hypot(a.x-r.bot.entity.position.x,a.z-r.bot.entity.position.z)-
     Math.hypot(b.x-r.bot.entity.position.x,b.z-r.bot.entity.position.z))
   for(const bed of sorted){
    const next=selectDirectionalBedStep(r.bot,bed)
    if(next.ok){
     bedPosition={x:bed.x,y:bed.y,z:bed.z}
     needsApproach=true
     r.lastBedApproach={status:'observed_single_flat_bedward_cell',
       bed:[bed.x,bed.y,bed.z],waypoints:[next.first],
       steps:1,routeComplete:false,permitted:false,serverVerified:false}
     break
    }
   }
  }
 }
 if(!bedPosition)return reply('rejected',choice.reason,message({reason:choice.reason}))
 const now=r.clock(),ev=r.movementEvidence?.get?.()
 const p={action,source,report,at:now,expiresAt:now+TIMEOUT,
   globalExpiresAt:now+1200000,steps:0,
   stage:needsApproach?'approach':'interact',
   epoch:r.epoch,loginAt:ev?.loginAt??null,lifeEpochAt:ev?.lifeEpochAt??null,
   dimension:r.bot.game?.dimension,
   position:{x:bedPosition.x,y:bedPosition.y,z:bedPosition.z},
   timer:null}
 const arm=()=>{
  clearTimeout(p.timer)
  p.timer=setTimeout(()=>{
   if(r.pendingBedRequest===p)cancelBed(r,'bed_request_expired')
  },Math.max(1,p.expiresAt-r.clock()))
  p.timer.unref?.()
 }
 arm()
 r.pendingBedRequest=p
 const next=resumeBed(r)
 if(next.state==='started')return reply('started','bed_interaction_started','已找到床，正在等待服务器确认')
 if(next.state==='approaching')return reply('started',next.reason,
   '已经启动一格安全接近床的尝试；终点需要后续独立BDS见证，不会自动连续走')
 if(next.state==='completed')return reply('completed',next.reason,next.message)
 if(next.state==='rejected')return reply('rejected',next.reason,message({reason:next.reason}))
 return reply('started',needsApproach?'awaiting_bds_bed_approach':'awaiting_bds_bed_proof',
   needsApproach?'已发现床和只读安全接近路线；等待BDS双样本开始单步行走':
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
 if(!r.ready()||r.closed||r.bot.isSleeping||r.safetyBusy||
    r.threat()||r.core.hasFollowIntent()||
    r.goalPlanner.stoppedByHuman||r.bot.health<14)
   return deny('bed_safety_or_follow_priority')
 if(r.job)return p.stage==='awaiting_step'?
   {state:'waiting',reason:'bed_step_in_flight'}:
   deny('bed_other_job_in_progress')
 const proof=scoutStartProof(r.bot,r.movementEvidence,r.clock)
 if(!proof.ok)return proof.reason==='scout_bds_position_unavailable'?
   {state:'waiting',reason:proof.reason}:deny(proof.reason)
 // A completed local GoalNear cannot certify the prior one-cell step.
 // The callback first settles its later independent BDS endpoint. Refuse
 // both duplicate movement and bed activation until that succeeds.
 if(p.stage==='awaiting_step'){
  if(r.pendingBedStep||r.job)
   return {state:'waiting',reason:'bed_step_waiting_for_independent_endpoint'}
  const last=r.lastBedApproachAction
  if(last?.status!=='verified'||last.at<p.stepIssuedAt||
     last.serverMovementVerified!==true)
   return deny('bed_step_independent_endpoint_unconfirmed')
  p.steps++
  if(p.steps>8||now>=p.globalExpiresAt)return deny('bed_approach_step_limit')
  p.stage='approach';p.expiresAt=Math.min(p.globalExpiresAt,now+TIMEOUT)
  clearTimeout(p.timer)
  p.timer=setTimeout(()=>{if(r.pendingBedRequest===p)cancelBed(r,'bed_request_expired')},
    Math.max(1,p.expiresAt-now));p.timer.unref?.()
 }
 const choice=selectAdjacentBed(r.bot,[p.position],{radius:16})
 if(!choice.bed&&choice.reason==='bed_needs_verified_approach'&&
    p.stage==='approach'){
  if(typeof r.resumeBedApproachOnWitness!=='function')
   return deny('bed_approach_executor_unavailable')
  const step=r.resumeBedApproachOnWitness({
    bedPosition:p.position,source:p.source})
  if(step.state!=='started')return deny(step.reason||'bed_step_not_admitted')
  p.stage='awaiting_step';p.stepIssuedAt=now;p.epoch=r.epoch
  return {state:'approaching',reason:'bed_one_cell_started_endpoint_unverified'}
 }
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
module.exports={requestBed,resumeBed,cancelBed,observedBedPositions,flatBedRoute,TIMEOUT}
