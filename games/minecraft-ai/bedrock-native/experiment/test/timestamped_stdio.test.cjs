'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {localStamp,prefixStream,installProductionTimestamps}=require('../src/timestamped_stdio.cjs')
function fake(){
  const chunks=[]
  return {chunks,write(chunk,callback){
    chunks.push(Buffer.from(chunk))
    if(typeof callback==='function')callback()
    return true
  },text:()=>Buffer.concat(chunks).toString('utf8')}
}
const now=()=>new Date(2026,9,23,3,49,4,125)
test('production log prefix stores real event-time local offset and PID',()=>{
  const stream=fake(),restore=prefixStream(stream,{now,pid:123})
  stream.write('hello\nworld\n')
  const stamp=localStamp(now())
  assert.match(stamp,/^2026-10-23T03:49:04\.125[+-]\d\d:\d\d$/)
  assert.equal(stream.text(),`[${stamp} PID=123] hello\n[${stamp} PID=123] world\n`)
  restore()
})
test('mixed, split chunks preserve original UTF-8 bytes and do not duplicate prefix',()=>{
  const stream=fake(),restore=prefixStream(stream,{now,pid:7})
  const bytes=Buffer.from('Alice移动\n','utf8')
  const part=bytes.indexOf(Buffer.from('移'))+1
  stream.write(bytes.subarray(0,part))
  stream.write(bytes.subarray(part))
  const result=stream.text()
  assert.equal(result.split('PID=7').length-1,1)
  assert(result.endsWith('Alice移动\n'))
  restore()
})
test('stderr warning and stdout events both receive timestamps; restore is safe',()=>{
  const stdout=fake(),stderr=fake()
  const restore=installProductionTimestamps({stdout,stderr,now,pid:999})
  stdout.write('[Alice wire] spawn_confirmed\n')
  stderr.write('(node:999) MaxListenersExceededWarning: warning\n')
  assert.match(stdout.text(),/PID=999.*spawn_confirmed/)
  assert.match(stderr.text(),/PID=999.*MaxListenersExceededWarning/)
  restore()
  const before=stdout.text();stdout.write('raw\n')
  assert.equal(stdout.text(),before+'raw\n')
})
test('callback invoked exactly once and same-line writes reuse timestamp',()=>{
  const stream=fake(),restore=prefixStream(stream,{now,pid:5})
  let called=0
  stream.write('partial ',()=>called++)
  stream.write('line\n')
  assert.equal(called,1)
  assert.equal(stream.text().split('PID=5').length-1,1)
  restore()
})
