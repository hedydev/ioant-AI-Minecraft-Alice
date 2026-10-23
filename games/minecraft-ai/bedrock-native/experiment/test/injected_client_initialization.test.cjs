'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {createLegacyNativeClient}=require('../src/connection_strategy.cjs')
const {attachInjectedClientInitialization}=require('../src/injected_client_initialization.cjs')
const expected=[['serverbound_loading_screen',{type:1}],
 ['client_camera_aim_assist',{preset_id:'',action:'clear',allow_aim_assist:false}],
 ['serverbound_loading_screen',{type:2}]]
function fake(version=2193){
 const c=new EventEmitter();c.options={protocolVersion:version};c.sent=[]
 c.queue=(n,p)=>c.sent.push([n,p]);return c
}
test('injected factory restores missing initial completion once, on the same connection',()=>{
 const c=fake();let connections=0,notifications=0
 const created=createLegacyNativeClient({host:'127.0.0.1',port:17879,profile:'AliceAI-HedydevGame',authRoot:'/safe/cache',raknetBackend:'raknet-native'},
  {createClient:()=>{connections++;return c}})
 c.on('alice_initialization',()=>notifications++)
 c.emit('play_status',{status:'login_success'});assert.equal(c.sent.length,0)
 c.emit('play_status',{status:'player_spawn'})
 assert.deepEqual(c.sent,expected);assert.equal(created,c);assert.equal(connections,1)
 c.emit('play_status',{status:'player_spawn'});assert.equal(c.sent.length,3)
 assert.equal(notifications,1)
 assert(!c.sent.some(([n])=>n==='set_local_player_as_initialized'))
})
test('unknown protocols and closed connections cannot send initialization',()=>{
 for(const v of [null,0,2168,2207]){
  const c=fake(v);attachInjectedClientInitialization(c)
  c.emit('play_status',{status:'player_spawn'});assert.equal(c.sent.length,0)
 }
 const c=fake();attachInjectedClientInitialization(c);c.emit('close')
 c.emit('play_status',{status:'player_spawn'});assert.equal(c.sent.length,0)
})
test('encoding failure is visible and never retried or announced as completion',()=>{
 const c=fake(),error=Error('encoding failed');let count=0,done=0
 c.queue=()=>{count++;throw error};c.on('alice_initialization',()=>done++)
 attachInjectedClientInitialization(c)
 assert.throws(()=>c.emit('play_status',{status:'player_spawn'}),e=>e===error)
 c.emit('play_status',{status:'player_spawn'});assert.equal(count,1);assert.equal(done,0)
})
let factory,codec
try{factory=require.resolve('mineflayer/lib/client/bedrock.js')}catch{}
try{codec=require('bedrock-protocol/src/transforms/serializer')}catch{}
test('installed Mineflayer factory supplies the same omitted sequence offline',{skip:!factory},()=>{
 const fs=require('node:fs'),vm=require('node:vm'),c=fake(),module={exports:{}}
 vm.runInNewContext(fs.readFileSync(factory,'utf8'),{module,require:id=>{
  if(id==='bedrock-protocol')return {createClient:()=>c}
  if(id==='../skin')return {classicSkin:()=>({})}
  throw Error('unexpected dependency')
 }})
 module.exports.createClient({version:'bedrock_1.26.51',offline:false})
 c.emit('play_status',{status:'player_spawn'})
 assert.equal(JSON.stringify(c.sent),JSON.stringify(expected))
})
test('2193 installed codec encodes exact loading start/end bytes with no ID',{skip:!codec},()=>{
 const s=codec.createSerializer('1.26.51'),d=codec.createDeserializer('1.26.51')
 for(const [type,hex] of [[1,'b8020200'],[2,'b8020400']]){
  const bytes=s.createPacketBuffer({name:'serverbound_loading_screen',params:{type}})
  assert.equal(bytes.toString('hex'),hex)
  const decoded=d.parsePacketBuffer(bytes).data
  assert.equal(decoded.name,'serverbound_loading_screen');assert.equal(decoded.params.type,type)
  assert.equal(decoded.params.loading_screen_id,undefined)
 }
 assert.doesNotThrow(()=>s.createPacketBuffer({name:expected[1][0],params:expected[1][1]}))
})
