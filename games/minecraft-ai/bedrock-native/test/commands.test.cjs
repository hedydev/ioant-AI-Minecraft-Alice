'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {parseInstruction,responseFor}=require('../src/commands.cjs')
const {config,sendChat,createMessageHandler,validateStartup,assertSupportedNode}=require('../src/main.cjs')

test('native Bedrock ping and login refuse Node 20/23 before loading protocol',()=>{
  assert.throws(()=>assertSupportedNode('20.11.0'),/requires Node.js >=24/)
  assert.throws(()=>assertSupportedNode('23.9.0'),/requires Node.js >=24/)
  assert.doesNotThrow(()=>assertSupportedNode('24.0.0'))
  assert.doesNotThrow(()=>assertSupportedNode('25.1.0'))
})

test('Chinese address and bare action query are parsed without owner whitelist',()=>{
  assert.equal(parseInstruction('AliceAI 跟着我'),'跟着我')
  assert.equal(parseInstruction('alice：状态'),'状态')
  assert.equal(parseInstruction('ai 帮助'),'帮助')
  assert.equal(parseInstruction('你在干嘛？'),'你在干嘛？')
  assert.equal(parseInstruction('你好'),null) // no unsolicited response
})
test('Unwired movement or harvest never claims success',()=>{
  assert.match(responseFor('跟着我',{spawned:true}),/未完成安全适配/)
  assert.match(responseFor('状态',{spawned:true}),/跟随、采集和战斗尚未接入/)
  assert.equal(responseFor('我今天吃过饭了'),null)
})
test('Bounded chat response only after spawn; ignore own chat and unrelated messages',()=>{
  const sent=[]
  const client={queue:(name,packet)=>sent.push({name,packet})}
  let clock=10000
  const msg=createMessageHandler({client,now:()=>clock})
  msg.onText({type:'chat',source_name:'Steve',message:'AliceAI 状态'})
  assert.equal(sent.length,0)
  msg.onSpawn()
  msg.onText({type:'chat',source_name:'Steve',message:'AliceAI 状态'})
  assert.equal(sent.length,1)
  assert.equal(sent[0].name,'text')
  assert.match(sent[0].packet.message,/已进入基岩世界/)
  msg.onText({type:'chat',source_name:'Steve',message:'AliceAI 状态'})
  assert.equal(sent.length,1)
  clock+=2000
  msg.onText({type:'chat',source_name:'Alex',message:'跟着我'})
  assert.equal(sent.length,2)
  assert.match(sent[1].packet.message,/不会假装执行成功/)
  msg.onText({type:'chat',source_name:'AliceAI',message:'AliceAI 状态'})
  msg.onText({type:'chat',source_name:'Steve',message:'普通聊天'})
  assert.equal(sent.length,2)
  msg.onEnd()
  msg.onText({type:'chat',source_name:'Steve',message:'AliceAI 帮助'})
  assert.equal(sent.length,2)
})
test('shared policy brain is wired to real Bedrock chat routing without fake actions',()=>{
  const sent=[]
  const lifecycle=[]
  const client={username:'VerifiedXboxGamertag',queue:(name,packet)=>sent.push(packet.message)}
  const brain={
    hasPendingCount:(name)=>name==='Steve',
    respond:(cmd,sender)=>'共享规则: '+sender+' '+cmd,
    onSpawn:()=>lifecycle.push('spawn'),
    onEnd:()=>lifecycle.push('end')
  }
  const msg=createMessageHandler({client,brain,now:()=>10000})
  msg.onSpawn()
  msg.onText({type:'chat',source_name:'Steve',message:'12个木头'})
  assert.equal(sent[0],'共享规则: Steve 12个木头')
  msg.onText({type:'chat',source_name:'VerifiedXboxGamertag',message:'AliceAI 状态'})
  assert.equal(sent.length,1)
  msg.onEnd()
  assert.deepEqual(lifecycle,['spawn','end'])
})

test('Online-only, single local server target and expected world backup gate',()=>{
  const cfg=config({})
  assert.equal(cfg.port,17879)
  assert.equal(cfg.host,'127.0.0.1')
  assert.throws(()=>config({ALICE_BEDROCK_HOST:'8.8.8.8'}),/local Mint server/)
  assert.throws(()=>config({ALICE_BEDROCK_PORT:'notaport'}),/Invalid Bedrock port/)
  assert.throws(()=>validateStartup(cfg),/backup required/)
})

test('Verified manifest and live Bedrock properties are mandatory before connection',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alice-native-check-'))
  try {
    fs.writeFileSync(path.join(dir,'server.properties'),'server-port=17879\nonline-mode=true\n')
    const manifest=path.join(dir,'backup.json')
    fs.writeFileSync(manifest,JSON.stringify({worlds:['worlds/Bedrock level']}))
    const c={...config({}),manifest,serverDir:dir,worldDir:'Bedrock level'}
    let verifyCalls=0
    validateStartup(c,{run:(...args)=>{verifyCalls++;assert.equal(args[0],'python3');return {status:0}}})
    assert.equal(verifyCalls,1)
    fs.writeFileSync(path.join(dir,'server.properties'),'server-port=17879\nonline-mode=false\n')
    assert.throws(()=>validateStartup(c),/Expected online-mode=true/)
  } finally {fs.rmSync(dir,{force:true,recursive:true})}
})