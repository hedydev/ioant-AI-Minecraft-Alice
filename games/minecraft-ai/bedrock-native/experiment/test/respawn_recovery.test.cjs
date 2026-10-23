'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {attachRespawnRecovery}=require('../src/respawn_recovery.cjs')
function fixture({withRuntime=true}={}){
 let now=0
 const tasks=[]
 const logs=[],packets=[],client=new EventEmitter(),bot=new EventEmitter()
 client.queue=(name,params)=>{packets.push({name,params})}
 bot._client=client;bot.health=20;bot.isAlive=true
 const schedule=(fn,delay)=>{
  const timer={fn,at:now+delay,done:false,unref(){}}
  tasks.push(timer);return timer
 }
 const cancel=t=>{t.done=true}
 const advance=t=>{
  while(true){
   const due=tasks.filter(x=>!x.done&&x.at<=t).sort((a,b)=>a.at-b.at)[0]
   if(!due)break
   now=due.at;due.done=true;due.fn()
  }
  now=t
 }
 const recovery=attachRespawnRecovery(bot,{clock:()=>now,schedule,cancel,
   log:{log:(...a)=>logs.push(a)}})
 if(withRuntime)client.emit('start_game',{runtime_entity_id:71n})
 const death=()=>{bot.health=0;bot.isAlive=false;bot.emit('death')}
 const alive=()=>{bot.health=20;bot.emit('health');bot.isAlive=true;bot.emit('spawn')}
 return {client,bot,advance,recovery,packets,logs,death,alive}
}
test('no packet when alive and death only requests one bounded retry after upstream fallback',()=>{
 const f=fixture()
 f.advance(30000);assert.equal(f.packets.length,0)
 f.death();f.advance(41999);assert.equal(f.packets.length,0)
 f.advance(42000)
 assert.equal(f.packets.length,1,'without BDS ready only one state=2 retry is allowed')
 assert.equal(f.packets[0].name,'respawn')
 assert.equal(f.packets[0].params.state,2)
 assert.equal(f.packets[0].params.runtime_entity_id,71n)
 assert.equal(f.recovery.get().retrySent,false,'final action must await server ready')
 assert.equal(f.recovery.get().readyRetrySent,true)
 f.advance(60000);assert.equal(f.packets.length,1)
 assert.equal(f.recovery.get().phase,'respawn_stalled')
 f.recovery.stop()
})
test('server ready observed, health and spawn recover before fallback',()=>{
 const f=fixture()
 f.death();f.client.emit('respawn',{state:'ready_to_spawn'})
 assert.equal(f.recovery.get().serverReadyObserved,true)
 f.advance(9000)
 f.alive()
 f.advance(60000)
 assert.equal(f.packets.length,0)
 assert.equal(f.recovery.get().phase,'respawn_verified')
 assert.equal(f.recovery.get().deadSeconds,null)
 f.recovery.stop()
})
test('a new server-ready packet can be recorded without coordinates or runtime IDs',()=>{
 const f=fixture();f.death()
 f.client.emit('respawn',{state:1,position:{x:999,y:999,z:999}})
 f.advance(12000)
 const summary=JSON.stringify(f.recovery.get())
 const logs=JSON.stringify(f.logs)
 assert.equal(f.recovery.get().serverReadyObserved,true)
 assert.equal(f.recovery.get().retrySent,true)
 assert.equal(f.recovery.get().readyRetrySent,false,'ready server must not receive redundant ready packet')
 assert.deepEqual(f.packets.map(p=>p.name),['player_action'])
 assert(!summary.includes('999'));assert(!summary.includes('71'))
 assert(!logs.includes('999'));assert(!logs.includes('71'))
 f.recovery.stop()
})
test('close preempts retry and reports transport failure instead of unbounded relogin',()=>{
 const f=fixture()
 f.death();f.client.emit('close')
 f.advance(90000)
 assert.equal(f.packets.length,0)
 assert.equal(f.recovery.get().phase,'transport_closed_during_respawn')
 f.recovery.stop()
})
test('no runtime ID refuses any raw network action',()=>{
 const f=fixture({withRuntime:false})
 f.death();f.advance(50000)
 assert.equal(f.packets.length,0)
 assert.equal(f.recovery.get().phase,'respawn_stalled')
 assert.equal(f.recovery.get().retrySent,false)
 f.recovery.stop()
})
test('repeated death events do not start multiple timers or replay extra packets',()=>{
 const f=fixture()
 f.death();f.bot.emit('death');f.bot.emit('death')
 f.advance(50000)
 assert.equal(f.recovery.get().cycles,1)
 assert.equal(f.packets.length,1,'repeated death must not duplicate ready request')
 f.recovery.stop()
})
test('positive health without a spawn event is not accepted as a completed respawn',()=>{
 const f=fixture()
 f.death();f.bot.health=20;f.bot.emit('health')
 assert.equal(f.recovery.get().phase,'health_restored_awaiting_spawn')
 f.advance(50000);assert.equal(f.packets.length,0)
 assert.equal(f.recovery.get().deadSeconds!==null,true)
 f.recovery.stop()
})

