'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {FollowInputObservation}=require('../src/follow_input_observation.cjs')
test('records jump control edges without issuing any commands',()=>{
 const m=new FollowInputObservation()
 const states=[false,true,true,false,true,false],bot={
  entity:{onGround:true},
  controlState:{jump:false,forward:true},
  getControlState:k=>bot.controlState[k]
 }
 for(const j of states){bot.controlState.jump=j;m.tick(bot)}
 const o=m.take()
 assert.equal(o.physicsSamples,6)
 assert.equal(o.jumpPressedTicks,3)
 assert.equal(o.jumpEdges,2)
 assert.equal(o.forwardPressedTicks,6)
 assert.equal(o.groundedTicks,6)
 assert.equal(o.inputTrust,'client_pathfinder_control_only')
 assert.equal(m.take().physicsSamples,0)
})
test('missing controls are treated as unobserved rather than faking a jump',()=>{
 const m=new FollowInputObservation()
 m.tick({entity:{onGround:false}})
 assert.equal(m.take().jumpEdges,0)
})
