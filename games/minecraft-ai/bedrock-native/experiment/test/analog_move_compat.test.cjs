'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {correct,attachAnalogMoveCompat}=require('../src/analog_move_compat.cjs')
const pkt=()=>({
  pitch:0,yaw:1,position:{x:0.5,y:70.62,z:0.5},tick:123n,
  input_data:['block_breaking_delay_enabled','up','vertical_collision'],
  input_mode:'mouse',play_mode:'screen',interaction_model:'touch',
  move_vector:{x:0,z:1},raw_move_vector:{x:0,z:1},
  analogue_move_vector:{x:0,z:0},delta:{x:0,y:0,z:.1}
})
test('fixes only contradictory analog vector without mutating original packet',()=>{
 const source=pkt(),before={...source},result=correct(source)
 assert.notEqual(result,source)
 assert.deepEqual(result.analogue_move_vector,{x:0,z:1})
 for(const key of Object.keys(before)){
   if(key!=='analogue_move_vector')assert.equal(result[key],source[key])
 }
 assert.deepEqual(source.analogue_move_vector,{x:0,z:0})
})
test('does not modify idle, already matching, inconsistent, out of bounds or non-2193 input',()=>{
 const entries=[
   {...pkt(),move_vector:{x:0,z:0},raw_move_vector:{x:0,z:0}},
   {...pkt(),analogue_move_vector:{x:0,z:1}},
   {...pkt(),raw_move_vector:{x:1,z:0}},
   {...pkt(),move_vector:{x:9,z:0}},
   {...pkt(),input_mode:'touch'},
   {...pkt(),play_mode:'normal'},
   {...pkt(),interaction_model:'crosshair'},
   {...pkt(),predicted_vehicle:42n},
   {...pkt(),input_data:['client_predicted_vehicle']},
   {...pkt(),analogue_move_vector:null},
   {...pkt(),move_vector:{x:NaN,z:1}}
 ]
 for(const entry of entries)assert.equal(correct(entry),null)
})
test('default off preserves packet identity and original queue',()=>{
 const calls=[],client={queue:function(...x){calls.push({receiver:this,args:x});return 'ok'}}
 const original=client.queue,a=attachAnalogMoveCompat(client)
 assert.equal(a.enabled,false)
 assert.equal(client.queue,original)
 assert.equal(client.queue('player_auth_input',pkt()),'ok')
 assert.equal(calls[0].args[1].analogue_move_vector.z,0)
})
test('opt-in preserves every queue return, receiver, unmodified non-movement packet and errors',()=>{
 const calls=[],failure=new Error('serialize_failed')
 const client={queue:function(name,packet){calls.push({receiver:this,name,packet});if(name==='explode')throw failure;return 55}}
 const original=client.queue
 const a=attachAnalogMoveCompat(client,{enabled:true})
 const moving=pkt(),notInput={foo:'bar'}
 assert.equal(client.queue('player_auth_input',moving),55)
 assert.equal(client.queue('text',notInput),55)
 assert.throws(()=>client.queue('explode',{test:true}),e=>e===failure)
 assert.equal(calls[0].receiver,client)
 assert.equal(calls[0].packet.analogue_move_vector.z,1)
 assert.equal(calls[1].packet,notInput)
 assert.equal(a.summary().corrected,1)
 assert.equal(a.summary().skipped,0)
 assert.equal(moving.analogue_move_vector.z,0)
 a.detach();assert.equal(client.queue,original)
})
test('failed auth serialization does not count as successful compatibility send',()=>{
 const failure=new Error('invalid')
 const client={queue(){throw failure}}
 const a=attachAnalogMoveCompat(client,{enabled:true})
 assert.throws(()=>client.queue('player_auth_input',pkt()),e=>e===failure)
 assert.equal(a.summary().corrected,0)
 a.detach()
})
