'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const os=require('node:os')
const {EventEmitter}=require('node:events')
const {loginShape,attachConnectionAudit,safeRead}=require('../connection_audit.cjs')
function jwt(value,header={alg:'ES384'}){
  const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
  return enc(header)+'.'+enc(value)+'.signature'
}
function fixture({xuid='private-xuid',username='private-gamertag',device='private-device-id'}={}){
  const c=new EventEmitter()
  c.clientX509='SECRET_EPHEMERAL_PUBLIC_KEY'
  c.options={version:'1.26.51',host:'127.0.0.1',port:17879,
    protocolVersion:2232,transport:'raknet',deviceOS:12,offline:false}
  c.profile={name:username,xuid}
  c.accessToken=[jwt({exp:Math.floor(Date.now()/1000)+3600}),
    jwt({exp:Math.floor(Date.now()/1000)+3600,identityPublicKey:'SECRET_EPHEMERAL_PUBLIC_KEY',extraData:{displayName:username,XUID:xuid}})]
  c.clientUserChain=jwt({DeviceOS:12,ServerAddress:'127.0.0.1:17879',
    GameVersion:'1.26.51',DeviceId:device,SelfSignedId:'secret-uuid',ThirdPartyName:username},{alg:'ES384',x5u:'SECRET_EPHEMERAL_PUBLIC_KEY'})
  c.multiplayerToken='SENSITIVE_PRIVATE_BEDROCK_MULTIPLAYER_TOKEN'
  return c
}
function withDir(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-connection-audit-'))
  try{return fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('login shape checks safe identity invariants without returning any identifiers',()=>{
  const result=loginShape(fixture())
  const text=JSON.stringify(result)
  for(const secret of ['private-xuid','private-gamertag','private-device-id','secret-uuid','SENSITIVE_PRIVATE_BEDROCK_MULTIPLAYER_TOKEN','SECRET_EPHEMERAL_PUBLIC_KEY'])
    assert(!text.includes(secret))
  assert.equal(result.userChainNameMatches,true)
  assert.equal(result.userChainDeviceOSMatches,true)
  assert.equal(result.userChainServerMatches,true)
  assert.equal(result.certificateNameMatches,true)
  assert.equal(result.certificatePublicKeyMatches,true)
  assert.equal(result.userChainHeaderKeyMatches,true)
  assert.equal(result.certificateCount,2)
  assert.deepEqual(result.certificateExpiry,['valid_over_5m','valid_over_5m'])
})
test('captures successful spawn and failed conflict, comparing only safe structural changes',()=>withDir(root=>{
  const warnings=[],log={log:(...args)=>warnings.push(args.join(' ')),warn:(...args)=>warnings.push(args.join(' '))}
  const client1=fixture()
  attachConnectionAudit(client1,{root,mode:'legacy-native-injected',log})
  client1.emit('session',client1.profile)
  client1.emit('loggingIn')
  client1.emit('join')
  client1.emit('spawn')
  client1.emit('close')
  const client2=fixture({xuid:'DIFFERENT_XUID',username:'DIFFERENT_NAME'})
  client2.options.deviceOS=1
  client2.clientX509='DIFFERENT_EPHEMERAL_PUBLIC_KEY'
  attachConnectionAudit(client2,{root,mode:'legacy-native-injected',log})
  client2.emit('session',client2.profile)
  client2.emit('loggingIn')
  client2.emit('disconnect',{reason:'server_id_conflict',message:'JWT secret should not appear'})
  client2.emit('close')
  client2.emit('close')
  const rows=safeRead(root)
  assert.equal(rows.length,2,'closed event recorded once')
  assert.equal(rows[0].result,'spawned')
  assert.equal(rows[1].result,'server_id_conflict')
  assert.equal(rows[1].login.userChainDeviceOSMatches,false)
  assert.equal(rows[1].login.certificatePublicKeyMatches,false)
  assert.equal(rows[1].login.userChainHeaderKeyMatches,false)
  assert(warnings.some(x=>x.includes('differentFields')&&x.includes('userChainDeviceOSMatches')))
  assert.equal(fs.statSync(path.join(root,'connection-audit.json')).mode&0o777,0o600)
  const raw=fs.readFileSync(path.join(root,'connection-audit.json'),'utf8')
  for(const secret of ['private-xuid','private-gamertag','private-device-id','DIFFERENT_XUID','DIFFERENT_NAME','SENSITIVE_PRIVATE_BEDROCK_MULTIPLAYER_TOKEN','JWT secret'])
    assert(!raw.includes(secret), 'must never save secret '+secret)
}))
test('unknown JWT or missing data is flagged not falsely verified',()=>{
  const c=fixture()
  c.clientUserChain='bad'
  c.accessToken=['sensitive raw token not jwt']
  const shape=loginShape(c)
  assert.equal(shape.userChainDecodable,false)
  assert.equal(shape.certificateDecodable,false)
  assert.deepEqual(shape.certificateExpiry,['unknown'])
})
test('audit never follows symlinked history file',()=>withDir(root=>{
  const target=path.join(root,'elsewhere')
  fs.writeFileSync(target,'[]')
  fs.symlinkSync(target,path.join(root,'connection-audit.json'))
  assert.throws(()=>safeRead(root),/unsafe audit history file/)
}))
