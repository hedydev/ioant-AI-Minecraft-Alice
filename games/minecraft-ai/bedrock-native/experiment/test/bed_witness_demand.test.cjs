'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {bedWitnessDemand}=require('../src/features/bed/witness_demand.cjs')
function fixture(){
 return {clock:()=>100000,ready:()=>true,closed:false,epoch:7,
  bot:{health:20,game:{dimension:'overworld'}},core:{state:'IDLE',hasFollowIntent:()=>false},
  goalPlanner:{stoppedByHuman:false},threat:()=>null,
  liveBehavior:{settings:{autonomyEnabled:true,agentMode:'autonomous'}},
  movementEvidence:{get:()=>({loginAt:1,lifeEpochAt:2})},
  idleGateReason:()=> 'work_cooldown',
  pendingBedRequest:{action:'sleep',stage:'door',at:90000,expiresAt:990000,
    globalExpiresAt:5400000,epoch:7,loginAt:1,lifeEpochAt:2,dimension:'overworld'}}
}
test('admitted bed intent requests only evidence through unrelated cooldown',()=>{
 const r=fixture(),d=bedWitnessDemand(r)
 assert.equal(d.kind,'intent');assert.equal(d.permissionGranted,false)
 assert.equal(d.querySent,false);assert.equal(d.expiresAt,990000)
 assert(!('position' in d));assert.equal(r.pendingBedRequest.stage,'door')
})
test('STOP, follow, danger, safety, job, wrong life and stale intent never request proof',()=>{
 for(const change of [r=>r.goalPlanner.stoppedByHuman=true,
  r=>r.core.hasFollowIntent=()=>true,r=>r.threat=()=>({}),r=>r.safetyBusy=true,
  r=>r.job={},r=>r.maintenanceBusy=true,r=>r.bot.health=15,
  r=>r.bot.isSleeping=true,r=>r.closed=true,r=>r.core.state='EXPLORE',
  r=>r.liveBehavior.settings.autonomyEnabled=false,
  r=>r.liveBehavior.settings.agentMode='companion',
  r=>r.pendingBedRequest.lifeEpochAt=0,r=>r.pendingBedRequest.loginAt=0,
  r=>r.pendingBedRequest.epoch=6,r=>r.pendingBedRequest.expiresAt=100000,
  r=>r.pendingBedRequest.at=100001,r=>r.pendingBedRequest.action='unknown',
  r=>r.idleGateReason=()=> 'post_threat_window',r=>r.verticalWatch={active:()=>true}]){
  const r=fixture();change(r);assert.equal(bedWitnessDemand(r),null)
 }
})
test('already issued automatic bed endpoint has an independent 240s deadline',()=>{
 const r=fixture();r.pendingBedRequest=null
 r.pendingBedStep={epoch:7,createdAt:90000,startedAt:91000,loginAt:1,lifeEpochAt:2}
 const d=bedWitnessDemand(r)
 assert.equal(d.kind,'endpoint');assert.equal(d.expiresAt,330000)
 r.clock=()=>330000;assert.equal(bedWitnessDemand(r),null)
 r.clock=()=>100000;r.pendingBedStep.startedAt=null
 assert.equal(bedWitnessDemand(r),null)
})
test('first native life has a null respawn boundary but still requires the exact login and life',()=>{
 const r=fixture()
 r.movementEvidence.get=()=>({loginAt:1,lifeEpochAt:null})
 r.pendingBedRequest.lifeEpochAt=null
 assert.equal(bedWitnessDemand(r).lifeEpochAt,null)
 r.movementEvidence.get=()=>({loginAt:1,lifeEpochAt:3})
 assert.equal(bedWitnessDemand(r),null)
 r.movementEvidence.get=()=>({loginAt:1})
 assert.equal(bedWitnessDemand(r),null)
})
