'use strict'
// Read-only bounded diagnostics for native Bedrock FOLLOW. Every read is from
// Mineflayer's current loaded-world snapshot; unknown chunks are NOT air.
// Never sends movement/gameplay packets or changes pathfinder/world state.
const round=n=>Number.isFinite(n)?Math.round(n*100)/100:null
const isFinitePos=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
const solid=b=>b&&b.boundingBox==='block'
function briefBlock(b){
  if(!b)return {state:'unloaded_or_unknown'}
  const name=String(b.name??'unknown').slice(0,50)
  return {state:'loaded',name,solid:!!solid(b),type:Number.isInteger(b.type)?b.type:null}
}
function positionAt(bot,from,dx,dy,dz){
  try{
    const point=from.offset(dx,dy,dz)
    return briefBlock(bot.blockAt(point))
  }catch{return {state:'read_error'}}
}
function localFollowDiagnostic(bot,entity,{pathStatus='unknown',pathLength=0}={}){
  const self=bot?.entity?.position,target=entity?.position
  if(!isFinitePos(self)||!isFinitePos(target)||typeof self.floored!=='function'||
     typeof bot.blockAt!=='function')return {reason:'position_or_block_api_unavailable'}
  const selfFloor=self.floored(),targetFloor=target.floored?.()
  const p=point=>({x:round(point.x),y:round(point.y),z:round(point.z)})
  const candidates=[[0,0,'self'],[1,0,'east'],[-1,0,'west'],[0,1,'south'],[0,-1,'north']]
  const blocks=candidates.map(([dx,dz,direction])=>{
    const below=positionAt(bot,selfFloor,dx,-1,dz)
    const feet=positionAt(bot,selfFloor,dx,0,dz)
    const head=positionAt(bot,selfFloor,dx,1,dz)
    // A rough local support probe, not a claim of full A* path reachability.
    const supported=below.state==='loaded'&&below.solid&&
      feet.state==='loaded'&&!feet.solid&&head.state==='loaded'&&!head.solid
    const uncertain=[below,feet,head].some(b=>b.state!=='loaded')
    return {direction,below,feet,head,supported,uncertain}
  })
  const info=bot?._bedrockWorldSupport??{}
  return {
    pathStatus:String(pathStatus).slice(0,24),pathLength:Number.isInteger(pathLength)?pathLength:0,
    selfFeet:p(self),selfOnGround:bot.entity.onGround??null,
    selfEyeHeight:round(bot.entity.eyeHeight),
    playerFeet:p(target),
    deltaY:round(target.y-self.y),
    targetVerticalGapForShortRecovery:Math.abs(target.y-self.y)>1.25,
    distanceXZ:round(Math.hypot(target.x-self.x,target.z-self.z)),
    blockDataSupported:info.supported??null,
    blockReason:String(info.reason??'').slice(0,90)||null,
    centerSupported:blocks[0].supported,
    centerUncertain:blocks[0].uncertain,
    nearbySupported:blocks.slice(1).filter(b=>b.supported).length,
    nearbyUncertain:blocks.slice(1).filter(b=>b.uncertain).length,
    footprint:blocks.map(({direction,below,feet,head,supported,uncertain})=>({
      direction,below,feet,head,supported,uncertain
    }))
  }
}
module.exports={localFollowDiagnostic}
