'use strict'
// Deaths observed by this Alice installation, NOT lifetime Xbox statistics.
// A personal respawn point is known only after an explicit Bedrock server
// player-spawn packet; world spawn and bed proximity are NOT such evidence.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const rootDefault=()=>path.join(os.homedir(),'.alice-bedrock-control')
function point(p){return p&&[p.x,p.y,p.z].every(Number.isSafeInteger)&&
  [p.x,p.y,p.z].every(n=>Math.abs(n)<=30000000)?
  {x:p.x,y:p.y,z:p.z}:null}
function personalSpawn(packet){
  if(!packet||packet.spawn_type!=='player')return null
  // Bedrock 1.26 spawn packet distinguishes world spawn vs player spawn.
  // Never equate a generic world_position with a player's respawn.
  return point(packet.player_position)
}
class LifeObserver{
  constructor({root=rootDefault(),clock=Date.now,log=console}={}){
    this.root=root;this.clock=clock;this.log=log
    this.known=false;this.deaths=0;this.since=null;this.dead=false
    this.respawn=null;this.respawnObservedThisSession=false
    this.read()
  }
  read(){
    try{
      if(fs.lstatSync(this.root,{throwIfNoEntry:false})?.isSymbolicLink())
        throw Error('unsafe_life_directory')
      const file=path.join(this.root,'life.json')
      const st=fs.lstatSync(file,{throwIfNoEntry:false})
      if(!st)return
      if(!st.isFile()||st.isSymbolicLink()||st.size>1024)throw Error('unsafe_life_file')
      const x=JSON.parse(fs.readFileSync(file,'utf8'))
      if(x?.version!==1||!Number.isSafeInteger(x.deaths)||x.deaths<0||
         x.deaths>1000000||!Number.isSafeInteger(x.since))throw Error('invalid_life_data')
      this.deaths=x.deaths;this.since=x.since;this.known=true
      this.respawn=point(x.respawn)
    }catch(e){this.log.warn('[Alice life] life history unavailable:',e.message)}
  }
  save(){
    try{
      if(fs.lstatSync(this.root,{throwIfNoEntry:false})?.isSymbolicLink())
        throw Error('unsafe_life_directory')
      fs.mkdirSync(this.root,{recursive:true,mode:0o700})
      const file=path.join(this.root,'life.json')
      if(fs.lstatSync(file,{throwIfNoEntry:false})?.isSymbolicLink())
        throw Error('unsafe_life_file')
      const tmp=path.join(this.root,'.life-'+process.pid+'.tmp')
      fs.writeFileSync(tmp,JSON.stringify({version:1,deaths:this.deaths,since:this.since,
        respawn:this.respawn}),{mode:0o600})
      fs.renameSync(tmp,file)
    }catch(e){this.log.warn('[Alice life] cannot persist observation:',e.message)}
  }
  spawn(){
    this.dead=false
    if(!this.known){
      this.since=this.clock()
      this.known=true
      this.save()
    }
    // set_spawn_position may arrive BEFORE Mineflayer's spawn event.
    // Preserve the per-session observed bit; constructor resets it on next
    // login/process start instead of hiding valid packet evidence.
  }
  death(){
    if(this.dead)return false
    this.dead=true
    if(!this.known){this.since=this.clock();this.known=true}
    this.deaths++
    this.save();return true
  }
  playerSpawnPacket(packet){
    const coords=personalSpawn(packet)
    if(!coords)return false
    if(!this.known){this.since=this.clock();this.known=true}
    this.respawn=coords;this.respawnObservedThisSession=true
    this.save();return true
  }
  summary(){
    return {deathsSinceTracking:this.deaths,trackingSince:this.since,
      deathCountIsLifetime:false,
      respawnPoint:this.respawn,respawnStatus:this.respawn?
        (this.respawnObservedThisSession?'observed_server_player_spawn_packet':
         'last_observed_prior_session'):'not_verified'}
  }
}
module.exports={LifeObserver,personalSpawn}
