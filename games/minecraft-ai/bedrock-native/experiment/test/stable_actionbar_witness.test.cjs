'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {attachStableActionbarWitness,parsePacket,PACK}=require('../src/stable_actionbar_witness.cjs')
const {attachMovementEvidence}=require('../src/movement_evidence.cjs')
const make=()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alice-stable-actionbar-'))
 fs.chmodSync(dir,0o700)
 let now=1793460000000
 const client=new EventEmitter()
 const evidence=attachMovementEvidence(client,{clock:()=>now,eyeHeight:()=>1.62})
 client.emit('start_game',{runtime_entity_id:123n,player_position:{x:-6,y:59.62,z:1}})
 const file=path.join(dir,'bds-stable-actionbar-enabled.json')
 const config=()=>fs.writeFileSync(file,JSON.stringify({version:1,enabled:true,
  packUuid:PACK,gamertag:'AliceXbox'}),{mode:0o600})
 const msg=(seq=1,delta=0)=>'ALICE_BDS_STABLE_V1|bedrockboot-1234567|'+seq+'|'+(now-100)+
  '|bedrock-player-unique-id|-6|58|'+(1+delta)
 return {dir,client,evidence,file,config,msg,move:(n)=>now+=n,now:()=>now,
  close:()=>{evidence.detach();fs.rmSync(dir,{recursive:true,force:true})}}
}
test('off until owner-only exact production pack config is installed',()=>{
 const m=make()
 try{
  const bridge=attachStableActionbarWitness(m.client,{file:m.file,
   name:()=> 'AliceXbox',evidence:m.evidence,clock:m.now})
  assert.equal(bridge.get().enabled,false)
  m.client.emit('set_title',{type:4,text:m.msg()})
  assert.equal(m.evidence.get().independentSamples,0)
  bridge.detach()
 }finally{m.close()}
})
test('two stable BDS-only actionbar positions establish independent pair',()=>{
 const m=make()
 try{
  m.config()
  let calls=0
  const bridge=attachStableActionbarWitness(m.client,{file:m.file,
   name:()=> 'AliceXbox',evidence:m.evidence,clock:m.now,
   onAccepted:()=>calls++})
  m.move(200)
  m.client.emit('set_title',{type:4,text:m.msg(1)})
  m.move(1800)
  m.client.emit('set_title',{type:'actionbar',text:m.msg(2)})
  const s=m.evidence.get()
  assert.equal(bridge.get().status,'accepted')
  assert.equal(s.independentSamples,2)
  assert.equal(s.independentSource,'bds_stable_actionbar')
  assert.equal(s.independentPairTravelBlocks,0)
  assert.equal(calls,2)
  bridge.detach()
 }finally{m.close()}
})
test('no chat, title, bad origin, stale or fake messages become movement proof',()=>{
 const m=make()
 try{
  m.config()
  const bridge=attachStableActionbarWitness(m.client,{file:m.file,
   name:()=> 'AliceXbox',evidence:m.evidence,clock:m.now})
  m.client.emit('text',{type:'systemMessage',message:m.msg()})
  m.client.emit('set_title',{type:'title',text:m.msg()})
  m.client.emit('set_title',{type:1,text:m.msg()})
  m.client.emit('set_title',{type:4,text:m.msg().replace('bedrock-player-unique-id','x')})
  m.move(5100)
  m.client.emit('set_title',{type:4,text:m.msg(3).replace(String(m.now()-100),String(m.now()-5000))})
  assert.equal(m.evidence.get().independentSamples,0)
  bridge.detach()
 }finally{m.close()}
})
test('script source is stable only, specific Alice UI, no commands or beta modules',()=>{
 const pack=path.join(__dirname,'../../../bds-stable-witness-pack')
 const manifest=JSON.parse(fs.readFileSync(path.join(pack,'manifest.json')))
 assert.deepEqual(manifest.dependencies,[{module_name:'@minecraft/server',version:'2.10.0'}])
 const code=fs.readFileSync(path.join(pack,'scripts/main.js'),'utf8')
 assert.match(code,/onScreenDisplay\.setActionBar\(payload\)/)
 assert.match(code,/__OWNER_SELECTED_ALICE_GAMERTAG__/)
 assert.doesNotMatch(code,/runCommand|server-net|server-admin/)
})
test('parser requires exact title type and monotone source timestamp',()=>{
 const m=make()
 try{
  assert.equal(parsePacket({type:4,text:m.msg()},m.now()).source,'bds_stable_actionbar')
  assert.equal(parsePacket({type:'chat',text:m.msg()},m.now()),null)
  assert.equal(parsePacket({type:4,text:m.msg().replace('ALICE_BDS_STABLE_V1','fake')},m.now()),null)
  assert.equal(parsePacket({type:4,text:m.msg()},m.now()-1000),null)
 }finally{m.close()}
})
