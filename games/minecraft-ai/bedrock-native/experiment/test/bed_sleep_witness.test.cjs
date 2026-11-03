'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {sleepOpportunity}=require('../src/features/bed/sleep_opportunity.cjs')
function fixture(){
 let now=100000,calls=0,task=null
 const r={bot:{entity:{position:{x:.5,y:64,z:.5}},health:20,
   game:{dimension:'overworld'},time:{timeOfDay:15000},isSleeping:false},
  ready:()=>true,clock:()=>now,closed:false,job:null,safetyBusy:false,
  maintenanceBusy:false,requireBdsAlignedExplore:true,
  core:{hasFollowIntent:()=>false},goalPlanner:{stoppedByHuman:false},
  observedBeds:{nearby:()=>[{x:1,y:64,z:0}]},
  failureMemory:{blocked:()=>null},threat:()=>null,nextSleepAt:0,log:{log(){}},
  movementEvidence:{get:()=>({independentSource:'bds_querytarget',
    independentSamples:2,independentPreviousAt:99000,independentAt:99500,
    independentLatestFeet:{x:.5,y:64,z:.5}})},
  ops:{inspectNightBeds:()=>({eligible:1}),sleepNearby:async args=>{
    calls++;assert.equal(args.forbidNavigation,true)
    assert.equal(args.requireBdsProof,true);return {ok:true,entered:true}}},
  startJob(type,source,fn){this.job={type};task=fn}}
 return {r,advance:ms=>now+=ms,calls:()=>calls,run:()=>task(new AbortController().signal)}
}
test('a timer missing the fresh window does not penalize the next real BDS pair',async()=>{
 const f=fixture();f.advance(5000)
 assert.equal(sleepOpportunity(f.r),false)
 assert.equal(f.r.lastSleepOpportunity.status,'scout_bds_position_unavailable')
 assert.equal(f.r.nextSleepAt,0)
 f.r.movementEvidence.get=()=>({independentSource:'bds_querytarget',
   independentSamples:4,independentPreviousAt:104000,independentAt:104500,
   independentLatestFeet:{x:.5,y:64,z:.5}})
 assert.equal(sleepOpportunity(f.r,{freshBdsWitness:true}),true)
 assert.equal(f.r.nextSleepAt,225000)
 await f.run();assert.equal(f.calls(),1)
 assert.equal(sleepOpportunity(f.r,{freshBdsWitness:true}),false)
})
test('far bed waits for verified approach without starting a doomed sleep/cooldown',()=>{
 const f=fixture();f.r.observedBeds.nearby=()=>[{x:8,y:64,z:0}]
 assert.equal(sleepOpportunity(f.r,{freshBdsWitness:true}),false)
 assert.equal(f.r.lastSleepOpportunity.status,'bed_needs_verified_approach')
 assert.equal(f.r.nextSleepAt,0);assert.equal(f.r.job,null)
})
test('STOP, FOLLOW, danger, independent endpoint in flight, sleeping and day block rest',()=>{
 for(const mutate of [r=>r.goalPlanner.stoppedByHuman=true,
   r=>r.core.hasFollowIntent=()=>true,r=>r.threat=()=>({}),
   r=>r.pendingScoutStep={},r=>r.pendingBedStep={},r=>r.pendingBedRequest={},
   r=>r.pendingDoorApproachStep={},r=>r.pendingDoorCrossing={},
   r=>r.maintenanceBusy=true,r=>r.bot.isSleeping=true,
   r=>r.bot.time.timeOfDay=6000]){
  const f=fixture();mutate(f.r)
  assert.equal(sleepOpportunity(f.r,{freshBdsWitness:true}),false)
  assert.equal(f.r.job,null);assert.equal(f.r.nextSleepAt,0)
 }
})
test('unaccepted job, occupied/unsafe bed, drift and stale evidence cannot consume retry',()=>{
 for(const mutate of [r=>r.startJob=()=>{},
   r=>r.ops.inspectNightBeds=()=>({eligible:0,status:'nearby_hostile_bed_unavailable'}),
   r=>r.bot.entity.position.x=2,
   r=>r.movementEvidence.get=()=>({independentSamples:1})]){
  const f=fixture();mutate(f.r)
  assert.equal(sleepOpportunity(f.r,{freshBdsWitness:true}),false)
  assert.equal(f.r.nextSleepAt,0)
 }
})
test('real witness integration attempts adjacent sleep before optional bed movement/scout',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
 assert.match(main,/Promise.resolve\(bedCheck\).then\(\(\)=>\{[\s\S]*?runtime.sleepTick\(\{freshBdsWitness:true\}\)[\s\S]*?runtime.resumeAutonomousBedApproachOnWitness\(\)/)
})
test('compressed heartbeat preserves actual loaded bed version and sleep truth',()=>{
 const {compactStatus}=require('../src/live_control.cjs')
 for(const pressure of [0,5000,100000]){
  const state={connected:true,sessionEstablished:true,isSleeping:true,
    producerPid:42,producerStartToken:'123',state:'RECOVER',
    padding:'x'.repeat(pressure),worldRoutine:{bedLogicVersion:1,canSleep:true,
      phase:'night',sleepOpportunity:{status:'safe_bed_candidate'},
      homeBed:{status:'not_verified'},extra:'x'.repeat(pressure)}}
  const packed=JSON.parse(compactStatus(state))
  assert.equal(packed.worldRoutine.bedLogicVersion,1)
  assert.equal(packed.worldRoutine.canSleep,true)
  assert.equal(packed.isSleeping,true)
  assert(Buffer.byteLength(JSON.stringify(packed))<=4096)
 }
})
