'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {MovementPredictionHistory,cloneState,tickId}=require('../src/movement_prediction_history.cjs')
class Vector{
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}
  clone(){return new Vector(this.x,this.y,this.z)}
}
function state(){return {pos:new Vector(0,64,0),vel:new Vector(),onGround:true,
  isCollidedVertically:true,isCollidedHorizontally:false,isInWater:false,
  isInLava:false,isInWeb:false,elytraFlying:false,jumpTicks:0,jumpQueued:false,
  fireworkRocketDuration:0,attributes:{speed:{value:.1}},yaw:0,pitch:0,
  control:{forward:false},speed:0}}
function simulate(s){
  s.vel.x=s.control.forward?1:0
  s.pos.x+=s.vel.x;s.pos.z+=s.vel.z
  if(s.jumpQueued){s.vel.y=.4;s.jumpTicks=10;s.jumpQueued=false}
  else s.jumpTicks=Math.max(0,s.jumpTicks-1)
  return s
}
function fixture({capacity=40}={}){
  const h=new MovementPredictionHistory({capacity,simulate}),s=state()
  function frame(tick,change=()=>{}){
    change(s);const before=cloneState(s);simulate(s)
    h.record(BigInt(tick),before,s,1.62)
  }
  function packet(tick,x,extra={}){return {prediction_type:'player',tick:BigInt(tick),
    position:{x,y:65.62,z:0},delta:{x:0,y:0,z:0},on_ground:true,...extra}}
  function correct(p){return h.correct(p,s,1.62,h.frames.at(-1)?.tick??5n)}
  return {h,s,frame,packet,correct}
}
test('delayed correction rewinds its tick and replays later inputs without losing progress',()=>{
  const f=fixture();for(let i=1;i<=5;i++)f.frame(i,s=>{s.control.forward=true})
  const r=f.correct(f.packet(2,1.75))
  assert.equal(r.replayed,3);assert.equal(r.state.pos.x,4.75)
  assert.equal(f.s.pos.x,5) // history never mutates the live bot itself
  assert.equal(f.h.frames[1].after.pos.x,1.75)
  assert.equal(f.h.summary().replayedFrames,3)
})
test('sub-half-block corrections still correct every position axis, delta and grounded state',()=>{
  const f=fixture();f.frame(1)
  const r=f.correct(f.packet(1,.1,{delta:{x:.02,y:-.1,z:.03},on_ground:false}))
  assert.equal(r.state.pos.x,.1);assert.equal(r.state.pos.y,64)
  assert.deepEqual({...r.state.vel},{x:.02,y:-.1,z:.03})
  assert.equal(r.state.onGround,false);assert.equal(r.state.isCollidedVertically,false)
})
test('historical controls/look and jump impulses replay without current live intent',()=>{
  const f=fixture();f.frame(1);f.frame(2,s=>{s.control.forward=true;s.yaw=1;s.jumpQueued=true})
  f.frame(3,s=>{s.control.forward=false;s.yaw=2})
  f.s.control.forward=true;f.s.yaw=3;f.s.jumpQueued=true // next, unsimulated input
  const r=f.correct(f.packet(1,0))
  assert.equal(r.state.pos.x,1);assert.equal(r.state.yaw,2)
  assert.equal(r.state.jumpTicks,9);assert.equal(r.state.jumpQueued,true)
  assert.equal(f.s.yaw,3);assert.equal(f.s.control.forward,true)
})
test('duplicate/out-of-order corrections are ignored, not replayed again',()=>{
  const f=fixture();for(let i=1;i<=3;i++)f.frame(i)
  assert(f.correct(f.packet(2,.1)).state)
  assert.equal(f.correct(f.packet(2,.2)).reason,'stale_input_correction')
  assert.equal(f.correct(f.packet(1,.3)).reason,'stale_input_correction')
  assert.equal(f.h.summary().correctionReplays,1)
})
test('future tick cannot alter state or re-anchor input time',()=>{
  const f=fixture();f.frame(1)
  assert.equal(f.correct(f.packet(20,3)).reason,'future_input_correction')
  assert.equal(f.s.pos.x,0);assert.equal(f.h.frames.length,1)
})
test('history eviction has explicit immediate authority fallback, not phantom replay',()=>{
  const f=fixture({capacity:2});for(let i=1;i<=4;i++)f.frame(i)
  const r=f.correct(f.packet(1,.2))
  assert.equal(r.fallback,true);assert.equal(r.replayed,0)
  assert.equal(r.state.pos.x,.2);assert.equal(f.h.frames.length,0)
})
test('life boundary rejects packets from a previous life even when same position',()=>{
  const f=fixture();f.frame(4);f.h.reset('death',{lifeBoundary:true,floor:4n})
  f.frame(5)
  assert.equal(f.correct(f.packet(4,7)).reason,'prior_life_correction')
  assert(f.correct(f.packet(5,.1)).state)
})
test('world invalidation forces fallback rather than re-simulating against changed blocks',()=>{
  const f=fixture();f.frame(1);f.h.reset('collision_world_changed')
  const r=f.h.correct(f.packet(1,.2),f.s,1.62,1n)
  assert.equal(r.reason,'correction_history_miss');assert.equal(r.fallback,true)
})
test('external mirror, knockback or pose change invalidates old trajectory',()=>{
  for(const mutate of [s=>{s.pos.x=2},s=>{s.vel.x=1},s=>{s.attributes.speed.value=.2}]){
    const f=fixture();f.frame(1);mutate(f.s)
    assert.equal(f.correct(f.packet(1,.1)).reason,'correction_context_changed')
  }
})
test('new frame after a discontinuity cannot extend incompatible history',()=>{
  const f=fixture();f.frame(1);f.frame(2,s=>{s.pos.x=10})
  assert.equal(f.h.frames.length,1);assert.equal(f.h.frames[0].tick,2n)
  f.frame(4);assert.equal(f.h.frames.length,1)
})
test('attribute snapshots are independent of mutable current server metadata',()=>{
  const f=fixture();f.frame(1);f.s.attributes.speed.value=9
  assert.equal(f.h.frames[0].before.attributes.speed.value,.1)
})
test('replay failure leaves live state untouched and returns immediate authority',()=>{
  const f=fixture();f.frame(1);f.frame(2);f.h.simulate=()=>{throw Error('unloaded world')}
  const r=f.correct(f.packet(1,3))
  assert.equal(r.reason,'correction_replay_unavailable');assert.equal(r.fallback,true)
  assert.equal(r.state.pos.x,3);assert.equal(f.s.pos.x,0)
})
test('historical eye-height conversion is exact and pose changes cannot silently replay',()=>{
  const f=fixture();f.frame(1)
  const r=f.h.correct(f.packet(1,0),f.s,1.27,1n)
  assert.equal(r.reason,'correction_context_changed');assert(Math.abs(r.state.pos.y-64)<1e-12)
})
test('malformed, vehicle and legacy velocity-only packets cannot partially mutate state',()=>{
  const cases=[{position:{x:NaN,y:1,z:1}},{delta:undefined},{delta:{x:0,y:Infinity,z:0}},
    {prediction_type:'vehicle'},{on_ground:1},{tick:-1n},{tick:undefined},{tick:1.5}]
  for(const change of cases){
    const f=fixture();f.frame(1)
    assert.equal(f.correct(f.packet(1,0,change)).reason,'invalid_player_correction')
    assert.equal(f.h.frames.length,1);assert.equal(f.s.pos.x,0)
  }
})
test('tick parser keeps uint64 precision and rejects ambiguous or invalid values',()=>{
  assert.equal(tickId([1,1]),4294967297n)
  assert.equal(tickId('18446744073709551615'),0xffffffffffffffffn)
  for(const value of [null,undefined,-1,1.2,Number.MAX_SAFE_INTEGER+1,[0,-1],[],true,'',' ',1n<<64n])
    assert.equal(tickId(value),null)
})
test('capacity and accumulated replay work remain bounded',()=>{
  const f=fixture({capacity:1000000});for(let i=1;i<=300;i++)f.frame(i)
  assert.equal(f.h.frames.length,80)
  const r=f.correct(f.packet(221,.1));assert.equal(r.replayed,79)
})
