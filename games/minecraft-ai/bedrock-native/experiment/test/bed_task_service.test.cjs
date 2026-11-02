'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {outcome}=require('../src/bed_request_outcome.cjs')
const {requestBed,resumeBed,cancelBed}=require('../src/bed_task_service.cjs')
const vec=(x,y,z)=>({x,y,z,
 offset(dx,dy,dz){return vec(x+dx,y+dy,z+dz)},
 distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}})
const bed={name:'red_bed',position:vec(1,65,0)}
let now=100000
function fixture(){
 now=100000
 const calls=[],reports=[]
 const r={
  pendingBedRequest:null,job:null,epoch:4,closed:false,seenSpawn:true,
  bot:{health:20,isSleeping:false,entity:{position:vec(.5,65,.5),onGround:true},
    game:{dimension:'overworld'},parseBedMetadata:()=>({occupied:0}),
    activateBlock:async()=>{},findBlocks:()=>[bed.position],
    blockAt(p)=>Math.floor(p.x)===1&&Math.floor(p.y)===65&&Math.floor(p.z)===0?
      bed:{name:'air',position:vec(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)),
        boundingBox:'empty'}},
  clock:()=>now,ready:()=>true,safetyBusy:false,threat:()=>null,
  core:{hasFollowIntent:()=>false},
  goalPlanner:{stoppedByHuman:false},
  currentRespawnStatus:()=>null,
  homeBed:{summary:()=>({status:'not_verified'}),confirm:x=>x.serverConfirmed},
  movementEvidence:{get:()=>({loginAt:6,lifeEpochAt:7})},
  observedBeds:{nearby:()=>[bed.position]},
  ops:{sleepNearby:async()=>({entered:true,woke:true})},
  startJob(type,source,work){
   calls.push(['job',type,source])
   this.job={type}
   Promise.resolve().then(()=>work(new AbortController().signal))
     .finally(()=>{this.job=null})
  }
 }
 return {r,calls,reports,report:(...x)=>reports.push(x)}
}
test('bed response differentiates personal spawn and actual sleep',()=>{
 assert.equal(outcome('set_spawnpoint',{spawnConfirmed:true}).ok,true)
 assert.equal(outcome('sleep',{spawnConfirmed:true,sleepWindow:false}).ok,false)
 assert.equal(outcome('sleep',{spawnConfirmed:true,sleepWindow:false}).reason,
   'spawn_confirmed_daytime_no_sleep')
 assert.equal(outcome('sleep',{sleepEntered:true}).ok,true)
 assert.equal(outcome('sleep',{sleepEntered:false}).nightSkipped,false)
})
test('sleep and spawnpoint require known bed within interaction range',()=>{
 const {r,calls}=fixture()
 r.observedBeds.nearby=()=>[]
 r.bot.findBlocks=()=>[]
 assert.equal(requestBed(r,'sleep','控制台').reason,'no_loaded_free_bed')
 assert.equal(calls.length,0)
})
test('manual command detects a newly loaded bed even when passive memory is empty',()=>{
 const {r}=fixture()
 r.observedBeds.nearby=()=>[]
 const out=requestBed(r,'sleep','控制台')
 assert.equal(out.reason,'awaiting_bds_bed_proof')
 cancelBed(r)
})
test('no BDS proof only stores bounded pending intent and never starts movement',()=>{
 const {r,calls}=fixture()
 const resp=requestBed(r,'sleep','控制台')
 assert.equal(resp.reason,'awaiting_bds_bed_proof')
 assert.equal(calls.length,0)
 assert(r.pendingBedRequest)
 cancelBed(r)
})
test('second new BDS witness may admit only existing adjacent bed without a route',()=>{
 const {r,calls}=fixture()
 requestBed(r,'set_spawnpoint','控制台')
 r.movementEvidence.get=()=>({loginAt:6,lifeEpochAt:7,independentSamples:2,
   independentSource:'bds_querytarget',independentPreviousAt:now-1100,
   independentAt:now-100,independentLatestFeet:{x:.5,y:65,z:.5}})
 assert.equal(resumeBed(r).state,'started')
 assert.equal(calls[0][1],'RECOVER')
 assert.equal(r.pendingBedRequest,null)
})
test('STOP cancels queued bed intent and reports failure, not success',()=>{
 const {r,calls,reports,report}=fixture()
 requestBed(r,'sleep','控制台',report)
 assert(cancelBed(r))
 assert.equal(reports[0][0],'failed')
 assert.equal(calls.length,0)
 assert.equal(resumeBed(r).state,'none')
})
test('death, relog and task epoch changes invalidate bed request',()=>{
 for(const mutate of [
  r=>{r.epoch++},
  r=>{r.movementEvidence.get=()=>({loginAt:8,lifeEpochAt:7})},
  r=>{r.movementEvidence.get=()=>({loginAt:6,lifeEpochAt:8})},
  r=>{r.bot.game.dimension='nether'}
 ]){
  const {r,calls}=fixture();requestBed(r,'sleep','控制台')
  mutate(r)
  assert.equal(resumeBed(r).state,'rejected')
  assert.equal(calls.length,0)
 }
})
test('follow and imminent danger invalidate the prior bed plan',()=>{
 for(const mutate of [
  r=>{r.core.hasFollowIntent=()=>true},
  r=>{r.threat=()=>({target:{name:'skeleton'}})},
  r=>{r.safetyBusy=true}
 ]){
  const {r,calls}=fixture();requestBed(r,'sleep','控制台')
  mutate(r)
  assert.equal(resumeBed(r).state,'rejected')
  assert.equal(calls.length,0)
 }
})
test('time-limited pending request cannot be rearmed by old witness',()=>{
 const {r,calls}=fixture()
 requestBed(r,'sleep','控制台')
 now+=240001
 assert.equal(resumeBed(r).state,'rejected')
 assert.equal(calls.length,0)
})
test('already confirmed personal spawn does not activate bed again',()=>{
 const {r,calls}=fixture()
 r.homeBed.summary=()=>({status:'server_confirmed_current_session'})
 assert.equal(requestBed(r,'set_spawnpoint','控制台').status,'completed')
 assert.equal(calls.length,0)
})
