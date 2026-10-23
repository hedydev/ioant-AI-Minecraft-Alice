'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {attachOutboundInputAudit,toTick,isMoving}=require('../src/outbound_input_audit.cjs')

test('queue tap forwards the identical object, this and return value and never logs packet details',()=>{
 const client=new EventEmitter()
 const originalPayload={tick:1001n,move_vector:{x:0,z:1},
   input_data:['up'],position:{x:123,y:65,z:-34},
   AuthenticationToken:'DO_NOT_COPY'}
 let seen=null
 const original=function(name,packet){seen={receiver:this,name,packet};return 'unchanged_result'}
 client.queue=original
 let now=2000
 const audit=attachOutboundInputAudit(client,{clock:()=>now})
 client.emit('start_game',{current_tick:1000n})
 now+=50
 assert.equal(client.queue('player_auth_input',originalPayload),'unchanged_result')
 assert.equal(seen.receiver,client)
 assert.equal(seen.packet,originalPayload)
 assert.equal(seen.name,'player_auth_input')
 const s=audit.get()
 assert.equal(s.queued,1)
 assert.equal(s.movingQueued,1)
 assert.equal(s.tickAdvance,1)
 assert.equal(s.tickVsExpectedWallTick,0)
 assert.equal(s.corrections,0)
 assert.equal(s.loginTickPresent,true)
 assert.equal(s.kind,'queue_only_not_network_or_BDS_proof')
 assert.ok(!JSON.stringify(s).includes('DO_NOT_COPY'))
 assert.ok(!JSON.stringify(s).includes('123'))
 audit.detach()
 assert.equal(client.queue,original)
})

test('unrelated packet queues are entirely unaffected and original exceptions propagate',()=>{
 const client=new EventEmitter(),error=new Error('real_transport_exception')
 let n=0
 const original=function(name,p){n++;if(name==='player_auth_input')throw error;return p}
 client.queue=original
 const a=attachOutboundInputAudit(client,{clock:()=>0})
 client.emit('start_game',{current_tick:1n})
 const raw={jwt:'PRIVATE'}
 assert.equal(client.queue('login',raw),raw)
 assert.equal(a.get().queued,0)
 assert.throws(()=>client.queue('player_auth_input',{tick:2n}),e=>e===error)
 assert.equal(n,2)
 assert.equal(a.get().queued,1)
 client.emit('close')
 assert.equal(client.queue,original)
})

test('10-second window, repeated and regressed ticks, and correction shapes are tracked',()=>{
 const client=new EventEmitter()
 client.queue=()=>{}
 let now=1000
 const a=attachOutboundInputAudit(client,{clock:()=>now})
 client.emit('start_game',{current_tick:[0,400]})
 client.queue('player_auth_input',{tick:401n,move_vector:{x:0,z:1}})
 now+=50
 client.queue('player_auth_input',{tick:401n,input_data:{up:true}})
 now+=50
 client.queue('player_auth_input',{tick:400n,move_vector:{x:0,z:0}})
 client.emit('correct_player_move_prediction',{tick:402n,position:{x:1,y:2,z:3}})
 let s=a.get()
 assert.equal(s.queued,3)
 assert.equal(s.movingQueued,2)
 assert.equal(s.repeatedTicks,1)
 assert.equal(s.regressedTicks,1)
 assert.equal(s.lastTickStep,-1)
 assert.equal(s.corrections,1)
 assert.equal(s.correctionTickPresent,true)
 assert.equal(s.loginTickShape,'array')
 now+=12000
 s=a.get()
 assert.equal(s.queuedLast10s,0)
 assert.equal(s.movingLast10s,0)
 assert.equal(s.queued,3)
 a.detach()
})

test('missing server tick cannot fabricate a valid synchronized baseline',()=>{
 const c=new EventEmitter();c.queue=()=>{}
 const a=attachOutboundInputAudit(c,{clock:()=>1234})
 c.emit('start_game',{})
 c.queue('player_auth_input',{tick:600n,move_vector:{x:1,z:0}})
 const s=a.get()
 assert.equal(s.loginTickPresent,false)
 assert.equal(s.loginTickShape,'missing')
 assert.equal(s.tickAdvance,null)
 assert.equal(s.tickVsExpectedWallTick,null)
 a.detach()
})

test('tick parser and movement intent are restrictive',()=>{
 assert.equal(toTick(-1),null)
 assert.equal(toTick('1234'),null)
 assert.equal(toTick([1,2]),4294967298n)
 assert.equal(toTick([1,-1]),null)
 assert.equal(toTick(Number.MAX_SAFE_INTEGER+1),null)
 assert.equal(isMoving({move_vector:{x:0,z:0},input_data:[]}),false)
 assert.equal(isMoving({input_data:{start_jumping:true}}),true)
 assert.equal(isMoving({move_vector:{x:0,z:1}}),true)
})

