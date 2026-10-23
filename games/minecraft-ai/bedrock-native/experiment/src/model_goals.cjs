'use strict'
// An LLM can propose only one high-level registered tool. Runtime owns every
// Bedrock packet, inventory gate, human priority and world-safety decision.
const TOOLS=Object.freeze(['observe','gather_wood','craft_wooden_sword','scout_safe','adapt_terrain'])
function validateGoal(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
      Object.keys(v).some(k=>!['tool','reason'].includes(k))||
      !TOOLS.includes(v.tool)||typeof v.reason!=='string'||
      !v.reason.trim()||v.reason.length>100||/[<>\r\n]/.test(v.reason))return null
  return {tool:v.tool,reason:v.reason.trim()}
}
class ModelGoalScheduler {
  constructor({planner=null,clock=Date.now,log=console,minIntervalMs=90000,maxHourly=12}={}){
    this.planner=planner;this.clock=clock;this.log=log;this.minIntervalMs=minIntervalMs;this.maxHourly=maxHourly
    this.pendingTrigger='new_goal';this.nextEligibleAt=0;this.windowStart=clock();this.hourCalls=0
    this.busy=false;this.inflight=null;this.controller=null
    this.modelStatus=planner?.url?'unverified':'disabled';this.lastPlanningAt=null
    this.planningLatencyMs=null;this.planningTrigger=null;this.goalSource=null
    this.planSteps=[];this.rejectedReason=null;this.requests=0;this.accepted=0
    this.lastOutcome=null;this.lastWorldSignature=null;this.stoppedByHuman=false
  }
  queue(trigger){
    if(!['new_goal','mode_selected','task_result','environment_changed','tool_blocked','proposal_rejected'].includes(trigger))return
    if(this.stoppedByHuman&&trigger!=='mode_selected')return
    if(trigger==='mode_selected')this.stoppedByHuman=false
    // A pending startup placeholder should not hide a concrete execution
    // failure. Keep one request queued (same call rate, no extra retries),
    // but deliver the more actionable tool_blocked cause to the planner.
    // Do not override STOP quarantine or an already queued runtime event.
    if(!this.pendingTrigger||
       (this.pendingTrigger==='new_goal'&&trigger==='tool_blocked'))
      this.pendingTrigger=trigger
  }
  observe(signature){
    if(this.lastWorldSignature!==null&&signature!==this.lastWorldSignature)this.queue('environment_changed')
    this.lastWorldSignature=signature
  }
  cancel(reason='priority'){
    this.controller?.abort()
    if(this.busy)this.rejectedReason=reason==='stop'?'cancelled_by_stop':'cancelled_by_priority'
  }
  halt(){
    this.cancel('stop');this.stoppedByHuman=true;this.pendingTrigger=null
    this.goalSource='human';this.planSteps=[]
  }
  async cancelAndWait(reason='priority'){
    this.cancel(reason)
    if(this.inflight)await this.inflight.catch(()=>{})
  }
  reject(reason){
    this.rejectedReason=String(reason).slice(0,64)
    this.queue('tool_blocked')
  }
  outcome(result){
    this.lastOutcome={result:result?.ok===true?'reported_success_needs_evidence':'blocked_or_unverified',
      reason:String(result?.reason||'not_verified').slice(0,64)}
    this.queue('task_result')
  }
  snapshot(mode){
    return {mode,modelStatus:this.modelStatus,
      modelName:this.planner?.model?String(this.planner.model).slice(0,64):null,
      lastPlanningAt:this.lastPlanningAt,
      planningLatencyMs:this.planningLatencyMs,planningTrigger:this.planningTrigger,
      goalSource:this.goalSource,planSteps:this.planSteps,rejectedReason:this.rejectedReason,
      nextEligibleAt:this.nextEligibleAt,planningRequests:this.requests,
      acceptedProposals:this.accepted,hourlyRequests:this.hourCalls,
      pendingTrigger:this.pendingTrigger,lastOutcome:this.lastOutcome,
      pausedByStop:this.stoppedByHuman}
  }
  async request({observation,memory}={}){
    if(this.stoppedByHuman)return null
    if(!this.planner?.url){this.modelStatus='disabled';return null}
    if(!this.pendingTrigger||this.busy)return null
    const now=this.clock()
    if(now<this.windowStart||now-this.windowStart>=3600000){this.windowStart=now;this.hourCalls=0}
    if(now<this.nextEligibleAt||this.hourCalls>=this.maxHourly){
      if(this.hourCalls>=this.maxHourly)this.nextEligibleAt=Math.max(this.nextEligibleAt,this.windowStart+3600000)
      return null
    }
    const trigger=this.pendingTrigger
    this.pendingTrigger=null;this.planningTrigger=trigger;this.lastPlanningAt=now
    this.nextEligibleAt=now+this.minIntervalMs;this.hourCalls++;this.requests++
    this.modelStatus='busy';this.busy=true;this.rejectedReason=null
    const controller=new AbortController();this.controller=controller
    const promise=(async()=>{
      try{
        const response=await this.planner.suggestGoal({observation,memory,signal:controller.signal})
        if(controller.signal.aborted){this.modelStatus='unverified';return null}
        const proposal=validateGoal(response)
        if(!proposal){
          this.modelStatus='error';this.rejectedReason='invalid_or_empty_model_proposal'
          this.queue('proposal_rejected');return null
        }
        this.modelStatus='ready';this.accepted++;this.goalSource='model';this.planSteps=[proposal.tool]
        this.log.log('[Alice agent] Ollama proposed tool:',JSON.stringify({tool:proposal.tool,trigger}))
        return proposal
      }catch(error){
        if(!controller.signal.aborted){
          this.modelStatus='error'
          this.rejectedReason=error?.message==='model_busy'?'shared_model_busy':'ollama_unavailable_or_timeout'
          this.queue('proposal_rejected')
          this.log.warn('[Alice agent] Ollama plan unavailable:',this.rejectedReason)
        }else this.modelStatus='unverified'
        return null
      }finally{
        this.planningLatencyMs=Math.max(0,this.clock()-now)
        this.log.log('[Alice agent] planning duration:',JSON.stringify({
          source:'ollama',trigger,modelStatus:this.modelStatus,
          planningLatencyMs:this.planningLatencyMs}))
        if(this.controller===controller)this.controller=null
      }
    })()
    this.inflight=promise
    try{return await promise}finally{this.busy=false;if(this.inflight===promise)this.inflight=null}
  }
}
module.exports={TOOLS,validateGoal,ModelGoalScheduler}
