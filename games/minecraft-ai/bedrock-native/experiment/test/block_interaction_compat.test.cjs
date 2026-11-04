'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {attachBlockInteractionCompat,networkBlock,wireId}=require('../src/block_interaction_compat.cjs')
function fixture(hash=-12345){
 const bot=new EventEmitter(),client=new EventEmitter(),calls=[]
 const state={name:'spruce_door',states:{open_bit:{type:'byte',value:0}}}
 const registry={blockStates:{7871:state},blocksByRuntimeId:{[hash]:{stateId:7871}},supportFeature:()=>true}
 bot._client=client;bot.registry=registry
 const original=function(block,...args){calls.push({self:this,block,args});return 'same_return'}
 const control=attachBlockInteractionCompat(bot,{loadBlock:r=>{assert.equal(r,bot.registry);return{getHash:(name,states)=>{assert.equal(name,state.name);assert.equal(states,state.states);return hash}}}})
 // Internal plugin injection precedes the compatibility listener.
 bot.activateBlock=original;client.emit('start_game',{block_network_ids_are_hashes:true});bot.emit('inject_allowed')
 const block={name:'spruce_door',stateId:7871,position:{x:1,y:2,z:3},getProperties(){return{local:this.stateId}}}
 return{bot,client,calls,block,registry,original,control}
}
test('hashed doors use installed hash and exact inverse; local world block remains untouched',()=>{
 const f=fixture(),face={x:0,y:0,z:1}
 assert.equal(f.bot.activateBlock(f.block,face),'same_return')
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].self,f.bot)
 assert.equal(f.calls[0].block.stateId,(-12345)>>>0)
 assert.equal(f.calls[0].block.position,f.block.position);assert.equal(f.calls[0].args[0],face)
 assert.equal(f.block.stateId,7871);assert.deepEqual(f.block.getProperties(),{local:7871})
 assert.equal(f.registry.blockStates[7871].states.open_bit.value,0)
})
test('bed sleep dispatch uses same activateBlock adapter, never a second activation',async()=>{
 const f=fixture();f.block.name='bed';f.registry.blockStates[7871].name='bed'
 f.bot.sleep=async bed=>f.bot.activateBlock(bed)
 assert.equal(await f.bot.sleep(f.block),'same_return');assert.equal(f.calls.length,1)
})
test('unhashed mode preserves identity; unknown mode and incomplete inverse send nothing',()=>{
 const f=fixture();f.client.emit('start_game',{block_network_ids_are_hashes:false})
 f.bot.activateBlock(f.block);assert.equal(f.calls[0].block,f.block)
 f.client.emit('start_game',{});assert.throws(()=>f.bot.activateBlock(f.block),/mode_unobserved/)
 f.client.emit('start_game',{block_network_ids_are_hashes:true});delete f.registry.blocksByRuntimeId[-12345]
 assert.throws(()=>f.bot.activateBlock(f.block),/inverse_unverified/);assert.equal(f.calls.length,1)
})
test('wrong state name, missing hash feature and malformed signed IDs fail closed',()=>{
 const f=fixture();f.registry.blockStates[7871].name='stone'
 assert.throws(()=>f.bot.activateBlock(f.block),/registry_unverified/)
 for(const n of [NaN,Infinity,-2147483649,4294967296,1.5])assert.equal(wireId(n),null)
 assert.equal(wireId(-2147483648),2147483648);assert.equal(wireId(4294967295),4294967295)
 assert.equal(f.calls.length,0)
})
test('non-target interactions and close retain existing API behavior',()=>{
 const f=fixture(),stone={name:'stone',stateId:1}
 f.bot.activateBlock(stone);assert.equal(f.calls[0].block,stone)
 f.client.emit('close');assert.equal(f.bot.activateBlock,f.original)
})
let nativeRequire=null
try{
 const path=require('node:path'),{createRequire}=require('node:module')
 nativeRequire=createRequire(path.join(path.dirname(require.resolve('mineflayer')),'lib','bedrock_plugins','interact.js'))
}catch{}
test('installed Bedrock registry and real chunk round-trip local IDs to exact runtime hashes',
 {skip:!nativeRequire},()=>{
 const r=nativeRequire('prismarine-registry')('bedrock_1.26.51')
 const Block=nativeRequire('prismarine-block')(r),Chunk=nativeRequire('prismarine-chunk')(r)
 const {Vec3}=nativeRequire('vec3'),pos=new Vec3(1,64,1)
 r.handleStartGame({itemstates:[],block_network_ids_are_hashes:true})
 const chunk=new Chunk({x:0,z:0})
 const torchId=r.blocksByName.torch.defaultState
 chunk.setBlockStateId(pos,torchId)
 const torch=chunk.getBlock(pos)
 assert.equal(torch.boundingBox,'empty');assert.deepEqual(torch.shapes,[])
 assert.equal(require('../src/scout_routes.cjs').knownAir(torch),true)
 for(const name of ['spruce_door','bed']){
  const stateId=r.blocksByName[name].minStateId
  chunk.setBlockStateId(pos,stateId)
  const block=chunk.getBlock(pos),state=r.blockStates[stateId]
  assert.equal(block.stateId,stateId);assert.equal(block.name,name)
  const expected=Block.getHash(state.name,state.states)
  const ref=networkBlock(r,block,Block)
  assert.equal(ref.stateId,expected>>>0);assert.notEqual(ref.stateId,stateId)
  assert.equal((r.blocksByRuntimeId[expected]??r.blocksByRuntimeId[expected>>>0]).stateId,stateId)
  assert.equal(chunk.getBlock(pos).stateId,stateId)
 }
})
