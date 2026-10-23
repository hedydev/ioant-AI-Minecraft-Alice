'use strict'
// Shared exclusive login guard for autonomous and legacy native Alice on Mint.
// A failure blocks NEW auth, not the Minecraft server or a running player.
// Never touches the Xbox cache, worlds, learning, or system processes.
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const crypto=require('node:crypto')
const DEFAULT_ROOT=()=>path.join(os.homedir(),'.alice-bedrock-control')
function activePid(pid){
  if(!Number.isInteger(pid)||pid<=0)return true // Untrusted lock -> fail closed.
  try{process.kill(pid,0);return true}catch(e){return e.code!=='ESRCH'}
}
function lockOwner(dir){
  const file=path.join(dir,'owner.json')
  const stat=fs.lstatSync(file)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512)
    throw Error('Unsafe Alice lock owner file')
  const owner=JSON.parse(fs.readFileSync(file,'utf8'))
  if(!owner||!Number.isInteger(owner.pid)||owner.pid<=0||
     !Number.isSafeInteger(owner.createdAt)||owner.createdAt<=0||
     typeof owner.nonce!=='string'||!/^[0-9a-f]{32}$/.test(owner.nonce))
    throw Error('Invalid Alice lock owner')
  return owner
}
function acquireAliceInstanceLock({root=DEFAULT_ROOT(),pid=process.pid,now=Date.now,
    alive=activePid,registerExit=true}={}){
  if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())
    throw Error('Unsafe Alice control root')
  fs.mkdirSync(root,{mode:0o700,recursive:true})
  const dir=path.join(root,'active-alice-client.lock')
  const owner={pid,createdAt:now(),nonce:crypto.randomBytes(16).toString('hex')}
  let own=false
  for(let pass=0;pass<2;pass++){
    try{
      fs.mkdirSync(dir,{mode:0o700})
      own=true
      break
    }catch(e){
      if(e.code!=='EEXIST')throw e
      if(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())
        throw Error('Unsafe Alice lock path')
      let existing
      try{existing=lockOwner(dir)}catch{
        throw Error('Alice login lock is incomplete or damaged; not starting a second client')
      }
      if(alive(existing.pid))
        throw Error('Another Alice native client is already running (PID '+existing.pid+'); refusing duplicate Xbox login')
      // A complete owner record is written only after exclusive mkdir;
      // if the owner PID is already gone, reclaim without an artificial delay.
      // Incomplete owner records still fail closed to avoid startup races.
      if(now()<existing.createdAt)
        throw Error('Alice login lock timestamp is in the future; refusing unsafe reclamation')
      // Recheck the identical owner before removing ONLY our own lock files.
      const again=lockOwner(dir)
      if(again.nonce!==existing.nonce||alive(again.pid))
        throw Error('Alice login ownership changed while checking stale lock')
      fs.unlinkSync(path.join(dir,'owner.json'))
      fs.rmdirSync(dir)
    }
  }
  if(!own)throw Error('Alice login lock unavailable')
  const filename=path.join(dir,'owner.json')
  try{
    fs.writeFileSync(filename,JSON.stringify(owner),{mode:0o600,flag:'wx'})
  }catch(e){try{fs.rmdirSync(dir)}catch{};throw e}
  let released=false
  const release=()=>{
    if(released)return
    released=true
    try{
      const existing=lockOwner(dir)
      if(existing.nonce!==owner.nonce)return // Cannot unlock a different owner
      fs.unlinkSync(filename)
      fs.rmdirSync(dir)
    }catch(e){if(e.code!=='ENOENT')return}
  }
  if(registerExit)process.once('exit',release)
  return release
}
module.exports={acquireAliceInstanceLock,activePid,lockOwner}
