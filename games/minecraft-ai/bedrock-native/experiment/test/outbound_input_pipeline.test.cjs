'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {attachOutboundInputPipeline}=require('../src/outbound_input_pipeline.cjs')
function setup(){
 const c=new EventEmitter();c.sendQ=[]
 c.queue=function(name,params){this.sendQ.push(Object.assign(Buffer.from([0]),{packet:{name,params}}));return 'sent'}
 c.deserializer={parsePacketBuffer:buffer=>({data:buffer.packet})}
 return c
}
const packet=()=>({tick:1n,input_data:['up'],move_vector:{x:0,z:1},raw_move_vector:{x:0,z:1},
 analogue_move_vector:{x:0,z:0},input_mode:'mouse',play_mode:'screen',interaction_model:'touch',
 position:{x:.5,y:70.62,z:.6},delta:{x:0,y:0,z:.1},pitch:0,yaw:0})
test('post-compat audit has no false analog mismatch and leaves caller unchanged',()=>{
 const c=setup(),original=c.queue,p=packet()
 const pipeline=attachOutboundInputPipeline(c,{audit:true,analog:true})
 assert.equal(c.queue('player_auth_input',p),'sent')
 assert.deepEqual(p.analogue_move_vector,{x:0,z:0})
 assert.equal(pipeline.analogCompat.summary().corrected,1)
 const s=pipeline.outboundInputAudit.get()
 assert.equal(s.wireProbeMatched,1);assert.equal(s.wireProbeMismatches,0)
 c.emit('close');assert.equal(c.queue,original)
})
test('real serialization differences remain visible with compatibility enabled',()=>{
 const c=setup();c.queue=function(name,p){this.sendQ.push(Object.assign(Buffer.from([0]),{packet:{name,params:{...p,move_vector:{x:0,z:0}}}}))}
 const {outboundInputAudit}=attachOutboundInputPipeline(c,{audit:true,analog:true})
 c.queue('player_auth_input',packet())
 assert.equal(outboundInputAudit.get().wireProbeFirstIssue,'move_mismatch')
 c.emit('close')
})
test('disabled compatibility preserves input and disabled audit installs no probe',()=>{
 for(const audit of [true,false]){
  const c=setup(),p=packet(),original=c.queue
  const pipe=attachOutboundInputPipeline(c,{audit,analog:false})
  c.queue('player_auth_input',p);assert.equal(c.sendQ[0].packet.params,p)
  if(audit)assert.equal(pipe.outboundInputAudit.get().wireProbeMatched,1)
  else assert.equal(pipe.outboundInputAudit,null)
  pipe.detach();assert.equal(c.queue,original)
 }
})
