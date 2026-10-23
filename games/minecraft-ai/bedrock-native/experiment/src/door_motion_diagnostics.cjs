'use strict'
// Passive, bounded evidence for why Bedrock door-crossing input stalls.
// No packet wrapping, world mutation, motion, config changes or raw identities.
// Local pose/collision and server-origin correction history are DIFFERENT facts.
const {observedDoorBits}=require('./escape_door_action.cjs')
const finite=n=>Number.isFinite(n)?Math.round(n*1000)/1000:null
const pos=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)?
  {x:finite(p.x),y:finite(p.y),z:finite(p.z)}:null
const shapes=block=>Array.isArray(block?.shapes)?
  block.shapes.slice(0,4).filter(a=>Array.isArray(a)&&a.length===6&&a.every(Number.isFinite))
    .map(a=>a.map(finite)):null
const blockSummary=block=>{
  const state=observedDoorBits(block)
  return {name:String(block?.name||'unknown').slice(0,40),
    boundingBox:block?.boundingBox==='block'?'block':
      block?.boundingBox==='empty'?'empty':'unknown',
    open:state.open,upper:state.upper,shapes:shapes(block)}
}
function sampleDoor(bot,door){
 const [x,y,z]=door
 try{
   const p=bot.entity?.position
   if(!p?.offset||!bot.blockAt)return null
   const at=(yy)=>bot.blockAt(p.offset(x-p.x,yy-p.y,z-p.z))
   return {lower:blockSummary(at(y)),upper:blockSummary(at(y+1))}
 }catch{return null}
}
const roundedAngle=x=>{
 if(!Number.isFinite(x))return null
 return finite(((x+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI)
}
function createDoorMotionProbe(bot,door,movementEvidence,{clock=Date.now}={}){
 const initial=pos(bot?.entity?.position)
 const initialServer=movementEvidence?.get?.()||null
 const expectedYaw=Math.atan2(-(door[0]-Math.floor(initial?.x??door[0])),
   -(door[2]-Math.floor(initial?.z??door[2])))
 const start=sampleDoor(bot,door)
 let physicsTicks=0,forwardPhysicsTicks=0,horizontalCollisionTicks=0
 let furthest=null,observedOnGround=null
 const onTick=()=>{
   physicsTicks++
   const entity=bot?.entity
   if(bot?.getControlState?.('forward')===true||bot?.controlState?.forward===true)
     forwardPhysicsTicks++
   if(entity?.isCollidedHorizontally===true)horizontalCollisionTicks++
   const current=pos(entity?.position)
   if(current&&initial){
     const moved=Math.hypot(current.x-initial.x,current.y-initial.y,current.z-initial.z)
     furthest=Math.max(furthest??0,finite(moved))
   }
   observedOnGround=entity?.onGround===true
 }
 bot.on?.('physicsTick',onTick)
 let finished=false
 return {
   finish(reason){
     if(finished)return null
     finished=true
     bot.off?.('physicsTick',onTick)
     bot.removeListener?.('physicsTick',onTick)
     const final=pos(bot?.entity?.position),e=bot?.entity
     const after=sampleDoor(bot,door),server=movementEvidence?.get?.()||null
     const age=Number.isFinite(server?.lastAt)?clock()-server.lastAt:null
     return {
       reason:String(reason||'unknown').slice(0,78),
       targetDoor:door.slice(),localBefore:initial,localAfter:final,
       localMoved:initial&&final?finite(Math.hypot(final.x-initial.x,
         final.y-initial.y,final.z-initial.z)):null,
       maxLocalMoved:furthest,
       physicsTicks,forwardPhysicsTicks,horizontalCollisionTicks,
       groundObserved:observedOnGround,groundAtEnd:e?.onGround===true,
       collisionAtEnd:e?.isCollidedHorizontally===true,
       physicsEnabled:bot?.physicsEnabled===true,
       isRiding:!!bot?.vehicle,
       yawRadians:finite(e?.yaw),expectedYawRadians:finite(expectedYaw),
       yawErrorRadians:roundedAngle((e?.yaw??NaN)-expectedYaw),
       velocity:pos(e?.velocity),
       doorInitially:start,doorFinally:after,
       serverPositionInitial:pos(initialServer?.latestFeet),
       serverPositionFinal:pos(server?.latestFeet),
       serverPacketCountDelta:Number.isFinite(server?.received)&&
         Number.isFinite(initialServer?.received)?
         server.received-initialServer.received:null,
       lastServerPacketSource:String(server?.lastSource||'none').slice(0,44),
       lastServerSampleAgeMs:age!=null&&age>=0?Math.round(age):null,
       serverPositionIsNotAssumedFromClient:true
     }
   }
 }
}
module.exports={createDoorMotionProbe,blockSummary}
