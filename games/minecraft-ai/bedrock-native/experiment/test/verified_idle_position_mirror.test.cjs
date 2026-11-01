'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path')
const {verifiedIdleMirrorDecision,reconcileVerifiedIdleMirror,COOLDOWN_MS}=
  require('../src/verified_idle_position_mirror.cjs')
function scene(){
 let stops=0,clears=0,packets=0
 const bot={health:20,isSleeping:false,entity:{position:{x:8.9,y:64,z:10},
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
 const start=main.indexOf('function onFreshIndependentBdsWitness(){')
 const end=main.indexOf('stableWitness=live?',start)
 assert(start>=0&&end>start)
 const part=main.slice(start,end)
 const mirror=part.indexOf('reconcileVerifiedIdleMirror(')
 const ack=part.indexOf('writeWitnessAck(')
 const probe=part.indexOf('resumeArmedProbe(')
 const bed=part.indexOf('runtime.spawnpointTick(')
 assert(mirror>=0&&mirror<ack&&ack<probe&&probe<bed)
 assert.match(part,/idleMirrorLastAt=Date\.now\(\)/)
})
