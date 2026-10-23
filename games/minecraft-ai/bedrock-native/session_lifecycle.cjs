'use strict'
// One bounded, observable shutdown path for both Bedrock Alice launchers.
// Pinned Mineflayer bot.end() calls bedrock-protocol.close(), NOT disconnect().
// Sending a disconnect request is better than silently closing the transport,
// but client 'close' is NOT authoritative proof that BDS released the player.
function installSignalShutdown({client,stop,log=console,signals=process,timeoutMs=3000,
  later=setTimeout,cancel=clearTimeout}={}){
  if(!client||typeof client.once!=='function'||typeof client.disconnect!=='function')
    throw Error('Bedrock client with disconnect() required')
  if(typeof stop!=='function')throw Error('Alice stop callback required')
  let stopping=false,closed=false,timer=null
  const onClose=()=>{
    closed=true
    if(timer!==null){cancel(timer);timer=null}
  }
  client.once('close',onClose)
  const shutdown=signal=>{
    if(stopping)return false
    stopping=true
    log.log('[Alice shutdown] requested:',signal,'(BDS session release unverified)')
    try{stop()}catch(err){log.error('[Alice shutdown] stopping controllers:',err.message)}
    try{
      if(!closed)client.disconnect('Alice stopped by operator')
    }catch(err){
      log.error('[Alice shutdown] protocol disconnect failed:',err.message)
      try{client.close()}catch(e){log.error('[Alice shutdown] local close failed:',e.message)}
    }
    if(!closed){
      timer=later(()=>{
        timer=null
        if(closed)return
        log.warn('[Alice shutdown] local close timeout; closing transport only (BDS session unknown)')
        try{client.close()}catch(err){log.error('[Alice shutdown] local close failed:',err.message)}
      },timeoutMs)
    }
    return true
  }
  const onInt=()=>shutdown('SIGINT')
  const onTerm=()=>shutdown('SIGTERM')
  signals.once('SIGINT',onInt)
  signals.once('SIGTERM',onTerm)
  return {
    shutdown,
    getState:()=>({stopping,closed}),
    dispose:()=>{
      signals.removeListener('SIGINT',onInt)
      signals.removeListener('SIGTERM',onTerm)
      client.removeListener('close',onClose)
      if(timer!==null){cancel(timer);timer=null}
    }
  }
}
module.exports={installSignalShutdown}
