'use strict'
// Real event-time timestamps for native Bedrock production stdout/stderr.
// Prefix original bytes at each line boundary; never parse or retain log
// content and never touch sockets, auth, the world or Node warning settings.
const pad=(n,len=2)=>String(n).padStart(len,'0')
function localStamp(date=new Date()){
  const offset=-date.getTimezoneOffset(),sign=offset>=0?'+':'-'
  const absolute=Math.abs(offset)
  return pad(date.getFullYear(),4)+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+
    'T'+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds())+
    '.'+pad(date.getMilliseconds(),3)+sign+pad(Math.floor(absolute/60))+':'+pad(absolute%60)
}
function prefixStream(stream,{now=()=>new Date(),pid=process.pid}={}){
  if(!stream||typeof stream.write!=='function')throw Error('timestamp_stream_unavailable')
  const original=stream.write.bind(stream)
  let atStart=true
  stream.write=function(chunk,encoding,callback){
    if(typeof encoding==='function'){callback=encoding;encoding=undefined}
    // All production logging is UTF-8. Preserve source bytes, including
    // split multi-byte code points and native Node warning output.
    const bytes=Buffer.isBuffer(chunk)?chunk:
      Buffer.from(chunk,typeof encoding==='string'?encoding:'utf8')
    if(!bytes.length)return original(bytes,callback)
    const parts=[]
    let start=0
    for(let i=0;i<bytes.length;i++){
      if(atStart){
        parts.push(Buffer.from('['+localStamp(now())+' PID='+pid+'] ','utf8'))
        atStart=false
      }
      if(bytes[i]===10){
        parts.push(bytes.subarray(start,i+1))
        start=i+1
        atStart=true
      }
    }
    if(start<bytes.length)parts.push(bytes.subarray(start))
    return original(Buffer.concat(parts),callback)
  }
  return ()=>{stream.write=original}
}
function installProductionTimestamps(options={}){
  const restoreOut=prefixStream(options.stdout||process.stdout,options)
  const restoreErr=prefixStream(options.stderr||process.stderr,options)
  return ()=>{restoreOut();restoreErr()}
}
module.exports={localStamp,prefixStream,installProductionTimestamps}
