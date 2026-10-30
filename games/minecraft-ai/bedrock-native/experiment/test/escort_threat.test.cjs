'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {observedHostileBarrier,OwnerMotion,escortAssessment}=require('../src/escort_threat.cjs')
const loc=(x,y,z)=>({x,y,z})
const enemy=(x,y,z)=>({name:'zombie',position:loc(x,y,z)})
const self=loc(.5,65,.5)
test('wall and glass block hostile melee despite Euclidean proximity',()=>{
 const t=enemy(6,65,.5)
 const bot={entity:{position:self},blockAt:p=>(
   Math.floor(p.x)===3?{name:'stone',boundingBox:'block'}:{name:'air',boundingBox:'empty'})}
 assert.equal(observedHostileBarrier(bot,t),'blocked')
 bot.blockAt=p=>Math.floor(p.x)===3?{name:'glass',boundingBox:'block'}:{name:'air',boundingBox:'empty'}
 assert.equal(observedHostileBarrier(bot,t),'blocked')
 bot.blockAt=()=>({name:'air',boundingBox:'empty'})
 assert.equal(observedHostileBarrier(bot,t),'clear')
 bot.blockAt=()=>null
 assert.equal(observedHostileBarrier(bot,t),'unknown')
})
test('human owner motion is bounded and expires when they stop',()=>{
 const m=new OwnerMotion()
 assert.equal(m.observe(loc(0,64,0),1000),false)
 assert.equal(m.observe(loc(.55,64,0),1300),true)
 assert.equal(m.observe(loc(.55,64,0),3000),true)
 assert.equal(m.observe(loc(.55,64,0),3201),false)
 m.reset()
 assert.equal(m.observe(loc(0,64,0),3300),false)
})
test('follow owner despite enclosed hostile; fight when owner stops and exposed threat reachable',()=>{
 const target=enemy(6,65,.5)
 const opts={hasIntent:true,health:13,danger:{target},self,
  target:target.position,recentSelfHurt:false}
 assert.deepEqual(escortAssessment({...opts,barrier:'blocked',ownerMoving:false}),
  {allowFollow:true,reason:'hostile_behind_observed_barrier'})
 assert.deepEqual(escortAssessment({...opts,barrier:'clear',ownerMoving:true}),
  {allowFollow:true,reason:'escort_moving_owner'})
 assert.equal(escortAssessment({...opts,barrier:'clear',ownerMoving:false}).allowFollow,false)
 assert.equal(escortAssessment({...opts,target:loc(2,65,.5),ownerMoving:true}).allowFollow,false)
 assert.equal(escortAssessment({...opts,ownerMoving:true,recentSelfHurt:true}).allowFollow,false)
 assert.equal(escortAssessment({...opts,ownerMoving:true,health:8}).allowFollow,false)
 assert.equal(escortAssessment({...opts,hasIntent:false,ownerMoving:true}).allowFollow,false)
})
