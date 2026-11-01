'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path')
const {verifiedIdleMirrorDecision,reconcileVerifiedIdleMirror,COOLDOWN_MS}=
  require('../src/verified_idle_position_mirror.cjs')
function scene(){
 let stops=0,clears=0,packets=0
 const bot={_aliceBedrockInputSync:{summary:()=>({lastMotionInputAt:null,lastAuthoritativePositionAt:null})},
 health:20,isSleeping:false,entity:{position:{x:8.9,y:64,z:10},
  velocity:{x:1,y:0,z:0},onGround:true},
  pathfinder:{setGoal:goal=>{assert.equal(goal,null);stops++}},
  clearControlStates:()=>clears++,_client:{queue:()=>packets++}}
 const state={loginAt:100,lifeEpochAt:500,
  independentSource:'bds_querytarget',independentSamples:2,
  independentPreviousAt:8900,independentAt:9500,
  independentLatestFeet:{x:7,y:64,z:10},
  independentPairTravelBlocks:0,awaitingVerifiedRespawn:false}
 const evidence={get:()=>state}
 const runtime={started:true,closed:false,ready:()=>true,core:{
  state:'IDLE',hasFollowIntent:()=>false},liveBehavior:{settings:{
  agentMode:'autonomous',autonomyEnabled:true}},job:null,idleBusy:false,
  safetyBusy:false,goalPlanner:{stoppedByHuman:false},threat:()=>null,lastSafetyAt:0}
 return {bot,runtime,evidence,state,count:()=>[stops,clears,packets],
  args:{bot,runtime,evidence,clock:()=>10000,lastMirroredAt:0}}
}
test('2 current-life, stationary independent BDS positions repair local idle physics only',()=>{
 const x=scene()
 assert.equal(reconcileVerifiedIdleMirror(x.args).ok,true)
 assert.deepEqual(x.bot.entity.position,{x:7,y:64,z:10})
 assert.deepEqual(x.bot.entity.velocity,{x:0,y:0,z:0})
 assert.equal(x.bot.entity.onGround,false)
 assert.deepEqual(x.count(),[1,1,0])
})
test('a stopped movement attempt cannot be rewound using its pre-movement BDS pair',()=>{
 const x=scene()
 x.bot.entity.position.x=7.91
 x.bot._aliceBedrockInputSync.summary=()=>({lastMotionInputAt:9600,lastAuthoritativePositionAt:null})
 const r=reconcileVerifiedIdleMirror(x.args)
 assert.equal(r.reason,'local_mirror_witness_precedes_activity')
 assert.equal(r.ok,false);assert.equal(x.bot.entity.position.x,7.91)
 assert.deepEqual(x.count(),[0,0,0])
 // Only two genuinely newer independent observations may restore eligibility.
 x.state.independentPreviousAt=9700;x.state.independentAt=9800
 assert.equal(reconcileVerifiedIdleMirror(x.args).ok,true)
})
test('idle mirror cannot undo a later authoritative correction or operate without an activity timeline',()=>{
 for(const summary of [()=>({lastMotionInputAt:null,lastAuthoritativePositionAt:9600}),()=>({})]){
  const x=scene();x.bot._aliceBedrockInputSync.summary=summary
  assert.equal(reconcileVerifiedIdleMirror(x.args).ok,false)
  assert.deepEqual(x.count(),[0,0,0])
 }
})
test('never lower strict BDS start proof, invent a fresh sample or move server',()=>{
 const x=scene(),source=fs.readFileSync(path.join(__dirname,
  '../src/verified_idle_position_mirror.cjs'),'utf8')
 assert.match(source,/scoutStartProof\(bot,evidence,clock\)/)
 assert.doesNotMatch(source,/(?:\.queue|\.write|teleport\(|querytarget\s+@|child_process|fetch\()/)
 assert.equal(COOLDOWN_MS,60000)
 x.state.independentAt=5000
 assert.equal(reconcileVerifiedIdleMirror(x.args).ok,false)
 assert.deepEqual(x.count(),[0,0,0])
})
test('every life, current pair, stable BDS and idle-safety precondition fails closed',()=>{
 const cases=[
   x=>x.runtime.core.state='COMBAT',
   x=>x.runtime.job={id:1},
   x=>x.runtime.core.hasFollowIntent=()=>true,
   x=>x.runtime.goalPlanner.stoppedByHuman=true,
   x=>x.runtime.safetyBusy=true,
   x=>x.runtime.threat=()=>({name:'zombie'}),
   x=>x.runtime.idleBusy=true,
   x=>x.runtime.liveBehavior.settings.autonomyEnabled=false,
   x=>x.runtime.liveBehavior.settings.agentMode='companion',
   x=>x.bot.health=15,
   x=>x.bot.isSleeping=true,
   x=>x.state.independentSamples=1,
   x=>x.state.independentPreviousAt=100,
   x=>x.state.lifeEpochAt=9000,
   x=>x.state.awaitingVerifiedRespawn=true,
   x=>x.state.independentPairTravelBlocks=0.2,
   x=>x.args.lastMirroredAt=9500,
   x=>x.bot.entity.position.x=12.2
 ]
 for(const change of cases){
  const s=scene();change(s)
  const result=reconcileVerifiedIdleMirror(s.args)
  assert.equal(result.ok,false,result.reason)
  assert.deepEqual(s.count(),[0,0,0])
 }
})
test('main reconciles on true independent witness before autonomous/bed movement opportunities',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
 const helper=main.indexOf('function maybeMirrorVerifiedIdle(')
 const start=main.indexOf('function onFreshIndependentBdsWitness(){')
 const end=main.indexOf('stableWitness=live?',start)
 assert(helper>=0&&start>helper&&end>start)
 const shared=main.slice(helper,start)
 assert.match(shared,/reconcileVerifiedIdleMirror\(\{bot,evidence:movementEvidence,/)
 assert.match(shared,/idleMirrorLastAt=Date\.now\(\)/)
 const part=main.slice(start,end)
 const mirror=part.indexOf('maybeMirrorVerifiedIdle(true)')
 const ack=part.indexOf('writeWitnessAck(')
 const probe=part.indexOf('resumeArmedProbe(')
 const publish=part.indexOf('publishStatus()')
 const bed=part.indexOf('runtime.spawnpointTick(')
 assert(mirror>=0&&mirror<ack&&ack<publish&&publish<probe&&probe<bed)
})

test('main emits only bounded reason/state when local mirror is deferred, not coords',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
 assert.match(main,/safe-idle BDS-local mirror deferred:/)
 assert.match(main,/idleMirrorLastRejection/)
 assert.match(main,/t-idleMirrorRejectionLoggedAt>=15000/)
 assert.match(main,/correctionApplied:false,bdsQuerySentByAlice:false/)
})

test('later drift can be corrected using the SAME still-fresh pair, never stale',()=>{
 const s=scene()
 s.bot.entity.position.x=7
 assert.equal(reconcileVerifiedIdleMirror(s.args).reason,'already_aligned')
 assert.deepEqual(s.count(),[0,0,0])
 // The player physics prediction subsequently drifts without another
 // server witness; no new independentSamples are invented.
 s.bot.entity.position.x=8.9
 assert.equal(s.state.independentSamples,2)
 assert.equal(reconcileVerifiedIdleMirror(s.args).ok,true)
 assert.deepEqual(s.count(),[1,1,0])
 const expired=scene()
 expired.args.clock=()=>14500
 assert.equal(reconcileVerifiedIdleMirror(expired.args).ok,false)
 assert.deepEqual(expired.count(),[0,0,0])
})
test('250ms timer revisits only an existing live pair; never polls extra BDS',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
 assert.match(main,/if\(bdsWitness\.poll\(movementEvidence\)\)\{/)
 assert.match(main,/else if\(runtime\.core\?\.state==='IDLE'\)/)
 assert.match(main,/t-e\.independentPreviousAt<=4000/)
 assert.match(main,/maybeMirrorVerifiedIdle\(false\)/)
 assert.match(main,/maybeMirrorVerifiedIdle\(true\)/)
 assert.equal((main.match(/bdsWitness\.poll\(movementEvidence\)/g)||[]).length,1)
})
