'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {BdsWitnessReader}=require('../src/bds_witness.cjs')
const {attachMovementEvidence}=require('../src/movement_evidence.cjs')
const {serverPositionProof}=require('../src/terrain_adaptation.cjs')
const UNIQUE='615bca9b-ea00-316a-8bc3-650a0c8991c4'
function make(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-witness-'))
 fs.chmodSync(root,0o700)
 let now=10000
 const file=path.join(root,'bds-position-witness.json')
 const client=new EventEmitter(),e=attachMovementEvidence(client,{clock:()=>now,eyeHeight:()=>1.62})
 client.emit('start_game',{runtime_entity_id:11n,player_position:{x:1,y:66.62,z:2}})
 const reader=new BdsWitnessReader({file,name:()=> 'AliceXbox',clock:()=>now})
 const write=(x,serial,uniqueId=UNIQUE)=>fs.writeFileSync(file,JSON.stringify({
   version:1,source:'mcsm_querytarget',gamertag:'AliceXbox',serial,uniqueId,
   observedAt:now-200,feet:{x,y:65,z:2}
 }),{mode:0o600})
 return {root,file,e,reader,write,step:(ms=1000)=>{now+=ms},close:()=>{e.detach();fs.rmSync(root,{recursive:true,force:true})}}
}
test('two distinct independent BDS samples confirm movement, packets stay zero',()=>{
 const f=make()
 try{
  f.step();f.write(1,'1792572000000000001')
  assert.equal(f.reader.poll(f.e),true)
  const checkpoint=f.e.checkpoint()
  f.step();f.write(2,'1792572000000000002')
  assert.equal(f.reader.poll(f.e),true)
  assert.equal(f.e.get().received,0)
  assert.equal(f.e.get().independentSamples,2)
  assert.equal(f.e.progress(checkpoint).confirmed,true)
  assert.equal(f.e.progress(checkpoint).movedBlocks,1)
  assert.equal(serverPositionProof({entity:{position:{x:2,y:65,z:2}}},f.e,()=>12000).ok,true)
 }finally{f.close()}
})
test('non-console BDS Script API observations are accepted only as independent evidence',()=>{
 const f=make()
 try{
  f.step()
  f.write(1,'1792572000000000001')
  let saved=JSON.parse(fs.readFileSync(f.file,'utf8'))
  saved.source='bds_script_api'
  fs.writeFileSync(f.file,JSON.stringify(saved),{mode:0o600})
  assert.equal(f.reader.poll(f.e),true)
  assert.equal(f.e.get().lastSource,'bds_script_api')
  const before=f.e.checkpoint()
  f.step();saved.serial='1792572000000000002';saved.observedAt=11000
  saved.feet={x:2,y:65,z:2}
  fs.writeFileSync(f.file,JSON.stringify(saved))
  assert.equal(f.reader.poll(f.e),true)
  assert.equal(f.e.get().independentSamples,2)
  assert.equal(f.e.progress(before).confirmed,true)
  assert.equal(f.e.get().source,'independent_bds_script_api')
 }finally{f.close()}
})
test('wrong identity, repeat serial, stale, symlink and group-readable proof all fail closed',()=>{
 const f=make()
 try{
  f.step();f.write(1,'1792572000000000001')
  assert.equal(f.reader.poll(f.e),true)
  assert.equal(f.reader.poll(f.e),false)
  f.step();f.write(2,'1792572000000000002','different-identity')
  assert.equal(f.reader.poll(f.e),false)
  assert.equal(f.e.get().independentSamples,1)
  fs.chmodSync(f.file,0o644)
  assert.equal(f.reader.poll(f.e),false)
  fs.unlinkSync(f.file)
  fs.symlinkSync(path.join(f.root,'absent'),f.file)
  assert.equal(f.reader.poll(f.e),false)
 }finally{f.close()}
})

test('two 250ms-reader observations stay individually ingested inside 4-second window',()=>{
 const f=make()
 try{
  f.step(300);f.write(1,'1792572000000000003')
  assert.equal(f.reader.poll(f.e),true)
  assert.equal(f.e.get().independentSamples,1)
  f.step(1100);f.write(1,'1792572000000000004')
  assert.equal(f.reader.poll(f.e),true)
  const got=f.e.get()
  assert.equal(got.independentSamples,2)
  assert.equal(got.independentAt-got.independentPreviousAt,1100)
  assert.equal(got.independentPairTravelBlocks,0)
 }finally{f.close()}
})
test('live main has separate passive fast witness reader and clears it on every shutdown',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
  assert.match(main,/const witnessTimer=live&&bdsWitness\?setInterval\(\(\)=>\{/)
  assert.match(main,/if\(!bdsWitness\.poll\(movementEvidence\)\)return/)
  assert.match(main,/reconcileRespawnMirror/)
 assert.match(main,/const statusTimer=live\?setInterval\(\(\)=>\{\s*runtime\.refreshBehavior\(\);publishStatus\(\);reportIdleGate\(\)\s*\},2000\)/)
 assert.equal((main.match(/clearInterval\(witnessTimer\)/g)||[]).length,3)
 assert.doesNotMatch(main,/bds_position_witness\.py.*--loop/)
})
