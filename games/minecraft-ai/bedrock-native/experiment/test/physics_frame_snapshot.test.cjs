'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {capturePhysicalFrame,restorePhysicalFrame}=require('../src/physics_frame_snapshot.cjs')
const entity=()=>({
  position:{x:0.5,y:69,z:-0.1640286849},
  velocity:{x:0,y:-0.0784,z:-0.0730871243},
  onGround:true,isCollidedHorizontally:false,isCollidedVertically:true
})
test('Pathfinder fullStop recenter and zero velocity are undone without clearing new intent',()=>{
 const e=entity(),controls={forward:true}
 const position=e.position,velocity=e.velocity,frame=capturePhysicalFrame(e)
 // Actual old Pathfinder fullStop callback behavior.
 controls.forward=false
 e.velocity.x=0;e.velocity.z=0
 e.position.z=-0.5
 const outcome=restorePhysicalFrame(e,frame)
 assert.equal(outcome.positionMutated,true)
 assert.equal(outcome.velocityMutated,true)
 assert.equal(e.position,position)
 assert.equal(e.velocity,velocity)
 assert.deepEqual(e.position,{x:.5,y:69,z:-.1640286849})
 assert.deepEqual(e.velocity,{x:0,y:-.0784,z:-.0730871243})
 assert.equal(controls.forward,false,'control release remains for next frame')
})
test('restores swapped kinematic objects and collision flags without clobbering yaw',()=>{
 const e=entity(),pos=e.position,vel=e.velocity,frame=capturePhysicalFrame(e)
 e.position={x:100,y:99,z:88}
 e.velocity={x:0,y:0,z:0}
 e.yaw=1.5;e.onGround=false;e.isCollidedHorizontally=true
 const result=restorePhysicalFrame(e,frame)
 assert(result.positionMutated&&result.velocityMutated&&result.contactMutated)
 assert.equal(e.position,pos);assert.equal(e.velocity,vel)
 assert.equal(e.yaw,1.5)
 assert.equal(e.onGround,true);assert.equal(e.isCollidedHorizontally,false)
})
test('unchanged callback leaves frame untouched',()=>{
 const e=entity(),frame=capturePhysicalFrame(e),before=JSON.stringify(e)
 const result=restorePhysicalFrame(e,frame)
 assert.deepEqual(result,{positionMutated:false,velocityMutated:false,contactMutated:false})
 assert.equal(JSON.stringify(e),before)
})
test('non-finite physical result fails closed',()=>{
 const e=entity();e.velocity.z=NaN
 assert.throws(()=>capturePhysicalFrame(e),/physical_frame_vector_unavailable/)
})
