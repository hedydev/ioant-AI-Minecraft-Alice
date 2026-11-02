'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {planRaisedDoorThreshold,performRaisedDoorThreshold,
 verifyRaisedDoorThreshold}=require('../src/raised_door_threshold.cjs')
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}})
function room({closed=false,roof=false,shape=true,occupied=false}={}){
 const p=v(.5,65,.5)
 return {entity:{position:p,onGround:true,eyeHeight:1.62},
 game:{dimension:'overworld'},entities:occupied?{1:{position:{x:1.5,y:65,z:.5}}}:{},
 blockAt(q){
  const x=Math.floor(q.x),y=Math.floor(q.y),z=Math.floor(q.z)
  if(y===64)return {name:'stone',boundingBox:'block'}
  if(x===1&&z===0&&(y===65||y===66))
   return {name:'spruce_door',boundingBox:'block',
    ...(shape?{shapes:[[0,0,0,1,1,.125]]}:{}),
    getProperties:()=>({open_bit:closed?0:1,upper_block_bit:y===66?1:0})}
  if(x===2&&z===0&&y===65)return {name:'stone',boundingBox:'block'}
  if(roof&&y===67)return {name:'stone',boundingBox:'block'}
  return {name:'air',boundingBox:'empty'}
 },
 lookAt:async()=>{},setControlState(){}}
}
const door=()=>({kind:'wooden_door',permitted:false,position:[1,65,0],
 approach:{position:[0,65,0],routeComplete:true,steps:0,elevationChanges:0}})
const pending=()=>({kind:'raised_threshold',door:[1,65,0],from:[0,65,0],
 beyond:[2,65,0],initialBdsFeet:{x:.5,y:65,z:.5},
 createdAt:100000,startedAt:100100,epoch:3,
 independentSamples:4,loginAt:6,lifeEpochAt:2})
const sample=()=>({independentSource:'bds_querytarget',independentSamples:6,
 independentPreviousAt:279000,independentAt:279800,
 loginAt:6,lifeEpochAt:2,independentLatestFeet:{x:1.5,y:65,z:.5}})
test('open wooden threshold with immediate full-block rise is observed but never authorized by scanning',()=>{
 const plan=planRaisedDoorThreshold(room(),door())
 assert.equal(plan.ok,true)
 assert.equal(plan.permitted,false)
 assert.equal(plan.serverMovementVerified,false)
 assert.deepEqual(plan.raisedLanding,[2,66,0])
})
test('closed door, incomplete collision shapes, low roof and occupied door fail closed',()=>{
 assert.equal(planRaisedDoorThreshold(room({closed:true}),door()).ok,false)
 assert.equal(planRaisedDoorThreshold(room({shape:false}),door()).ok,false)
 assert.equal(planRaisedDoorThreshold(room({roof:true}),door()).ok,false)
 assert.equal(planRaisedDoorThreshold(room({occupied:true}),door()).ok,false)
})
test('only actually adjacent near-side route may begin threshold step',()=>{
 const d=door();d.approach.steps=1
 assert.equal(planRaisedDoorThreshold(room(),d).ok,false)
 const b=room();b.entity.position=v(4.5,65,.5)
 assert.equal(planRaisedDoorThreshold(b,door()).ok,false)
})
test('one bounded input is never a BDS-verified crossing, and controls release',async()=>{
 const b=room(),inputs=[]
 b.setControlState=(key,on)=>inputs.push([key,on])
 const r=await performRaisedDoorThreshold(b,door(),{
  safe:()=>true,pulses:1,sleep:async()=>{}})
 assert.equal(r.ok,false)
 assert.equal(r.attempted,true)
 assert.equal(r.serverMovementVerified,false)
 assert.equal(r.roomExitVerified,false)
 assert.equal(inputs.filter(x=>x[1]).length,1)
 assert.deepEqual(inputs.at(-1),['forward',false])
})
test('preemption sends no movement input',async()=>{
 const b=room(),inputs=[]
 b.setControlState=(key,on)=>inputs.push([key,on])
 const r=await performRaisedDoorThreshold(b,door(),{safe:()=>false})
 assert.equal(r.attempted,false)
 assert.deepEqual(inputs,[])
})
test('new independent pair confirms ONLY door-cell threshold',()=>{
 const r=verifyRaisedDoorThreshold(pending(),sample(),{x:1.5,y:65,z:.5},280000)
 assert.equal(r.ok,true)
 assert.equal(r.thresholdVerified,true)
 assert.equal(r.roomExitVerified,false)
})
test('old, packet-only, other-session and partial BDS pairs do not confirm threshold',()=>{
 const s=sample(),p=pending(),local={x:1.5,y:65,z:.5}
 assert.equal(verifyRaisedDoorThreshold(p,{...s,independentSource:'packet_self'},local,280000).ok,false)
 assert.equal(verifyRaisedDoorThreshold(p,{...s,independentSamples:5},local,280000).ok,false)
 assert.equal(verifyRaisedDoorThreshold(p,{...s,independentPreviousAt:100100},local,280000).ok,false)
 assert.equal(verifyRaisedDoorThreshold(p,{...s,lifeEpochAt:7},local,280000).ok,false)
 assert.equal(verifyRaisedDoorThreshold(p,s,local,340101).ok,false)
})
test('near side, beyond door, elevation mismatch and client drift are not threshold success',()=>{
 const s=sample(),p=pending()
 for(const e of [{x:.5,y:65,z:.5},{x:2.5,y:66,z:.5},{x:1.5,y:66,z:.5}]){
  assert.equal(verifyRaisedDoorThreshold(p,{...s,independentLatestFeet:e},e,280000).ok,false)
 }
 assert.equal(verifyRaisedDoorThreshold(p,s,{x:5,y:65,z:5},280000).ok,false)
})
