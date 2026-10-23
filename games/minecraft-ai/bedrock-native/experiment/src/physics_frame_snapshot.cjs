'use strict'
// After a Bedrock physics simulation commits, physicsTick subscribers may set
// controls for the NEXT frame. They must not teleport or edit the just-applied
// frame's kinematics: those mutations would corrupt the packet for this tick
// and become an unacknowledged start position for the following simulation.
// This intentionally affects only the Alice pinned Bedrock input plugin.
const AXES=Object.freeze(['x','y','z'])
const CONTACT=Object.freeze(['onGround','isCollidedHorizontally','isCollidedVertically'])
function vector(value){
  if(!value||!AXES.every(axis=>Number.isFinite(value[axis])))
    throw Error('physical_frame_vector_unavailable')
  return Object.fromEntries(AXES.map(axis=>[axis,value[axis]]))
}
function capturePhysicalFrame(entity){
  if(!entity||!entity.position||!entity.velocity)
    throw Error('physical_frame_entity_unavailable')
  return {
    positionRef:entity.position,velocityRef:entity.velocity,
    position:vector(entity.position),velocity:vector(entity.velocity),
    contact:Object.fromEntries(CONTACT.map(k=>[k,entity[k]]))
  }
}
function restorePhysicalFrame(entity,frame){
  if(!entity||!frame)throw Error('physical_frame_missing')
  let positionMutated=entity.position!==frame.positionRef
  let velocityMutated=entity.velocity!==frame.velocityRef
  if(entity.position!==frame.positionRef)entity.position=frame.positionRef
  if(entity.velocity!==frame.velocityRef)entity.velocity=frame.velocityRef
  for(const axis of AXES){
    if(!Object.is(frame.positionRef[axis],frame.position[axis]))positionMutated=true
    if(!Object.is(frame.velocityRef[axis],frame.velocity[axis]))velocityMutated=true
    frame.positionRef[axis]=frame.position[axis]
    frame.velocityRef[axis]=frame.velocity[axis]
  }
  let contactMutated=false
  for(const key of CONTACT){
    if(!Object.is(entity[key],frame.contact[key]))contactMutated=true
    entity[key]=frame.contact[key]
  }
  return {positionMutated,velocityMutated,contactMutated}
}
module.exports={capturePhysicalFrame,restorePhysicalFrame}
