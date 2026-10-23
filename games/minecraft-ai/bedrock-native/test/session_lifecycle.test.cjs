'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {installSignalShutdown}=require('../session_lifecycle.cjs')
function fixture({autoClose=true,throwDisconnect=false}={}){
 const client=new EventEmitter(),signals=new EventEmitter(),events=[],logs=[]
 client.disconnect=reason=>{
   events.push(['disconnect',reason])
   if(throwDisconnect)throw Error('transport broken')
   if(autoClose)client.emit('close')
 }
 client.close=()=>{events.push(['close']);client.emit('close')}
 const log={log:(...v)=>logs.push(v.join(' ')),warn:(...v)=>logs.push(v.join(' ')),
   error:(...v)=>logs.push(v.join(' '))}
 let timer
 const a=installSignalShutdown({client,signals,log,stop:()=>events.push(['stop']),
  later:fn=>{timer=fn;return 1},cancel:()=>{timer=null}})
 return {a,client,signals,events,logs,timeout:()=>timer?.()}
}
test('SIGINT stops controllers then sends native Bedrock disconnect with no process.exit',()=>{
 const f=fixture()
 f.signals.emit('SIGINT')
 assert.deepEqual(f.events.map(x=>x[0]),['stop','disconnect'])
 assert.equal(f.a.getState().closed,true)
 assert.match(f.logs.join('\n'),/BDS session release unverified/)
 f.a.dispose()
})
test('signal handling idempotent; repeated signal cannot create a second disconnect',()=>{
 const f=fixture()
 f.signals.emit('SIGTERM')
 assert.equal(f.a.shutdown('SIGINT'),false)
 assert.equal(f.events.filter(x=>x[0]==='disconnect').length,1)
 f.a.dispose()
})
test('transport unable to close gets bounded local fallback, never a claim of server logout',()=>{
 const f=fixture({autoClose:false})
 f.signals.emit('SIGINT')
 assert.equal(f.a.getState().closed,false)
 f.timeout()
 assert.equal(f.a.getState().closed,true)
 assert(f.events.some(x=>x[0]==='close'))
 assert.match(f.logs.join('\n'),/BDS session unknown/)
 f.a.dispose()
})
test('disconnect failure only closes local connection and logs uncertainty',()=>{
 const f=fixture({throwDisconnect:true})
 f.signals.emit('SIGTERM')
 assert.deepEqual(f.events.map(x=>x[0]),['stop','disconnect','close'])
 assert.match(f.logs.join('\n'),/protocol disconnect failed/)
 f.a.dispose()
})
