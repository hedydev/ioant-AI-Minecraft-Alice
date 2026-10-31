'use strict'
// When a genuinely fresh independent BDS pair arrives, offer ONE normal
// autonomy decision during the existing 4s gate. Never send commands, move,
// override STOP/FOLLOW/threat checks or bypass navigation safety.
const {scoutStartProof}=require('./scout_start_proof.cjs')
function createWitnessIdleResume({runtime,bot,evidence,clock=Date.now,
  schedule=fn=>setImmediate(fn),log={warn(){}}}={}){
 if(typeof runtime?.idleTick!=='function'||!bot||!evidence)
  throw Error('witness_idle_resume_requires_runtime')
 let pending=false,lastTriggeredAt=-Infinity
 function eligible(){
  const settings=runtime.liveBehavior?.settings
  return runtime.started===true&&runtime.closed!==true&&
   settings?.autonomyEnabled===true&&settings?.agentMode==='autonomous'&&
   !runtime.goalPlanner?.stoppedByHuman&&!runtime.idleBusy&&
   runtime.core?.state==='IDLE'&&!runtime.job&&!runtime.safetyBusy&&
   !bot.isSleeping&&!runtime.core?.hasFollowIntent?.()&&
   runtime.ready?.()===true
 }
 function request(){
  const now=clock()
  if(!Number.isFinite(now)||pending||now-lastTriggeredAt<5000)return false
  if(!scoutStartProof(bot,evidence,clock).ok||!eligible())return false
  pending=true;lastTriggeredAt=now
  schedule(()=>{
   // Another safety task may have started while awaiting this turn. Re-run
   // all checks immediately before entering the ORIGINAL runIdleDecision.
   if(!scoutStartProof(bot,evidence,clock).ok||!eligible()){
    pending=false;return
   }
   Promise.resolve().then(()=>runtime.idleTick()).catch(err=>
     log.warn('[Alice autonomy] fresh BDS decision deferred:',
       String(err?.message||err).slice(0,80))).finally(()=>{pending=false})
  })
  return true
 }
 return {request,get:()=>({pending,lastTriggeredAt})}
}
module.exports={createWitnessIdleResume}
