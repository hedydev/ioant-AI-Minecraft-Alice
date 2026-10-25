'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {liveOwner,liveSnapshots}=require('../scripts/inspect_movement_sync.cjs')
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
