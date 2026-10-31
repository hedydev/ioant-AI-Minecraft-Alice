'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {observeHome,homeAgenda,HomeBaseMemory}=require('../src/home_base.cjs')
const pos=(x,y,z)=>({x,y,z,offset(a,b,c){return pos(x+a,y+b,z+c)}})
const air=()=>({name:'air',boundingBox:'empty'})
const solid=name=>({name,boundingBox:'block'})
function room({noDoor=false,noRoof=false,unknown=false,world='overworld'}={}){
 let reads=0,actions=0
 const bot={
  entity:{position:pos(.5,65,.5),onGround:true},
  game:{dimension:world},health:20,time:{timeOfDay:9000},entities:{},
  blockAt(p){
   reads++;const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(unknown&&x>=2)return null
   if(y===64)return Math.abs(x)<=1&&Math.abs(z)<=1?solid('oak_planks'):air()
   if(y===65&&x===0&&z===1)return solid('red_bed')
   if(y===65&&x===2&&z===0&&!noDoor)return solid('oak_door')
   if(y===65||y===66)return Math.abs(x)<=1&&Math.abs(z)<=1?air():solid('stone_bricks')
   if(y===68&&!noRoof)return solid('stone_bricks')
   return air()
  },
  activateBlock(){actions++},setControlState(){actions++},placeBlock(){actions++},dig(){actions++}
 }
 return {bot,bed:pos(0,65,1),reads:()=>reads,actions:()=>actions}
}
test('recognize roof, loaded enclosure, bed and wooden doorway without claiming movement',()=>{
 const {bot,bed,reads,actions}=room()
 const r=observeHome(bot,bed)
 assert.equal(r.status,'observed_indoor_home_candidate',JSON.stringify(r))
 assert.equal(r.enclosureVerified,false)
 assert.equal(r.roofAndDoorObserved,true)
 assert.deepEqual(r.door,{x:2,y:65,z:0})
 assert.equal(r.bed.z,1)
 assert(r.reachableCells>=3)
 assert(r.roofConfirmed>=2)
 assert.equal(r.doorPassageVerified,false)
 assert.equal(r.returnVerified,false)
 assert(reads()<=2400)
 assert.equal(actions(),0)
})
test('unknown near door, missing roof, missing door and wrong dimension fail closed',()=>{
 for(const opt of [{unknown:true},{noDoor:true},{noRoof:true},{world:'nether'}]){
  const {bot,bed,actions}=room(opt)
  assert.equal(observeHome(bot,bed).status,'unverified',JSON.stringify(opt))
  assert.equal(actions(),0)
 }
})
test('outer unknown frontier is diagnostic only; observed bed + roof + safe door approach required',()=>{
 const {bot,bed,actions}=room()
 const known={center:[0,65,0],unknownCells:8,reachableCells:7,
  openFrontier:{kind:'observed_open_frontier_not_confirmed_exit'},
  doorCandidates:[{position:[2,65,0],kind:'wooden_door',permitted:false,
   approach:{routeComplete:true,serverVerified:false,
    position:[1,65,0],steps:1}}]}
 const r=observeHome(bot,bed,{escape:known})
 assert.equal(r.status,'observed_indoor_home_candidate',JSON.stringify(r))
 assert.equal(r.outerSurveyUnknown,8)
 assert.equal(r.outerSurveyFrontierObserved,true)
 assert.equal(r.enclosureVerified,false)
 assert.equal(r.returnVerified,false)
 assert.equal(actions(),0)
})
test('do not persist an unconfirmed bed as home; after confirmed spawn persist 0600 candidate but not exit',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alice-homebase-'))
 try{
  const file=path.join(dir,'home.json'),unverified=new HomeBaseMemory({file,clock:()=>10000})
  const {bot,bed}=room()
  assert.equal(unverified.summary().status,'not_established')
  assert.equal(unverified.observe(bot,bed).status,'observed_indoor_home_candidate')
  assert.equal(fs.existsSync(file),false)
  const confirmed=new HomeBaseMemory({file,clock:()=>11000})
  assert.equal(confirmed.observe(bot,bed,{spawnConfirmed:true}).status,'observed_indoor_home_candidate')
  assert.equal(confirmed.summary().returnVerified,false)
  assert.equal(fs.statSync(file).mode&0o777,0o600)
  const restart=new HomeBaseMemory({file,clock:()=>20000})
  assert.deepEqual(restart.summary().door,{x:2,y:65,z:0})
  assert.equal(restart.summary().exitVerified,false)
  assert.equal(restart.summary().returnVerified,false)
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
})
test('day and night return planning is only an intent; companion, follow and danger preempt',()=>{
 const {bot}=room()
 const home={bed:{x:0,y:65,z:1},door:{x:2,y:65,z:0}}
 assert.equal(homeAgenda(bot,home,{mode:'companion'}).objective,'none')
 bot.entity.position=pos(30,65,30)
 const plan=homeAgenda(bot,home,{mode:'autonomous',serverProof:true})
 assert.equal(plan.objective,'return_home')
 assert.equal(plan.reason,'requires_observed_server_verified_return_segments')
 assert.equal(plan.returnRouteVerified,false)
 bot.time.timeOfDay=13500
 assert.equal(homeAgenda(bot,home,{mode:'autonomous',serverProof:false}).reason,'independent_bds_gate_not_ready')
 assert.equal(homeAgenda(bot,home,{mode:'autonomous',following:true}).objective,'none')
 assert.equal(homeAgenda(bot,home,{mode:'autonomous',threat:true}).objective,'none')
})

test('raised spruce double-height door may identify HOME geometry without claiming exit',()=>{
 const {bot,bed,actions}=room()
 const original=bot.blockAt
 bot.blockAt=p=>{
  const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
  if(x===2&&z===0&&y===65)return solid('oak_planks')
  if(x===2&&z===0&&(y===66||y===67))return solid('spruce_door')
  return original(p)
 }
 const r=observeHome(bot,bed)
 assert.equal(r.status,'observed_indoor_home_candidate',JSON.stringify(r))
 assert.deepEqual(r.door,{x:2,y:66,z:0})
 assert.deepEqual(r.doorApproach,{x:1,y:65,z:0})
 assert.equal(r.doorPassageVerified,false)
 assert.equal(r.returnVerified,false)
 assert.equal(r.enclosureVerified,false)
 assert.equal(actions(),0)
})
