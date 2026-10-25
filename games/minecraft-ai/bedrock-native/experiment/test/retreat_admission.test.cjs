'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {BedrockOperations}=require('../src/operations.cjs')
const {installNavigationPositionGuard}=require('../src/navigation_position_guard.cjs')
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)},
  clone(){return v(x,y,z)},floored(){return v(Math.floor(x),Math.floor(y),Math.floor(z))},
  distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}})
const solid={name:'stone_bricks',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
const air={name:'air',boundingBox:'empty',shapes:[]}
function fixture(){
  const calls={goto:0}
  const bot={entity:{position:v(.5,65,.5),onGround:true},
    blockAt:p=>p.y<65?solid:air,
    pathfinder:{goto:async()=>{calls.goto++},setGoal:()=>true,setMovements:()=>{}}}
  const api={Movements:class{},GoalNear:class{constructor(x,y,z,r){Object.assign(this,{x,y,z,r})}}}
  const target={name:'zombie',position:v(-2.5,65,.5)}
  return {bot,api,target,calls}
}

test('real shared navigation guard denies retreat before any native pathfinder call',async()=>{
  const f=fixture(),evidence={get:()=>({independentSamples:0})}
  const guard=installNavigationPositionGuard(f.bot,evidence,{clock:()=>10000})
  try{
    const result=await new BedrockOperations({
      bot:f.bot,api:f.api,movementEvidence:evidence}).retreatFrom(f.target)
    assert.equal(result.ok,false)
    assert.equal(result.reason,'retreat_bds_position_unavailable')
    assert.equal(result.attempted,false)
    assert.equal(result.serverMovementVerified,false)
    assert.equal(f.calls.goto,0,'guard rejection must precede native movement')
    assert.equal(guard.snapshot().rejected,1)
    assert(!['retreat_flat_geometry_not_verified',
      'retreat_no_verified_away_corridor'].includes(result.reason),
      'witness rejection must never be mislabeled as collision cornering')
  }finally{guard.detach()}
})

test('retreat preserves exact guard reason without leaking arbitrary exception text',async()=>{
  for(const [raised,expected] of [
    ['navigation_scout_client_server_position_diverged','retreat_bds_client_position_diverged'],
    ['navigation_scout_client_position_unavailable','retreat_client_position_unavailable'],
    ['navigation_scout_bds_position_unavailable','retreat_bds_position_unavailable']
  ]){
    const f=fixture()
    f.bot.pathfinder.goto=()=>{throw Error(raised)}
    const result=await new BedrockOperations({bot:f.bot,api:f.api}).retreatFrom(f.target)
    assert.equal(result.reason,expected)
    assert.equal(result.attempted,false)
    assert.equal(result.serverMovementVerified,false)
    assert(!JSON.stringify(result).includes(raised))
  }
})

test('actual Pathfinder failures still report attempted navigation without granting proof',async()=>{
  for(const [message,reason] of [
    ['No path to the goal!','retreat_pathfinder_no_path'],
    ['PRIVATE_TRANSPORT_ERROR','retreat_pathfinder_error']
  ]){
    const f=fixture()
    f.bot.pathfinder.goto=()=>{f.calls.goto++;throw Error(message)}
    const result=await new BedrockOperations({bot:f.bot,api:f.api}).retreatFrom(f.target)
    assert.equal(f.calls.goto,1)
    assert.equal(result.reason,reason)
    assert.equal(result.attempted,true)
    assert.equal(result.serverMovementVerified,false)
    assert(!JSON.stringify(result).includes('PRIVATE_TRANSPORT_ERROR'))
  }
})

test('failed emergency goto requests stop before stationary defensive handoff',async()=>{
 const f=fixture()
 let stopped=0
 f.bot.pathfinder.stop=()=>{stopped++}
 f.bot.pathfinder.goto=()=>{f.calls.goto++;throw Error('PRIVATE_PATHFINDER_ERROR')}
 const result=await new BedrockOperations({bot:f.bot,api:f.api}).retreatFrom(f.target)
 assert.equal(result.reason,'retreat_pathfinder_error')
 assert.equal(result.attempted,true)
 assert.equal(result.pathfinderStopRequested,true)
 assert.equal(stopped,1)
 assert.equal(result.serverMovementVerified,false)
})
test('guard denial does not stop Pathfinder or give permission to move',async()=>{
 const f=fixture()
 let stopped=0
 f.bot.pathfinder.stop=()=>{stopped++}
 f.bot.pathfinder.goto=()=>{throw Error('navigation_scout_bds_position_unavailable')}
 const result=await new BedrockOperations({bot:f.bot,api:f.api}).retreatFrom(f.target)
 assert.equal(result.attempted,false)
 assert.equal(result.pathfinderStopRequested,false)
 assert.equal(stopped,0)
})
