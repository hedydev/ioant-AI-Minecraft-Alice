'use strict'
// Loop avoidance is not a success claim: an unverified movement endpoint is
// an ATTEMPT, never a visited/server-confirmed waypoint.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const ATTEMPT_HOLD_MS=20*60*1000,CONFIRMED_HOLD_MS=60*60*1000,MAX=48
const routeKey=s=>typeof s==='string'&&/^-?\d+,-?\d+,-?\d+$/.test(s)?s:null
class ExplorationProgress{
 constructor({clock=Date.now,file=null,log=console}={}){
  this.clock=clock;this.file=file;this.log=log;this.rows=[];this.persistenceError=null
  this.load()
 }
 valid(row,now){
  return row&&routeKey(row.key)&&['attempted','confirmed','unverified','blocked'].includes(row.outcome)&&
    Number.isSafeInteger(row.at)&&row.at>=0&&row.at<=now+60000&&
    now-row.at<=CONFIRMED_HOLD_MS
 }
 load(){
  if(!this.file)return
  try{
   const st=fs.lstatSync(this.file)
   if(!st.isFile()||st.isSymbolicLink()||st.size>12288)throw Error('unsafe_exploration_history')
   const parsed=JSON.parse(fs.readFileSync(this.file,'utf8'))
   if(!Array.isArray(parsed))throw Error('invalid_exploration_history')
   this.rows=parsed.filter(row=>this.valid(row,this.clock())).slice(-MAX)
  }catch(e){if(e.code!=='ENOENT')this.persistenceError='read_unavailable'}
 }
 save(){
  if(!this.file)return
  try{
   const dir=path.dirname(this.file)
   if(fs.lstatSync(dir,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('unsafe_progress_directory')
   fs.mkdirSync(dir,{recursive:true,mode:0o700})
   if(fs.lstatSync(this.file,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('unsafe_progress_file')
   const data=JSON.stringify(this.rows)
   if(Buffer.byteLength(data)>12288)throw Error('oversized_progress_history')
   const tmp=path.join(dir,'.alice-progress-'+process.pid+'-'+crypto.randomBytes(4).toString('hex')+'.tmp')
   try{fs.writeFileSync(tmp,data,{mode:0o600,flag:'wx'});fs.renameSync(tmp,this.file)}
   finally{try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
   this.persistenceError=null
  }catch{this.persistenceError='write_unavailable'}
 }
 prune(){
  const now=this.clock()
  this.rows=this.rows.filter(r=>this.valid(r,now)&&
    now-r.at<(r.outcome==='confirmed'?CONFIRMED_HOLD_MS:ATTEMPT_HOLD_MS)).slice(-MAX)
 }
 attempt(candidate){
  const key=routeKey(candidate?.key)
  if(!key)return null
  this.prune()
  this.rows=this.rows.filter(r=>r.key!==key)
  const row={key,at:this.clock(),outcome:'attempted'}
  this.rows.push(row);this.save()
  return row
 }
 finish(candidate,result){
  const key=routeKey(candidate?.key)
  if(!key)return null
  this.prune()
  // A server-looking numeric field alone is insufficient: require provenance.
  const confirmed=result?.ok===true&&result?.confirmedEndpoint===key&&
    result?.serverMovementVerified===true&&
    Number.isFinite(result?.serverMovedBlocks)&&result.serverMovedBlocks>=.25
  const status=confirmed?'confirmed':
    result?.attempted===false?'blocked':'unverified'
  const old=this.rows.find(r=>r.key===key)
  if(old)old.outcome=status
  else this.rows.push({key,at:this.clock(),outcome:status})
  this.rows=this.rows.slice(-MAX);this.save()
  return {key,outcome:status,serverMovementVerified:confirmed}
 }
 excluded(){
  this.prune()
  return new Set(this.rows.map(r=>r.key))
 }
 summary(){
  this.prune()
  const counts={attempted:0,unverified:0,blocked:0,confirmed:0}
  for(const r of this.rows)counts[r.outcome]++
  return {entries:this.rows.length,excludedEndpoints:this.rows.length,
    ...counts,persistenceError:this.persistenceError,
    trust:'attempted_is_not_server_verified'}
 }
}
module.exports={ExplorationProgress,ATTEMPT_HOLD_MS}
