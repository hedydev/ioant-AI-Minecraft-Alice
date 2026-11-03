'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createIdleAdmission}=require('../src/features/autonomy/idle_admission.cjs')
test('pending door crossing cannot start another autonomous decision before independent proof',()=>{
  let actions=0
  const ctx={pendingDoorCrossing:{startedAt:1000},clock:()=>2000,
    refreshBehavior(){},startJob(){actions++},log:{log(){}}}
  const review=createIdleAdmission({})
  assert.deepEqual(review.call(ctx),{allowed:false})
  assert.equal(ctx.pendingDoorCrossing.startedAt,1000)
  assert.equal(actions,0)
})
test('pending scout step must wait and retain original 240-second deadline',()=>{
  const pending={epoch:4,startedAt:1000},ctx={clock:()=>2000,
    pendingScoutStep:pending,refreshBehavior(){},
    startJob(){throw Error('not authorized')}}
  assert.deepEqual(createIdleAdmission({}).call(ctx),{allowed:false})
  assert.equal(ctx.pendingScoutStep,pending)
})
test('STOP, companion, and autonomous-off states refuse work',()=>{
  const states=[
    {autonomyEnabled:false,agentMode:'survival',stoppedByHuman:false},
    {autonomyEnabled:true,agentMode:'companion',stoppedByHuman:false},
    {autonomyEnabled:true,agentMode:'survival',stoppedByHuman:true}
  ]
  for(const state of states){
    let authorized=false
    const ctx={refreshBehavior(){},liveBehavior:{settings:state},
      goalPlanner:{stoppedByHuman:state.stoppedByHuman},
      ready(){authorized=true;throw Error('should not continue')}}
    assert.deepEqual(createIdleAdmission({}).call(ctx),{allowed:false})
    assert.equal(authorized,false)
  }
})
test('danger and human FOLLOW intent preempt autonomous admission before resource plans',()=>{
  for(const scenario of ['danger','follow']){
    let scanned=false
    const ctx={refreshBehavior(){},liveBehavior:{settings:{autonomyEnabled:true,agentMode:'survival'}},
      goalPlanner:{stoppedByHuman:false},ready:()=>true,
      bot:{isSleeping:false,health:20},
      core:{hasFollowIntent:()=>scenario==='follow'},
      safetyBusy:false,threat:()=>scenario==='danger'?{name:'zombie'}:null,
      verticalWatch:{active:()=>false},
      ops:{inventory(){scanned=true;throw Error('must not read resources')}}}
    assert.deepEqual(createIdleAdmission({}).call(ctx),{allowed:false})
    assert.equal(scanned,false)
  }
})

test('missing independent BDS startup proof blocks work and preserves navigation hold',()=>{
  const methods=createIdleAdmission({scoutStartProof:()=>({ok:false,reason:'scout_bds_position_unavailable'}),
    environment:()=>({phase:'day',tick:5000,safeToExplore:true}),
    homeAgenda:()=>({objective:'none',reason:'no_home',phase:'day'})})
  const ctx={
    refreshBehavior(){},clock:()=>100000,
    liveBehavior:{settings:{autonomyEnabled:true,agentMode:'survival'}},
    goalPlanner:{stoppedByHuman:false},ready:()=>true,
    bot:{isSleeping:false,health:20,entity:{position:{x:0,y:64,z:0}}},
    core:{state:'IDLE',hasFollowIntent:()=>false},
    safetyBusy:false,threat:()=>null,verticalWatch:{active:()=>false},
    lastSafetyAt:0,continuousGoal:{resume(){},reconcile(){},wait(){}},
    homeBase:{summary:()=>({}),last:null},
    ops:{inventory:()=>[]},
    p:{autonomy_policy:{decideIdleWork:()=> 'LEARN_WEAPON'}},
    startupObservationPending:true,
    holdNavigation(proof){this.navigationHold=proof.reason},
    log:{log(){}}
  }
  assert.deepEqual(methods.call(ctx),{allowed:false})
  assert.equal(ctx.navigationHold,'scout_bds_position_unavailable')
  assert.equal(ctx.startupObservationPending,true)
})
