'use strict'
// Optional strict BDS session preflight using the operator-identified,
// read-only MCSManager instance console log. No console commands, auth access
// or server/world changes. This is NOT an authenticated BDS list/querytarget.
// Unknown or stale evidence fails CLOSED when this guard is configured.
const fs=require('node:fs')
const path=require('node:path')

const os=require('node:os')
const PROOF_LIFETIME_MS=45*1000
const PROOF_BASENAME='bds-session-rejoin-absence.json'
// Original BDS port identity is kept stable during one verified login.
function originalUdpSocketInode({read=fs.readFileSync}={}){
  const candidates=[]
  for(const file of ['/proc/net/udp','/proc/net/udp6']){
    let table
    try{table=read(file,'utf8')}catch{return null}
    for(const line of table.split(/\r?\n/).slice(1)){
      const cols=line.trim().split(/\s+/)
      if(cols.length<10)continue
      const port=cols[1]?.split(':').at(-1)
      if(port?.toUpperCase()!=='45D7')continue // decimal 17879
      if(!/^[0-9]+$/.test(cols[9])||cols[9]==='0')return null
      candidates.push(cols[9])
    }
  }
  return candidates.length===1?candidates[0]:null
}
function readAbsenceProof(env,{now=Date.now,fsImpl=fs,
    home=os.homedir(),socketInode=originalUdpSocketInode}={}){
  try{
    const root=path.join(home,'.alice-bedrock-control')
    const file=path.join(root,PROOF_BASENAME)
    const directory=fsImpl.lstatSync(root),item=fsImpl.lstatSync(file)
    if(!directory.isDirectory()||directory.isSymbolicLink()||
       !item.isFile()||item.isSymbolicLink()||
       directory.uid!==process.getuid()||item.uid!==process.getuid()||
       (directory.mode&0o077)!==0||(item.mode&0o077)!==0||
       item.size===0||item.size>768)return false
    const d=JSON.parse(fsImpl.readFileSync(file,'utf8'))
    const keys=['version','source','observedAt','expiresAt','instanceLogDev',
      'instanceLogIno','instanceId','port','socketInode']
    if(Object.keys(d).sort().join(',')!==keys.sort().join(','))return false
    const time=now()
    if(d.version!==1||d.source!=='bds_querytarget_no_matching_player'||
       d.port!==17879||!Number.isSafeInteger(d.observedAt)||
       d.expiresAt!==d.observedAt+PROOF_LIFETIME_MS||
       time<d.observedAt||time>=d.expiresAt||!Number.isSafeInteger(time)||
       d.instanceId!==path.basename(env.ALICE_BEDROCK_BDS_SESSION_LOG,'.log')||
       !Number.isSafeInteger(d.instanceLogDev)||
       !Number.isSafeInteger(d.instanceLogIno)||typeof d.socketInode!=='string')return false
    const stat=fsImpl.statSync(env.ALICE_BEDROCK_BDS_SESSION_LOG)
    if(!stat.isFile()||stat.dev!==d.instanceLogDev||stat.ino!==d.instanceLogIno)
      return false
    return socketInode()===d.socketInode
  }catch{return false}
}

const DEFAULT_DIR='/opt/mcsmanager/daemon/data/InstanceLog'
const MAX_TAIL=1024*1024
const MAX_AGE_MS=30*60*1000
function readTail(file,{fsImpl=fs}={}){
  const flags=fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK
  const fd=fsImpl.openSync(file,flags)
  try{
    const st=fsImpl.fstatSync(fd)
    if(!st.isFile()||st.size===0)throw Error('BDS session log is missing or empty')
    const size=Math.min(st.size,MAX_TAIL),buf=Buffer.alloc(size)
    const read=fsImpl.readSync(fd,buf,0,size,st.size-size)
    let text=buf.toString('utf8',0,read)
    if(st.size>size)text=text.slice(text.indexOf('\n')+1)
    return {text,mtimeMs:st.mtimeMs}
  }finally{fsImpl.closeSync(fd)}
}
function sessionStatus(log,gamertag){
  const entries=[]
  // Only accept BDS server-origin player lifecycle lines, never free-form chat.
  const re=/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}:\d{3} INFO\] Player (connected|disconnected|Spawned): ([^\r\n]*)$/i
  for(const line of log.split(/\r?\n/)){
    const match=re.exec(line)
    // BDS emits 'Spawned: name xuid: ...' (no comma), unlike
    // 'connected: name, xuid: ...'. Never return or log these identifiers.
    const actor=match?.[2]?.split(/(?:,\s*|\s+)(?:xuid|pfid):/i)[0].replace(/,\s*$/,'').trim()
    if(actor?.toLowerCase()===gamertag.toLowerCase())
      entries.push(match[1].toLowerCase())
  }
  const latest=entries.at(-1)||null
  return {latest,eventsSeen:entries.length}
}
function assertBdsSessionReleased(env=process.env,{now=Date.now,dir=DEFAULT_DIR,reader=readTail,proofReader=readAbsenceProof}={}){
  const file=env.ALICE_BEDROCK_BDS_SESSION_LOG
  const name=env.ALICE_BEDROCK_BDS_GAMERTAG
  if(!file&&!name)return {status:'unconfigured'}
  if(!file||!name)throw Error('BDS session guard requires both ALICE_BEDROCK_BDS_SESSION_LOG and ALICE_BEDROCK_BDS_GAMERTAG')
  if(typeof name!=='string'||!/^[A-Za-z0-9_ ]{3,32}$/.test(name)||name!==name.trim())
    throw Error('Invalid BDS Gamertag for session guard')
  const root=path.resolve(dir),resolved=path.resolve(file)
  if(path.dirname(resolved)!==root||!/^[-a-f0-9]{32}\.log$/i.test(path.basename(resolved)))
    throw Error('BDS session log must be one explicit MCSManager InstanceLog UUID .log file')
  if(fs.lstatSync(root).isSymbolicLink()||fs.lstatSync(resolved).isSymbolicLink())
    throw Error('Refusing symlinked BDS session log')
  let data
  try{data=reader(resolved)}catch(e){
    throw Error('BDS session log unreadable; cannot safely verify prior session: '+(e.code||e.message))
  }
  const age=now()-data.mtimeMs
  if(!Number.isFinite(age)||age< -60000||age>MAX_AGE_MS)
    throw Error('BDS session log is stale or has a future modification time; refusing unverified login')
  const s=sessionStatus(data.text,name)
  if(s.latest==='connected'||s.latest==='spawned')
    throw Error('BDS still records configured Alice Gamertag ONLINE; refusing another Xbox login')
  if(s.latest!=='disconnected'){
    // Only a *missing* historic session event may use a fresh server-side
    // no-match proof, never a known ONLINE player. Bound to the exact original
    // MCSManager log inode and UDP socket so BDS restarts invalidate the proof.
    if(s.latest===null&&proofReader(env,{now}))
      return {status:'live_bds_absence_verified',eventsSeen:s.eventsSeen,logAgeMs:Math.round(age)}
    throw Error('BDS session history has no verified prior Alice disconnect; refusing unverified login')
  }
  return {status:'last_bds_event_disconnected',eventsSeen:s.eventsSeen,logAgeMs:Math.round(age)}
}
module.exports={assertBdsSessionReleased,sessionStatus,readTail,readAbsenceProof,originalUdpSocketInode,PROOF_LIFETIME_MS,MAX_AGE_MS,MAX_TAIL}
