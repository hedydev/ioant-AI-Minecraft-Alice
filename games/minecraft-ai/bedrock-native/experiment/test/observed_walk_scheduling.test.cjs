'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const path=require('node:path'),{pathToFileURL}=require('node:url')
const {AliceBedrockRuntime}=require('../src/runtime.cjs')
const P=path.resolve(__dirname,'../../../runtime/alice_modules')
async function policies(){
 const names=['autonomy_policy','safety_policy','terrain_policy','wood_policy','social_policy','inventory_policy','equipment']
 return Object.fromEntries(await Promise.all(names.map(async n=>[n,await import(pathToFileURL(path.join(P,n+'.js')).href)])))
}
function vec(x,y,z){return {x,y,z,offset(a,b,c){return vec(x+a,y+b,z+c)},clone(){return vec(x,y,z)},floored(){return vec(Math.floor(x),Math.floor(y),Math.floor(z))},distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}}}
async function fixture({fresh=true,stopped=false,following=false}={}){
 let now=100000,modelCalls=0,walkCalls=0,releaseModel,releaseWalk
 const calls=[]
 const bot={health:20,food:20,username:'AliceFixture',entity:{position:vec(.5,65,.5),onGround:true},
  time:{timeOfDay:6000},game:{dimension:'overworld'},players:{},entities:{},registry:{itemsByName:{}},
  inventory:{items:()=>[{name:'stone_sword',count:1},{name:'oak_log',count:4}]},
  blockAt:q=>({name:Math.floor(q.y)===64?'stone_bricks':'air',
   boundingBox:Math.floor(q.y)===64?'block':'empty',shapes:Math.floor(q.y)===64?[[0,0,0,1,1,1]]:[]}),
  pathfinder:{setMovements(){},setGoal(){},goto:async()=>{},stop(){}},
  chat(){},clearControlStates(){},stopDigging(){}}
 const core={state:following?'FOLLOW':'IDLE',intent:{type:following?'FOLLOW':'IDLE',data:{}},
  learning:{summary:()=>({})},setFollowIntent(playerName,distance){this.state='FOLLOW';this.intent={type:'FOLLOW',data:{playerName,distance}}},transition(s){this.state=s},hasFollowIntent(){return this.intent.type==='FOLLOW'},
  stop(){this.state='IDLE';this.intent={type:'IDLE',data:{}}},resumeIntent(){this.state=this.intent.type}}
 const evidence={get:()=>({loginAt:50000,lifeEpochAt:null,independentSource:'bds_querytarget',
  independentSamples:2,independentAt:fresh?now-100:now-6000,
  independentPreviousAt:fresh?now-300:now-7000,independentLatestFeet:{x:.5,y:65,z:.5}})}
 const planner={url:'http://127.0.0.1:11435',suggestGoal:()=>{modelCalls++;return new Promise(resolve=>{releaseModel=resolve})}}
 const runtime=new AliceBedrockRuntime({bot,core,policies:await policies(),clock:()=>now,
  api:{Movements:class{},GoalNear:class{}},movementEvidence:evidence,
  requireBdsAlignedExplore:true,planner,log:{log:(...args)=>calls.push(args),warn(){},error(){}},
  operator:{inventory:()=>bot.inventory.items(),equipAuto:async()=>({ok:false})},
  settingsReader:{read:()=>({revision:0,settings:{agentMode:'autonomous',autonomyEnabled:true}})}})
 runtime.started=true;runtime.seenSpawn=true;runtime.hasHealth=true;runtime.hasInventorySync=true
 runtime.lastHumanAt=0;runtime.nextIdleAt=0;runtime.goalPlanner.stoppedByHuman=stopped
 runtime.boundedScout=async()=>{walkCalls++;return new Promise(resolve=>{releaseWalk=resolve})}
 return {runtime,core,bot,calls,get modelCalls(){return modelCalls},get walkCalls(){return walkCalls},
  expire(){now+=6000},async close(){releaseModel?.({tool:'observe'});releaseWalk?.({ok:false,reason:'cancelled'});runtime.stop();await new Promise(setImmediate)}}
}
test('fresh independently validated walk starts without awaiting a slow model',async()=>{
 const f=await fixture();let cycle
 try{
  cycle=f.runtime.idleTick();await new Promise(setImmediate)
  assert.equal(f.walkCalls,1,'a valid current-life WALK must reach the existing executor before model inference')
  assert.equal(f.modelCalls,0,'mechanical WALK must not spend the 4s evidence window waiting on a model')
  assert.equal(f.core.state,'EXPLORE')
 }finally{await f.close();await cycle}
})
test('expired evidence, human STOP and FOLLOW still prevent independent walking',async()=>{
 for(const options of [{fresh:false},{stopped:true},{following:true}]){
  const f=await fixture(options)
  try{await f.runtime.idleTick();await new Promise(setImmediate);assert.equal(f.walkCalls,0);assert.equal(f.modelCalls,0)}
  finally{await f.close()}
 }
})

test('real player STOP and FOLLOW commands preempt the deterministic walking job',async()=>{
 for(const [command,wanted] of [['AliceAI 停止','IDLE'],['AliceAI 跟着我','FOLLOW']]){
  const f=await fixture()
  try{await f.runtime.idleTick();await new Promise(setImmediate);assert.equal(f.walkCalls,1)
   await f.runtime.onChat('Steve',command)
   assert.equal(f.core.state,wanted);assert.equal(f.runtime.job,null)
   assert.equal(f.modelCalls,0)
  }finally{await f.close()}
 }
})

test('route revalidation rejection consumes the decision without stale action fallthrough',()=>{
 const {createObservedWalkStrategy}=require('../src/features/autonomy/observed_walk_strategy.cjs')
 let jobs=0
 const run=createObservedWalkStrategy({environment:()=>({safeToExplore:true}),
  selectSafeWalkingCandidate:()=>({candidate:null}),HOSTILES:new Set()})
 const ctx={closed:false,ready:()=>true,job:null,safetyBusy:false,threat:()=>false,
  bot:{health:20,entities:{},entity:{position:{}}},verticalWatch:{active:()=>false},
  core:{state:'IDLE',hasFollowIntent:()=>false},goalPlanner:{stoppedByHuman:false},
  liveBehavior:{settings:{agentMode:'autonomous',autonomyEnabled:true}},
  failureMemory:{activeRoutes:()=>[]},explorationProgress:{excluded:()=>[]},
  startJob(){jobs++},log:{log(){}}}
 assert.equal(run.call(ctx,{initialSafeWalk:true,
  candidate:{ok:true,kind:'observed_voxel_walking_only',key:'1,2,3'},
  decision:{action:'OBSERVE'},voxel:{}}),true)
 assert.equal(jobs,0)
})
