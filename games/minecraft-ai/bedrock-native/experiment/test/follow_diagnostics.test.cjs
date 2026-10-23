'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {localFollowDiagnostic}=require('../src/follow_diagnostics.cjs')
function v(x,y,z){return {x,y,z,
  floored(){return v(Math.floor(x),Math.floor(y),Math.floor(z))},
  offset(dx,dy,dz){return v(x+dx,y+dy,z+dz)}}}
const stone={name:'stone',type:1,boundingBox:'block'}
const air={name:'air',type:0,boundingBox:'empty'}
test('Bedrock noPath snapshot probes feet and adjacent blocks without changing world',()=>{
  let reads=0
  const bot={entity:{position:v(10.5,69,20.5),eyeHeight:1.62,onGround:true},
    _bedrockWorldSupport:{supported:true},
    blockAt(p){reads++;return p.y===68?stone:air}}
  const diag=localFollowDiagnostic(bot,{position:v(17,69,20)},{pathStatus:'noPath',pathLength:2})
  assert.equal(diag.reason,undefined)
  assert.equal(diag.selfFeet.y,69)
  assert.equal(diag.centerSupported,true)
  assert.equal(diag.nearbySupported,4)
  assert.equal(diag.nearbyUncertain,0)
  assert.equal(diag.footprint.length,5)
  assert.equal(diag.blockDataSupported,true)
  assert.equal(diag.selfOnGround,true)
  assert.equal(reads,15,'bounded 5x3 block reads only')
})
test('unknown loaded chunks are not classified as air or reachable ground',()=>{
  const bot={entity:{position:v(0,100,0),onGround:false},blockAt(p){
    if(p.x===0&&p.y===99)return null
    if(p.x>0)return null
    return p.y===99?stone:air
  }}
  const diag=localFollowDiagnostic(bot,{position:v(5,100,0)})
  assert.equal(diag.centerSupported,false)
  assert.equal(diag.centerUncertain,true)
  assert(diag.nearbyUncertain>0)
  assert.equal(diag.footprint[0].below.state,'unloaded_or_unknown')
})
test('unavailable position or missing block API fails explicitly, never inventing a path',()=>{
  assert.deepEqual(localFollowDiagnostic({},null),{reason:'position_or_block_api_unavailable'})
  const bot={entity:{position:v(0,64,0)}}
  assert.deepEqual(localFollowDiagnostic(bot,{position:v(1,64,1)}),{reason:'position_or_block_api_unavailable'})
})

test('diagnose target vertical difference without claiming a verified path',()=>{
  const bot={entity:{position:v(0.5,99,0.5),onGround:true},
    blockAt:p=>p.y===98?stone:air}
  const d=localFollowDiagnostic(bot,{position:v(5.5,97,0.5)},{pathStatus:'noPath'})
  assert.equal(d.deltaY,-2)
  assert.equal(d.targetVerticalGapForShortRecovery,true)
  assert.equal(d.centerSupported,true)
})
