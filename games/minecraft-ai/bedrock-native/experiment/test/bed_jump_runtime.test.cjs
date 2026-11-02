'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {surveyEscape}=require('../src/escape_survey.cjs')
const {selectDirectionalBedStep}=require('../src/bed_directional_step.cjs')
const {chooseAdjacentMovement}=require('../src/adjacent_motion_decision.cjs')
const {scoutStartProof}=require('../src/scout_start_proof.cjs')
const {candidateOneBlockJump,performOneBlockJump}=require('../src/one_block_jump.cjs')
const {verifyBedStep}=require('../src/bed_step_witness.cjs')
const code=fs.readFileSync(path.join(__dirname,'../src/runtime.cjs'),'utf8')
const first=code.indexOf('  settlePendingBedStepOnWitness(){')
const last=code.indexOf('  observeHomeTick(',first)
assert(first>=0&&last>first)
const Runtime=new Function('verifyBedStep','scoutStartProof','selectDirectionalBedStep',
 'candidateOneBlockJump','performOneBlockJump','surveyEscape','HOSTILES','selectAdjacentBed',
 'chooseAdjacentMovement',
 'return class JumpRuntimeContract {\n'+code.slice(first,last)+'\n}')(
 verifyBedStep,scoutStartProof,selectDirectionalBedStep,
 candidateOneBlockJump,performOneBlockJump,surveyEscape,
 new Set(['zombie','skeleton']),()=>({bed:null,reason:'bed_needs_verified_approach'}),
 chooseAdjacentMovement)
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}})
function fixture({roof=false,blocked=false,companion=true}={}){
 let now=100000,presses=0
 let witness={
  loginAt:6,lifeEpochAt:7,independentSource:'bds_querytarget',
  independentSamples:2,independentPreviousAt:99000,
  independentAt:99900,independentLatestFeet:{x:.5,y:65,z:.5}}
 const bot={game:{dimension:'overworld'},health:20,isSleeping:false,
  entity:{position:v(.5,65,.5),onGround:true},entities:{},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===3&&y===66&&z===0)return {name:'red_bed',boundingBox:'block'}
   if(blocked&&x===1&&y===65&&z===0)return {name:'oak_door',boundingBox:'block'}
   if(x===1&&y===65&&z===0)return {name:'stone',boundingBox:'block'}
   if(roof&&y===68)return {name:'stone',boundingBox:'block'}
   if(y===64)return {name:'stone',boundingBox:'block'}
   return {name:'air',boundingBox:'empty'}
  },
  pathfinder:{goto:async()=>{throw Error('jump must not use goto')},
   setMovements(){},setGoal(){}},
  lookAt:async()=>{},
  setControlState(name,state){if(name==='jump'&&state)presses++}
 }
 const r=new Runtime()
 Object.assign(r,{
  bot,clock:()=>now,epoch:0,closed:false,maintenanceBusy:false,
  pendingBedStep:null,nextBedApproachStepAt:0,job:null,
  movementEvidence:{get:()=>witness},ready:()=>true,
  threat:()=>null,safetyBusy:false,
  core:{state:'IDLE',hasFollowIntent:()=>false},
  goalPlanner:{stoppedByHuman:false},verticalWatch:{active:()=>false},
  p:{autonomy_policy:{AUTONOMY_GRACE_MS:60000},terrain_policy:{cautiousPathOptions(){}}},
  lastHumanAt:now,
  liveBehavior:{settings:{autonomyEnabled:!companion,agentMode:companion?'companion':'autonomous'}},
  homeBase:{last:null},homeBed:{summary:()=>({status:'not_verified'})},
  api:{Movements:class{},GoalNear:class{}},
  log:{log(){}}
 })
 r.startJob=function(type,source,work){
  this.epoch++
  const controller=new AbortController()
  this.job={type,signal:controller.signal,abort:controller}
  this.action={source}
  this.work=work
  // Deliberately return undefined: the real startJob API is void on success.
 }
 return {r,presses:()=>presses,advance:ms=>{now+=ms},
  arrive(){
   bot.entity.position=v(1.5,66,.5)
   witness={...witness,independentSamples:4,independentPreviousAt:now-1200,
     independentAt:now-200,independentLatestFeet:{x:1.5,y:66,z:.5}}
  }}
}
test('control panel bed request recognizes one FULL-BLOCK rise even in companion mode',async()=>{
 const f=fixture()
 const started=f.r.resumeBedApproachOnWitness({
  bedPosition:{x:3,y:66,z:0},source:'控制台'})
 assert.equal(started.state,'started')
 const result=await f.r.work(f.r.job.signal)
 assert.equal(result.ok,false)
 assert.equal(result.attempted,true)
 assert.equal(result.reason,'bed_jump_waiting_for_new_independent_endpoint')
 assert(f.presses()>=1&&f.presses()<=4)
 assert(f.r.pendingBedStep)
 f.r.job=null
 assert.equal(f.r.settlePendingBedStepOnWitness().state,'waiting')
 f.advance(180000);f.arrive()
 const accepted=f.r.settlePendingBedStepOnWitness()
 assert.equal(accepted.state,'verified')
 assert.equal(accepted.serverMovementVerified,true)
 assert.equal(f.r.pendingBedStep,null)
})
test('overhead low roof or stateful door refuses to jump or use pathfinder',()=>{
 for(const option of [{roof:true},{blocked:true}]){
  const f=fixture(option)
  const admission=f.r.resumeBedApproachOnWitness({
   bedPosition:{x:3,y:66,z:0},source:'控制台'})
  assert.equal(admission.state,'held')
  assert.equal(f.presses(),0)
 }
})
test('human STOP or urgent threat denies jumping without movement input',()=>{
 for(const kind of ['STOP','danger','FOLLOW']){
  const f=fixture()
  if(kind==='STOP')f.r.goalPlanner.stoppedByHuman=true
  if(kind==='danger')f.r.threat=()=>({target:{name:'skeleton'}})
  if(kind==='FOLLOW')f.r.core.hasFollowIntent=()=>true
  assert.equal(f.r.resumeBedApproachOnWitness({
   bedPosition:{x:3,y:66,z:0},source:'控制台'}).state,'held')
  assert.equal(f.presses(),0)
 }
})