test('missing server ready retries both upstream packet phases once then stays stalled',()=>{
 const f=fixture()
 f.death()
 f.advance(12000)
 assert.deepEqual(f.packets.map(p=>p.name),['respawn'])
 assert.equal(f.recovery.get().phase,'respawn_ready_retried_waiting_for_server')
 f.advance(500000)
 assert.equal(f.packets.length,1)
 assert.equal(f.recovery.get().phase,'respawn_stalled')
 assert.equal(f.recovery.get().serverReadyObserved,false)
 f.recovery.stop()
})
test('server ready after bounded retry can complete on original session without new login',()=>{
 const f=fixture()
 f.death();f.advance(12000)
 f.client.emit('respawn',{state:1})
 assert.equal(f.recovery.get().serverReadyObserved,true)
 assert.deepEqual(f.packets.map(p=>p.name),['respawn','player_action'],
   'final action must follow server ready')
 assert.equal(f.recovery.get().phase,'respawn_action_after_server_ready')
 f.alive();f.advance(120000)
 assert.equal(f.recovery.get().phase,'respawn_verified')
 assert.equal(f.recovery.get().deadSeconds,null)
 assert.equal(f.recovery.get().cycles,1)
 assert.equal(f.packets.length,2)
 f.recovery.stop()
})

test('late ReadyToSpawn after full retry sends exactly one final action',()=>{
 const f=fixture()
 f.death();f.advance(12000)
 assert.deepEqual(f.packets.map(p=>p.name),['respawn'])
 f.client.emit('respawn',{state:1})
 assert.deepEqual(f.packets.map(p=>p.name),['respawn','player_action'])
 assert.equal(f.packets[1].params.runtime_entity_id,71n)
 f.client.emit('respawn',{state:1})
 f.client.emit('respawn',{state:'ready_to_spawn'})
 assert.equal(f.packets.length,2,'duplicate server ready must not replay action')
 f.advance(30000)
 assert.equal(f.recovery.get().phase,'respawn_stalled')
 f.recovery.stop()
})
test('if server ready arrived before deadline use action-only retry at 12s',()=>{
 const f=fixture()
 f.death();f.client.emit('respawn',{state:1})
 f.advance(12000)
 assert.deepEqual(f.packets.map(p=>p.name),['player_action'])
 assert.equal(f.recovery.get().readyRetrySent,false)
 assert.equal(f.recovery.get().retrySent,true)
 f.recovery.stop()
})
test('late ReadyToSpawn after close never sends any final action',()=>{
 const f=fixture()
 f.death();f.advance(12000)
 assert.equal(f.packets.length,1)
 f.client.emit('close')
 f.client.emit('respawn',{state:1})
 assert.equal(f.packets.length,1)
 assert.equal(f.recovery.get().phase,'transport_closed_during_respawn')
 f.recovery.stop()
})
