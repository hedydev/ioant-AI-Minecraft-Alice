'use strict'
// Bed interaction does not imply success. Only the personal spawn packet does.
const fs=require('node:fs'),path=require('node:path')
const {personalSpawn}=require('./life_observer.cjs')
const {finishShortMultiplayerRest}=require('./life_actions.cjs')
const {scoutStartProof}=require('./scout_start_proof.cjs')
const valid=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
const bed=n=>typeof n==='string'&&(n==='bed'||n.endsWith('_bed'))
const wait=ms=>new Promise(r=>setTimeout(r,ms))
function selectAdjacentBed(bot,positions,{radius=12}={}){
 const self=bot?.entity?.position
 if(!valid(self)||bot?.game?.dimension!=='overworld'||typeof bot?.blockAt!=='function')
  return {bed:null,reason:'bed_world_unverified'}
 let tooFar=false
 for(const p of (Array.isArray(positions)?positions:[]).filter(valid)
   .sort((a,b)=>dist(self,a)-dist(self,b))){
  if(dist(self,p)>radius)continue
  let b,meta
  try{
   b=bot.blockAt(typeof self.offset==='function'?
     self.offset(p.x-self.x,p.y-self.y,p.z-self.z):p)
   if(bed(b?.name))meta=bot.parseBedMetadata?.(b)
  }catch{continue}
  if(!bed(b?.name)||!valid(b.position)||meta?.occupied!==0)continue
  if(dist(self,b.position)>1.95){tooFar=true;continue}
  if(typeof bot.activateBlock!=='function')
   return {bed:null,reason:'bed_activation_unavailable'}
  return {bed:b,reason:'loaded_free_bed_in_reach'}
 }
 return {bed:null,reason:tooFar?'bed_needs_verified_approach':'no_loaded_free_bed'}
}
async function useBedForSpawn(bot,block,{evidence,clock=Date.now,signal,
 safe=()=>true,sleep=wait,timeoutMs=1800}={}){
 const fail=(reason,attempted=false,rest=null)=>({ok:false,reason,attempted,
   serverConfirmed:false,rest})
 if(signal?.aborted||!safe())return fail('preempted')
 if(bot?.game?.dimension!=='overworld'||!valid(bot?.entity?.position)||
   !valid(block?.position)||dist(bot.entity.position,block.position)>1.95||
   !bed(block?.name))return fail('not_adjacent_verified_bed')
 const proof=scoutStartProof(bot,evidence,clock)
 if(!proof.ok)return fail(proof.reason)
 const selected=selectAdjacentBed(bot,[block.position],{radius:2})
 if(!selected.bed)return fail(selected.reason)
 const client=bot._client
 if(typeof client?.on!=='function'||typeof client?.removeListener!=='function')
  return fail('spawn_packet_api_missing')
 let ack=null,active=true
 const listener=p=>{
  if(!active)return
  const pos=personalSpawn(p)
  if(pos&&dist(pos,block.position)<=2.5)ack=pos
 }
 client.on('set_spawn_position',listener)
 let attempted=false,rest=null
 try{
  if(signal?.aborted||!safe())return fail('preempted')
  attempted=true
  await Promise.race([
   Promise.resolve().then(()=>bot.activateBlock(selected.bed)),
   sleep(1300).then(()=>{throw Error('timeout')})
  ]).catch(()=>{})
  const until=clock()+timeoutMs
  while(!ack&&clock()<until){
   if(signal?.aborted||!safe())return fail('preempted',attempted)
   await sleep(90)
  }
  // At night activation can enter bed; if peers are online wake after
  // observed entry. Resetting insomnia does NOT require skipping night.
  if(bot.isSleeping===true)
   rest=await finishShortMultiplayerRest(bot,{signal,sleep})
  return ack?{ok:true,attempted:true,serverConfirmed:true,
    reason:'bed_personal_spawn_packet_confirmed',bed:block.position,spawn:ack,rest}:
    fail('bed_spawn_packet_unconfirmed',attempted,rest)
 }finally{active=false;client.removeListener('set_spawn_position',listener)}
}
class HomeBedMemory{
 constructor({file=null,clock=Date.now}={}){
  this.file=file;this.clock=clock;this.currentSession=false;this.record=null
  if(file)try{
   const st=fs.lstatSync(file,{throwIfNoEntry:false})
   if(st?.isFile()&&!st.isSymbolicLink()&&st.size<1024&&!(st.mode&0o077)){
    const d=JSON.parse(fs.readFileSync(file,'utf8'))
    if(d?.version===1&&valid(d.bed)&&d.dimension==='overworld'&&
       Number.isSafeInteger(d.confirmedAt))this.record=d
   }
  }catch{}
 }
 confirm(result){
  if(!result?.serverConfirmed||!valid(result.bed)||!valid(result.spawn)||
     dist(result.bed,result.spawn)>2.5)return false
  this.record={version:1,dimension:'overworld',
    bed:{x:Math.floor(result.bed.x),y:Math.floor(result.bed.y),z:Math.floor(result.bed.z)},
    confirmedAt:this.clock()}
  this.currentSession=true
  if(this.file)try{
   const dir=path.dirname(this.file)
   if(fs.lstatSync(dir,{throwIfNoEntry:false})?.isSymbolicLink()||
      fs.lstatSync(this.file,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('unsafe_file')
   fs.mkdirSync(dir,{recursive:true,mode:0o700})
   const tmp=path.join(dir,'.home-bed-'+process.pid+'.tmp')
   fs.writeFileSync(tmp,JSON.stringify(this.record),{mode:0o600})
   fs.renameSync(tmp,this.file)
  }catch{}
  return true
 }
 summary(){return {status:!this.record?'not_verified':
   this.currentSession?'server_confirmed_current_session':'previous_server_confirmation',
   bed:this.record?.bed||null,shelter:'room_and_return_route_not_verified'}}
}
module.exports={selectAdjacentBed,useBedForSpawn,HomeBedMemory}
