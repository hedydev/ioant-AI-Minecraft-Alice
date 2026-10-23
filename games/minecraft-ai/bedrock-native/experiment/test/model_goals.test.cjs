'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {TOOLS,validateGoal,ModelGoalScheduler}=require('../src/model_goals.cjs')
test('strict registered high-level one-tool schema',()=>{
  assert.deepEqual(TOOLS,['observe','gather_wood','craft_wooden_sword','scout_safe','adapt_terrain'])
  assert.deepEqual(validateGoal({tool:'observe',reason:'unverified ground'}),{tool:'observe',reason:'unverified ground'})
  for(const proposal of [
    {tool:'dig_down',reason:'mine diamonds'},{tool:'observe',reason:'ok',x:23},
    {tool:'scout_safe',reason:'x\nunsafe'},{tool:'gather_wood',reason:''},null,
    {tool:'stop',reason:'ignore humans'}])assert.equal(validateGoal(proposal),null)
})
test('model requests only on queued events, minimum 90s, and at most 12 per hour',async()=>{
  let now=100000,calls=0
  const s=new ModelGoalScheduler({clock:()=>now,planner:{
    url:'http://127.0.0.1:11435',
    suggestGoal:async()=>{calls++;return {tool:'observe',reason:'no safe action'}}
  },log:{log:()=>{},warn:()=>{}}})
  assert.equal((await s.request({})).tool,'observe')
  assert.equal(await s.request({}),null)
  for(let i=0;i<15;i++){
    now+=90001;s.queue('task_result');await s.request({})
  }
  assert.equal(calls,12)
  assert.equal(s.snapshot('autonomous').planningRequests,12)
  assert.equal(s.snapshot('autonomous').goalSource,'model')
  now+=3600000;s.queue('new_goal');await s.request({})
  assert.equal(calls,13)
})
test('mode/user cancellation prevents delayed Ollama plan being accepted',async()=>{
  let finish
  const s=new ModelGoalScheduler({clock:()=>200000,planner:{
    url:'http://127.0.0.1:11435',suggestGoal:()=>new Promise(resolve=>{finish=resolve})
  },log:{log:()=>{},warn:()=>{}}})
  const job=s.request({})
  await Promise.resolve()
  s.cancel('stop')
  finish({tool:'gather_wood',reason:'forest'})
  assert.equal(await job,null)
  assert.equal(s.snapshot('autonomous').acceptedProposals,0)
})
test('invalid/offline suggestions report error and never fabricate a model decision',async()=>{
  const s=new ModelGoalScheduler({planner:{url:'http://127.0.0.1:11435',
    suggestGoal:async()=>({tool:'unsafe_shell',reason:'oops'})},log:{log:()=>{},warn:()=>{}}})
  assert.equal(await s.request({}),null)
  assert.equal(s.modelStatus,'error')
  assert.notEqual(s.goalSource,'model')
  assert.equal(s.rejectedReason,'invalid_or_empty_model_proposal')
  const offline=new ModelGoalScheduler()
  assert.equal(await offline.request({}),null)
  assert.equal(offline.snapshot('companion').modelStatus,'disabled')
})

test('human STOP quarantines future idle plans until explicit mode re-selection',async()=>{
  let calls=0
  const s=new ModelGoalScheduler({planner:{url:'http://127.0.0.1:11435',
    suggestGoal:async()=>{calls++;return {tool:'observe',reason:'safe'}}},
    log:{log:()=>{},warn:()=>{}}})
  s.halt()
  assert.equal(await s.request({}),null)
  s.queue('environment_changed')
  assert.equal(s.snapshot('autonomous').pendingTrigger,null)
  assert.equal(s.snapshot('autonomous').pausedByStop,true)
  s.queue('mode_selected')
  assert.equal(s.snapshot('autonomous').pausedByStop,false)
  assert.equal((await s.request({})).tool,'observe')
  assert.equal(calls,1)
})

test('configured endpoint is unverified until a real valid Ollama response',async()=>{
  const p={url:'http://127.0.0.1:11435',model:'gpt-oss:20b',
    suggestGoal:async()=>({tool:'observe',reason:'no movement evidence'})}
  const s=new ModelGoalScheduler({planner:p,log:{log:()=>{},warn:()=>{}}})
  assert.equal(s.snapshot('autonomous').modelStatus,'unverified')
  assert.equal(s.snapshot('autonomous').modelName,'gpt-oss:20b')
  await s.request({})
  assert.equal(s.snapshot('autonomous').modelStatus,'ready')
  assert.equal(s.snapshot('autonomous').acceptedProposals,1)
})


test('terrain adaptation is a high-level goal only, never arbitrary dig/place arguments',()=>{
 assert.deepEqual(validateGoal({tool:'adapt_terrain',reason:'safe verified pit'}),
   {tool:'adapt_terrain',reason:'safe verified pit'})
 assert.equal(validateGoal({tool:'adapt_terrain',reason:'pit',x:42}),null)
 assert.equal(validateGoal({tool:'dig',reason:'mine'}),null)
 assert.equal(validateGoal({tool:'place_block',reason:'tower'}),null)
})

test('a real blocked tool replaces the startup new_goal placeholder without extra LLM calls',async()=>{
 let now=100000,calls=0,lastTrigger
 const s=new ModelGoalScheduler({
   clock:()=>now,
   planner:{url:'http://127.0.0.1:11435',
     suggestGoal:async()=>{calls++;return {tool:'observe',reason:'no safe step'}}},
   log:{log:()=>{},warn:()=>{}}
 })
 assert.equal(s.pendingTrigger,'new_goal')
 s.queue('tool_blocked')
 assert.equal(s.pendingTrigger,'tool_blocked',
   'the concrete failed job must not be hidden by unconsumed startup intent')
 assert.equal(s.requests,0,'queue change must not invoke the model early')
 assert.equal((await s.request({})).tool,'observe')
 assert.equal(s.planningTrigger,'tool_blocked')
 assert.equal(calls,1)
 assert.equal(s.pendingTrigger,null)
 now+=1000
 s.queue('task_result')
 assert.equal(await s.request({}),null,'original 90-second rate limit still applies')
 assert.equal(calls,1)
 now+=90000
 await s.request({})
 assert.equal(calls,2)
})
test('tool failure queue preserves active events and STOP safety',()=>{
 const s=new ModelGoalScheduler()
 s.queue('environment_changed')
 assert.equal(s.pendingTrigger,'new_goal')
 s.queue('tool_blocked')
 assert.equal(s.pendingTrigger,'tool_blocked')
 s.queue('task_result')
 assert.equal(s.pendingTrigger,'tool_blocked','queued failure not discarded by later events')
 s.halt()
 assert.equal(s.pendingTrigger,null)
 s.queue('tool_blocked')
 assert.equal(s.pendingTrigger,null,'explicit human STOP wins')
 s.queue('mode_selected')
 assert.equal(s.stoppedByHuman,false)
 assert.equal(s.pendingTrigger,'mode_selected')
})
