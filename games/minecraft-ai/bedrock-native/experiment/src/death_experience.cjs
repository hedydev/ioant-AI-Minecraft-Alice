'use strict'
const fs=require('node:fs'),path=require('node:path')
const MOBS=new Set(['zombie','husk','drowned','skeleton','stray','bogged',
  'spider','cave_spider','creeper','witch','pillager','ravager',
  'wither_skeleton','phantom','slime','magma_cube','silverfish','endermite',
  'zoglin','hoglin'])
const WINDOW_MS=6*60*60*1000,MAX_RECORDS=32
const points=v=>Number.isFinite(v)&&v>=0&&v<=20?v:null
const safeMob=v=>MOBS.has(v)?v:'unknown'
class DeathExperience {
  constructor({file=null,clock=Date.now,log=console}={}){
    this.file=file;this.clock=clock;this.log=log;this.records=[];this.read()
  }
  read(){
    if(!this.file)return
    try{
      const root=path.dirname(this.file)
      const dir=fs.lstatSync(root,{throwIfNoEntry:false})
      const st=fs.lstatSync(this.file,{throwIfNoEntry:false})
      if(!st)return
      if(!dir?.isDirectory()||dir.isSymbolicLink()||
         (dir.mode&0o077)!==0||dir.uid!==process.getuid()||
         !st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
         st.uid!==process.getuid()||st.size>8192)throw Error('unsafe_death_history')
      const doc=JSON.parse(fs.readFileSync(this.file,'utf8'))
      if(doc?.version!==1||!Array.isArray(doc.records)||
         doc.records.length>MAX_RECORDS)throw Error('invalid_death_history')
      this.records=doc.records.map(r=>{
        if(!Number.isSafeInteger(r.at)||r.at<0||r.mob!==safeMob(r.mob)||
           !['hostile_nearby_unconfirmed','recent_damage_and_hostile_nearby',
             'hunger_exhaustion_possible','cause_unknown'].includes(r.reason)||
           !['observed_proximity','observed_damage_and_proximity','no_attribution'].includes(r.evidence))
          throw Error('invalid_death_entry')
        return {at:r.at,mob:r.mob,reason:r.reason,evidence:r.evidence,
          healthBefore:points(r.healthBefore),food:points(r.food)}
      })
    }catch{
      this.records=[]
      this.log.warn?.('[Alice life] death memory unavailable:', 'invalid_or_unsafe_private_history')
    }
  }
  save(){
    if(!this.file)return
    let temp=null
    try{
      const root=path.dirname(this.file)
      if(fs.lstatSync(root,{throwIfNoEntry:false})?.isSymbolicLink())
        throw Error('unsafe_directory')
      fs.mkdirSync(root,{recursive:true,mode:0o700})
      const dir=fs.lstatSync(root)
      if(!dir.isDirectory()||dir.uid!==process.getuid()||
         (dir.mode&0o077)!==0)throw Error('unsafe_directory')
      const prev=fs.lstatSync(this.file,{throwIfNoEntry:false})
      if(prev&&(prev.isSymbolicLink()||!prev.isFile()||
         prev.uid!==process.getuid()||(prev.mode&0o077)!==0))
        throw Error('unsafe_history')
      temp=path.join(root,'.death-learning-'+process.pid+'-'+this.clock()+'.tmp')
      const fd=fs.openSync(temp,fs.constants.O_CREAT|fs.constants.O_EXCL|
        fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600)
      try{fs.writeSync(fd,JSON.stringify({version:1,records:this.records}))}
      finally{fs.closeSync(fd)}
      fs.renameSync(temp,this.file);temp=null
    }catch{
      this.log.warn?.('[Alice life] death memory write rejected:', 'unsafe_or_unavailable')
    }finally{if(temp){try{fs.unlinkSync(temp)}catch{}}}
  }
  assess(mob){
    const kind=safeMob(mob),now=this.clock()
    const count=kind==='unknown'?0:this.records.filter(r=>r.mob===kind&&
      r.at<=now&&now-r.at<=WINDOW_MS).length
    return {mob:kind,observations:count,repeatedRisk:count>=2,
      strategy:count>=2?'prefer_verified_retreat_over_unconfirmed_attack':'normal_safety_policy'}
  }
  record({nearbyMob='unknown',recentDamage=false,healthBefore=null,food=null}={}){
    const mob=safeMob(nearbyMob)
    const reason=mob!=='unknown'?
      (recentDamage?'recent_damage_and_hostile_nearby':'hostile_nearby_unconfirmed'):
      points(food)===0?'hunger_exhaustion_possible':'cause_unknown'
    const evidence=mob!=='unknown'?(recentDamage?
      'observed_damage_and_proximity':'observed_proximity'):'no_attribution'
    const row={at:this.clock(),mob,reason,evidence,
      healthBefore:points(healthBefore),food:points(food)}
    this.records.push(row)
    if(this.records.length>MAX_RECORDS)this.records=this.records.slice(-MAX_RECORDS)
    this.save()
    return {reason,evidence,verifiedCause:false,kind:mob,...this.assess(mob)}
  }
  summary(){
    const last=this.records.at(-1)
    if(!last)return {observedDeaths:0,lastConclusion:'no_death_evidence',repeatedThreats:[]}
    const now=this.clock(),types=[...new Set(this.records.filter(r=>
      r.at<=now&&now-r.at<=WINDOW_MS&&r.mob!=='unknown').map(r=>r.mob))]
    const repeatedThreats=types.map(m=>this.assess(m)).filter(r=>r.repeatedRisk)
      .sort((a,b)=>b.observations-a.observations).slice(0,3)
      .map(x=>({kind:x.mob,observations:x.observations}))
    return {observedDeaths:this.records.length,lastDeathAt:last.at,
      lastConclusion:last.reason,nearbyMob:last.mob,verifiedCause:false,
      repeatedThreats}
  }
}
module.exports={DeathExperience,WINDOW_MS,MAX_RECORDS}
