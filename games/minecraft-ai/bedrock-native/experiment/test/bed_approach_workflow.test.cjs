'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {requestBed,resumeBed,cancelBed}=require('../src/bed_task_service.cjs')
const vec=(x,y,z)=>({x,y,z,
  offset(a,b,c){return vec(x+a,y+b,z+c)},
  distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}})
const bedPosition=vec(3,65,0)
function world({walled=false,doorway=false}={}){
 let now=100000,proof=false,stepCalls=0,interactions=0
 const bed={name:'red_bed',position:bedPosition}
 const bot={game:{dimension:'overworld'},
  entity:{position:vec(.5,65,.5),onGround:true},health:20,
  isSleeping:false,entities:{},players:{},parseBedMetadata:()=>({occupied:0}),
  activateBlock:async()=>{},findBlocks:()=>[bedPosition],
  blockAt:p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===3&&y===65&&z===0)return bed
   if(doorway&&x===1&&z===0&&(y===65||y===66))
    return {name:'spruce_door',boundingBox:'block',position:vec(x,y,z)}
   if(y===64)return {name:'stone',boundingBox:'block',position:vec(x,y,z)}
   if(walled&&y===65&&x>=1&&x<=2&&Math.abs(z)<=7)
    return {name:'stone',boundingBox:'block',position:vec(x,y,z)}
   return {name:'air',boundingBox:'empty',position:vec(x,y,z)}
  }}
 const r={bot,epoch:2,job:null,closed:false,ready:()=>true,
  clock:()=>now,pendingBedRequest:null,pendingBedStep:null,
  threat:()=>null,safetyBusy:false,core:{state:'IDLE',hasFollowIntent:()=>false},
  goalPlanner:{stoppedByHuman:false},
  currentRespawnStatus:()=>null,
  homeBed:{summary:()=>({status:'not_verified'}),confirm:()=>false},
  observedBeds:{nearby:()=>[bedPosition]},
  movementEvidence:{get:()=>proof?{
   loginAt:5,lifeEpochAt:7,independentSource:'bds_querytarget',
   independentSamples:4,independentAt:now-100,
   independentPreviousAt:now-1000,
   independentLatestFeet:{x:bot.entity.position.x,y:65,z:bot.entity.position.z}
  }:{loginAt:5,lifeEpochAt:7,independentSamples:0}},
  ops:{sleepNearby:async()=>({ok:false})},
  resumeBedApproachOnWitness({bedPosition:pos}){
   stepCalls++
   assert.deepEqual(pos,{x:3,y:65,z:0})
   this.epoch++
   this.pendingBedStep={startedAt:now}
   this.job={type:'EXPLORE'}
   this.lastBedApproachAction={status:'awaiting_bds_endpoint',at:now}
   return {state:'started',reason:'bed_first_cell_started'}
  },
  startJob(type){interactions++;this.job={type}}
 }
 return {r,setProof:x=>proof=x,advance:x=>now+=x,
  steps:()=>stepCalls,interactions:()=>interactions}
}
test('an explicit distant bed stays pending rather than falsely claiming sleep',()=>{
 const f=world(),o=requestBed(f.r,'sleep','控制台')
 assert.equal(o.reason,'awaiting_bds_bed_approach')
 assert.equal(f.r.pendingBedRequest.stage,'approach')
 assert.equal(f.r.lastBedApproach.status,'observed_route_candidate')
 assert.equal(f.steps(),0)
 cancelBed(f.r)
})
test('a fresh pair starts at most ONE one-cell step, no duplicate on job flight',()=>{
 const f=world()
 requestBed(f.r,'sleep','控制台');f.setProof(true)
 assert.equal(resumeBed(f.r).state,'approaching')
 assert.equal(f.steps(),1)
 assert.equal(f.r.pendingBedRequest.stage,'awaiting_step')
 assert.equal(resumeBed(f.r).state,'waiting')
 assert.equal(f.steps(),1)
 cancelBed(f.r)
})
test('only a later independent endpoint can advance bed task to interaction',()=>{
 const f=world()
 requestBed(f.r,'set_spawnpoint','控制台')
 f.setProof(true)
 assert.equal(resumeBed(f.r).state,'approaching')
 f.r.job=null;f.r.pendingBedStep=null
 f.r.lastBedApproachAction={status:'unverified',
   reason:'bed_step_waiting_for_new_independent_endpoint',at:100000}
 assert.equal(resumeBed(f.r).state,'rejected')
 assert.equal(f.interactions(),0)
})
test('independently verified one-cell endpoint allows adjacent bed interaction',()=>{
 const f=world()
 requestBed(f.r,'set_spawnpoint','控制台');f.setProof(true)
 assert.equal(resumeBed(f.r).state,'approaching')
 f.advance(180000)
 f.r.job=null;f.r.pendingBedStep=null
 f.r.bot.entity.position=vec(1.5,65,.5)
 f.r.lastBedApproachAction={status:'verified',
   serverMovementVerified:true,at:280000}
 assert.equal(resumeBed(f.r).state,'started')
 assert.equal(f.interactions(),1)
 assert.equal(f.steps(),1)
})
test('solid wall makes bed route read-only and rejects a direct step',()=>{
 const f=world({walled:true})
 const reply=requestBed(f.r,'sleep','控制台')
 assert.equal(reply.status,'rejected')
 assert.equal(f.steps(),0)
 assert.equal(f.interactions(),0)
})

test('a detected wooden exit door is reported, not silently walked through',()=>{
 const f=world({doorway:true})
 const reply=requestBed(f.r,'sleep','控制台')
 assert.equal(reply.status,'rejected')
 assert.equal(reply.reason,'bed_route_requires_door')
 assert.equal(f.steps(),0)
 assert(f.r.lastEscapeSurvey?.doorCandidates?.length>0)
})
