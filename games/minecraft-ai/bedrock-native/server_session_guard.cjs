'use strict'
// Optional strict BDS session preflight using the operator-identified,
// read-only MCSManager instance console log. No console commands, auth access
// or server/world changes. This is NOT an authenticated BDS list/querytarget.
// Unknown or stale evidence fails CLOSED when this guard is configured.
const fs=require('node:fs')
const path=require('node:path')
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
function assertBdsSessionReleased(env=process.env,{now=Date.now,dir=DEFAULT_DIR,reader=readTail}={}){
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
  if(s.latest!=='disconnected')
    throw Error('BDS session history has no verified prior Alice disconnect; refusing unverified login')
  return {status:'last_bds_event_disconnected',eventsSeen:s.eventsSeen,logAgeMs:Math.round(age)}
}
module.exports={assertBdsSessionReleased,sessionStatus,readTail,MAX_AGE_MS,MAX_TAIL}
