'use strict'
// Optional operator-owned, read-only MCSManager/BDS querytarget witness.
// The LLM and Alice dashboard cannot write to this file or invoke console commands.
// Fail closed: no witness means no movement/build proof.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const DEFAULT_FILE=()=>path.join(os.homedir(),'.alice-bedrock-control','bds-position-witness.json')
const validPosition=p=>p&&[p.x,p.y,p.z].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<30000000)
class BdsWitnessReader{
  constructor({file=DEFAULT_FILE(),clock=Date.now,name=()=>null}={}){
    this.file=file;this.clock=clock;this.name=name;this.lastStatus='not_configured'
    this.lastAccepted=null
  }
  poll(evidence){
    if(typeof evidence?.ingestIndependentPosition!=='function')return false
    try{
      const dir=fs.lstatSync(path.dirname(this.file),{throwIfNoEntry:false})
      const st=fs.lstatSync(this.file,{throwIfNoEntry:false})
      if(!dir||!st){this.lastStatus='not_configured';return false}
      if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0||
         dir.uid!==process.getuid()||!st.isFile()||st.isSymbolicLink()||
         (st.mode&0o077)!==0||st.uid!==process.getuid()||st.size>1024){
        this.lastStatus='unsafe_witness_file';return false
      }
      const row=JSON.parse(fs.readFileSync(this.file,'utf8'))
      const id=this.name(),now=this.clock(),s=evidence.get()
      const loginAt=s?.loginAt,lifeAt=s?.lifeEpochAt
      if(row?.version!==1||!['mcsm_querytarget','bds_script_api'].includes(row.source)||
        !/^[A-Za-z0-9_ ]{3,16}$/.test(id||'')||row.gamertag!==id||
        typeof row.serial!=='string'||!/^[0-9]{16,20}$/.test(row.serial)||
        typeof row.uniqueId!=='string'||!/^[-A-Za-z0-9]{8,72}$/.test(row.uniqueId)||
        !validPosition(row.feet)||!Number.isSafeInteger(row.observedAt)||
        !Number.isSafeInteger(loginAt)){
        this.lastStatus='stale_or_invalid_witness';return false
      }
      if(row.observedAt<=loginAt){
        this.lastStatus='prior_login_witness';return false
      }
      if(s?.awaitingVerifiedRespawn===true||
         Number.isSafeInteger(lifeAt)&&row.observedAt<=lifeAt){
        this.lastStatus='prior_life_witness';return false
      }
      if(row.observedAt>now||now-row.observedAt>4000){
        this.lastStatus='expired_witness';return false
      }
      // A 250ms passive poll sees the same file repeatedly. A byte-identical
      // already consumed sample is not a new position, nor an ingestion error.
      // Keep an explicit 'already_consumed' status rather than falsely
      // reporting failure after every successful external query.
      const fingerprint=[row.serial,row.uniqueId,row.observedAt,
        row.feet.x,row.feet.y,row.feet.z,row.source,row.gamertag].join('|')
      if(this.lastAccepted===fingerprint){
        this.lastStatus='already_consumed';return false
      }
      const ok=evidence.ingestIndependentPosition({
        feet:row.feet,serial:row.serial,uniqueId:row.uniqueId,
        observedAt:row.observedAt,source:row.source
      })
      if(ok)this.lastAccepted=fingerprint
      this.lastStatus=ok?'accepted':'duplicate_or_rejected'
      return ok
    }catch{
      this.lastStatus='unavailable';return false
    }
  }
}
module.exports={BdsWitnessReader}