test('high-frequency queue bursts keep only a bounded ten-second ring',()=>{
 const client=new EventEmitter();client.queue=()=>{}
 let now=5000
 const a=attachOutboundInputAudit(client,{clock:()=>now})
 client.emit('start_game',{current_tick:0n})
 for(let i=0;i<700;i++){
   client.queue('player_auth_input',{tick:BigInt(i),move_vector:{x:0,z:1}})
 }
 let state=a.get()
 assert.equal(state.queued,700)
 assert.equal(state.movingQueued,700)
 assert.equal(state.queuedLast10s,512)
 assert.equal(state.movingLast10s,512)
 now+=10001
 state=a.get()
 assert.equal(state.queuedLast10s,0)
 assert.equal(state.movingLast10s,0)
 a.detach()
})

test('tracks successful serialization distinctly from queue attempts and errors',()=>{
 const client=new EventEmitter()
 const queued=[]
 const failure=new Error('serializer_failed')
 client.queue=function(name,p){if(p.invalid)throw failure;queued.push({name,p});return 'ok'}
 let now=3000
 const a=attachOutboundInputAudit(client,{clock:()=>now})
 client.emit('start_game',{current_tick:77n})
 const valid={tick:78n,move_vector:{x:0,z:1},unknownSecret:'NOT_TRACKED'}
 assert.equal(client.queue('player_auth_input',valid),'ok')
 assert.throws(()=>client.queue('player_auth_input',{tick:79n,invalid:true}),e=>e===failure)
 const d=a.get()
 assert.equal(d.queued,2)
 assert.equal(d.serialized,1)
 assert.equal(d.serializationErrors,1)
 assert.equal(d.serializedLast10s,1)
 assert.equal(d.pendingPacketBuffers,null)
 assert.equal(d.transportHookAttached,false)
 assert.ok(!JSON.stringify(d).includes('NOT_TRACKED'))
 assert.equal(queued[0].p,valid)
 a.detach()
})

test('counts RakNet sendReliable calls without copying buffers, preserving return/error and detach',()=>{
 const client=new EventEmitter()
 const sent=[]
 const error=new Error('transport_failure')
 let now=5000
 const wire={sendReliable:function(buf,immediate){
   sent.push({receiver:this,buf,immediate})
   if(immediate===false)throw error
   return 42
 }}
 const original=wire.sendReliable
 client.connection=wire
 client.queue=function(){}
 const a=attachOutboundInputAudit(client,{clock:()=>now})
 client.emit('start_game',{current_tick:[0,1]})
 const packet=Buffer.from('PRIVATE_BYTES')
 assert.equal(wire.sendReliable(packet,true),42)
 assert.throws(()=>wire.sendReliable(packet,false),e=>e===error)
 assert.equal(sent[0].buf,packet)
 assert.equal(sent[0].receiver,wire)
 const s=a.get()
 assert.equal(s.transportHookAttached,true)
 assert.equal(s.transportCalls,2)
 assert.equal(s.transportThrows,1)
 assert.equal(s.transportLast10s,2)
 assert.equal(s.lastTransportAgeMs,0)
 assert.equal(s.kind,'queue_only_not_network_or_BDS_proof')
 assert.ok(!JSON.stringify(s).includes('PRIVATE_BYTES'))
 a.detach()
 assert.equal(wire.sendReliable,original)
 now+=11000
})

test('observes pending encoded queue without claiming transport acceptance',()=>{
 const c=new EventEmitter()
 c.sendQ=[]
 c.queue=function(name,p){this.sendQ.push(Buffer.from([10,11]));this.sendIds=[name]}
 const a=attachOutboundInputAudit(c,{clock:()=>0})
 c.emit('start_game',{current_tick:0n})
 c.queue('player_auth_input',{tick:1n,move_vector:{x:0,z:1}})
 assert.equal(a.get().serialized,1)
 assert.equal(a.get().pendingPacketBuffers,1)
 assert.equal(a.get().transportCalls,0)
 c.sendQ=[]
 assert.equal(a.get().pendingPacketBuffers,0)
 a.detach()
})

test('read only native RakNet method does not stop optional monitoring',()=>{
 const client=new EventEmitter()
 client.queue=()=>42
 const original=()=>true
 client.connection=Object.create(null,{sendReliable:{value:original,writable:false}})
 const a=attachOutboundInputAudit(client,{clock:()=>100})
 client.emit('start_game',{current_tick:0n})
 assert.equal(a.get().transportHookAttached,false)
 assert.equal(client.queue('player_auth_input',{tick:1n}),42)
 assert.equal(a.get().serialized,1)
 a.detach()
})

