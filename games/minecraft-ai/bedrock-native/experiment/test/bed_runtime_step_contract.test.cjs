'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {scoutStartProof}=require('../src/scout_start_proof.cjs')
const {selectDirectionalBedStep}=require('../src/bed_directional_step.cjs')
const {verifyBedStep}=require('../src/bed_step_witness.cjs')
const {surveyEscape}=require('../src/escape_survey.cjs')
// Actual controller methods are isolated, not rewritten as optimistic mocks.
// This checks the asynchronous 180s post-input evidence gap and manual-mode gate.
const text=fs.readFileSync(path.join(__dirname,'../src/runtime.cjs'),'utf8')
const first=text.indexOf('  settlePendingBedStepOnWitness(){')
const last=text.indexOf('  observeHomeTick(',first)
assert(first>=0&&last>first)
const Runtime=new Function('scoutStartProof','selectDirectionalBedStep','verifyBedStep',
 'surveyEscape','HOSTILES','selectAdjacentBed',
 'return class BedMethodContract {\n'+text.slice(first,last)+'\n}')(
 scoutStartProof,selectDirectionalBedStep,verifyBedStep,surveyEscape,
 new Set(['zombie','skeleton']),()=>({bed:null,reason:'bed_needs_verified_approach'}))
const vec=(x,y,z)=>({x,y,z,offset:(a,b,c)=>vec(x+a,y+b,z+c)})
function fixture({autonomous=false,blocked=false}={}){
 let now=100000,inputs=0
 let witness={
  loginAt:7,lifeEpochAt:8,independentSource:'bds_querytarget',
  independentSamples:2,independentPreviousAt:99000,independentAt:99900,
  independentLatestFeet:{x:.5,y:65,z:.5}}
 const r=new Runtime()
 Object.assign(r,{clock:()=>now,epoch:0,pendingBedStep:null,nextBedApproachStepAt:0,
  bot:{game:{dimension:'overworld'},entities:{},health:20,isSleeping:false,
   entity:{position:vec(.5,65,.5),onGround:true},
   blockAt:p=>Math.floor(p.y)===64?{name:'stone',boundingBox:'block'}:
     blocked&&Math.floor(p.x)===1&&Math.floor(p.y)===65?
       {name:'spruce_door',boundingBox:'block'}:{name:'air',boundingBox:'empty'},
   pathfinder:{async goto(){inputs++},setMovements(){},setGoal(){}}},
  movementEvidence:{get:()=>witness},ready:()=>true,maintenanceBusy:false,
  safetyBusy:false,threat:()=>null,
  core:{state:'IDLE',hasFollowIntent:()=>false},
  goalPlanner:{stoppedByHuman:false},verticalWatch:{active:()=>false},
  p:{autonomy_policy:{AUTONOMY_GRACE_MS:60000},terrain_policy:{cautiousPathOptions(){}}},
  lastHumanAt:now,liveBehavior:{settings:{autonomyEnabled:autonomous,
    agentMode:autonomous?'autonomous':'companion'}},
  homeBed:{summary:()=>({status:'server_confirmed_current_session'})},
  homeBase:{last:null},
  api:{Movements:class{constructor(){this.openable=new Set()}},GoalNear:class{}},
  log:{log(){}}})
 r.startJob=function(type,source,job){
  this.epoch++;this.job={type};this.action={source};this.task=job
  // The actual runtime successfully creates a job but returns undefined.
 }
 return {r,inputs:()=>inputs,advance:ms=>{now+=ms},
  arrive(){
   r.bot.entity.position=vec(1.5,65,.5)
   witness={...witness,independentSamples:4,
    independentPreviousAt:now-1200,independentAt:now-200,
    independentLatestFeet:{x:1.5,y:65,z:.5}}
  }}
}
test('explicit companion-mode bed step waits for LATER independent BDS proof',async()=>{
 const f=fixture(),r=f.r
 assert.equal(r.resumeBedApproachOnWitness({
  bedPosition:{x:14,y:65,z:0},source:'控制台'}).state,'started')
 const result=await r.task(new AbortController().signal)
 assert.equal(f.inputs(),1)
 assert.equal(result.serverMovementVerified,false)
 assert.equal(result.reason,'bed_step_waiting_for_new_independent_endpoint')
 assert(r.pendingBedStep)
 r.job=null;f.advance(180000);f.arrive()
 const later=r.settlePendingBedStepOnWitness()
 assert.equal(later.state,'verified')
 assert.equal(later.serverMovementVerified,true)
 assert.equal(r.pendingBedStep,null)
})
test('no new independent post-input pair never marks a waypoint complete',async()=>{
 const f=fixture(),r=f.r
 assert.equal(r.resumeBedApproachOnWitness({
  bedPosition:{x:14,y:65,z:0},source:'控制台'}).state,'started')
 await r.task(new AbortController().signal)
 r.job=null
 assert.equal(r.settlePendingBedStepOnWitness().state,'waiting')
 assert(r.pendingBedStep)
})
test('closed door in next cell prevents any bed approach input',()=>{
 const f=fixture({blocked:true})
 const result=f.r.resumeBedApproachOnWitness({
  bedPosition:{x:14,y:65,z:0},source:'控制台'})
 assert.equal(result.state,'held')
 assert.equal(f.inputs(),0)
})
test('manual task cannot override active STOP, danger or human FOLLOW',()=>{
 for(const kind of ['STOP','FOLLOW','danger']){
  const f=fixture(),r=f.r
  if(kind==='STOP')r.goalPlanner.stoppedByHuman=true
  if(kind==='FOLLOW')r.core.hasFollowIntent=()=>true
  if(kind==='danger')r.threat=()=>({target:{name:'skeleton'}})
  assert.equal(r.resumeBedApproachOnWitness({
   bedPosition:{x:14,y:65,z:0},source:'控制台'}).state,'held')
  assert.equal(f.inputs(),0)
 }
})
