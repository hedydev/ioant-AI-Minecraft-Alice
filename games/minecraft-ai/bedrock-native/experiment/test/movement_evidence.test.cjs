'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {attachMovementEvidence}=require('../src/movement_evidence.cjs')
test('never confirm movement from local Mineflayer entity position alone',()=>{
  const client=new EventEmitter();let now=1000
  const e=attachMovementEvidence(client,{clock:()=>now})
  client.emit('start_game',{runtime_entity_id:123n,movement_authority:'server',rewind_history_size:40})
  const checkpoint=e.checkpoint()
  assert.deepEqual(e.progress(checkpoint),{confirmed:false,reason:'no_two_server_positions',packetCount:0})
  assert.equal(e.get().received,0)
  assert.equal(e.get().rewindHistory,40)
  e.detach()
})
test('only received server-authoritative corrections establish self motion',()=>{
  const client=new EventEmitter();let now=5000
  const e=attachMovementEvidence(client,{clock:()=>now,eyeHeight:()=>1.62})
  client.emit('start_game',{runtime_entity_id:42n,movement_authority:'server'})
  client.emit('correct_player_move_prediction',{position:{x:10,y:66.62,z:9},tick:101n})
  const checkpoint=e.checkpoint()
  client.emit('move_player',{runtime_id:999n,position:{x:100,y:100,z:100},mode:'normal'})
  assert.equal(e.get().received,1,'other players must never count as Alice server movement')
  now+=500
  client.emit('correct_player_move_prediction',{position:{x:10.75,y:66.62,z:9},tick:110n})
  assert.equal(e.progress(checkpoint).confirmed,true)
  assert.equal(e.progress(checkpoint).movedBlocks,0.75)
  assert.equal(e.get().latestFeet.y,65)
  assert.equal(e.get().travelBlocks,0.75)
  assert.equal(e.get().lastSource,'correct_player_move_prediction')
  client.emit('move_player',{runtime_id:42n,position:{x:11,y:66.62,z:9},mode:'normal'})
  assert.equal(e.get().latestFeet.x,11)
  client.emit('close')
  client.emit('correct_player_move_prediction',{position:{x:99,y:99,z:99}})
  assert.equal(e.get().received,3,'closed listener must not continue collecting')
})
test('repeated stationary server corrections never assert movement',()=>{
  const client=new EventEmitter()
  const e=attachMovementEvidence(client)
  client.emit('correct_player_move_prediction',{position:{x:0,y:66,z:0}})
  const checkpoint=e.checkpoint()
  client.emit('correct_player_move_prediction',{position:{x:0.06,y:66,z:0}})
  assert.equal(e.progress(checkpoint).confirmed,false)
  assert.equal(e.progress(checkpoint).reason,'server_position_unchanged')
  e.detach()
})


test('start_game initial coordinates are server-origin but not movement progress',()=>{
  const client=new EventEmitter(),now=123400
  const e=attachMovementEvidence(client,{clock:()=>now,eyeHeight:()=>1.62})
  client.emit('start_game',{runtime_entity_id:42n,movement_authority:'server',
    player_position:{x:-1260.84,y:99.62,z:653.62}})
  assert.deepEqual(e.get().loginFeet,{x:-1260.84,y:98,z:653.62})
  assert.equal(e.get().loginSource,'start_game_player_position')
  assert.equal(e.get().loginAt,now)
  assert.equal(e.get().received,0,'login snapshot must not count as a movement correction')
  assert.equal(e.get().latestFeet,null)
  assert.equal(e.progress(e.checkpoint()).confirmed,false,
    'server position at login alone does not prove any later travel')
  client.emit('correct_player_move_prediction',{position:{x:-1258,y:99.62,z:653.62}})
  assert.equal(e.get().received,1)
  assert.equal(e.get().loginFeet.x,-1260.84,'subsequent server corrections must not change login baseline')
  e.detach()
})
test('invalid or missing server login position remains unknown',()=>{
  const client=new EventEmitter(),e=attachMovementEvidence(client)
  client.emit('start_game',{runtime_entity_id:55n,movement_authority:'server'})
  assert.equal(e.get().loginFeet,null)
  assert.equal(e.get().loginSource,null)
  e.detach()
})

test('relogin clears witness evidence, packet counters and old login timestamp',()=>{
 const client=new EventEmitter();let now=10000
 const e=attachMovementEvidence(client,{clock:()=>now})
 client.emit('start_game',{runtime_entity_id:1n,player_position:{x:0,y:71.62,z:0}})
 now=11000
 const id='615bca9b-ea00-316a-8bc3-650a0c8991c4'
 const first=e.ingestIndependentPosition({source:'mcsm_querytarget',feet:{x:0,y:70,z:0},
   serial:'1792572000000000001',uniqueId:id,observedAt:now-50})
 assert.equal(first,true)
 assert.equal(e.get().authoritativeSamples,1)
 client.emit('start_game',{runtime_entity_id:2n}) // no new server-origin login position
 assert.equal(e.get().authoritativeSamples,0)
 assert.equal(e.get().independentSamples,0)
 assert.equal(e.get().loginAt,null)
 now=12000
 assert.equal(e.ingestIndependentPosition({source:'mcsm_querytarget',feet:{x:2,y:70,z:0},
   serial:'1792572000000000002',uniqueId:id,observedAt:now-50}),false)
 e.detach()
})

