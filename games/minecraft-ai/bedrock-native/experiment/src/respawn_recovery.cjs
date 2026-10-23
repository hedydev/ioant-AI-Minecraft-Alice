'use strict'
// Observes the pinned Bedrock Mineflayer death/respawn flow. One extra
// One bounded, same-session handshake retry after 12s of confirmed death.
// Bedrock ordering is strictly ready request (state=2) -> BDS ReadyToSpawn
// (state=1) -> final player_action:respawn. Do not send final action BEFORE
// the server's ready signal: the pinned upstream suppresses repeat actions
// after its original 5s fallback. No second Xbox login, teleport or loops.
const RETRY_AFTER_MS=12000
const STALLED_AFTER_MS=30000
const activeHealth=bot=>Number.isFinite(bot?.health)&&bot.health>0
function attachRespawnRecovery(bot,{clock=Date.now,schedule=setTimeout,cancel=clearTimeout,
  retryAfterMs=RETRY_AFTER_MS,stalledAfterMs=STALLED_AFTER_MS,log=console}={}){
  if(!bot?._client?.on||!bot?.on)throw Error('respawn_client_unavailable')
  if(!Number.isSafeInteger(retryAfterMs)||retryAfterMs<6000||
     !Number.isSafeInteger(stalledAfterMs)||stalledAfterMs<=retryAfterMs)
    throw Error('respawn_watch_invalid_limits')
  const client=bot._client
  let runtimeId=null,deadSince=null,stage='idle',readySeen=false,retrySent=false,readyRetrySent=false
  let retryTimer=null,stallTimer=null,sessionOpen=true,cycles=0
  const emit=(reason)=>{try{log.log('[Alice life] respawn recovery:',
    JSON.stringify({phase:stage,reason,retrySent,readyRetrySent,
      serverReadyObserved:readySeen}))}catch{}}
  function stopTimers(){
    if(retryTimer!==null){cancel(retryTimer);retryTimer=null}
    if(stallTimer!==null){cancel(stallTimer);stallTimer=null}
  }
  function stillDead(){
    return deadSince!==null&&sessionOpen&&!activeHealth(bot)&&bot.isAlive!==true
  }
  function noteStartGame(packet){if(packet?.runtime_entity_id!=null)runtimeId=packet.runtime_entity_id}
  function noteDeath(){
    if(deadSince!==null||!sessionOpen)return
    deadSince=clock();cycles++;readySeen=false;retrySent=false;readyRetrySent=false
    stage='waiting_for_server_respawn';emit('death_observed')
    retryTimer=schedule(()=>{
      retryTimer=null
      if(!stillDead())return
      if(runtimeId===null||typeof client.queue!=='function'){
        stage='cannot_retry_without_player_runtime_id';emit('no_runtime_id');return
      }
      // If we have no server ReadyToSpawn, only request ready again.
      // The old fallback may have sent its action prematurely. Once BDS
      // actually acknowledges this retry, send one new FINAL action then.
      try{
        if(!readySeen){
          const origin={x:0,y:0,z:0}
          client.queue('respawn',{position:origin,x:0,y:0,z:0,
            state:2,runtime_entity_id:runtimeId})
          readyRetrySent=true
          stage='respawn_ready_retried_waiting_for_server'
          emit('server_ready_not_seen')
        }else{
          retryAction('server_ready_but_health_zero')
        }
      }catch{
        stage='respawn_retry_send_failed';emit('queue_error')
      }
    },retryAfterMs)
    retryTimer?.unref?.()
    stallTimer=schedule(()=>{
      stallTimer=null
      if(!stillDead())return
      stage='respawn_stalled'
      emit(readySeen?'server_ready_without_spawn':'no_server_ready_or_spawn')
    },stalledAfterMs)
    stallTimer?.unref?.()
  }
  function retryAction(reason){
    // Strictly one Alice-owned retry, always on the SAME BDS connection.
    // Pinned Mineflayer's upstream first action (at 5s) is separate.
    if(retrySent||!stillDead()||runtimeId===null||typeof client.queue!=='function')return
    const origin={x:0,y:0,z:0}
    client.queue('player_action',{runtime_entity_id:runtimeId,action:'respawn',
      position:origin,result_position:origin,face:-1})
    retrySent=true
    stage=readyRetrySent?'respawn_action_after_server_ready':
      'respawn_action_retried_once'
    emit(reason)
  }
  function noteReady(packet){
    if(deadSince===null)return
    if(packet?.state===1||packet?.state==='ready_to_spawn'){
      readySeen=true
      if(stage==='waiting_for_server_respawn')stage='server_ready_seen'
      emit('server_ready_to_spawn')
      // This registered handler executes AFTER upstream health.js's own
      // handler. Upstream has sentRespawnAction=true since its 5s fallback,
      // so we must enqueue one final action only after BDS ReadyToSpawn.
      if(readyRetrySent&&!retrySent&&stillDead()){
        try{retryAction('final_action_after_server_ready')}
        catch{
          stage='respawn_retry_send_failed';emit('queue_error')
        }
      }
    }
  }
  function noteHealth(){
    if(deadSince===null)return
    if(activeHealth(bot)){
      stopTimers()
      stage='health_restored_awaiting_spawn'
      emit('positive_health_seen')
    }
  }
  function noteSpawn(){
    if(deadSince===null)return
    stopTimers()
    if(!activeHealth(bot)){
      stage='spawn_without_positive_health'
      emit('spawn_health_not_ready')
      return
    }
    stage='respawn_verified'
    deadSince=null
    emit('spawn_with_positive_health')
  }
  function noteClose(){
    sessionOpen=false
    stopTimers()
    if(deadSince!==null){
      stage='transport_closed_during_respawn'
      emit('transport_closed')
    }
  }
  client.on('start_game',noteStartGame)
  bot.on('death',noteDeath)
  bot.on('health',noteHealth)
  bot.on('spawn',noteSpawn)
  client.on('respawn',noteReady)
  client.on('close',noteClose)
  return {
    get:()=>({phase:stage,deadSeconds:deadSince===null?null:
      Math.max(0,Math.floor((clock()-deadSince)/1000)),
      serverReadyObserved:readySeen,retrySent,readyRetrySent,cycles}),
    stop:()=>{stopTimers();client.off('start_game',noteStartGame)
      bot.off('death',noteDeath);bot.off('health',noteHealth)
      bot.off('spawn',noteSpawn);client.off('respawn',noteReady)
      client.off('close',noteClose)}
  }
}
module.exports={attachRespawnRecovery,RETRY_AFTER_MS,STALLED_AFTER_MS}
