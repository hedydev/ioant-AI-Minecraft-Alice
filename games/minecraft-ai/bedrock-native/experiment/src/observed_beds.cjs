'use strict'
// A bed is an observed landmark, not a recurring autonomous goal.
// Remember up to 32 coordinates privately; revalidate loaded Bedrock blocks
// and sleeping safety at use time. Never create beds or claim a respawn point.
const fs=require('node:fs'),path=require('node:path')
const LIMIT=32,SCAN_INTERVAL_MS=60000
const bed=n=>typeof n==='string'&&(n==='bed'||n.endsWith('_bed'))
const cell=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)?
  {x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)}:null
const dimension=bot=>String(bot?.game?.dimension||'unknown')
class ObservedBeds{
 constructor({file=null,clock=Date.now,log=console}={}){
  this.file=file;this.clock=clock;this.log=log
  this.records=[];this.nextScanAt=Number.NEGATIVE_INFINITY
  if(file)this.load()
 }
 load(){
  try{
   const s=fs.lstatSync(this.file,{throwIfNoEntry:false})
   if(!s)return
   if(!s.isFile()||s.isSymbolicLink()||s.size>4096)throw Error('unsafe_bed_memory')
   const data=JSON.parse(fs.readFileSync(this.file,'utf8'))
   if(data?.version!==1||!Array.isArray(data.beds)||data.beds.length>LIMIT)throw Error('invalid_bed_memory')
   this.records=data.beds.filter(r=>r&&typeof r.dimension==='string'&&
     /^[a-z0-9_]{1,30}$/.test(r.dimension)&&cell(r.position)&&
     [r.position.x,r.position.y,r.position.z].every(Number.isSafeInteger)&&
     Number.isSafeInteger(r.seenAt)&&r.seenAt>0).slice(0,LIMIT)
  }catch(e){this.log.warn('[Alice bed memory] unavailable:',String(e.message).slice(0,55))}
 }
 save(){
  if(!this.file)return
  try{
   const dir=path.dirname(this.file)
   if(fs.lstatSync(dir,{throwIfNoEntry:false})?.isSymbolicLink()||
      fs.lstatSync(this.file,{throwIfNoEntry:false})?.isSymbolicLink())
      throw Error('unsafe_bed_memory_path')
   fs.mkdirSync(dir,{recursive:true,mode:0o700})
   const tmp=path.join(dir,'.observed-beds-'+process.pid+'.tmp')
   fs.writeFileSync(tmp,JSON.stringify({version:1,beds:this.records}),{mode:0o600})
   fs.renameSync(tmp,this.file)
  }catch(e){this.log.warn('[Alice bed memory] write failed:',String(e.message).slice(0,55))}
 }
 observe(bot){
  const now=this.clock()
  if(now<this.nextScanAt)return {changed:false,reason:'scan_not_due'}
  this.nextScanAt=now+SCAN_INTERVAL_MS
  const here=bot?.entity?.position,dim=dimension(bot)
  if(!cell(here)||dim!=='overworld'||typeof bot.findBlocks!=='function'||
     typeof bot.blockAt!=='function')return {changed:false,reason:'scan_unavailable'}
  let found
  try{found=bot.findBlocks({matching:b=>bed(b?.name),maxDistance:12,count:24})||[]}
  catch{return {changed:false,reason:'scan_failed'}}
  let added=0
  for(const point of found.slice(0,24)){
   const pos=cell(point)
   if(!pos||Math.hypot(pos.x+.5-here.x,pos.y-here.y,pos.z+.5-here.z)>13)continue
   let block
   try{block=bot.blockAt(point)}catch{}
   if(!bed(block?.name))continue
   const current=this.records.find(r=>r.dimension===dim&&
     r.position.x===pos.x&&r.position.y===pos.y&&r.position.z===pos.z)
   if(current){current.seenAt=now;continue}
   this.records.push({dimension:dim,position:pos,seenAt:now});added++
  }
  this.records.sort((a,b)=>b.seenAt-a.seenAt)
  if(this.records.length>LIMIT)this.records.length=LIMIT
  if(added>0){
   this.save()
   this.log.log('[Alice bed memory] observed:',JSON.stringify({newBeds:added,
     knownBeds:this.records.length,source:'observed_world_blocks'}))
  }
  return {changed:added>0,added,known:this.records.length}
 }
 nearby(bot,{radius=12}={}){
  const here=bot?.entity?.position,dim=dimension(bot)
  if(!cell(here)||typeof bot?.blockAt!=='function')return []
  return this.records.filter(r=>r.dimension===dim&&
    Math.hypot(r.position.x+.5-here.x,r.position.y-here.y,
      r.position.z+.5-here.z)<=radius)
   .filter(r=>{
     const q=r.position
     try{
       const at=typeof here.offset==='function'?
         here.offset(q.x-here.x,q.y-here.y,q.z-here.z):q
       return bed(bot.blockAt(at)?.name)
     }catch{return false}
   }).map(r=>({...r.position}))
 }
 summary(){return {knownBeds:this.records.length}}
}
module.exports={ObservedBeds,SCAN_INTERVAL_MS}
