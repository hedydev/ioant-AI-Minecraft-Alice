'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {planNightReposition,nightConditions}=require('../src/night_survival.cjs')
const vec=(x,y,z)=>({x,y,z})
function bot({tick=15000,health=20,onGround=true,rain=false,entities={}}={}){
 return {time:{timeOfDay:tick},health,game:{dimension:'overworld'},
   isRaining:rain,entity:{position:vec(.5,69,.5),onGround},entities}
}
const route=(target=[3,69,0])=>({
 status:'route_candidate',center:[0,69,0],
 walkRoutes:[{target,steps:3,actions:['WALK','WALK','WALK'],
   waypoints:[[1,69,0],[2,69,0],[3,69,0]]}]
})
test('night can propose two safe level walking cells without arbitrary long roam',()=>{
 const result=planNightReposition(bot(),route())
 assert.equal(result.ok,true)
 assert.equal(result.candidate.distance,2)
 assert.equal(result.candidate.waypoints.length,2)
 assert.deepEqual(result.candidate.target,{x:2,y:69,z:0})
 assert.equal(result.candidate.key,'2,69,0')
 assert.equal(nightConditions(bot(),result.candidate).ok,true)
})
test('daylight, missing clock and storm cannot authorize night movement',()=>{
 const candidate=planNightReposition(bot(),route()).candidate
 assert.equal(nightConditions(bot({tick:6000}),candidate).ok,false)
 assert.equal(nightConditions(bot({tick:23460}),candidate).ok,false)
 assert.equal(nightConditions({...bot(),time:{}},candidate).ok,false)
 assert.equal(nightConditions(bot({rain:true}),candidate).reason,'night_weather_not_safe')
})
test('health, unsupported footing and nearby monsters prevent night move',()=>{
 const candidate=planNightReposition(bot(),route()).candidate
 assert.equal(nightConditions(bot({health:14}),candidate).reason,'night_health_or_ground_unverified')
 assert.equal(nightConditions(bot({onGround:false}),candidate).reason,'night_health_or_ground_unverified')
 const entities={1:{name:'zombie',position:vec(3,69,0)}}
 assert.equal(planNightReposition(bot({entities}),route()).ok,false)
})
test('rejects route with step-down, jump, missing cell or non-contiguous step',()=>{
 const candidate=planNightReposition(bot(),route()).candidate
 assert.equal(nightConditions(bot(),{...candidate,waypoints:[{x:1,y:68,z:0},{x:2,y:68,z:0}]}).ok,false)
 assert.equal(nightConditions(bot(),{...candidate,waypoints:[{x:1,y:69,z:0},{x:3,y:69,z:0}]}).ok,false)
 assert.equal(nightConditions(bot(),{...candidate,waypoints:[{x:1,y:69,z:0}]}).ok,false)
 const s=route();s.walkRoutes[0].actions[1]='JUMP_UP'
 assert.equal(planNightReposition(bot(),s).ok,false)
})
test('does not invent route if voxel safety survey has no observed corridor',()=>{
 assert.equal(planNightReposition(bot(),{status:'unverified',walkRoutes:[]}).ok,false)
})

test('second waypoint retains original route geometry but rechecks live threats',()=>{
 const actor=bot()
 const proposal=planNightReposition(actor,route()).candidate
 const routeOrigin={...actor.entity.position}
 actor.entity.position=vec(1.5,69,.5)
 assert.equal(nightConditions(actor,proposal).reason,'night_route_not_contiguous',
   'without original origin, rechecking a progressed route is misleading')
 assert.equal(nightConditions(actor,proposal,{routeOrigin}).ok,true,
   'first local waypoint must not invalidate a surveyed second waypoint')
 actor.entities={1:{name:'creeper',position:vec(2,69,0)}}
 assert.equal(nightConditions(actor,proposal,{routeOrigin}).reason,'night_hostile_within_12',
   'using the original geometry must NOT freeze the safety environment')
 actor.entities={}
 actor.isRaining=true
 assert.equal(nightConditions(actor,proposal,{routeOrigin}).reason,'night_weather_not_safe')
})
