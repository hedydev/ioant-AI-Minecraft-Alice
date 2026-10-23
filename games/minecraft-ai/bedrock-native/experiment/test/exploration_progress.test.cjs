'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {ExplorationProgress,ATTEMPT_HOLD_MS}=require('../src/exploration_progress.cjs')
const withDir=fn=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'alice-progress-'));try{fn(d)}finally{fs.rmSync(d,{recursive:true,force:true})}}
test('unverified movement is excluded temporarily, never marked as visited or server success',()=>withDir(root=>{
 let now=100000
 const file=path.join(root,'progress.json'),j=new ExplorationProgress({clock:()=>now,file})
 const a={key:'-1261,98,656'},b={key:'-1265,98,652'}
 j.attempt(a);j.finish(a,{ok:false,reason:'scout_server_endpoint_unconfirmed'})
 j.attempt(b);j.finish(b,{ok:false,reason:'scout_server_endpoint_unconfirmed'})
 assert.equal(j.summary().unverified,2)
 assert.equal(j.summary().confirmed,0)
 assert(j.excluded().has(a.key)&&j.excluded().has(b.key))
 assert.equal(fs.statSync(file).mode&0o777,0o600)
 const restored=new ExplorationProgress({clock:()=>now,file})
 assert.equal(restored.summary().unverified,2)
 now+=ATTEMPT_HOLD_MS+1
 assert.equal(restored.excluded().size,0)
}))
test('verified BDS endpoint is distinct from local-only and persists longer',()=>withDir(root=>{
 let now=1000
 const j=new ExplorationProgress({clock:()=>now,file:path.join(root,'progress.json')})
 const cand={key:'0,65,5'}
 j.attempt(cand)
 assert.equal(j.finish(cand,{ok:true,confirmedEndpoint:cand.key,
   serverMovedBlocks:4.4,serverMovementVerified:true}).outcome,'confirmed')
 assert.equal(j.summary().confirmed,1)
 now+=ATTEMPT_HOLD_MS+1
 assert(j.excluded().has(cand.key))
}))
test('never accept forged success without server position evidence',()=>{
 const j=new ExplorationProgress({clock:()=>123000})
 j.attempt({key:'1,65,1'})
 assert.equal(j.finish({key:'1,65,1'},{ok:true,confirmedEndpoint:'1,65,1'}).outcome,
   'unverified')
 assert.equal(j.finish({key:'1,65,1'},{ok:true,serverMovedBlocks:3,
   confirmedEndpoint:'99,65,99',serverMovementVerified:true}).outcome,'unverified')
 assert.equal(j.finish({key:'1,65,1'},{ok:true,serverMovedBlocks:3,
   confirmedEndpoint:'1,65,1'}).outcome,'unverified',
   'a server-like number without an explicit server verdict is not proof')
 assert.equal(j.finish({key:'1,65,1'},{ok:true,serverMovementVerified:true,
   localEstimateBlocks:3,confirmedEndpoint:'1,65,1'}).outcome,'unverified',
   'local physics cannot substitute for observed server movement')
 assert.equal(j.summary().confirmed,0)
})
test('bounded storage rejects symlinked history without altering its target',()=>withDir(root=>{
 const target=path.join(root,'other.txt')
 fs.writeFileSync(target,'protected')
 const file=path.join(root,'progress.json')
 fs.symlinkSync(target,file)
 const j=new ExplorationProgress({clock:()=>5000,file})
 j.attempt({key:'0,65,1'})
 assert.equal(fs.readFileSync(target,'utf8'),'protected')
 assert.equal(j.persistenceError,'write_unavailable')
}))
