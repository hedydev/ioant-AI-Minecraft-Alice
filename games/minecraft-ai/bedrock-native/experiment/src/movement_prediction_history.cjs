'use strict'
// Input tick IDs identify PAST predicted frames, not the server's current clock.
// This bounded buffer owns physics data only: no bot, timers, network or AI.
const MAX_HISTORY=80
const INPUTS=['attributes','yaw','pitch','control','jumpBoost','speed','slowness',
  'dolphinsGrace','slowFalling','levitation','depthStrider','elytraEquipped']
const CONTEXT=INPUTS.filter(k=>!['yaw','pitch','control'].includes(k))
const PHYSICAL=['onGround','isInWater','isInLava','isInWeb',
  'isCollidedHorizontally','isCollidedVertically','elytraFlying','jumpTicks']
function tickId(value){
  try{
    if(typeof value==='string'&&!/^[0-9]+$/.test(value))return null
    if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))return null
    if(Array.isArray(value)){
      if(value.length!==2||!value.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))return null
      value=(BigInt(value[0])<<32n)|BigInt(value[1])
    }
    if(!['bigint','number','string'].includes(typeof value)||value==='')return null
    const n=BigInt(value)
    return n>=0n&&n<=0xffffffffffffffffn?n:null
  }catch{return null}
}
function finiteVector(v){return !!v&&['x','y','z'].every(k=>Number.isFinite(v[k]))}
function cloneState(state){
  if(!state||!finiteVector(state.pos)||!finiteVector(state.vel))throw Error('invalid_prediction_state')
  const copy=Object.assign(Object.create(Object.getPrototypeOf(state)),state)
  copy.pos=state.pos.clone();copy.vel=state.vel.clone()
  copy.control={...state.control}
  copy.attributes=structuredClone(state.attributes||{})
  return copy
}
function context(state,eyeHeight){
  return JSON.stringify([eyeHeight,...CONTEXT.map(k=>state[k])])
}
function samePhysical(a,b){
  return ['pos','vel'].every(k=>['x','y','z'].every(axis=>Object.is(a[k][axis],b[k][axis])))&&
    PHYSICAL.every(k=>Object.is(a[k],b[k]))
}
function applyCorrection(state,packet,eyeHeight){
  const copy=cloneState(state)
  Object.assign(copy.pos,{x:packet.position.x,y:packet.position.y-eyeHeight,z:packet.position.z})
  Object.assign(copy.vel,{x:packet.delta.x,y:packet.delta.y,z:packet.delta.z})
  copy.onGround=packet.on_ground
  copy.isCollidedVertically=packet.on_ground
  copy.isCollidedHorizontally=false
  return copy
}
class MovementPredictionHistory {
  constructor({simulate,capacity=40}){
    this.simulate=simulate;this.frames=[];this.floor=null;this.lastCorrection=null
    this.stats={correctionReplays:0,replayedFrames:0,correctionFallbacks:0,
      correctionsRejected:0,historyResets:0,lastCorrectionReason:null}
    this.resize(capacity)
  }
  resize(size){
    this.capacity=Number.isInteger(size)&&size>0?Math.min(MAX_HISTORY,size):40
    if(this.frames.length>this.capacity)this.frames.splice(0,this.frames.length-this.capacity)
  }
  reset(reason,{lifeBoundary=false,floor=null}={}){
    this.frames=[];this.stats.historyResets++
    if(lifeBoundary){this.floor=tickId(floor);this.lastCorrection=null}
    this.stats.lastCorrectionReason=reason
  }
  record(tick,before,after,eyeHeight){
    const previous=this.frames.at(-1)
    if(previous&&(tick!==previous.tick+1n||!samePhysical(before,previous.after)||
        context(before,eyeHeight)!==context(previous.after,previous.eyeHeight)))
      this.reset('prediction_context_changed')
    this.frames.push({tick,before:cloneState(before),after:cloneState(after),eyeHeight})
    if(this.frames.length>this.capacity)this.frames.shift()
  }
  correct(packet,current,eyeHeight,lastEmittedTick){
    const tick=tickId(packet.tick)
    const reject=reason=>{
      this.stats.correctionsRejected++;this.stats.lastCorrectionReason=reason
      return {state:null,reason,replayed:0}
    }
    // Contract checked against the installed bedrock_1.26.51 schema: delta,
    // on_ground and prediction_type. Never silently substitute velocity.
    if(tick===null||!finiteVector(packet.position)||!finiteVector(packet.delta)||
        typeof packet.on_ground!=='boolean'||!Number.isFinite(eyeHeight)||eyeHeight<=0||
        !['player',0].includes(packet.prediction_type))return reject('invalid_player_correction')
    if(this.floor!==null&&tick<=this.floor)return reject('prior_life_correction')
    if(lastEmittedTick===null||tick>lastEmittedTick)return reject('future_input_correction')
    if(this.lastCorrection!==null&&tick<=this.lastCorrection)return reject('stale_input_correction')
    const index=this.frames.findIndex(f=>f.tick===tick)
    const latest=this.frames.at(-1)
    const fallback=reason=>{
      const correctionHeight=index>=0?this.frames[index].eyeHeight:eyeHeight
      const state=applyCorrection(current,packet,correctionHeight)
      this.reset(reason);this.lastCorrection=tick;this.stats.correctionFallbacks++
      return {state,reason,replayed:0,fallback:true}
    }
    // A history miss is explicit immediate authority, never invented replay.
    // Changed world/pose/attributes or an external mirror also invalidate it.
    if(index<0)return fallback('correction_history_miss')
    if(!samePhysical(current,latest.after)||context(current,eyeHeight)!==context(latest.after,latest.eyeHeight))
      return fallback('correction_context_changed')
    try{
      const base=this.frames[index]
      let state=applyCorrection(base.after,packet,base.eyeHeight)
      const updated=[{...base,after:cloneState(state)}]
      for(let i=index+1;i<this.frames.length;i++){
        const frame=this.frames[i],previous=this.frames[i-1]
        // Replay recorded inputs/look, not today's live control proxy. Preserve
        // derived velocity/contact/jump cooldown from the corrected trajectory.
        const inputs=cloneState(frame.before)
        for(const key of INPUTS)state[key]=inputs[key]
        state.jumpQueued=frame.before.jumpQueued
        if(frame.before.fireworkRocketDuration!==previous.after.fireworkRocketDuration)
          state.fireworkRocketDuration=frame.before.fireworkRocketDuration
        const before=cloneState(state)
        state=this.simulate(state)
        updated.push({...frame,before,after:cloneState(state)})
      }
      // A callback may have queued the NEXT jump/firework after the last frame.
      if(current.jumpQueued!==latest.after.jumpQueued)state.jumpQueued=current.jumpQueued
      if(current.fireworkRocketDuration!==latest.after.fireworkRocketDuration)
        state.fireworkRocketDuration=current.fireworkRocketDuration
      this.frames.splice(index,updated.length,...updated)
      this.lastCorrection=tick;this.stats.correctionReplays++
      this.stats.replayedFrames+=updated.length-1
      this.stats.lastCorrectionReason='correction_replayed'
      return {state,reason:'correction_replayed',replayed:updated.length-1}
    }catch{return fallback('correction_replay_unavailable')}
  }
  summary(){return {...this.stats,historyFrames:this.frames.length,historyCapacity:this.capacity}}
}
module.exports={MovementPredictionHistory,cloneState,tickId,MAX_HISTORY}
