'use strict'
// Alice Bedrock: durable, evidence-driven *intent*, never movement authority.
// The core state machine is about the current action; this controller holds
// the desired long-lived survival goal across short jobs, failures and pauses.
// Only verified inventory observations may advance resource milestones.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const PLANS=new Set(['LEARN_WEAPON','COLLECT_WOOD','OBSERVE','SECURE_SHELTER'])
const TASKS=new Set(['GATHER','CRAFT','EXPLORE','RECOVER','BUILD'])
const PHASES=new Set(['READY','ACTING','BLOCKED','WAITING','PAUSED'])
const REASONS=new Set([
 'inventory_transition_verified','waiting_for_verified_materials',
 'tool_failed','tool_exception','server_position_unconfirmed',
 'action_preempted','player_override','user_stop',
 'unsafe_or_unavailable','waiting_for_daylight','review_scheduled',
 'target_not_reached','no_safe_route','observe_only','restart_revalidate',
 'shelter_materials_missing','shelter_entrance_unsecured',
 'shelter_existing_structure_nearby','shelter_terrain_unloaded',
 'shelter_position_unconfirmed','shelter_no_safe_candidate',
 'shelter_build_blocked','shelter_door_material_missing',
 'shelter_door_open_state_unverified','priority_changed'
])
const own=source=>typeof source==='string'&&source.startsWith('自主')
const stepFor=(goal,wood)=>{
 if(goal==='SECURE_SHELTER')return 'BUILD_SHELTER'
 if(goal==='LEARN_WEAPON')return wood<2?'ACQUIRE_WOOD':'CRAFT_WEAPON'
 if(goal==='COLLECT_WOOD')return 'ACQUIRE_WOOD'
 return 'OBSERVE_WORLD'
}
const safeCount=n=>Number.isSafeInteger(n)&&n>=0&&n<100000?n:0
const safeReason=reason=>REASONS.has(reason)?reason:'unsafe_or_unavailable'
class ContinuousGoal {
 constructor({clock=Date.now,file=null,log=console}={}){
   this.clock=clock;this.file=file;this.log=log
   this.goal=null;this.lastCompleted=null;this.lastError=null;this.suspendedGoal=null
   this.load()
 }
 load(){
   if(!this.file)return
   try{
     const st=fs.lstatSync(this.file)
     if(!st.isFile()||st.isSymbolicLink()||st.size>2048)throw Error('unsafe_goal_file')
     const j=JSON.parse(fs.readFileSync(this.file,'utf8'))
     if(j?.version!==1||!PLANS.has(j.goal)||!Number.isSafeInteger(j.createdAt)||
        j.createdAt<0||j.createdAt>this.clock()+60000||
        !Number.isSafeInteger(j.revision)||j.revision<1||j.revision>100000000)
       throw Error('invalid_goal_snapshot')
     // A previous session's action or route cannot be trusted as current.
     // Reconcile from fresh inventory and safety gates before ANY action.
     this.goal={goal:j.goal,step:'REVALIDATE',phase:'WAITING',
       reason:'restart_revalidate',createdAt:j.createdAt,changedAt:this.clock(),
       revision:j.revision,verifiedWood:0,attempts:0,activeTask:null}
   }catch(e){if(e.code!=='ENOENT')this.lastError='load_unavailable'}
 }
 persist(){
   if(!this.file||!this.goal)return
   try{
     const dir=path.dirname(this.file)
     if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('unsafe_goal_root')
     fs.mkdirSync(dir,{recursive:true,mode:0o700})
     if(fs.existsSync(this.file)&&fs.lstatSync(this.file).isSymbolicLink())throw Error('unsafe_goal_target')
     // Persist intent only, not route, failure-state, player identity or
     // optimistic item counts; world observations must be reacquired.
     const raw=JSON.stringify({version:1,goal:this.goal.goal,
       createdAt:this.goal.createdAt,revision:this.goal.revision})
     if(Buffer.byteLength(raw)>256)throw Error('goal_snapshot_too_large')
     const temp=path.join(dir,'.continuous-goal-'+process.pid+'-'+crypto.randomBytes(4).toString('hex')+'.tmp')
     try{fs.writeFileSync(temp,raw,{mode:0o600,flag:'wx'});fs.renameSync(temp,this.file)}
     finally{try{fs.unlinkSync(temp)}catch{}}
     this.lastError=null
   }catch{this.lastError='write_unavailable'}
 }
 emit(event){
   if(!this.goal)return
   this.log.log('[Alice goal] transition:',JSON.stringify({event,
     goal:this.goal.goal,step:this.goal.step,phase:this.goal.phase,
     reason:this.goal.reason,revision:this.goal.revision}))
 }
 update(fields,{event='updated',persist=false}={}){
   if(!this.goal)return false
   let changed=false
   for(const [k,v] of Object.entries(fields))if(this.goal[k]!==v){
     this.goal[k]=v;changed=true
   }
   if(changed){this.goal.changedAt=this.clock();this.emit(event);if(persist)this.persist()}
   return changed
 }
 reconcile({plan,wood,hasWeapon}={}){
   if(!PLANS.has(plan)||typeof hasWeapon!=='boolean'||!Number.isFinite(wood)||wood<0)return false
   const amount=safeCount(Math.floor(wood))
   if(this.goal&&this.goal.goal!==plan){
     const old=this.goal
     if(plan==='SECURE_SHELTER'&&old.goal!=='SECURE_SHELTER')
       this.suspendedGoal=old.goal
     if(old.goal==='SECURE_SHELTER'&&plan===this.suspendedGoal)
       this.suspendedGoal=null
     const verified=old.goal==='LEARN_WEAPON'?hasWeapon:
       old.goal==='COLLECT_WOOD'?amount>=4:false
     if(verified){this.lastCompleted={goal:old.goal,at:this.clock(),reason:'inventory_transition_verified'}}
   }
   if(!this.goal||this.goal.goal!==plan){
     this.goal={goal:plan,step:stepFor(plan,amount),phase:'READY',
       reason:this.goal?'priority_changed':'review_scheduled',
       createdAt:this.clock(),changedAt:this.clock(),
       revision:(this.goal?.revision||0)+1,verifiedWood:amount,attempts:0,activeTask:null}
     this.emit('selected');this.persist()
     return true
   }
   const next=stepFor(plan,amount)
   const prior=this.goal.step
   const gain=amount>this.goal.verifiedWood
   // The step can temporarily be DISCOVER_RESOURCES or RECOVER_SAFELY,
   // which is part of the same objective, not a new verified milestone.
   // Do not reset BLOCKED back to READY merely due to a new idleTick.
   if((this.goal.reason==='restart_revalidate'||gain||
       prior==='ACQUIRE_WOOD'&&next==='CRAFT_WEAPON')&&
       this.goal.activeTask===null){
     this.update({step:next,phase:'READY',
       reason:gain?'inventory_transition_verified':'review_scheduled',
       verifiedWood:amount,attempts:gain?0:this.goal.attempts},
       {event:gain?'milestone':'revalidated',persist:gain})
   }else{
     this.goal.verifiedWood=amount
   }
   return true
 }
 begin(type,source){
   if(!this.goal||!own(source)||!TASKS.has(type))return false
   const step=type==='GATHER'?'ACQUIRE_WOOD':
     type==='CRAFT'?'CRAFT_WEAPON':type==='EXPLORE'?'DISCOVER_RESOURCES':
     type==='BUILD'?'BUILD_SHELTER':'RECOVER_SAFELY'
   this.update({phase:'ACTING',step,reason:'review_scheduled',activeTask:type},
     {event:'action_started'})
   return true
 }
 finish(type,source,result){
   if(!this.goal||!own(source)||!TASKS.has(type))return false
   const ok=result?.ok===true
   const proven=ok&&(type==='BUILD'?result.worldModificationVerified===true:
     type==='EXPLORE'?result.serverMovementVerified===true:
     type==='GATHER'||type==='CRAFT'?
       result.verifiedDelta>0||Number.isInteger(result.gained)&&result.gained>0:
     true)
   const reason=ok&&!proven?type==='EXPLORE'?'server_position_unconfirmed':'target_not_reached':
     !ok&&String(result?.reason||'').includes('server_endpoint_unconfirmed')?
       'server_position_unconfirmed':
     !ok?'tool_failed':'review_scheduled'
   // A successful primitive does NOT complete a resource goal. Only fresh
   // inventory reconciliation in idleTick can promote the milestone.
   this.update({phase:proven?'READY':'BLOCKED',reason,activeTask:null,
     attempts:this.goal.attempts+(proven?0:1)},
   {event:proven?'action_verified':'action_blocked'})
   return true
 }
 failed(type,source){
   if(!this.goal||!own(source)||!TASKS.has(type))return false
   this.update({phase:'BLOCKED',reason:'tool_exception',activeTask:null,
     attempts:this.goal.attempts+1},{event:'action_exception'})
   return true
 }
 resume(){
   if(!this.goal||this.goal.phase!=='PAUSED')return false
   this.update({phase:'READY',reason:'review_scheduled'},{event:'resumed'})
   return true
 }
 wait(reason='review_scheduled'){
   if(!this.goal||this.goal.phase==='ACTING'||this.goal.phase==='PAUSED')return false
   this.update({phase:'WAITING',reason:safeReason(reason)},{event:'waiting'})
   return true
 }
 interrupt(reason='action_preempted'){
   if(!this.goal||this.goal.phase==='PAUSED')return false
   this.update({phase:'PAUSED',reason:safeReason(reason),activeTask:null},
     {event:'interrupted'})
   return true
 }
 snapshot({nextReviewAt=null,mode='autonomous',humanOverride=false}={}){
   if(!this.goal)return null
   const g=this.goal
   return {goal:g.goal,step:g.step,
     phase:humanOverride||mode!=='autonomous'?'PAUSED':g.phase,
     reason:humanOverride?'player_override':mode!=='autonomous'?'user_stop':g.reason,
     revision:g.revision,verifiedWood:g.verifiedWood,attempts:g.attempts,
     activeTask:g.activeTask,createdAt:g.createdAt,changedAt:g.changedAt,
     nextReviewAt:Number.isFinite(nextReviewAt)?nextReviewAt:null,
     lastCompleted:this.lastCompleted,suspendedGoal:this.suspendedGoal,
     persistenceError:this.lastError}
 }
}
module.exports={ContinuousGoal,stepFor}
