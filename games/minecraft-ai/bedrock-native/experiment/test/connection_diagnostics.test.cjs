'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { attachConnectionDiagnostics, safeDisconnect, cleanScalar } = require('../src/connection_diagnostics.cjs')
function fake() {
  const wire = new EventEmitter()
  const lines = []
  let now = 100
  const diag = attachConnectionDiagnostics({_client:wire},{clock:()=>now,log:{log:(...a)=>lines.push(a.join(' ')),warn:(...a)=>lines.push(a.join(' '))}})
  return { wire, lines, diag, step:(n)=>{now+=n} }
}
test('reports pre-spawn disconnect with exact non-sensitive fields instead of empty kicked text', () => {
  const a=fake()
  a.wire.emit('connect')
  a.wire.emit('network_settings')
  a.wire.emit('loggingIn')
  a.step(150)
  a.wire.emit('disconnect',{message:'',reason:'server_full',hide_disconnect_screen:false,filtered_message:''})
  a.wire.emit('close')
  assert.equal(a.diag.getPhase(),'login_sent')
  assert.equal(a.diag.getDisconnect().reason,'server_full')
  assert(a.lines.some(x=>x.includes('pre-spawn disconnect')))
  assert(a.lines.some(x=>x.includes('server_disconnect phase=login_sent')))
})
test('successful join and spawn recorded without dumping any auth payload', () => {
  const a=fake()
  a.wire.emit('join',{certificate:'do-not-print'})
  a.wire.emit('start_game',{sessionToken:'do-not-print'})
  a.wire.emit('play_status',{status:'player_spawn',jwt:'do-not-print'})
  a.wire.emit('spawn')
  a.wire.emit('close')
  assert.equal(a.diag.getPhase(),'spawn_confirmed')
  assert(!a.lines.join('\n').includes('do-not-print'))
  assert(!a.lines.some(x=>x.includes('pre-spawn disconnect')))
})
test('recurrent server_id_conflict does not re-request the already-done login A/B', () => {
  const a=fake()
  a.wire.emit('network_settings')
  a.wire.emit('disconnect',{reason:'server_id_conflict',message:''})
  a.wire.emit('close')
  const output=a.lines.join('\\n')
  assert.match(output,/recurring intermittent pre-spawn rejection/)
  assert.match(output,/Prior native\/chat vs Mineflayer A\/B/)
  assert.match(output,/do not repeat that comparison/)
  assert.doesNotMatch(output,/compare the legacy chat-only connector with the autonomous client SEQUENTIALLY/)
})
test('filters massive or token-like kick text and strips control characters', () => {
  assert.equal(cleanScalar('bad\nreason'), 'bad reason')
  assert.equal(cleanScalar('eyJ'+'a'.repeat(120)), '[redacted]')
  assert.equal(safeDisconnect({message:'x'.repeat(200)}).message, '[redacted]')
})
test('disconnect may have empty/missing reason and must remain unknown', () => {
  const result=safeDisconnect({hide_disconnect_reason:true,message:''})
  assert.equal(result.reason,null)
  assert.equal(result.message,'')
  assert.equal(result.hideDisconnectReason,true)
})