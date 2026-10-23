'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {acquireAliceInstanceLock}=require('../instance_lock.cjs')
function withDir(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-instance-lock-'))
  try{fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('native Alice startup denies another live owner before new Xbox transport',()=>withDir(root=>{
  const release=acquireAliceInstanceLock({root,registerExit:false})
  try{
    assert.throws(()=>acquireAliceInstanceLock({root,registerExit:false}),/already running/)
  }finally{release()}
  const again=acquireAliceInstanceLock({root,registerExit:false})
  again()
  assert(!fs.existsSync(path.join(root,'active-alice-client.lock')))
}))
test('crashed old Alice lock is recovered only when pid no longer exists',()=>withDir(root=>{
  const dir=path.join(root,'active-alice-client.lock')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir,'owner.json'),JSON.stringify({
    pid:12345,nonce:'f'.repeat(32),createdAt:100000
  }))
  const release=acquireAliceInstanceLock({root,registerExit:false,alive:()=>false,now:()=>200000})
  const owner=JSON.parse(fs.readFileSync(path.join(dir,'owner.json')))
  assert.equal(owner.pid,process.pid)
  assert.notEqual(owner.nonce,'f'.repeat(32))
  release()
}))
test('active or unreadable lock fails safely and never steals active login',()=>withDir(root=>{
  const dir=path.join(root,'active-alice-client.lock')
  fs.mkdirSync(dir)
  const owner={pid:12345,nonce:'f'.repeat(32),createdAt:190000}
  fs.writeFileSync(path.join(dir,'owner.json'),JSON.stringify(owner))
  assert.throws(()=>acquireAliceInstanceLock({root,registerExit:false,alive:()=>true,now:()=>200000}),/already running/)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'owner.json'))).nonce,owner.nonce)
  fs.writeFileSync(path.join(dir,'owner.json'),'{}')
  assert.throws(()=>acquireAliceInstanceLock({root,registerExit:false,alive:()=>false,now:()=>300000}),/incomplete or damaged/)
}))
test('symbolic links cannot redirect a lock outside dedicated control directory',()=>withDir(root=>{
  const external=path.join(root,'external')
  fs.mkdirSync(external)
  fs.symlinkSync(external,path.join(root,'active-alice-client.lock'))
  assert.throws(()=>acquireAliceInstanceLock({root,registerExit:false}),/Unsafe Alice lock path/)
}))
