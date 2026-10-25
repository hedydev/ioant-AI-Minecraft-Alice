'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {liveOwner,liveSnapshots,evaluateMovement}=require('../scripts/inspect_movement_sync.cjs')
function fixture(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'alice-readonly-proof-'))
 const home=path.join(tmp,'home'),root=path.join(home,'.alice-bedrock-control')
 const locked=path.join(root,'active-alice-client.lock')
 const procRoot=path.join(tmp,'proc')
 const pid=12345,now=Date.now(),token='123456789'
 fs.mkdirSync(locked,{recursive:true,mode:0o700})
 fs.chmodSync(root,0o700);fs.chmodSync(locked,0o700)
 const project=path.join(home,'minecraft-ai','bedrock-native','experiment')
 const node=path.join(home,'.local','share','alice-bedrock','node24','current','bin','node')
 fs.mkdirSync(project,{recursive:true})
 fs.mkdirSync(path.dirname(node),{recursive:true})
 fs.writeFileSync(node,'fixture')
 const proc=path.join(procRoot,String(pid));fs.mkdirSync(proc,{recursive:true})
 fs.symlinkSync(node,path.join(proc,'exe'))
 fs.symlinkSync(project,path.join(proc,'cwd'))
 fs.writeFileSync(path.join(proc,'cmdline'),'node\0src/main.cjs\0--production-start\0')
 // Linux /proc/PID/stat tail has field 3 (state) at index 0; field 22 at 19.
 const stat=Array.from({length:25},()=> '0');stat[18]=token
 fs.writeFileSync(path.join(proc,'stat'),pid+' (node) S '+stat.join(' '))
 const owner={pid,nonce:'a'.repeat(32)}
 const core={producerPid:pid,producerStartToken:token,
  connected:true,sessionEstablished:true,world:'Bedrock level',serverPort:17879,
  movementEvidence:{latestFeet:{x:1,y:64,z:1},loginFeet:{x:0,y:64,z:0},
   lastAt:now-1500,lastSource:'bds_querytarget',independentSamples:2,travelBlocks:1}}
 const wire={version:1,updatedAt:now-500,kind:'queue_only_not_network_or_BDS_proof',
  movingQueued:2,serialized:2}
 function write(name,object){
  const file=path.join(name==='owner.json'?locked:root,name)
  fs.writeFileSync(file,JSON.stringify(object),{mode:0o600})
  fs.chmodSync(file,0o600)
  // The injected read clock is frozen at fixture setup. A real write occurs
  // afterwards, so pin synthetic telemetry mtimes to a valid earlier instant.
  // Apply the same rule to rewritten files in negative tests: they must test
  // the intended guard (PID, embedded timestamp), not an accidental future mtime.
  if(name==='status.json'||name==='outbound-input-audit.json'){
   const at=new Date(now-1000)
   fs.utimesSync(file,at,at)
  }
 }
 write('owner.json',owner);write('status.json',core);write('outbound-input-audit.json',wire)
 return {home,root,procRoot,now,owner,core,wire,proc,write,
  close:()=>fs.rmSync(tmp,{recursive:true,force:true})}
}
test('live state is anchored to exactly one owner PID and process birth token',()=>{
 const f=fixture();try{
  assert.deepEqual(liveOwner({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   {pid:f.owner.pid,token:f.core.producerStartToken,now:f.now})
  const result=liveSnapshots({controlRoot:f.root,procRoot:f.procRoot,now:f.now})
  assert.equal(result.core.serverPort,17879)
  assert.equal(result.wire.movingQueued,2)
 }finally{f.close()}
})
test('previous Alice heartbeat with reused PID is never trusted',()=>{
 const f=fixture();try{
  f.write('status.json',{...f.core,producerStartToken:'old_birth_token'})
  assert.throws(()=>liveSnapshots({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_process_identity_mismatch/)
 }finally{f.close()}
})
test('stale outbound audit cannot report movement from an earlier login',()=>{
 const f=fixture();try{
  f.write('outbound-input-audit.json',{...f.wire,updatedAt:f.now-60000})
  assert.throws(()=>liveSnapshots({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_report_stale/)
 }finally{f.close()}
})
test('future-dated heartbeat mtime is rejected even with valid PID provenance',()=>{
 const f=fixture();try{
  const file=path.join(f.root,'status.json')
  const future=new Date(f.now+30000)
  fs.utimesSync(file,future,future)
  assert.throws(()=>liveSnapshots({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_report_stale/)
 }finally{f.close()}
})
test('future-dated outbound audit mtime is rejected',()=>{
 const f=fixture();try{
  const file=path.join(f.root,'outbound-input-audit.json')
  const future=new Date(f.now+30000)
  fs.utimesSync(file,future,future)
  assert.throws(()=>liveSnapshots({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_report_stale/)
 }finally{f.close()}
})
test('stale status file mtime is rejected even if payload is current',()=>{
 const f=fixture();try{
  const file=path.join(f.root,'status.json')
  const past=new Date(f.now-30000)
  fs.utimesSync(file,past,past)
  assert.throws(()=>liveSnapshots({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_report_stale/)
 }finally{f.close()}
})
test('stale outbound audit file mtime is rejected even if payload is current',()=>{
 const f=fixture();try{
  const file=path.join(f.root,'outbound-input-audit.json')
  const past=new Date(f.now-30000)
  fs.utimesSync(file,past,past)
  assert.throws(()=>liveSnapshots({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_report_stale/)
 }finally{f.close()}
})
test('unexpected process command never looks like Alice',()=>{
 const f=fixture();try{
  fs.writeFileSync(path.join(f.proc,'cmdline'),'node\0src/other.cjs\0--production-start\0')
  assert.throws(()=>liveOwner({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_process_identity_unavailable/)
 }finally{f.close()}
})
test('unexpected node binary and cwd are refused',()=>{
 const f=fixture();try{
  const exe=path.join(f.proc,'exe'),cwd=path.join(f.proc,'cwd')
  fs.unlinkSync(exe);fs.symlinkSync('/bin/sh',exe)
  assert.throws(()=>liveOwner({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_process_identity_unavailable/)
  fs.unlinkSync(exe)
  fs.symlinkSync(path.join(f.home,'.local','share','alice-bedrock','node24','current','bin','node'),exe)
  fs.unlinkSync(cwd);fs.symlinkSync(f.root,cwd)
  assert.throws(()=>liveOwner({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /movement_process_identity_unavailable/)
 }finally{f.close()}
})
test('tampered or world-readable status is rejected, no world paths opened',()=>{
 const f=fixture();try{
  fs.chmodSync(path.join(f.root,'status.json'),0o644)
  assert.throws(()=>liveSnapshots({controlRoot:f.root,procRoot:f.procRoot,now:f.now}),
   /unsafe_movement_report_source/)
 }finally{f.close()}
})

test('no independent witness means no BDS movement even with large packet travel',()=>{
 const f=fixture();try{
  const m={...f.core.movementEvidence,travelBlocks:27886.34,
   independentSamples:0,independentLatestFeet:null,lastAt:f.now-100}
  const report=evaluateMovement({core:{...f.core,movementEvidence:m},
   wire:{...f.wire,movingQueued:0,lastMovingAgeMs:null},now:f.now})
  assert.equal(report.verdict,'BDS_POSITION_NOT_FRESH')
  assert.equal(report.bdsVerifiedTravel,null)
  assert.equal(report.mixedObservedTravelUnverified,27886.34)
  assert.equal(report.bdsFeet,null)
  assert.deepEqual(report.latestObservedFeet,{x:1,y:64,z:1})
 }finally{f.close()}
})
test('two fresh independent witnesses and time-aligned input establish BDS position change',()=>{
 const f=fixture();try{
  const m={...f.core.movementEvidence,
   independentSource:'bds_querytarget',independentSamples:2,
   independentLatestFeet:{x:0.6,y:64,z:0},independentPreviousAt:f.now-3000,
   independentAt:f.now-500,independentPairTravelBlocks:0.6,
   independentTravelBlocks:0.6,travelBlocks:100}
  const report=evaluateMovement({core:{...f.core,movementEvidence:m},
   wire:{...f.wire,updatedAt:f.now-200,lastMovingAgeMs:1100},now:f.now})
  assert.equal(report.verdict,'BDS_MOVEMENT_CONFIRMED')
  assert.equal(report.bdsVerifiedTravel,0.6)
  assert.equal(report.bdsLastPairTravel,0.6)
  assert.equal(report.mixedObservedTravelUnverified,100)
  assert.equal(report.inputNearBdsPair,true)
 }finally{f.close()}
})
test('packet-only travel, stale second witness, and stale moving burst cannot confirm',()=>{
 const f=fixture();try{
  const good={...f.core.movementEvidence,
   independentSource:'bds_querytarget',independentSamples:2,
   independentLatestFeet:{x:1,y:64,z:0},independentPreviousAt:f.now-3000,
   independentAt:f.now-500,independentPairTravelBlocks:0,
   independentTravelBlocks:0,travelBlocks:400}
  const report=(m,w)=>evaluateMovement({core:{...f.core,movementEvidence:m},
   wire:{...f.wire,...w},now:f.now})
  assert.equal(report(good,{lastMovingAgeMs:1200}).verdict,'MOVEMENT_NOT_CONFIRMED')
  assert.equal(report({...good,independentPairTravelBlocks:1,independentPreviousAt:f.now-6000},
   {lastMovingAgeMs:1200}).verdict,'BDS_POSITION_NOT_FRESH')
  assert.equal(report({...good,independentPairTravelBlocks:1,independentTravelBlocks:1},
   {movingQueued:0,lastMovingAgeMs:null}).verdict,'NO_MOVEMENT_INPUT_ATTEMPTED')
  assert.equal(report({...good,independentPairTravelBlocks:1,independentTravelBlocks:1},
   {updatedAt:f.now-500,lastMovingAgeMs:60000}).verdict,'MOVEMENT_NOT_CONFIRMED')
  assert.equal(report({...good,independentPairTravelBlocks:1,independentTravelBlocks:1},
   {updatedAt:f.now-500,lastMovingAgeMs:null}).verdict,'MOVEMENT_NOT_CONFIRMED')
  assert.equal(report({...good,independentPairTravelBlocks:1,independentTravelBlocks:1},
   {lastMovingAgeMs:1200}).verdict,'BDS_MOVEMENT_CONFIRMED')
  assert.equal(evaluateMovement({core:{...f.core,serverPort:17880,movementEvidence:good},
   wire:{...f.wire,lastMovingAgeMs:1200},now:f.now}).verdict,'BDS_POSITION_NOT_FRESH')
 }finally{f.close()}
})