test('relogin rejects old script-position evidence, duplicate serial and switched identity',()=>{
 const client=new EventEmitter();let at=10000
 const e=attachMovementEvidence(client,{clock:()=>at,eyeHeight:()=>1.62})
 const sample=(serial,id='server-player-uuid')=>({
   source:'bds_script_api',serial,uniqueId:id,observedAt:at-100,
   feet:{x:1,y:64,z:1}})
 client.emit('start_game',{runtime_entity_id:12n,player_position:{x:1,y:65.62,z:1}})
 at=11000
 assert.equal(e.ingestIndependentPosition(sample('1792572000000000001')),true)
 assert.equal(e.ingestIndependentPosition(sample('1792572000000000001')),false)
 assert.equal(e.ingestIndependentPosition(sample('1792572000000000002','different-player-uuid')),false)
 client.emit('start_game',{runtime_entity_id:13n})
 at=12000
 assert.equal(e.ingestIndependentPosition(sample('1792572000000000003')),false)
 e.detach()
})

test('server correction does not overwrite the independent witness age or identity',()=>{
 const client=new EventEmitter();let at=10000
 const e=attachMovementEvidence(client,{clock:()=>at})
 client.emit('start_game',{runtime_entity_id:10n,player_position:{x:1,y:65.62,z:2}})
 at=11000
 const base={source:'bds_script_api',uniqueId:'player-script-identity',
   feet:{x:1,y:64,z:2},observedAt:at-100}
 assert.equal(e.ingestIndependentPosition({...base,serial:'1792572000000000001'}),true)
 at=12000
 assert.equal(e.ingestIndependentPosition({...base,observedAt:at-100,
   serial:'1792572000000000002'}),true)
 client.emit('correct_player_move_prediction',{position:{x:1,y:65.62,z:2}})
 const s=e.get()
 assert.equal(s.lastSource,'correct_player_move_prediction')
 assert.equal(s.independentSource,'bds_script_api')
 assert.equal(s.independentAt,11900)
 at=16300
 assert.equal(e.get().independentAt,11900,'server corrections cannot extend independent freshness')
 e.detach()
})

test('large correction-only travel never becomes independent BDS motion',()=>{
 const client=new EventEmitter();let at=10000
 const e=attachMovementEvidence(client,{clock:()=>at})
 client.emit('start_game',{runtime_entity_id:42n,player_position:{x:0,y:65.62,z:0}})
 client.emit('correct_player_move_prediction',{position:{x:0,y:65.62,z:0}})
 client.emit('correct_player_move_prediction',{position:{x:22,y:65.62,z:0}})
 assert.equal(e.get().travelBlocks,22)
 assert.equal(e.get().independentSamples,0)
 assert.equal(e.get().independentTravelBlocks,0)
 assert.equal(e.get().independentPairTravelBlocks,null)
 e.detach()
})
test('independent BDS distance excludes interleaved server packet corrections',()=>{
 const client=new EventEmitter();let at=10000
 const e=attachMovementEvidence(client,{clock:()=>at})
 client.emit('start_game',{runtime_entity_id:42n,player_position:{x:0,y:65.62,z:0}})
 const common={source:'mcsm_querytarget',uniqueId:'one-session-uid'}
 at=11000
 assert.equal(e.ingestIndependentPosition({...common,serial:'1792572000000000001',
  observedAt:at-100,feet:{x:0,y:64,z:0}}),true)
 client.emit('correct_player_move_prediction',{position:{x:12,y:65.62,z:0}})
 at=12000
 assert.equal(e.ingestIndependentPosition({...common,serial:'1792572000000000002',
  observedAt:at-100,feet:{x:0.5,y:64,z:0}}),true)
 assert.equal(e.get().independentSamples,2)
 assert.equal(e.get().independentPreviousAt,10900)
 assert.equal(e.get().independentAt,11900)
 assert.equal(e.get().independentPairTravelBlocks,0.5)
 assert.equal(e.get().independentTravelBlocks,0.5)
 assert.ok(e.get().travelBlocks>20)
 assert.equal(e.ingestIndependentPosition({...common,serial:'1792572000000000003',
  observedAt:11900,feet:{x:5,y:64,z:0}}),false,
  'newer serial with replayed clock must not count')
 client.emit('start_game',{runtime_entity_id:42n,player_position:{x:0,y:65.62,z:0}})
 assert.equal(e.get().independentTravelBlocks,0)
 assert.equal(e.get().independentPreviousAt,null)
 e.detach()
})
test('death in same login invalidates previous-life independent witness',()=>{
 const c=new EventEmitter();let now=10000
 const e=attachMovementEvidence(c,{clock:()=>now})
 c.emit('start_game',{runtime_entity_id:2n,player_position:{x:1,y:65.62,z:2}})
 now=11000
 assert.equal(e.ingestIndependentPosition({source:'mcsm_querytarget',
  uniqueId:'player-id',feet:{x:1,y:64,z:2},observedAt:now-100,
  serial:'1792572000000000001'}),true)
 e.beginRespawnEpoch()
 assert.equal(e.get().independentSamples,0)
 assert.equal(e.get().independentLatestFeet,null)
 assert.equal(e.get().loginAt,10000)
 e.detach()
})
test('independent BDS teleport-sized jumps are not counted as walking',()=>{
 const client=new EventEmitter();let at=10000
 const e=attachMovementEvidence(client,{clock:()=>at})
 client.emit('start_game',{runtime_entity_id:42n,player_position:{x:0,y:65.62,z:0}})
 const common={source:'mcsm_querytarget',uniqueId:'one-session-uid'}
 at=11000
 assert.equal(e.ingestIndependentPosition({...common,serial:'1792572000000000001',
  observedAt:10900,feet:{x:0,y:64,z:0}}),true)
 at=12000
 assert.equal(e.ingestIndependentPosition({...common,serial:'1792572000000000002',
  observedAt:11900,feet:{x:100,y:64,z:0}}),true)
 assert.equal(e.get().independentTravelBlocks,0)
 assert.equal(e.get().independentPairTravelBlocks,null)
 e.detach()
})
