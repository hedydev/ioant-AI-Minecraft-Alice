'use strict'
// Acknowledge ACCEPTED BDS source samples at the 250ms reader cadence.
// This is a private, local metadata receipt for the already-authorized
// operator-side MCSManager client. No world/command/network operations.
// A proof is valid only for the instant of the accepted sample, never a
// perpetual admission grant or a replacement for scoutStartProof.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto')
const {scoutStartProof}=require('./scout_start_proof.cjs')
const DEFAULT_ROOT=()=>path.join(os.homedir(),'.alice-bedrock-control')
function writeWitnessAck({bot,evidence,root=DEFAULT_ROOT(),clock=Date.now,
    producerStartToken=null,pid=process.pid}={}){
 const e=evidence?.get?.(),now=clock()
 if(!e||!Number.isSafeInteger(e.loginAt)||!Number.isSafeInteger(e.independentAt)||
    !Number.isSafeInteger(e.independentSamples)||e.independentSamples<1||
    e.independentAt<=e.loginAt||now<e.independentAt||now-e.independentAt>4000||
    e.awaitingVerifiedRespawn===true||
    Number.isSafeInteger(e.lifeEpochAt)&&e.independentAt<=e.lifeEpochAt||
    !['bds_querytarget','bds_script_api','bds_stable_actionbar'].includes(e.independentSource)||
    !Number.isSafeInteger(pid)||pid<=0||typeof producerStartToken!=='string'||
    !/^[A-Za-z0-9_:-]{1,96}$/.test(producerStartToken))return false
 const d=fs.lstatSync(root,{throwIfNoEntry:false})
 if(!d||!d.isDirectory()||d.isSymbolicLink()||d.uid!==process.getuid()||
    (d.mode&0o077)!==0)return false
 const target=path.join(root,'bds-witness-ack.json')
 const prev=fs.lstatSync(target,{throwIfNoEntry:false})
 if(prev&&(prev.isSymbolicLink()||!prev.isFile()||prev.uid!==process.getuid()||
      (prev.mode&0o077)!==0))return false
 const proof=scoutStartProof(bot,evidence,clock)
 const v={version:1,writerPid:pid,producerStartToken,
   independentSamples:e.independentSamples,independentAt:e.independentAt,
   loginAt:e.loginAt,lifeEpochAt:Number.isSafeInteger(e.lifeEpochAt)?e.lifeEpochAt:null,
   source:e.independentSource,positionGateSatisfied:proof.ok===true}
 const raw=JSON.stringify(v)
 if(Buffer.byteLength(raw)>420)return false
 const tmp=path.join(root,'.bds-ack-'+pid+'-'+crypto.randomBytes(6).toString('hex'))
 try{
  fs.writeFileSync(tmp,raw,{encoding:'utf8',mode:0o600,flag:'wx'})
  fs.renameSync(tmp,target)
  return true
 }finally{
  try{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}catch{}
 }
}
module.exports={writeWitnessAck}
