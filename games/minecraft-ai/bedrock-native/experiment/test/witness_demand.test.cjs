'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {witnessDemand}=require('../src/witness_demand.cjs')
const now=10000
function setup(){
  const s={loginAt:8000,lifeEpochAt:null,awaitingVerifiedRespawn:false,
    independentSamples:0,independentAt:null,independentPreviousAt:null,
    independentSource:null,independentLatestFeet:null}
  return {s,evidence:{get:()=>s},bot:{entity:{position:{x:1,y:65,z:2}}},
    connected:true,sessionEstablished:true,clock:()=>now}
}
test('new login needs two genuinely fresh independent positions',()=>{
  const f=setup(),res=witnessDemand(f)
  assert.equal(res.state,'needs_two_fresh_samples')
  assert.equal(res.samplesNeeded,2)
  assert.equal(res.querySent,false)
  assert.equal(res.permissionGranted,false)
  assert.equal(res.navigationAuthorized,false)
})
test('a single current-login sample requests only a second one (advisory)',()=>{
  const f=setup();Object.assign(f.s,{independentSamples:1,
    independentAt:9500,independentSource:'bds_querytarget',
    independentLatestFeet:{x:1,y:65,z:2}})
  const res=witnessDemand(f)
  assert.equal(res.state,'needs_second_fresh_sample')
  assert.equal(res.samplesNeeded,1)
  assert.equal(res.navigationAuthorized,false)
})
test('two current fresh samples aligned pass original scoutStartProof gate',()=>{
  const f=setup();Object.assign(f.s,{independentSamples:2,
    independentPreviousAt:9300,independentAt:9500,
    independentSource:'bds_querytarget',independentLatestFeet:{x:1,y:65,z:2}})
  const res=witnessDemand(f)
  assert.equal(res.state,'fresh_pair_aligned')
  assert.equal(res.samplesNeeded,0)
  assert.equal(res.navigationAuthorized,true)
})
test('stale previous sample cannot turn one fresh observation into two',()=>{
  const f=setup();Object.assign(f.s,{independentSamples:90,
    independentPreviousAt:5900,independentAt:9800,
    independentSource:'bds_querytarget',independentLatestFeet:{x:1,y:65,z:2}})
  assert.equal(witnessDemand(f).state,'needs_second_fresh_sample')
  f.s.independentAt=5900
  assert.equal(witnessDemand(f).state,'needs_two_fresh_samples')
})
test('respawn and reconnect reject old-life samples and no login',()=>{
  const f=setup();f.s.awaitingVerifiedRespawn=true
  assert.equal(witnessDemand(f).state,'respawn_not_verified')
  f.s.awaitingVerifiedRespawn=false;f.s.lifeEpochAt=9900
  f.s.independentAt=9800
  f.s.independentSource='bds_querytarget'
  f.s.independentLatestFeet={x:1,y:65,z:2}
  assert.equal(witnessDemand(f).state,'needs_two_fresh_samples')
  f.s.loginAt=null
  assert.equal(witnessDemand(f).state,'login_not_verified')
  f.connected=false
  assert.equal(witnessDemand(f).state,'session_not_connected')
})
test('diverged current pair never triggers query or movement permission',()=>{
  const f=setup();Object.assign(f.s,{independentSamples:2,
    independentPreviousAt:9000,independentAt:9500,
    independentSource:'bds_querytarget',independentLatestFeet:{x:5,y:65,z:2}})
  const res=witnessDemand(f)
  assert.equal(res.state,'client_server_diverged')
  assert.equal(res.samplesNeeded,0)
  assert.equal(res.querySent,false)
  assert.equal(res.navigationAuthorized,false)
})
test('diagnostic integration is passive; main invokes no console command',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
  assert.match(main,/witnessDemand\(\{connected:!!connected,sessionEstablished:networkSessionEstablished,/)
  assert.match(main,/witnessDemand:.*witnessDemand\(/s)
  const source=fs.readFileSync(path.join(__dirname,'../src/witness_demand.cjs'),'utf8')
  assert.doesNotMatch(source,/child_process|\.spawn\(|\.exec\(|fetch\(|http\.request|querytarget\s+@/)
})
