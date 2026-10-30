'use strict'
// Regression adapted from operator's 2026-10-22 Mint Codex reproduction.
// Uses the pinned real Physics + Mineflayer Pathfinder, no network/login/BDS.
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const {createRequire}=require('node:module')
const {EventEmitter}=require('node:events')
const root=path.resolve(__dirname,'..'),fromRoot=createRequire(path.join(root,'package.json'))
const Vec3=fromRoot('vec3')
const registry=fromRoot('minecraft-data')('bedrock_1.26.51')
const plugin=path.resolve(root,'src/bedrock_client_input_sync.cjs')
const pluginCode=fs.readFileSync(plugin,'utf8')
function run(delay,{pathfinder=false,flip=false,beginForward=false,die=false,respawn=false}={}){
  let now=100000,timer=null,ticks=0
  const bot=new EventEmitter(),client=new EventEmitter(),packets=[],frames=[]
  bot._client=client;bot.registry=registry;bot.entities={};bot.game={minY:-64,height:384}
  bot.inventory={slots:[],items:()=>[]}
  bot.entity={position:new Vec3(.5,69,.5),velocity:new Vec3(0,0,0),
    yaw:0,pitch:0,eyeHeight:1.62,onGround:true,effects:{},attributes:{}}
  bot.blockAt=p=>({name:p.y<69?'stone':'air',
    type:(p.y<69?registry.blocksByName.stone:registry.blocksByName.air).id,
    position:new Vec3(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)),
    boundingBox:p.y<69?'block':'empty',
    shapes:p.y<69?[[0,0,0,1,1,1]]:[],getProperties:()=>({})})
  client.queue=(name,p)=>{
    if(name==='player_auth_input')packets.push({
      tick:String(p.tick),input:[...p.input_data],move:{...p.move_vector},
      raw:{...p.raw_move_vector},analog:{...p.analogue_move_vector},
      pos:{...p.position},yaw:p.yaw,pitch:p.pitch
    })
  }
  const mod={exports:{}}
  vm.runInNewContext(pluginCode,{module:mod,exports:mod.exports,require:createRequire(plugin),
    Date:{now:()=>now},setInterval:fn=>{timer=fn;return {unref(){}}},
    clearInterval(){timer=null},setTimeout,clearTimeout,console},{filename:plugin})
  mod.exports(bot)
  client.emit('start_game',{current_tick:1000n,movement_authority:'server'})
  bot.emit('spawn')
  packets.length=0
  const from=bot.entity.position.clone()
  bot.on('physicsTick',()=>{ticks++;if(flip)bot.setControlState('forward',ticks<7)})
  const actualSim=bot.physics.simulatePlayer
  bot.physics.simulatePlayer=(state,world)=>{
    frames.push({forward:state.control.forward,live:state.control===bot.controlState})
    return actualSim(state,world)
  }
  if(pathfinder){
    const pf=fromRoot('mineflayer-pathfinder')
    pf.pathfinder(bot)
    const moves=new pf.Movements(bot)
    moves.canDig=false;moves.allow1by1towers=false
    moves.allowParkour=false;moves.allowSprinting=false
    bot.pathfinder.setMovements(moves)
    bot.pathfinder.setGoal(new pf.goals.GoalNear(.5,69,-4.5,.5))
  }else if(beginForward)bot.setControlState('forward',true)
  if(die)bot.emit('death')
  if(respawn)bot.emit('spawn')
  now+=delay;if(timer)timer()
  const result={packets,frames,ticks,localMoved:bot.entity.position.distanceTo(from),
    stats:bot._aliceBedrockInputSync.summary()}
  client.emit('close')
  return result
}
test('50ms standard tick reports exactly one aligned input frame',()=>{
  const r=run(50,{beginForward:true})
  assert.equal(r.packets.length,1)
  assert.deepEqual(r.packets.map(p=>p.tick),['1001'])
  assert.equal(r.packets[0].move.z,1)
  assert(r.packets[0].input.includes('up'))
  assert.equal(r.stats.emitted,2) // includes initial send on spawn
})
test('400ms callback change sends 8 distinct snapshots, no stale-zero after forward begins',()=>{
  const r=run(400,{flip:true})
  assert.equal(r.packets.length,8)
  assert.deepEqual(r.packets.map(p=>p.tick),Array.from({length:8},(_,i)=>String(1001+i)))
  assert.equal(r.packets[0].move.z,0)
  assert(r.packets.slice(1,6).every(p=>p.move.z===1&&p.input.includes('up')))
  // The seventh physicsTick releases forward; that change belongs to
  // the eighth packet, not retrospectively to the seventh physics frame.
  assert.equal(r.packets[6].move.z,1)
  assert.equal(r.packets[7].move.z,0)
  assert(r.localMoved>.1)
  assert.equal(r.stats.lastBatchFrames,8)
  assert.equal(r.stats.skippedTicks,0)
})
test('400ms with real Pathfinder sends forward snapshots for actual physical steps',()=>{
  const r=run(400,{pathfinder:true})
  assert.equal(r.packets.length,8)
  assert(r.localMoved>.1)
  assert(r.packets.some(p=>p.move.z!==0&&p.input.includes('up')))
  assert.equal(r.packets[0].move.z,0)
  assert.equal(r.stats.overruns,0)
})
test('750ms elapsed sends every frame with no unaccounted skipped tick',()=>{
  const r=run(750,{flip:true})
  assert.equal(r.packets.length,15)
  assert.deepEqual(r.packets.map(p=>p.tick),Array.from({length:15},(_,i)=>String(1001+i)))
  assert.equal(r.stats.lastBatchFrames,15)
  assert.equal(r.stats.skippedTicks,0)
  assert.equal(r.stats.overruns,0)
})
test('death pauses corpse physics; respawn resumes without stale movement',()=>{
 const a=run(900,{beginForward:true,die:true})
 assert.equal(a.packets.length,0);assert.equal(a.localMoved,0)
 assert.equal(a.stats.deathPauses,1)
 const b=run(900,{beginForward:true,die:true,respawn:true})
 assert(b.packets.length>0)
 assert(b.packets.every(p=>p.move.z===0))
 assert.equal(b.stats.respawnResumes,1)
})
test('severe 1800ms event-loop stall stops controls and refuses phantom physics catchup',()=>{
  const r=run(1800,{beginForward:true})
  assert.equal(r.packets.length,0)
  assert.equal(r.stats.overruns,1)
  assert.equal(r.stats.lastOverrunReason,'catchup_window_exceeded')
  assert.equal(r.stats.skippedTicks,36)
  assert.equal(r.ticks,0)
  assert.equal(r.localMoved,0)
})
