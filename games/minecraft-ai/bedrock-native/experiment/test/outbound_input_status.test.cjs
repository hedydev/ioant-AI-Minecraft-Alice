'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {OutboundInputStatus,compact,FILENAME}=require('../src/outbound_input_status.cjs')
function withDir(f){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-input-audit-status-'))
 try{f(root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('private input audit file keeps only whitelisted counters and 0600 permissions',()=>withDir(root=>{
 const warnings=[],log={warn:(...args)=>warnings.push(args)}
 const writer=new OutboundInputStatus({root,clock:()=>1700000000000,log})
 writer.publish({kind:'queue_only_not_network_or_BDS_proof',queued:198,movingQueued:7,
   serialized:198,serializationErrors:0,transportHookAttached:true,
   transportHookState:'attached',transportCalls:33,pendingPacketBuffers:0,
   secret:'NEVER_COPY',player:{x:10,y:20,z:30}})
 const file=path.join(root,FILENAME)
 const stored=JSON.parse(fs.readFileSync(file,'utf8'))
 assert.equal(stored.queued,198)
 assert.equal(stored.transportCalls,33)
 assert.equal(stored.transportHookState,'attached')
 assert.equal(stored.updatedAt,1700000000000)
 assert.equal(stored.secret,undefined)
 assert.equal(stored.player,undefined)
 assert.equal(fs.statSync(file).mode&0o777,0o600)
 assert.equal(warnings.length,0)
}))
test('private audit writer never overwrites a symlink',()=>withDir(root=>{
 const other=path.join(root,'external-data')
 fs.writeFileSync(other,'not a diagnostic')
 fs.symlinkSync(other,path.join(root,FILENAME))
 const warnings=[]
 new OutboundInputStatus({root,log:{warn:(...v)=>warnings.push(v)}}).publish({
   kind:'queue_only_not_network_or_BDS_proof',queued:1})
 assert.equal(fs.readFileSync(other,'utf8'),'not a diagnostic')
 assert.equal(warnings.length,1)
}))
test('invalid audit source is refused without creating a file',()=>withDir(root=>{
 const warnings=[]
 new OutboundInputStatus({root,log:{warn:(...v)=>warnings.push(v)}}).publish({
   kind:'other-data',queued:5})
 assert.equal(fs.existsSync(path.join(root,FILENAME)),false)
 assert.equal(warnings.length,1)
}))
test('oversized or unexpected fields are not persisted in status',()=>{
 const summary=compact({kind:'queue_only_not_network_or_BDS_proof',queued:99,
   comment:'AUTH'.repeat(2000),transportHookState:'a'.repeat(200),
   movingQueued:2,serialized:2},()=>5)
 assert.equal(summary.queued,99)
 assert.equal(summary.transportHookState,undefined)
 assert.equal(summary.comment,undefined)
 assert.equal(summary.updatedAt,5)
 assert.equal(summary.serialized,2)
})
