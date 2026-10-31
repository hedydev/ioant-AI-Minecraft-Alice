'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {selectAdjacentBed,useBedForSpawn,HomeBedMemory}=require('../src/bed_spawnpoint.cjs')
function mock(){
 const pos=(x,y,z)=>({x,y,z,offset(a,b,c){return pos(x+a,y+b,z+c)}})
 const block={name:'red_bed',position:pos(1,64,0)}
 const client=new EventEmitter()
 const bot={entity:{position:pos(.5,64,.5)},game:{dimension:'overworld'},
  _client:client,parseBedMetadata:()=>({occupied:0}),blockAt:()=>block,
  activateBlock:async()=>client.emit('set_spawn_position',{
   spawn_type:'player',player_position:{x:1,y:64,z:1}})}
 const evidence={get:()=>({independentSource:'bds_querytarget',
  independentSamples:2,independentPreviousAt:8000,independentAt:9000,
  independentLatestFeet:bot.entity.position})}
 return {bot,block,client,evidence}
}
test('bed reach + personal server packet set respawn without nighttime requirement',async()=>{
 const x=mock();assert.equal(selectAdjacentBed(x.bot,[x.block.position]).reason,'loaded_free_bed_in_reach')
 const r=await useBedForSpawn(x.bot,x.block,{evidence:x.evidence,clock:()=>10000})
 assert.equal(r.serverConfirmed,true)
 assert.equal(x.client.listenerCount('set_spawn_position'),0)
})
test('world spawn, stale witness, unreachable bed never mark spawn',async()=>{
 const a=mock();a.bot.activateBlock=async()=>a.client.emit('set_spawn_position',{
  spawn_type:'world',player_position:{x:1,y:64,z:1}})
 let now=Date.now()
 const r=await useBedForSpawn(a.bot,a.block,{evidence:a.evidence,
  clock:()=>now+=100,sleep:async()=>{},timeoutMs:180})
 assert.equal(r.serverConfirmed,false)
 const b=mock();b.evidence.get=()=>({independentSamples:1})
 assert.equal((await useBedForSpawn(b.bot,b.block,{evidence:b.evidence})).reason,
  'scout_bds_position_unavailable')
 const c=mock();c.bot.entity.position={x:30,y:64,z:30}
 assert.equal(selectAdjacentBed(c.bot,[c.block.position]).bed,null)
})
test('home landmark persisted ONLY on spawn packet proof, not a verified shelter',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alice-home-'))
 try{
  const file=path.join(dir,'bed.json'),m=new HomeBedMemory({file,clock:()=>10000})
  assert.equal(m.summary().status,'not_verified')
  assert.equal(m.confirm({serverConfirmed:false}),false)
  assert.equal(fs.existsSync(file),false)
  assert.equal(m.confirm({serverConfirmed:true,bed:{x:1,y:64,z:0},spawn:{x:1,y:64,z:1}}),true)
  assert.equal(fs.statSync(file).mode&0o777,0o600)
  assert.equal(m.summary().status,'server_confirmed_current_session')
  assert.equal(m.summary().shelter,'room_and_return_route_not_verified')
  assert.equal(new HomeBedMemory({file}).summary().status,'previous_server_confirmation')
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
