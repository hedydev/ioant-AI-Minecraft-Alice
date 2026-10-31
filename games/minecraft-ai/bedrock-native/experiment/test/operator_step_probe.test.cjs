'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {selectProbeRoute}=require('../src/operator_step_probe.cjs')
function make({phase=5000,health=20,food=20,mobs=[]}={}){
 const bot={entity:{position:{x:10.5,y:65,z:20.5},onGround:true},
 game:{dimension:'overworld'},time:{timeOfDay:phase},health,food,
 entities:Object.fromEntries(mobs.map((m,i)=>[i,{name:'zombie',position:m}]))}
 const route={steps:2,actions:['WALK','WALK'],target:[12,65,20],
  waypoints:[[11,65,20],[12,65,20]]}
 const survey={status:'route_candidate',walkRoutes:[route],walkRoute:route,center:[10,65,20]}
 return {bot,survey}
}
test('select verified observed two-cell flat walking route, not a fixed absolute coordinate',()=>{
 const f=make()
 const r=selectProbeRoute(f.bot,{survey:f.survey})
 assert.equal(r.candidate?.distance,2)
 assert.deepEqual(r.candidate?.waypoints,[{x:11,y:65,z:20},{x:12,y:65,z:20}])
 assert.equal(r.candidate?.target.x,12)
})
test('unsafe/low health, nearby monster and wrong phase do not select route',()=>{
 for(const options of [{health:5},{food:3},{mobs:[{x:12,y:65,z:20}]},
  {phase:23500}]){
  const f=make(options)
  assert.equal(selectProbeRoute(f.bot,{survey:f.survey}).candidate,null)
 }
 const f=make();f.survey.walkRoutes=[{...f.survey.walkRoute,steps:4}]
 assert.equal(selectProbeRoute(f.bot,{survey:f.survey}).candidate,null)
})
