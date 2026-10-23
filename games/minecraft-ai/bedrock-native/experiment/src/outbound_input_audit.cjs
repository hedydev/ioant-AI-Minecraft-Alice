'use strict'
// Opt-in, anonymized Bedrock player_auth_input QUEUE audit.
// Crucial distinction: a call to client.queue is NOT proof of network delivery,
// BDS acceptance or real movement. Never stores packet bodies, credentials,
// player identifiers, positions or per-tick input history.
// Only installed when ALICE_BEDROCK_INPUT_AUDIT=1; forwards the identical
// arguments and return/throw behavior to the original queue implementation.
const {SerializedInputProbe}=require('./serialized_input_probe.cjs')
const WINDOW_MS=10000
const finite=n=>typeof n==='number'&&Number.isFinite(n)
function toTick(value){
  if(typeof value==='bigint'&&value>=0n)return value
  if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return BigInt(value)
  if(Array.isArray(value)&&value.length===2&&value.every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff))
    return (BigInt(value[0])<<32n)|BigInt(value[1])
  return null
}
function tickShape(value){
  if(value===undefined||value===null)return 'missing'
  if(typeof value==='bigint')return 'bigint'
  if(typeof value==='number')return 'number'
  if(Array.isArray(value))return 'array'
  return 'unrecognized'
}
function safeDelta(a,b){
  if(a==null||b==null)return null
  const diff=a-b
  return diff<=BigInt(Number.MAX_SAFE_INTEGER)&&diff>=-BigInt(Number.MAX_SAFE_INTEGER)
    ?Number(diff):null
}
function isMoving(packet){
  const v=packet?.move_vector
  if(v&&(finite(v.x)&&v.x!==0||finite(v.z)&&v.z!==0))return true
  const flags=packet?.input_data
  const names=['up','down','left','right','jumping','start_jumping']
  return Array.isArray(flags)?names.some(n=>flags.includes(n))
    :!!flags&&typeof flags==='object'&&names.some(n=>flags[n]===true)
}
function attachOutboundInputAudit(client,{clock=Date.now}={}){
  if(!client||typeof client.on!=='function'||typeof client.queue!=='function')
    throw Error('Bedrock client queue required')
  const original=client.queue
  let loginAt=null,loginTick=null,loginTickShape='missing',total=0,moving=0
  let lastQueuedAt=null,lastTick=null,lastTickStep=null,lastQueueInterval=null
  let lastMovingAt=null,movingBurstCount=0,currentMovingRun=0,maxConsecutiveMovingTicks=0
  let repeats=0,regressions=0,corrections=0,lastCorrectionTick=null
  let serialized=0,serializationErrors=0,transportCalls=0,transportThrows=0
  let lastTransportAt=null,transportHookAttached=false,transportHookState='connection_pending'
  let observedTransport=null,originalTransport=null,tappedTransport=null
  const wireProbe=new SerializedInputProbe()
  let correctionTickShape='missing',closed=false
  const timestamps=[],movingTimestamps=[],serializedTimestamps=[],transportTimestamps=[]
  function trim(now){
    while(timestamps.length&&timestamps[0]<now-WINDOW_MS)timestamps.shift()
    while(movingTimestamps.length&&movingTimestamps[0]<now-WINDOW_MS)movingTimestamps.shift()
    while(serializedTimestamps.length&&serializedTimestamps[0]<now-WINDOW_MS)serializedTimestamps.shift()
    while(transportTimestamps.length&&transportTimestamps[0]<now-WINDOW_MS)transportTimestamps.shift()
  }
  function start(packet){
    // createClient({delayedInit:true}) may not populate client.connection
    // until AFTER the audit is initially installed. At start_game it exists.
    tryAttachTransport()
    loginAt=clock();loginTick=toTick(packet?.current_tick)
    loginTickShape=tickShape(packet?.current_tick)
    total=0;moving=0;lastQueuedAt=null;lastTick=null;lastTickStep=null
    lastQueueInterval=null;repeats=0;regressions=0;corrections=0
    lastMovingAt=null;movingBurstCount=0;currentMovingRun=0;maxConsecutiveMovingTicks=0
    serialized=0;serializationErrors=0;transportCalls=0;transportThrows=0;lastTransportAt=null
    lastCorrectionTick=null;correctionTickShape='missing'
    wireProbe.reset()
    timestamps.length=0;movingTimestamps.length=0;serializedTimestamps.length=0;transportTimestamps.length=0
  }
  function corrected(packet){
    corrections++
    lastCorrectionTick=toTick(packet?.tick)
    correctionTickShape=tickShape(packet?.tick)
  }
  function observe(packet){
    const now=clock(),tick=toTick(packet?.tick)
    total++
    timestamps.push(now)
    if(timestamps.length>512)timestamps.shift()
    if(isMoving(packet)){
      moving++
      movingTimestamps.push(now)
      if(movingTimestamps.length>512)movingTimestamps.shift()
      // Contiguity matters: 17 dispersed moving packets do not represent
      // 17 uninterrupted physical ticks or a successful walk.
      if(tick!==null&&lastTick!==null&&tick-lastTick===1n&&currentMovingRun>0){
        currentMovingRun++
      }else{
        currentMovingRun=1
        movingBurstCount++
      }
      maxConsecutiveMovingTicks=Math.max(maxConsecutiveMovingTicks,currentMovingRun)
      lastMovingAt=now
    }else currentMovingRun=0
    trim(now)
    if(lastQueuedAt!==null)lastQueueInterval=Math.max(0,now-lastQueuedAt)
    lastQueuedAt=now
    if(tick!==null){
      if(lastTick!==null){
        lastTickStep=safeDelta(tick,lastTick)
        if(tick===lastTick)repeats++
        if(tick<lastTick)regressions++
      }
      lastTick=tick
    }
  }
  function tappedQueue(name,params){
    const auth=name==='player_auth_input'&&!closed
    const movingAuth=auth&&isMoving(params)
    const encodedBefore=movingAuth&&Array.isArray(client.sendQ)?client.sendQ.length:null
    if(auth){try{observe(params)}catch{}}
    try{
      const result=original.apply(this,arguments)
      if(auth){
        serialized++
        if(movingAuth){try{wireProbe.capture(client,params,encodedBefore)}catch{}}
        serializedTimestamps.push(clock())
        if(serializedTimestamps.length>512)serializedTimestamps.shift()
      }
      return result
    }catch(err){
      if(auth)serializationErrors++
      throw err
    }
  }
  // Observe RakNet only after the asynchronous protocol client has finished
  // its delayed init. This wrapper never modifies buffer or packet contents,
  // and counts generic sendReliable calls, not BDS acceptance.
  function tryAttachTransport(){
    if(closed||transportHookAttached)return
    const candidate=client.connection
    if(!candidate){transportHookState='connection_pending';return}
    const original=candidate.sendReliable
    if(typeof original!=='function'){transportHookState='method_unavailable';return}
    const tapped=function(){
      if(!closed){
        transportCalls++
        lastTransportAt=clock()
        transportTimestamps.push(lastTransportAt)
        if(transportTimestamps.length>512)transportTimestamps.shift()
      }
      try{return original.apply(this,arguments)}
      catch(err){if(!closed)transportThrows++;throw err}
    }
    // A non-writable native method must not block Alice startup or login.
    try{
      candidate.sendReliable=tapped
      if(candidate.sendReliable!==tapped){
        transportHookState='not_writable'
        return
      }
    }catch{
      transportHookState='not_writable'
      return
    }
    observedTransport=candidate
    originalTransport=original
    tappedTransport=tapped
    transportHookAttached=true
    transportHookState='attached'
  }
  // Covers an already-initialized client and all delayed-init races.
  tryAttachTransport()
  client.on('connect_allowed',tryAttachTransport)
  client.on('start_game',start)
  client.on('correct_player_move_prediction',corrected)
  client.queue=tappedQueue
  function get(){
    // Passive recovery if connect_allowed fired before listener registration.
    tryAttachTransport()
    const now=clock()
    trim(now)
    const elapsed=loginAt===null?null:Math.max(0,now-loginAt)
    const ticksByWall=elapsed===null?null:Math.round(elapsed/50)
    const tickAdvance=safeDelta(lastTick,loginTick)
    return {kind:'queue_only_not_network_or_BDS_proof',
      loginTickShape,loginTickPresent:loginTick!==null,
      queued:total,movingQueued:moving,
      queuedLast10s:timestamps.length,movingLast10s:movingTimestamps.length,
      movingBurstCount,maxConsecutiveMovingTicks,
      currentMovingRun,lastMovingAgeMs:lastMovingAt===null?null:Math.max(0,now-lastMovingAt),
      lastQueueAgeMs:lastQueuedAt===null?null:Math.max(0,now-lastQueuedAt),
      lastQueueIntervalMs:lastQueueInterval,lastTickStep,
      tickAdvance,tickVsExpectedWallTick:tickAdvance===null?null:tickAdvance-ticksByWall,
      repeatedTicks:repeats,regressedTicks:regressions,
      // queue-called and queue-returned are different: serializers can throw.
      serialized,serializationErrors,serializedLast10s:serializedTimestamps.length,
      // RakNet method-call count includes unrelated packet batches.
      transportHookAttached,transportHookState,
      transportCalls,transportLast10s:transportTimestamps.length,
      transportThrows,lastTransportAgeMs:lastTransportAt===null?null:Math.max(0,now-lastTransportAt),
      pendingPacketBuffers:Array.isArray(client.sendQ)?client.sendQ.length:null,
      corrections,correctionTickShape,correctionTickPresent:lastCorrectionTick!==null,
      ...wireProbe.summary()}
  }
  function detach(){
    if(closed)return
    closed=true
    if(client.queue===tappedQueue)client.queue=original
    if(transportHookAttached&&observedTransport?.sendReliable===tappedTransport){
      try{observedTransport.sendReliable=originalTransport}catch{}
    }
    client.off?.('connect_allowed',tryAttachTransport)
    client.off?.('start_game',start)
    client.off?.('correct_player_move_prediction',corrected)
    client.off?.('close',detach)
  }
  client.once('close',detach)
  return {get,detach}
}
module.exports={attachOutboundInputAudit,toTick,isMoving}
