'use strict'
// Passive FOLLOW input evidence from the same physics ticks that Pathfinder
// controls. NOT a capture of outbound Bedrock player_auth_input or BDS proof.
// Ownership: only the active FOLLOW mode samples; no setters are wrapped.
class FollowInputObservation {
  constructor(){this.reset()}
  reset(){
    this.samples=0;this.jumpPressedTicks=0;this.jumpEdges=0;
    this.forwardPressedTicks=0;this.groundedTicks=0;this.lastJump=false
  }
  tick(bot){
    const get=k=>{
      try{
        const v=bot?.getControlState?.(k)
        if(typeof v==='boolean')return v
      }catch{}
      return bot?.controlState?.[k]===true
    }
    const jump=get('jump'),forward=get('forward')
    this.samples++
    if(jump){this.jumpPressedTicks++;if(!this.lastJump)this.jumpEdges++}
    this.lastJump=jump
    if(forward)this.forwardPressedTicks++
    if(bot?.entity?.onGround===true)this.groundedTicks++
  }
  take(){
    const result={physicsSamples:this.samples,jumpPressedTicks:this.jumpPressedTicks,
      jumpEdges:this.jumpEdges,forwardPressedTicks:this.forwardPressedTicks,
      groundedTicks:this.groundedTicks,inputTrust:'client_pathfinder_control_only'}
    this.reset()
    return result
  }
}
module.exports={FollowInputObservation}
