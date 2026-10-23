'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {isNight,canSleepNow,hasNearbyBed,inspectNightBeds,monstersNearBed,sleepNearby}=require('../src/life_actions.cjs')
function v(x,y,z){return {x,y,z,distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}}}
function fixture(){
 const bed={name:'red_bed',position:v(3,64,0)}
 const bot={game:{dimension:'overworld'},time:{timeOfDay:6000},isRaining:false,thunderState:0,
  entity:{position:v(0,64,0)},entities:{},findBlocks:()=>[bed.position],blockAt:()=>bed,
  parseBedMetadata:()=>({occupied:0}),isSleeping:false,pathfinder:{goto:async()=>{}},
  sleep:async()=>{bot.isSleeping=true}}
 return {bot,bed}
}
test('morning is not night, daylight thunder can sleep, Nether cannot',()=>{
 const {bot}=fixture()
 assert.equal(isNight(bot),false)
 assert.equal(canSleepNow(bot),false)
 bot.thunderState=1;bot.isRaining=true
 assert.equal(isNight(bot),false)
 assert.equal(canSleepNow(bot),true)
 bot.game.dimension='the_nether'
 assert.equal(canSleepNow(bot),false)
})
test('free nearby bed ignored if known hostile surrounds bed',()=>{
 const {bot,bed}=fixture()
 bot.time.timeOfDay=14000
 assert.equal(hasNearbyBed(bot),true)
 bot.entities.zombie={name:'zombie',position:v(5,64,1),kind:'Hostile mobs'}
 assert.equal(monstersNearBed(bot,bed),true)
 assert.equal(hasNearbyBed(bot),false)
 bot.entities.zombie.position=v(100,64,100)
 assert.equal(hasNearbyBed(bot),true)
})
test('bed interaction in unsafe dimension is rejected before any navigation',async()=>{
 const {bot}=fixture()
 bot.game.dimension='the_nether'
 let moved=0
 bot.pathfinder.goto=async()=>{moved++}
 const result=await sleepNearby(bot,{GoalNear:class{}},{})
 assert.equal(result.reason,'not_night_or_thunderstorm_or_wrong_dimension')
 assert.equal(moved,0)
})

test('autonomous sleep excludes previously rejected bed while leaving other bed available',async()=>{
 const {bot,bed}=fixture()
 bot.time.timeOfDay=14000
 const second={name:'blue_bed',position:v(2,64,0)}
 bot.findBlocks=()=>[bed.position,second.position]
 bot.blockAt=p=>p.x===bed.position.x?bed:second
 const avoided=p=>p.x===bed.position.x
 assert.equal(hasNearbyBed(bot,12,{avoidBed:avoided}),true)
 const visited=[]
 bot.pathfinder.goto=async goal=>visited.push(goal)
 bot.sleep=async block=>{assert.equal(block,second);bot.isSleeping=true}
 const outcome=await sleepNearby(bot,{GoalNear:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z}}},{avoidBed:avoided})
 assert.equal(outcome.ok,true)
 assert.equal(outcome.bedPosition.x,second.position.x)
 assert.equal(visited.length,1)
})
test('navigation failure and sleep rejection expose distinct stage and exact attempted bed',async()=>{
 const {bot,bed}=fixture();bot.time.timeOfDay=14000
 bot.pathfinder.goto=async()=>{throw Error('noPath')}
 const api={GoalNear:class{}}
 const route=await sleepNearby(bot,api,{})
 assert.equal(route.ok,false)
 assert.equal(route.reason,'bed_navigation_failed:noPath')
 assert.deepEqual(route.bedPosition,{x:3,y:64,z:0})
 bot.pathfinder.goto=async()=>{}
 bot.sleep=async()=>{throw Error('sleep refused by BDS')}
 const refused=await sleepNearby(bot,api,{})
 assert.equal(refused.reason,'bed_sleep_rejected:sleep refused by BDS')
 assert.deepEqual(refused.bedPosition,route.bedPosition)
})

test('bed observations distinguish blockers and allow a second free bed',()=>{
 const {bot,bed}=fixture();bot.time.timeOfDay=14000
 const b={name:'blue_bed',position:v(5,64,0)}
 bot.findBlocks=()=>[bed.position,b.position]
 bot.blockAt=p=>p.x===3?bed:b
 bot.entities.mob={name:'zombie',position:v(3,64,1)}
 let o=inspectNightBeds(bot,12)
 assert.equal(o.eligible,0)
 assert.equal(o.hostile,2)
 delete bot.entities.mob
 o=inspectNightBeds(bot,12,{avoidBed:p=>p.x===3})
 assert.equal(o.eligible,1)
 assert.equal(o.excluded,1)
 assert.equal(o.beds[0].name,'blue_bed')
 assert.equal(o.status,'safe_bed_candidate')
})
test('a sleep state ACK timeout is unknown, not proof BDS rejected the bed',async()=>{
 const {bot}=fixture();bot.time.timeOfDay=14000
 bot.sleep=async()=>{throw Error('bot did not sleep (not night, monsters nearby, or bed obstructed?)')}
 const r=await sleepNearby(bot,{GoalNear:class{}},{})
 assert.equal(r.ok,false)
 assert.equal(r.reason,'bed_sleep_unconfirmed_no_state_ack')
 assert.equal(r.bedDiagnosis.phase,'night')
 assert.equal(r.bedDiagnosis.sleepWindow,true)
 assert.equal(r.bedDiagnosis.hostileNear,false)
 assert.equal(r.bedDiagnosis.observedSleeping,false)
 assert.equal(r.bedPosition.x,3)
})
test('two block halves of one bed cannot be treated as two independent alternatives',()=>{
 const {bot}=fixture();bot.time.timeOfDay=14000
 const foot={name:'red_bed',position:v(3,64,0)}
 const head={name:'red_bed',position:v(4,64,0)}
 bot.findBlocks=()=>[foot.position,head.position]
 bot.blockAt=p=>p.x===4?head:foot
 bot.parseBedMetadata=block=>({occupied:0,part:block===head,
   headOffset:{x:1,y:0,z:0}})
 const o=inspectNightBeds(bot,12)
 assert.equal(o.found,1)
 assert.equal(o.eligible,1)
 assert.equal(o.beds[0],foot)
 const blocked=inspectNightBeds(bot,12,{avoidBed:p=>p.x===3})
 assert.equal(blocked.eligible,0)
 assert.equal(blocked.excluded,1)
})


test('remembered bed observation is used without searching all beds at night',async()=>{
 const {bot,bed}=fixture()
 bot.time.timeOfDay=14000
 bot.findBlocks=()=>{throw Error('unbounded bed search must not run')}
 const opts={knownPositions:[{x:bed.position.x,y:bed.position.y,z:bed.position.z}]}
 const found=inspectNightBeds(bot,12,opts)
 assert.equal(found.eligible,1)
 const used=await sleepNearby(bot,{GoalNear:class{}},opts)
 assert.equal(used.ok,true)
 bot.isSleeping=false
 bot.blockAt=()=>({name:'air',position:bed.position})
 assert.equal(inspectNightBeds(bot,12,opts).eligible,0,
   'remembered coordinates must not bypass fresh bed block verification')
})
