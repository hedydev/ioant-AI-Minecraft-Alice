'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {verifyRaisedDoorThreshold}=require('../src/raised_door_threshold.cjs')
const {verifyRaisedDoorLanding}=require('../src/raised_door_landing_witness.cjs')
const {verifyDoorCrossing}=require('../src/door_crossing_witness.cjs')
const {chooseAdjacentMovement}=require('../src/adjacent_motion_decision.cjs')
const {scoutStartProof}=require('../src/scout_start_proof.cjs')
const src=fs.readFileSync(path.join(__dirname,'../src/runtime.cjs'),'utf8')
const first=src.indexOf('  settlePendingDoorCrossingOnWitness(){')
const last=src.indexOf('  recordEscapePassage(',first)
assert(first>=0&&last>first)
let jumps=0
const Runtime=new Function('verifyRaisedDoorThreshold','verifyRaisedDoorLanding',
 'verifyDoorCrossing','chooseAdjacentMovement','scoutStartProof','performOneBlockJump',
 'return class VerifiedDoorRuntime {\n'+src.slice(first,last)+'\n}')(
 verifyRaisedDoorThreshold,verifyRaisedDoorLanding,verifyDoorCrossing,
 chooseAdjacentMovement,scoutStartProof,async()=>{jumps++;return {attempted:true}})
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}})
function fixture(){
 jumps=0
 let now=200000
 let witness={independentSource:'bds_querytarget',independentSamples:6,
  independentPreviousAt:199100,independentAt:199800,
  independentLatestFeet:{x:1.5,y:65,z:.5},loginAt:2,lifeEpochAt:3}
 const bot={game:{dimension:'overworld'},health:20,isSleeping:false,
  entity:{position:v(1.5,65,.5),onGround:true},entities:{},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(y===64)return {name:'stone',boundingBox:'block'}
   if(x===1&&z===0&&(y===65||y===66))
    return {name:'spruce_door',boundingBox:'block',
      shapes:[[0,0,0,1,1,.125]],getProperties:()=>({
        open_bit:1,upper_block_bit:y===66?1:0})}
   if(x===2&&z===0&&y===65)return {name:'stone',boundingBox:'block'}
   return {name:'air',boundingBox:'empty'}
  },
  lookAt:async()=>{},setControlState(){}}
 const r=new Runtime()
 Object.assign(r,{clock:()=>now,epoch:5,closed:false,bot,
   movementEvidence:{get:()=>witness},pendingDoorCrossing:{
     kind:'raised_threshold',door:[1,65,0],from:[0,65,0],
     beyond:[2,65,0],initialBdsFeet:{x:.5,y:65,z:.5},
     independentSamples:4,loginAt:2,lifeEpochAt:3,
     createdAt:100000,startedAt:100100,epoch:5},
   verifiedRaisedThreshold:null,pendingBedRequest:null,
   nextIdleAt:0,lastEscapeSurvey:null,ready:()=>true,
   goalPlanner:{stoppedByHuman:false},
   liveBehavior:{settings:{autonomyEnabled:true,agentMode:'autonomous'}},
   core:{state:'IDLE',hasFollowIntent:()=>false},safetyBusy:false,
   threat:()=>null,verticalWatch:{active:()=>false},
   lastSafetyAt:0,
   log:{log(){}},
   escapeApproachGuard(signal){return this.job?.signal===signal?
     {ok:true}:{ok:false}},
   startJob(type,source,work){
     this.epoch++;const abort=new AbortController()
     this.job={type,signal:abort.signal,abort}
     this.action={source};this.core.state=type;this.task=work
   }})
 return {r,bot,advance:ms=>{now+=ms},setWitness:fn=>{witness=fn(witness)},
  moves:()=>jumps}
}
test('verified door tile is a one-use token for exactly one JUMP_UP',async()=>{
 const f=fixture()
 const first=f.r.settlePendingDoorCrossingOnWitness()
 assert.equal(first.state,'verified')
 assert.equal(first.thresholdVerified,true)
 assert.equal(first.raisedLandingVerified,false)
 assert.equal(f.r.lastEscapePassageAction.roomExitVerified,false)
 const admitted=f.r.resumeRaisedDoorLandingOnWitness()
 assert.equal(admitted.state,'started',JSON.stringify(admitted))
 assert.equal(f.r.resumeRaisedDoorLandingOnWitness().state,'none')
 assert.equal(f.moves(),0)
 const res=await f.r.task(f.r.job.signal)
 assert.equal(res.serverMovementVerified,false)
 assert.equal(res.attempted,true)
 assert.equal(f.moves(),1)
 assert.equal(f.r.pendingDoorCrossing.kind,'raised_landing')
 f.r.core.state='IDLE';f.r.job=null
 f.advance(180000)
 f.bot.entity.position=v(2.5,66,.5)
 f.setWitness(s=>({...s,independentSamples:8,
   independentPreviousAt:379100,independentAt:379900,
   independentLatestFeet:{x:2.5,y:66,z:.5}}))
 const last=f.r.settlePendingDoorCrossingOnWitness()
 assert.equal(last.state,'verified',JSON.stringify(last))
 assert.equal(last.raisedLandingVerified,true)
 assert.equal(last.roomExitVerified,false)
})
test('expired or changed player intent cancels the stage before any jump',()=>{
 for(const reason of ['STOP','FOLLOW','old','low_ceiling']){
  const f=fixture()
  assert.equal(f.r.settlePendingDoorCrossingOnWitness().state,'verified')
  if(reason==='STOP')f.r.goalPlanner.stoppedByHuman=true
  if(reason==='FOLLOW')f.r.core.hasFollowIntent=()=>true
  if(reason==='old')f.advance(4500)
  if(reason==='low_ceiling'){
   const original=f.bot.blockAt
   f.bot.blockAt=p=>Math.floor(p.y)===68?
     {name:'stone',boundingBox:'block'}:original(p)
  }
  const out=f.r.resumeRaisedDoorLandingOnWitness()
  assert.notEqual(out.state,'started',reason)
  assert.equal(f.r.resumeRaisedDoorLandingOnWitness().state,'none')
  assert.equal(f.moves(),0)
 }
})
test('unverified door endpoint is not permission to jump',()=>{
 const f=fixture()
 f.setWitness(s=>({...s,independentLatestFeet:{x:.5,y:65,z:.5}}))
 assert.equal(f.r.settlePendingDoorCrossingOnWitness().state,'rejected')
 assert.equal(f.r.resumeRaisedDoorLandingOnWitness().state,'none')
 assert.equal(f.moves(),0)
})
