'use strict'
// Plugin contract test with deterministic, no-network physics. The separate
// client_input_tick_sync suite exercises real pinned Physics and Pathfinder.
const test=require('node:test'),assert=require('node:assert/strict')
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module')
const plugin=path.resolve(__dirname,'../src/bedrock_client_input_sync.cjs')
class Vector{
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}
  clone(){return new Vector(this.x,this.y,this.z)}
  set(x,y,z){Object.assign(this,{x,y,z})}
}
class PlayerState{
  constructor(bot,control){
    Object.assign(this,bot.entity)
    delete this.position;delete this.velocity
    this.pos=bot.entity.position.clone();this.vel=bot.entity.velocity.clone()
    this.control=control;this.jumpTicks=bot.jumpTicks;this.jumpQueued=bot.jumpQueued
    this.fireworkRocketDuration=bot.fireworkRocketDuration
  }
  apply(bot){
    bot.entity.position=this.pos;bot.entity.velocity=this.vel
    for(const key of ['onGround','isCollidedHorizontally','isCollidedVertically',
      'isInWater','isInLava','isInWeb','elytraFlying'])bot.entity[key]=this[key]
    for(const key of ['jumpTicks','jumpQueued','fireworkRocketDuration'])bot[key]=this[key]
  }
}
function fixture(){
  let now=100000,timer=null,simulations=0,callbacks=0
  const bot=new EventEmitter(),client=new EventEmitter(),packets=[]
  bot._client=client;bot.registry={protocol:{types:{}},version:{'>=':()=>true}}
  bot.inventory={slots:[]};bot.entity={position:new Vector(.5,64,.5),velocity:new Vector(),
    yaw:0,pitch:0,eyeHeight:1.62,onGround:true,effects:{},attributes:{}}
  client.queue=(name,packet)=>packets.push({name,packet})
  const fromPlugin=createRequire(plugin),mod={exports:{}}
  vm.runInNewContext(fs.readFileSync(plugin,'utf8'),{
    module:mod,exports:mod.exports,require:name=>{
      if(name==='vec3')return Vector
      if(name==='mineflayer/lib/conversions')return {
        fromNotchianPitch:x=>x,toNotchianPitch:x=>x,toNotchianYaw:x=>x}
      if(name==='prismarine-physics')return {PlayerState,Physics:()=>({simulatePlayer:s=>{
        simulations++;s.vel.z=s.control.forward?-1:0;s.pos.z+=s.vel.z;return s
      }})}
      return fromPlugin(name)
    },performance:{now:()=>now},Date:{now:()=>now},
    setInterval:fn=>{timer=fn;return {unref(){}}},clearInterval:()=>{timer=null},
    setTimeout,clearTimeout,console
  },{filename:plugin})
  mod.exports(bot)
  client.emit('start_game',{current_tick:1000n,movement_authority:'server',rewind_history_size:40})
  bot.on('physicsTick',()=>{callbacks++})
  bot.emit('spawn')
  const advance=ms=>{now+=ms;timer?.()}
  const correction=(tick,extra={})=>client.emit('correct_player_move_prediction',{
    prediction_type:'player',tick,position:{x:.5,y:65.62,z:-.4},
    delta:{x:0,y:0,z:-1},on_ground:true,...extra})
  return {bot,client,packets,advance,correction,counts:()=>({simulations,callbacks}),
    summary:()=>bot._aliceBedrockInputSync.summary()}
}
test('delayed plugin correction replays physics only, preserves current look and sends no packets',()=>{
  const f=fixture();f.bot.setControlState('forward',true);f.advance(100)
  assert.equal(f.bot.entity.position.z,-1.5)
  f.bot.entity.yaw=2;f.bot.setControlState('forward',false)
  const before=f.counts(),packetCount=f.packets.length
  f.correction(1001n)
  assert.equal(f.bot.entity.position.z,-1.4)
  assert.equal(f.bot.entity.yaw,2);assert.equal(f.bot.controlState.forward,false)
  assert.equal(f.counts().simulations,before.simulations+1)
  assert.equal(f.counts().callbacks,before.callbacks)
  assert.equal(f.packets.length,packetCount)
  assert.equal(f.summary().correctionReplays,1)
  f.advance(50)
  assert.equal(f.packets.at(-1).packet.tick,1003n,'past correction must not reset present clock')
  f.client.emit('close')
})
test('old-life, future and duplicate packets cannot move the new player or repeat callbacks',()=>{
  const f=fixture();f.advance(100);f.bot.emit('death');f.bot.emit('spawn')
  const before=f.counts(),p={...f.bot.entity.position}
  f.correction(1001n);f.correction(9999n)
  assert.deepEqual({...f.bot.entity.position},p);assert.deepEqual(f.counts(),before)
  f.advance(50);f.correction(1003n);const corrected=f.bot.entity.position.clone()
  f.correction(1003n,{position:{x:500,y:65.62,z:500}})
  assert.deepEqual(f.bot.entity.position,corrected)
  f.client.emit('close')
})
test('fallback stops navigation without allowing fullStop to overwrite server correction',()=>{
  const f=fixture();f.bot.setControlState('forward',true);f.advance(100)
  f.bot.pathfinder={stop:()=>{f.bot.entity.position.z=999;f.bot.entity.velocity.z=0}}
  f.bot.emit('blockUpdate')
  f.correction(1001n)
  assert.equal(f.bot.entity.position.z,-.4);assert.equal(f.bot.entity.velocity.z,-1)
  assert.equal(f.bot.controlState.forward,false);assert.equal(f.summary().correctionFallbacks,1)
  f.client.emit('close')
})
test('vehicle corrections and disabled physics never replay the standing player trajectory',()=>{
  const f=fixture();f.advance(100)
  f.correction(1001n,{prediction_type:'vehicle'})
  assert.equal(f.bot.entity.position.z,.5)
  f.bot.physicsEnabled=false;f.correction(1001n)
  assert.equal(f.summary().correctionReplays,0);assert.equal(f.summary().correctionFallbacks,1)
  f.client.emit('close')
})
test('correction packet uses actual delta and on_ground, not legacy velocity',()=>{
  const f=fixture();f.advance(50)
  f.correction(1001n,{delta:{x:.1,y:-.2,z:.3},on_ground:false,
    velocity:{x:99,y:99,z:99}})
  assert.deepEqual({...f.bot.entity.velocity},{x:.1,y:-.2,z:.3})
  assert.equal(f.bot.entity.onGround,false)
  f.client.emit('close')
})
test('only newly queued motion updates activity time; replay does not create another input',()=>{
 const f=fixture()
 assert.equal(f.summary().lastMotionInputAt,null)
 f.bot.setControlState('forward',true);f.advance(100)
 assert.equal(f.summary().lastMotionInputAt,100100)
 f.bot.setControlState('forward',false);f.advance(50)
 f.correction(1001n)
 assert.equal(f.summary().lastMotionInputAt,100100)
 assert.equal(f.summary().lastAuthoritativePositionAt,100150)
 f.client.emit('close')
})
