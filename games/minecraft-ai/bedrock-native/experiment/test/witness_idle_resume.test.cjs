'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {createWitnessIdleResume}=require('../src/witness_idle_resume.cjs')
function setup(){
 let now=10000,calls=0
 let submitted=[]
 const s={independentSource:'bds_querytarget',independentSamples:2,
  independentAt:9600,independentPreviousAt:9300,
  independentLatestFeet:{x:1,y:65,z:2}}
 const bot={entity:{position:{x:1,y:65,z:2}},isSleeping:false}
 const runtime={started:true,closed:false,liveBehavior:{settings:{
  autonomyEnabled:true,agentMode:'autonomous'}},
  goalPlanner:{stoppedByHuman:false},idleBusy:false,core:{state:'IDLE',
   hasFollowIntent:()=>false},job:null,safetyBusy:false,ready:()=>true,
  idleTick:async()=>{calls++}}
 const evidence={get:()=>s}
 const clock=()=>now
 const x=createWitnessIdleResume({runtime,bot,evidence,clock,
   schedule:fn=>submitted.push(fn)})
 return {s,bot,runtime,clock,evidence,x,submitted,
   advance:ms=>{now+=ms},calls:()=>calls,
   flush:async()=>{for(const f of submitted.splice(0))f();await new Promise(setImmediate)}}
}
test('two fresh independent aligned samples wake normal autonomy once',async()=>{
 const f=setup()
 assert.equal(f.x.request(),true)
 assert.equal(f.x.request(),false)
 assert.equal(f.calls(),0)
 await f.flush()
 assert.equal(f.calls(),1)
 assert.equal(f.x.get().pending,false)
 assert.equal(f.x.request(),false)
})
test('one sample, stale pair and mismatched client do not wake',async()=>{
 const f=setup();f.s.independentSamples=1
 assert.equal(f.x.request(),false)
 f.s.independentSamples=2;f.advance(5000)
 assert.equal(f.x.request(),false)
 f.s.independentAt=14900;f.s.independentPreviousAt=14800
 f.bot.entity.position.x=8
 assert.equal(f.x.request(),false)
 assert.equal(f.calls(),0)
})
test('STOP, FOLLOW, another job, sleep and closed world refuse',()=>{
 const f=setup()
 const states=[
  ()=>f.runtime.goalPlanner.stoppedByHuman=true,
  ()=>f.runtime.core.hasFollowIntent=()=>true,
  ()=>f.runtime.job={},
  ()=>f.bot.isSleeping=true,
  ()=>f.runtime.closed=true,
  ()=>f.runtime.liveBehavior.settings.agentMode='companion'
 ]
 for(const set of states){
  // New fixture every gate to prove it independently.
  const t=setup(); 
  const original={runtime:f.runtime,bot:f.bot}
  void original
  if(set===states[0])t.runtime.goalPlanner.stoppedByHuman=true
  else if(set===states[1])t.runtime.core.hasFollowIntent=()=>true
  else if(set===states[2])t.runtime.job={}
  else if(set===states[3])t.bot.isSleeping=true
  else if(set===states[4])t.runtime.closed=true
  else t.runtime.liveBehavior.settings.agentMode='companion'
  assert.equal(t.x.request(),false)
 }
})
test('proof expires before scheduled callback and prevents any idle call',async()=>{
 const f=setup()
 assert.equal(f.x.request(),true)
 f.advance(5000)
 await f.flush()
 assert.equal(f.calls(),0)
})
test('job starts between event and scheduled callback so no collision',async()=>{
 const f=setup()
 assert.equal(f.x.request(),true)
 f.runtime.job={id:22}
 await f.flush()
 assert.equal(f.calls(),0)
})
test('main routes genuine accepted witness to deferred safe idle resume',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
 assert.match(main,/createWitnessIdleResume\(\{\s*runtime,bot,evidence:movementEvidence,/)
 assert.match(main,/witnessIdleResume\.request\(\)/)
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src/witness_idle_resume.cjs'),'utf8'),
    /querytarget\s+@|child_process|execSync|spawnSync/)
})
