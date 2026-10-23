'use strict'
// Bedrock login evidence ledger. Inspect ONLY allowlisted booleans/numbers;
// never persist Xbox identifiers, usernames, auth JWTs, device UUIDs, IPs or certificates.
// This passive recorder does not affect protocol packets or auth flow.
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const crypto=require('node:crypto')
const ROOT=()=>path.join(os.homedir(),'.alice-bedrock-control')
const FILE='connection-audit.json'
const MAX_BYTES=64*1024
const KEEP=32
function jwtPayload(value){
  try{
    if(typeof value!=='string'||value.length>32768)return null
    const b=value.split('.')
    if(b.length!==3||b[1].length>16384)return null
    const obj=JSON.parse(Buffer.from(b[1],'base64url').toString('utf8'))
    return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:null
  }catch{return null}
}
function tokenWindow(claims,now){
  if(!claims||!Number.isSafeInteger(claims.exp))return 'unknown'
  const delta=claims.exp-Math.floor(now/1000)
  if(delta<=0)return 'expired'
  return delta<=300?'expires_within_5m':'valid_over_5m'
}
function loginShape(client,now=Date.now()){
  const opts=client?.options||{}
  const profile=client?.profile||{}
  const chain=Array.isArray(client?.accessToken)?client.accessToken:[]
  const user=jwtPayload(client?.clientUserChain)
  const certificate=chain.map(jwtPayload)
  const keyClaims=certificate.filter(c=>typeof c?.identityPublicKey==='string')
  const keyPresent=typeof client?.clientX509==='string'&&client.clientX509.length>0
  const identityJwtHeader=(()=>{
    try{return JSON.parse(Buffer.from(String(client?.clientUserChain||'').split('.')[0]||'','base64url').toString('utf8'))}
    catch{return null}
  })()
  const profileCert=certificate.find(c=>c?.extraData)?.extraData
  const authName=profileCert?.displayName
  const identityName=typeof profile?.name==='string'?profile.name:null
  return {
    protocolVersion:Number.isSafeInteger(opts.protocolVersion)?opts.protocolVersion:null,
    gameVersion:typeof opts.version==='string'?opts.version.slice(0,20):null,
    transport:opts.transport==='nethernet'?'nethernet':'raknet',
    authMode:opts.offline?'offline':'xbox_online',
    deviceOS:Number.isSafeInteger(opts.deviceOS)?opts.deviceOS:null,
    authTitleKind:typeof opts.authTitle==='string'?'explicit':'default',
    hasAuthenticatedProfile:!!identityName&&!!profile?.xuid,
    certificateCount:chain.length,
    certificateDecodable:chain.length>0&&certificate.every(x=>x!==null),
    certificateNameMatches:authName&&identityName?authName===identityName:null,
    certificatePublicKeyMatches:keyClaims.length&&keyPresent
      ?keyClaims.some(t=>t.identityPublicKey===client.clientX509):null,
    userChainHeaderKeyMatches:identityJwtHeader?.x5u&&keyPresent
      ?identityJwtHeader.x5u===client.clientX509:null,
    certificateExpiry:certificate.map(t=>tokenWindow(t,now)),
    hasMultiplayerToken:typeof client?.multiplayerToken==='string'&&client.multiplayerToken.length>0,
    userChainDecodable:!!user,
    userChainNameMatches:user&&identityName?user.ThirdPartyName===identityName:null,
    userChainServerMatches:user?user.ServerAddress===opts.host+':'+opts.port:null,
    userChainGameVersionMatches:user?user.GameVersion===opts.version:null,
    userChainDeviceOSMatches:user?user.DeviceOS===opts.deviceOS:null,
    // Detect genuine absent fields without leaking their random values.
    hasDeviceId:typeof user?.DeviceId==='string'&&user.DeviceId.length>0,
    hasSelfSignedId:typeof user?.SelfSignedId==='string'&&user.SelfSignedId.length>0
  }
}
function safeRead(root){
  const file=path.join(root,FILE)
  try{
    const st=fs.lstatSync(file)
    if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BYTES)throw Error('unsafe audit history file')
    const a=JSON.parse(fs.readFileSync(file,'utf8'))
    return Array.isArray(a)?a.slice(-KEEP).filter(r=>r&&typeof r==='object'):[]
  }catch(e){if(e.code==='ENOENT')return [];throw e}
}
function save(root,rows){
  if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw Error('unsafe audit directory')
  fs.mkdirSync(root,{mode:0o700,recursive:true})
  const target=path.join(root,FILE)
  if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('unsafe audit target')
  const content=JSON.stringify(rows.slice(-KEEP))
  if(Buffer.byteLength(content)>MAX_BYTES)throw Error('audit history too large')
  const tmp=path.join(root,'.connection-audit-'+process.pid+'-'+crypto.randomBytes(4).toString('hex')+'.tmp')
  try{
    fs.writeFileSync(tmp,content,{mode:0o600,flag:'wx'})
    fs.renameSync(tmp,target)
  }finally{try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
}
function attachConnectionAudit(client,{mode='unknown',root=ROOT(),now=Date.now,log=console}={}){
  if(!client||typeof client.on!=='function')throw Error('Bedrock client required')
  const started=now()
  // The only identity is a fresh random audit ID, not a player/device/Xbox ID.
  const id=crypto.randomBytes(8).toString('hex')
  const record={id,startedAt:started,mode:String(mode).slice(0,32),phase:'created',result:'in_progress',login:null}
  let closed=false
  let lastError=null
  function update(){
    try{
      const rows=safeRead(root).filter(x=>x.id!==id)
      rows.push({...record})
      save(root,rows)
    }catch(err){
      const message=String(err.message||err)
      if(message!==lastError)log.warn('[Alice connection audit] storage unavailable:',message)
      lastError=message
    }
  }
  function stage(phase){record.phase=phase}
  client.on('session',()=>stage('session_authenticated'))
  client.on('loggingIn',()=>{
    stage('login_sent')
    record.login=loginShape(client,now())
    log.log('[Alice connection audit] login evidence:',JSON.stringify(record.login))
  })
  client.on('join',()=>stage('encryption_handshake_accepted'))
  client.on('start_game',()=>stage('start_game_received'))
  client.on('spawn',()=>{
    stage('spawn_confirmed')
    record.result='spawned'
    update()
    log.log('[Alice connection audit] session successful; saved anonymous comparison baseline')
  })
  client.on('disconnect',packet=>{
    // Only allow a constrained enum-like reason. Never copy an arbitrary server message.
    const raw=packet?.reason
    record.reason=typeof raw==='string'&&/^[a-z_]{1,64}$/.test(raw)?raw:'unknown'
  })
  client.on('close',()=>{
    if(closed)return
    closed=true
    if(record.result!=='spawned')record.result=record.reason==='server_id_conflict'?'server_id_conflict':'closed_before_spawn'
    record.finishedAt=now()
    // Compare structural invariants only, with prior successful run if possible.
    if(record.result==='server_id_conflict'&&record.login){
      try{
        const old=safeRead(root).slice().reverse().find(x=>x.result==='spawned'&&x.login)
        if(old){
          const differences=Object.keys(record.login).filter(k=>JSON.stringify(record.login[k])!==JSON.stringify(old.login[k]))
          log.warn('[Alice connection audit] compared with previous spawn:',JSON.stringify({
            sameLoginShape:differences.length===0,
            differentFields:differences,
            priorMode:old.mode
          }))
        }else log.warn('[Alice connection audit] first recorded failed login; no earlier audit baseline')
      }catch(err){log.warn('[Alice connection audit] comparison unavailable:',err.message)}
    }
    update()
  })
  return {get:()=>({...record})}
}
module.exports={attachConnectionAudit,loginShape,jwtPayload,tokenWindow,safeRead}
