'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {writeWitnessAck}=require('../src/witness_ack.cjs')
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-bds-ack-'))
 fs.chmodSync(root,0o700)
 let now=10000
 const e={loginAt:8000,lifeEpochAt:null,awaitingVerifiedRespawn:false,
   independentSource:'bds_querytarget',independentSamples:1,
   independentAt:9500,independentPreviousAt:null,
   independentLatestFeet:{x:1,y:65,z:2}}
 const bot={entity:{position:{x:1,y:65,z:2}}}
 const args={root,bot,evidence:{get:()=>e},clock:()=>now,
   producerStartToken:'owner_123'}
 const read=()=>JSON.parse(fs.readFileSync(path.join(root,'bds-witness-ack.json'),'utf8'))
 return {root,e,args,read,setNow:v=>now=v,
    close:()=>fs.rmSync(root,{recursive:true,force:true})}
}
test('private atomic one-sample ack never confuses sample with navigation authority',()=>{
 const f=fixture()
 try{
  assert.equal(writeWitnessAck(f.args),true)
  const a=f.read()
  assert.equal(a.independentSamples,1)
  assert.equal(a.positionGateSatisfied,false)
  const stat=fs.statSync(path.join(f.root,'bds-witness-ack.json'))
  assert.equal(stat.mode&0o077,0)
  assert.equal(JSON.stringify(a).includes('feet'),false)
 }finally{f.close()}
})
test('two current independent aligned samples publish an instant gate receipt',()=>{
 const f=fixture()
 try{
  f.e.independentSamples=2;f.e.independentPreviousAt=9200
  assert.equal(writeWitnessAck(f.args),true)
  assert.equal(f.read().positionGateSatisfied,true)
  f.e.independentLatestFeet.x=5
  assert.equal(writeWitnessAck(f.args),true)
  assert.equal(f.read().positionGateSatisfied,false)
 }finally{f.close()}
})
test('stale, previous-life and wrong source cannot overwrite last good ack',()=>{
 const f=fixture()
 try{
  assert.equal(writeWitnessAck(f.args),true)
  const before=fs.readFileSync(path.join(f.root,'bds-witness-ack.json'),'utf8')
  f.setNow(15000)
  assert.equal(writeWitnessAck(f.args),false)
  f.setNow(10000);f.e.lifeEpochAt=9600
  assert.equal(writeWitnessAck(f.args),false)
  f.e.lifeEpochAt=null;f.e.independentSource='client_physics'
  assert.equal(writeWitnessAck(f.args),false)
  assert.equal(fs.readFileSync(path.join(f.root,'bds-witness-ack.json'),'utf8'),before)
 }finally{f.close()}
})
test('unsafe destination and public control directory are refused',()=>{
 const f=fixture()
 try{
  const target=path.join(f.root,'bds-witness-ack.json')
  fs.symlinkSync(path.join(f.root,'absent'),target)
  assert.equal(writeWitnessAck(f.args),false)
  fs.unlinkSync(target);fs.chmodSync(f.root,0o755)
  assert.equal(writeWitnessAck(f.args),false)
 }finally{f.close()}
})
test('main publishes ACK only on accepted independent BDS sample path',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
 assert.match(main,/writeWitnessAck\(\{bot,evidence:movementEvidence,/)
 assert.match(main,/if\(bdsWitness\.poll\(movementEvidence\)\)\{\s*onFreshIndependentBdsWitness\(\)/)
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src/witness_ack.cjs'),'utf8'),
   /querytarget\s+@|child_process|fetch\(|http\.request/)
})
