'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {VerticalMotionWatch,nearbyClimbable}=require('../src/vertical_motion_watch.cjs')
const pos=(x,y,z)=>({x,y,z,offset(dx,dy,dz){return pos(x+dx,y+dy,z+dz)}})
const bot=(x=.5,y=98,z=.5)=>({
  entity:{position:pos(x,y,z),onGround:true},
  blockAt:()=>({name:'air'})
})
test('flat travel and one-block step-down do not trigger vertical safety hold',()=>{
 let now=0;const watch=new VerticalMotionWatch({clock:()=>now}),b=bot()
 watch.observe(b,{dimension:'overworld'})
 for(let i=0;i<40;i++){
   now+=250;b.entity.position=pos(.5+i*.1,98-(i%8===0?1:0),.5)
   assert.equal(watch.observe(b,{dimension:'overworld'}),null)
 }
 assert.equal(watch.summary().active,false)
})
test('rapid 25-block local descent observed during combat holds autonomous exploration',()=>{
 let now=1000;const watch=new VerticalMotionWatch({clock:()=>now}),b=bot()
 watch.observe(b,{dimension:'overworld',serverPacketCount:0})
 now+=5000;b.entity.onGround=false;b.entity.position=pos(3.5,83.2,6.5)
 const e=watch.observe(b,{dimension:'overworld',serverPacketCount:0})
 assert.equal(e.reason,'rapid_unverified_vertical_displacement')
 assert(e.dropBlocks>=14)
 assert.equal(e.onGround,false)
 assert.equal(e.positionTrust,'local_prediction_not_server_proof')
 assert.equal(e.serverPositionPackets,0)
 assert.equal(watch.summary().remainingSeconds,90)
 now+=2000;b.entity.position=pos(3.5,73,6.5)
 assert.equal(watch.observe(b,{dimension:'overworld'}),null,
  'one episode must not spam identical alerts')
 now+=90001
 assert.equal(watch.summary().active,false)
})
test('ladder near descent is reported as uncertain mechanics, not server-authorized safety',()=>{
 let now=0;const watch=new VerticalMotionWatch({clock:()=>now}),b=bot()
 b.blockAt=p=>Math.floor(p.x)===0&&Math.floor(p.y)===75&&Math.floor(p.z)===0?
  {name:'minecraft:ladder'}:{name:'air'}
 watch.observe(b,{dimension:'overworld'})
 now=3000;b.entity.position=pos(.5,75,.5)
 const e=watch.observe(b,{dimension:'overworld'})
 assert.equal(e.nearbyClimbable,true)
 assert.equal(e.positionTrust,'local_prediction_not_server_proof')
 assert.equal(watch.active(),true,'ladder is not verified server descent evidence')
})
test('dimension transitions and new session reset do not create fake falls',()=>{
 let now=0;const watch=new VerticalMotionWatch({clock:()=>now}),b=bot()
 watch.observe(b,{dimension:'overworld'})
 now=1000;b.entity.position=pos(.5,70,.5)
 assert.equal(watch.observe(b,{dimension:'nether'}),null)
 assert.equal(watch.active(),false)
 now=2000;b.entity.position=pos(.5,62,.5)
 assert(watch.observe(b,{dimension:'nether'}))
 watch.reset()
 assert.equal(watch.active(),false)
 now=3000;b.entity.position=pos(.5,35,.5)
 assert.equal(watch.observe(b,{dimension:'nether'}),null)
})
test('unloaded or unreadable nearby blocks never grant ladder evidence',()=>{
 const b=bot();b.blockAt=()=>{throw Error('chunk unavailable')}
 assert.equal(nearbyClimbable(b,b.entity.position),null)
})
