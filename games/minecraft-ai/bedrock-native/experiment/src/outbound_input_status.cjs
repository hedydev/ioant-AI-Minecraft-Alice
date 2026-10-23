'use strict'
// Independent owner-only snapshot for OPTIONAL outbound wire diagnostics.
// Never bypass the existing 4 KiB live status limit or store raw Bedrock
// packets, credentials, gamertags, or Minecraft positions.
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const crypto=require('node:crypto')
const rootDefault=()=>path.join(os.homedir(),'.alice-bedrock-control')
const FILENAME='outbound-input-audit.json'
const MAX_BYTES=2048
const KEYS=Object.freeze([
  'loginTickShape','loginTickPresent','queued','movingQueued',
  'queuedLast10s','movingLast10s','movingBurstCount','maxConsecutiveMovingTicks',
  'currentMovingRun','lastMovingAgeMs','lastQueueAgeMs','lastQueueIntervalMs',
  'lastTickStep','tickAdvance','tickVsExpectedWallTick',
  'repeatedTicks','regressedTicks','serialized','serializationErrors',
  'serializedLast10s','analogCompatEnabled','analogCompatCorrected','analogCompatSkipped',
  'syncEmitted','syncCatchupFrames','syncMaxBatchFrames','syncOverruns',
  'syncSkippedTicks','syncLastBatchFrames','syncControlsChangedInsideFrame',
  'syncCallbackPositionMutationsPrevented','syncCallbackVelocityMutationsPrevented',
  'syncCallbackContactMutationsPrevented',
  'transportHookAttached','transportHookState',
  'transportCalls','transportLast10s','transportThrows',
  'lastTransportAgeMs','pendingPacketBuffers','corrections',
  'correctionTickShape','correctionTickPresent',
  'wireProbeFrames','wireProbeMatched','wireProbeMismatches',
  'wireProbeUnavailable','wireProbeFirstIssue'
])
function compact(data,clock=Date.now){
  if(!data||data.kind!=='queue_only_not_network_or_BDS_proof')
    throw Error('invalid_optional_audit')
  const out={version:1,updatedAt:clock(),kind:'queue_only_not_network_or_BDS_proof'}
  for(const key of KEYS){
    const value=data[key]
    if(value===null||typeof value==='boolean'||
       typeof value==='number'&&Number.isFinite(value)||
       typeof value==='string'&&value.length<=40)out[key]=value
  }
  return out
}
class OutboundInputStatus {
  constructor({root=rootDefault(),clock=Date.now,log=console}={}){
    this.root=root;this.clock=clock;this.log=log;this.lastError=null
  }
  publish(summary){
    try{
      const current=fs.lstatSync(this.root,{throwIfNoEntry:false})
      if(current&&(!current.isDirectory()||current.isSymbolicLink()))
        throw Error('unsafe_audit_directory')
      fs.mkdirSync(this.root,{recursive:true,mode:0o700})
      const file=path.join(this.root,FILENAME)
      const old=fs.lstatSync(file,{throwIfNoEntry:false})
      if(old&&(!old.isFile()||old.isSymbolicLink()))
        throw Error('unsafe_audit_file')
      const data=JSON.stringify(compact(summary,this.clock))
      if(Buffer.byteLength(data)>MAX_BYTES)throw Error('audit_status_too_large')
      const tmp=path.join(this.root,'.outbound-input-'+process.pid+'-'+crypto.randomBytes(4).toString('hex')+'.tmp')
      try{
        fs.writeFileSync(tmp,data,{encoding:'utf8',mode:0o600,flag:'wx'})
        fs.renameSync(tmp,file)
      }finally{
        try{fs.unlinkSync(tmp)}catch(err){if(err.code!=='ENOENT')throw err}
      }
      this.lastError=null
    }catch(err){
      const code=/^[a-z_]{1,60}$/.test(err.message)?err.message:'io_error'
      if(code!==this.lastError)this.log.warn('[Alice input audit] private snapshot unavailable:',code)
      this.lastError=code
    }
  }
}
module.exports={OutboundInputStatus,compact,FILENAME,KEYS}
