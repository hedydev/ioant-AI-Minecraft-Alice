'use strict'
// Bedrock server-origin self-position evidence. Never treats client physics as proof.
// Observes packets without injecting, wrapping, or changing network/auth logic.
function finitePos(p){return !!p&&[p.x,p.y,p.z].every(Number.isFinite)}
function copy(p){return {x:p.x,y:p.y,z:p.z}}
function round(n){return Math.round(n*100)/100}
function attachMovementEvidence(client,{clock=Date.now,eyeHeight=()=>1.62}={}){
  if(!client||typeof client.on!=='function')throw Error('Bedrock client required')
  let ownRuntimeId=null,events=0,packets=0,independentSamples=0,last=null,lastAt=0,distance=0,lastSource=null
  let lastIndependentSerial=null,independentUniqueId=null
  let independentLatestFeet=null,independentAt=null,independentSource=null
  // Independent BDS samples have a separate motion ledger. Ordinary
  // correction/self-move packets must NEVER inflate this distance.
  let independentTravel=0,independentPreviousAt=null,independentPairTravel=null
  let serverTick=null,authority=null,rewindHistory=null,closed=false
  let loginFeet=null,loginAt=null
  // start_game pins the transport login; Bedrock death does NOT emit another
  // start_game. Separate life epochs prevent a recent pre-death witness file
  // from being replayed as a new-life sample immediately after respawn.
  let lifeEpochAt=null,awaitingVerifiedRespawn=false
  function record(pos,source,tick=null,observedAt=clock(),alreadyFeet=false){
    if(closed||!finitePos(pos))return
    const y=alreadyFeet?pos.y:pos.y-(Number.isFinite(eyeHeight())?eyeHeight():1.62)
    const next={x:pos.x,y,z:pos.z}
    if(last){const step=Math.hypot(next.x-last.x,next.y-last.y,next.z-last.z)
      if(Number.isFinite(step)&&step<32)distance+=step}
    last=next;lastAt=observedAt;events++;lastSource=source
    if(['bds_querytarget','bds_script_api','bds_stable_actionbar'].includes(source))independentSamples++
    else packets++
    if(tick!=null){try{serverTick=String(tick).slice(0,32)}catch{}}
  }
  const onStart=p=>{
    // A second login without a trusted position must not inherit the last
    // session's valid login timestamp or baseline.
    loginFeet=null;loginAt=null
    lifeEpochAt=null;awaitingVerifiedRespawn=false
    // start_game.player_position is supplied by the SERVER for THIS login.
    // It establishes only the session's initial position. It is NOT proof
    // that subsequent client-predicted walking was accepted or persisted.
    const initial=p?.player_position??p?.spawn
    if(finitePos(initial)){
      const height=Number.isFinite(eyeHeight())?eyeHeight():1.62
      loginFeet={x:round(initial.x),y:round(initial.y-height),z:round(initial.z)}
      loginAt=clock()
    }
    // A fresh Bedrock login invalidates every old movement checkpoint and
    // external identity; one new observation cannot reuse a prior session's
    // evidence to authorize world modifications.
    events=0;packets=0;independentSamples=0;last=null;lastAt=0
    distance=0;lastSource=null;serverTick=null
    lastIndependentSerial=null;independentUniqueId=null
    independentLatestFeet=null;independentAt=null;independentSource=null
    independentTravel=0;independentPreviousAt=null;independentPairTravel=null
    ownRuntimeId=p?.runtime_entity_id==null?null:String(p.runtime_entity_id)
    authority=typeof p?.movement_authority==='string'?p.movement_authority.slice(0,24):null
    rewindHistory=Number.isInteger(p?.rewind_history_size)?p.rewind_history_size:null
  }
  const onCorrection=p=>record(p?.position,'correct_player_move_prediction',p?.tick)
  const onMove=p=>{
    const id=p?.runtime_id??p?.runtime_entity_id
    if(ownRuntimeId!==null&&id!=null&&String(id)===ownRuntimeId)
      record(p?.position,'self_move_player',null)
  }
  // The independent reader validates private-file provenance and the exact
  // gamertag. Here additionally pin the BDS uniqueId for this login and
  // enforce monotonic samples; one replay cannot create false travel.
  function ingestIndependentPosition(sample){
    if(closed||!loginAt||awaitingVerifiedRespawn||
       lifeEpochAt!==null&&sample?.observedAt<=lifeEpochAt||
       !['mcsm_querytarget','bds_script_api','bds_stable_actionbar'].includes(sample?.source)||!finitePos(sample.feet)||
       typeof sample.uniqueId!=='string'||!/^[-A-Za-z0-9]{8,72}$/.test(sample.uniqueId)||
       typeof sample.serial!=='string'||!/^[0-9]{16,20}$/.test(sample.serial)||
       !Number.isSafeInteger(sample.observedAt)||sample.observedAt<=loginAt||
       sample.observedAt>clock()||clock()-sample.observedAt>4000)return false
    if(lastIndependentSerial!==null&&BigInt(sample.serial)<=BigInt(lastIndependentSerial))return false
    if(independentUniqueId!==null&&independentUniqueId!==sample.uniqueId)return false
    // Both serial and observation time must move strictly forwards. A newer
    // serial containing a replayed timestamp is not a new temporal sample.
    if(independentAt!==null&&sample.observedAt<=independentAt)return false
    if(independentLatestFeet!==null){
      independentPreviousAt=independentAt
      const step=Math.hypot(
        sample.feet.x-independentLatestFeet.x,
        sample.feet.y-independentLatestFeet.y,
        sample.feet.z-independentLatestFeet.z)
      // A large jump could be a teleport or a respawn; do not call it walking.
      independentPairTravel=Number.isFinite(step)&&step<32?step:null
      if(independentPairTravel!==null)independentTravel+=independentPairTravel
    }
    independentUniqueId=sample.uniqueId;lastIndependentSerial=sample.serial
    independentLatestFeet=copy(sample.feet);independentAt=sample.observedAt
    independentSource=sample.source==='bds_stable_actionbar'?'bds_stable_actionbar':
      sample.source==='bds_script_api'?'bds_script_api':'bds_querytarget'
    record(sample.feet,independentSource,null,sample.observedAt,true)
    return true
  }
  // Respawn does not emit start_game on the existing Bedrock transport.
  // Old-life BDS witness pairs cannot authorize post-death navigation.
  function beginRespawnEpoch(){
    lifeEpochAt=clock();awaitingVerifiedRespawn=true
    independentSamples=0;lastIndependentSerial=null;independentUniqueId=null
    independentLatestFeet=null;independentAt=null;independentPreviousAt=null
    independentSource=null;independentPairTravel=null;independentTravel=0
    last=null;lastAt=0;lastSource=null;events=0;packets=0;distance=0
  }
  function completeRespawnEpoch(){
    // Only the post-death Bedrock spawn event with positive health may call
    // this. Mark the new life boundary HERE, not at death or the pre-spawn
    // ReadyToSpawn/health packet; all earlier server samples stay forbidden.
    if(closed||!awaitingVerifiedRespawn||!loginAt)return false
    const now=clock()
    if(now<lifeEpochAt)return false
    lifeEpochAt=now;awaitingVerifiedRespawn=false
    return true
  }
  const onClose=()=>{closed=true;detach()}
  function detach(){
    client.off?.('start_game',onStart)
    client.off?.('correct_player_move_prediction',onCorrection)
    client.off?.('move_player',onMove)
    client.off?.('close',onClose)
  }
  client.on('start_game',onStart)
  client.on('correct_player_move_prediction',onCorrection)
  client.on('move_player',onMove)
  client.once('close',onClose)
  return {
    get:()=>({source:independentAt!==null&&clock()-independentAt>=0&&
      clock()-independentAt<=4000?
      (independentSource==='bds_stable_actionbar'?'independent_bds_stable_actionbar':
       independentSource==='bds_script_api'?'independent_bds_script_api':
       'independent_bds_querytarget'):'bedrock_server_packets_only',
      received:packets,authoritativeSamples:events,independentSamples,
      latestFeet:last?Object.fromEntries(Object.entries(last).map(([k,v])=>[k,round(v)])):null,
      lastAt:lastAt||null,lastSource,travelBlocks:round(distance),
      independentLatestFeet:independentLatestFeet?copy(independentLatestFeet):null,
      independentAt,independentPreviousAt,independentSource,
      independentPairTravelBlocks:independentPairTravel===null?null:round(independentPairTravel),
      independentTravelBlocks:round(independentTravel),
      // Server's start_game spawn coordinate is deliberately separate from
      // corrective self-move packets and never increments received.
      loginFeet,loginAt,loginSource:loginFeet?'start_game_player_position':null,
      lifeEpochAt,awaitingVerifiedRespawn,
      serverTick,authority,rewindHistory}),
    // A correction is authoritative evidence only if it was observed AFTER this checkpoint.
    checkpoint:()=>({events,position:last?copy(last):null}),
    progress:checkpoint=>{
      if(!checkpoint||events<=checkpoint.events||!last||!checkpoint.position)
        return {confirmed:false,reason:'no_two_server_positions',packetCount:packets}
      const moved=Math.hypot(last.x-checkpoint.position.x,last.y-checkpoint.position.y,last.z-checkpoint.position.z)
      return {confirmed:moved>=0.25,movedBlocks:round(moved),reason:moved>=0.25?'server_position_changed':'server_position_unchanged',packetCount:packets}
    },
    ingestIndependentPosition,
    beginRespawnEpoch,completeRespawnEpoch,
    detach
  }
}
module.exports={attachMovementEvidence,finitePos}