test('RakNet delayedInit hooks after connect_allowed without affecting the transport',()=>{
 const client=new EventEmitter()
 client.queue=()=>{}
 let now=5000
 const audit=attachOutboundInputAudit(client,{clock:()=>now})
 assert.equal(audit.get().transportHookAttached,false)
 assert.equal(audit.get().transportHookState,'connection_pending')
 const seen=[]
 const connection={sendReliable:function(data,immediate){seen.push({thisValue:this,data,immediate});return 99}}
 const original=connection.sendReliable
 client.connection=connection
 client.emit('connect_allowed')
 assert.equal(audit.get().transportHookAttached,true)
 assert.equal(audit.get().transportHookState,'attached')
 client.emit('start_game',{current_tick:[0,123]})
 const payload={opaque:'private-reference'}
 assert.equal(connection.sendReliable(payload,true),99)
 assert.equal(seen.length,1)
 assert.equal(seen[0].data,payload)
 assert.equal(seen[0].thisValue,connection)
 assert.equal(audit.get().transportCalls,1)
 assert.equal(audit.get().transportLast10s,1)
 audit.detach()
 assert.equal(connection.sendReliable,original)
})

test('late start_game and passive status polling retry if connect_allowed was already missed',()=>{
 const c=new EventEmitter()
 c.queue=()=>{}
 const audit=attachOutboundInputAudit(c,{clock:()=>8000})
 const connection={sendReliable:()=>1}
 c.connection=connection
 c.emit('start_game',{current_tick:[0,77]})
 assert.equal(audit.get().transportHookAttached,true)
 audit.detach()
 const client2=new EventEmitter()
 client2.queue=()=>{}
 const second=attachOutboundInputAudit(client2,{clock:()=>9000})
 assert.equal(second.get().transportHookState,'connection_pending')
 client2.connection={sendReliable:()=>2}
 assert.equal(second.get().transportHookAttached,true)
 second.detach()
})

test('late connected nonwritable transport reports reason while queue audit continues',()=>{
 const c=new EventEmitter()
 c.queue=()=>123
 const a=attachOutboundInputAudit(c,{clock:()=>100})
 Object.defineProperty(c,'connection',{value:Object.create(null,{
   sendReliable:{value:()=>1,writable:false,configurable:false}
 }),writable:false})
 c.emit('connect_allowed')
 assert.equal(a.get().transportHookAttached,false)
 assert.equal(a.get().transportHookState,'not_writable')
 c.emit('start_game',{current_tick:[0,1]})
 assert.equal(c.queue('player_auth_input',{tick:2n}),123)
 assert.equal(a.get().serialized,1)
 a.detach()
})

test('moving input bursts require consecutive moving ticks, not cumulative packet count',()=>{
 const c=new EventEmitter();c.queue=()=>null
 let now=1000
 const a=attachOutboundInputAudit(c,{clock:()=>now})
 c.emit('start_game',{current_tick:100n})
 function send(tick,forward){
   now+=50
   c.queue('player_auth_input',{tick:BigInt(tick),
     move_vector:{x:0,z:forward?1:0},input_data:forward?['up']:[]})
 }
 send(101,true);send(102,true);send(103,false)
 send(104,true);send(106,true);send(107,false)
 send(108,true);send(109,true);send(110,true)
 const out=a.get()
 assert.equal(out.movingQueued,7)
 assert.equal(out.movingBurstCount,4)
 assert.equal(out.maxConsecutiveMovingTicks,3)
 assert.equal(out.currentMovingRun,3)
 assert.equal(out.lastMovingAgeMs,0)
 assert.equal(out.serialized,9)
 a.detach()
})

test('first moving burst reads back the encoded frame without changing queue semantics',()=>{
 const c=new EventEmitter(),payload={tick:99n,input_data:['up'],
   move_vector:{x:0,z:1},raw_move_vector:{x:0,z:1},
   analogue_move_vector:{x:0,z:1},position:{x:0.5,y:70.62,z:1},
   delta:{x:0,y:0,z:.1},yaw:180,pitch:0}
 const raw=Buffer.from('encoded_authoritative_input')
 c.sendQ=[]
 c.queue=function(){this.sendQ.push(raw);return 7}
 c.deserializer={parsePacketBuffer:()=>({data:{name:'player_auth_input',params:payload}})}
 const audit=attachOutboundInputAudit(c,{clock:()=>1000})
 c.emit('start_game',{current_tick:98n})
 assert.equal(c.queue('player_auth_input',payload),7)
 const d=audit.get()
 assert.equal(d.wireProbeFrames,1)
 assert.equal(d.wireProbeMatched,1)
 assert.equal(d.wireProbeMismatches,0)
 assert.equal(d.serialized,1)
 assert(!JSON.stringify(d).includes('encoded_authoritative_input'))
 audit.detach()
})
