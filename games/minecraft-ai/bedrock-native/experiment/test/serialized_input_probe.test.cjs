'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {SerializedInputProbe,compare,decodeProbe,MAX_PROBES}=require('../src/serialized_input_probe.cjs')
const packet=()=>({tick:10001n,input_data:['up','vertical_collision'],move_vector:{x:0,z:1},raw_move_vector:{x:0,z:1},
  analogue_move_vector:{x:0,z:1},position:{x:0.5,y:70.62,z:0.66},delta:{x:0,y:0,z:0.12},yaw:180,pitch:0,
  authorization:'SENSITIVE_DO_NOT_REPORT'})
const client=(actual=packet())=>({sendQ:[Buffer.from('DO_NOT_LOG')],deserializer:{parsePacketBuffer:()=>({data:{name:'player_auth_input',params:actual}})}})
test('matching serialized packet is compared without recording payloads',()=>{
  const a=packet(),c=client({...a,tick:[0,10001],position:{...a.position,y:a.position.y+1e-6}})
  const p=new SerializedInputProbe();p.capture(c,a,0)
  assert.deepEqual(p.summary(),{wireProbeFrames:1,wireProbeMatched:1,wireProbeMismatches:0,wireProbeUnavailable:0,wireProbeFirstIssue:null})
  assert(!JSON.stringify(p.summary()).includes('SENSITIVE'))
  assert(!JSON.stringify(p.summary()).includes('70.62'))
})
test('detects encoded movement loss',()=>{
  const a=packet(),b={...a,move_vector:{x:0,z:0}}
  const p=new SerializedInputProbe();p.capture(client(b),a,0)
  assert.equal(p.summary().wireProbeFirstIssue,'move_mismatch')
})
test('detects flag, tick, delta and analog differences',()=>{
  const a=packet()
  assert.equal(compare(a,{...a,input_data:['down','vertical_collision']}),'flags_mismatch')
  assert.equal(compare(a,{...a,tick:0n}),'tick_mismatch')
  assert.equal(compare(a,{...a,delta:{x:0,y:0,z:0}}),'velocity_mismatch')
  assert.equal(compare(a,{...a,analogue_move_vector:{x:0,z:0}}),'analog_mismatch')
})
test('missing buffer or decoder fails open and never leaks thrown parser errors',()=>{
  const a=packet(),c=client();delete c.deserializer
  assert.equal(decodeProbe(c,a,0),'decoder_unavailable')
  assert.equal(decodeProbe(c,a,99),'queue_unavailable')
  c.deserializer={parsePacketBuffer(){throw Error('secrets')}}
  assert.equal(decodeProbe(c,a,0),'decode_error')
})
test('work is bounded to 32 moving frames and reset per login',()=>{
  const c=client(),p=new SerializedInputProbe()
  for(let i=0;i<100;i++)p.capture(c,packet(),0)
  assert.equal(p.summary().wireProbeFrames,MAX_PROBES)
  assert.equal(p.summary().wireProbeMatched,MAX_PROBES)
  assert(!JSON.stringify(p.summary()).includes('DO_NOT_LOG'))
  p.reset();assert.equal(p.summary().wireProbeFrames,0)
})
