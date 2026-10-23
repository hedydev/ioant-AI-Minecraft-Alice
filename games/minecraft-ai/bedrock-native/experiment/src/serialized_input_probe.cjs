'use strict'
// Opt-in, first-moving-burst-only encoder roundtrip audit. Raw Buffers and
// decoded packets are never stored or logged; only fixed error codes leave memory.
const MAX_PROBES=32
const num=n=>typeof n==='number'&&Number.isFinite(n)
const tick=v=>{
  if(typeof v==='bigint'&&v>=0n)return v
  if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)return BigInt(v)
  if(Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))
    return (BigInt(v[0])<<32n)|BigInt(v[1])
  return null
}
const close=(a,b)=>num(a)&&num(b)&&Math.abs(a-b)<=0.0001
const vec=(a,b,axes)=>a&&b&&axes.every(k=>close(a[k],b[k]))
const flags=v=>{
  if(Array.isArray(v)&&v.every(k=>typeof k==='string'))return [...new Set(v)].sort()
  if(v&&typeof v==='object'&&!Array.isArray(v))return Object.keys(v).filter(k=>v[k]===true).sort()
  return null
}
function compare(expected,actual){
  if(!actual||typeof actual!=='object')return 'unexpected_packet'
  if(tick(expected.tick)===null||tick(actual.tick)!==tick(expected.tick))return 'tick_mismatch'
  const x=flags(expected.input_data),y=flags(actual.input_data)
  if(!x||!y||x.length!==y.length||x.some((name,i)=>name!==y[i]))return 'flags_mismatch'
  for(const k of ['move_vector','raw_move_vector','analogue_move_vector'])
    if(!vec(expected[k],actual[k],['x','z']))return k==='move_vector'?'move_mismatch':
      k==='raw_move_vector'?'raw_mismatch':'analog_mismatch'
  if(!vec(expected.position,actual.position,['x','y','z']))return 'position_mismatch'
  if(!vec(expected.delta,actual.delta,['x','y','z']))return 'velocity_mismatch'
  if(!close(expected.yaw,actual.yaw)||!close(expected.pitch,actual.pitch))return 'rotation_mismatch'
  return null
}
function decodeProbe(client,expected,queueLengthBefore){
  // Only decode the newly serialized outbound player_auth_input Buffer.
  const q=client?.sendQ
  if(!Array.isArray(q)||!Number.isSafeInteger(queueLengthBefore)||
      q.length!==queueLengthBefore+1||!Buffer.isBuffer(q[q.length-1]))
    return 'queue_unavailable'
  const deserializer=client?.deserializer
  if(typeof deserializer?.parsePacketBuffer!=='function')return 'decoder_unavailable'
  try{
    const parsed=deserializer.parsePacketBuffer(q[q.length-1])?.data
    if(parsed?.name!=='player_auth_input')return 'unexpected_packet'
    return compare(expected,parsed.params)||'matched'
  }catch{return 'decode_error'}
}
class SerializedInputProbe{
  constructor(){this.reset()}
  reset(){this.count=0;this.matched=0;this.errors=0;this.unavailable=0;
    this.firstIssue=null}
  capture(client,packet,queueLengthBefore){
    if(this.count>=MAX_PROBES)return
    this.count++
    const result=decodeProbe(client,packet,queueLengthBefore)
    if(result==='matched')this.matched++
    else if(result==='queue_unavailable'||result==='decoder_unavailable')this.unavailable++
    else this.errors++
    if(result!=='matched'&&this.firstIssue===null)this.firstIssue=result
  }
  summary(){return {wireProbeFrames:this.count,wireProbeMatched:this.matched,
    wireProbeMismatches:this.errors,wireProbeUnavailable:this.unavailable,
    wireProbeFirstIssue:this.firstIssue}}
}
module.exports={SerializedInputProbe,compare,decodeProbe,MAX_PROBES}
