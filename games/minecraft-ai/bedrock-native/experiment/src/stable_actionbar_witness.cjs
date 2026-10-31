'use strict'
// The channel is BDS -> Alice only: dedicated-server stable Script API
// sends a SetTitlePacket/Actionbar, NOT player chat or client physics.
// OFF unless an owner-only opt-in config is installed after production pack
// registration and live packet verification. No filesystem writes/queries.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const PACK='37ac86b0-11b0-4505-b15d-989d7ff5b10b'
const FILE=()=>path.join(os.homedir(),'.alice-bedrock-control','bds-stable-actionbar-enabled.json')
const BOOT=/^[a-z0-9]{6,16}-[a-z0-9]{7,16}$/
const UID=/^[A-Za-z0-9-]{8,72}$/
const MAX_BYTES=512
function readConfig(file,name){
  try{
    const dir=fs.lstatSync(path.dirname(file),{throwIfNoEntry:false})
    const st=fs.lstatSync(file,{throwIfNoEntry:false})
    if(!dir||!st||!dir.isDirectory()||dir.isSymbolicLink()||
      dir.uid!==process.getuid()||(dir.mode&0o077)!==0||
      !st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
      (st.mode&0o077)!==0||st.size>512)return null
    const v=JSON.parse(fs.readFileSync(file,'utf8'))
    if(!v||Object.keys(v).sort().join(',')!=='enabled,gamertag,packUuid,version'||
      v.version!==1||v.enabled!==true||v.packUuid!==PACK||
      v.gamertag!==name||!/^[A-Za-z0-9_ ]{3,16}$/.test(name||''))return null
    return v
  }catch{return null}
}
function parsePacket(packet,now){
  // The client-bound SetTitlePacket 88 in protocol 2193 encodes
  // Actionbar TitleType=4. Reject player-chat/TextPacket and other titles.
  const kind=packet?.type??packet?.title_type
  if(kind!==4&&kind!=='actionbar'&&kind!=='Actionbar')return null
  const raw=packet?.text??packet?.title_text
  if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX_BYTES)return null
  const parts=raw.split('|')
  if(parts.length!==8||parts[0]!=='ALICE_BDS_STABLE_V1')return null
  const [,boot,seqStr,atStr,id,x,y,z]=parts
  if(!BOOT.test(boot)||!/^[1-9][0-9]{0,5}$/.test(seqStr)||
     !/^[1-9][0-9]{12}$/.test(atStr)||!UID.test(id))return null
  const at=Number(atStr),seq=Number(seqStr)
  if(!Number.isSafeInteger(at)||at>now||now-at>4000)return null
  const coords=[x,y,z].map(s=>s.length<=28&&s.length>0?Number(s):NaN)
  if(coords.some(n=>!Number.isFinite(n)||Math.abs(n)>=30000000))return null
  return {source:'bds_stable_actionbar',observedAt:at,
    uniqueId:id,serial:(BigInt(at)*1000000n+BigInt(seq)).toString(),
    feet:{x:coords[0],y:coords[1],z:coords[2]}}
}
function attachStableActionbarWitness(client,{file=FILE(),name=()=>null,
  evidence,clock=Date.now,onAccepted=()=>{}}={}){
  let status='not_configured',enabled=false
  const cfg=readConfig(file,name())
  if(!cfg)return {get:()=>({enabled,status}),detach:()=>{}}
  enabled=true;status='configured_awaiting_packet'
  const onPacket=packet=>{
    const parsed=parsePacket(packet,clock())
    if(!parsed)return
    const ok=evidence?.ingestIndependentPosition?.(parsed)===true
    status=ok?'accepted':'duplicate_or_rejected'
    if(ok)onAccepted()
  }
  client.on('set_title',onPacket)
  const detach=()=>client.off('set_title',onPacket)
  client.once('close',detach)
  return {get:()=>({enabled,status}),detach}
}
module.exports={attachStableActionbarWitness,readConfig,parsePacket,PACK}
