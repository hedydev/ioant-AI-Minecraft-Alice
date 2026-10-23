'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {safeFollowStep}=require('../src/safe_follow_step.cjs')
function v(x,y,z){return {x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}}}
function fixture(){
  let reads=0
  const bot={entity:{position:v(0.5,65,0.5),onGround:true},blockAt:p=>{
    reads++
    return {name:p.y===64?'stone':'air',boundingBox:p.y===64?'block':'empty'}
  }}
  return {bot,reads:()=>reads,target:{position:v(6.5,65,0.5)}}
}
test('flat loaded two-block headroom allows a bounded forward step',()=>{
  const f=fixture()
  const r=safeFollowStep(f.bot,f.target,{radius:3})
  assert.equal(r.ok,true)
  assert.equal(r.stepBlocks,1.2)
  assert.equal(r.yaw,-Math.PI/2)
  assert(r.sampled>=45)
  assert(f.reads()>=45)
})
test('never move into unloaded, hazardous, obstructed or raised ground',()=>{
  const f=fixture()
  f.bot.blockAt=p=>p.x>=1?null:{name:p.y===64?'stone':'air',boundingBox:p.y===64?'block':'empty'}
  assert.equal(safeFollowStep(f.bot,f.target).reason,'unsafe_unloaded_or_blocked_corridor')
  f.bot.blockAt=p=>({name:p.y===64?'lava':'air',boundingBox:p.y===64?'block':'empty'})
  assert.equal(safeFollowStep(f.bot,f.target).ok,false)
  f.bot.blockAt=p=>({name:p.y===66?'oak_planks':p.y===64?'stone':'air',boundingBox:p.y===66||p.y===64?'block':'empty'})
  assert.equal(safeFollowStep(f.bot,f.target).ok,false)
  f.target.position.y=66
  assert.equal(safeFollowStep(f.bot,f.target).ok,false,
    'a raised target does not override an obstructed path')
  f.bot.blockAt=p=>({name:p.y===64?'stone':'air',
    boundingBox:p.y===64?'block':'empty'})
  assert.equal(safeFollowStep(f.bot,f.target).ok,true,
    'only a known clear flat corridor permits a short step toward a higher player')
  f.target.position.y=67
  assert.equal(safeFollowStep(f.bot,f.target).reason,'target_vertical_gap_exceeds_short_recovery')
})
test('short recovery refuses a corridor near a known zombie or hostile entity',()=>{
  const f=fixture()
  f.bot.entities={zombie:{name:'zombie',kind:'Hostile mobs',position:v(2,65,0)}}
  assert.equal(safeFollowStep(f.bot,f.target).reason,'known_hostile_near_recovery_step')
})
test('requires confirmed ground and close enough visible target',()=>{
  const f=fixture()
  f.bot.entity.onGround=false
  assert.equal(safeFollowStep(f.bot,f.target).ok,false)
  f.bot.entity.onGround=true
  f.target.position=v(22.5,65,0.5)
  assert.equal(safeFollowStep(f.bot,f.target).reason,'target_too_far_for_short_recovery')
  f.target.position=v(2,65,0.5)
  assert.equal(safeFollowStep(f.bot,f.target).reason,'already_in_follow_radius')
})

test('lower player never authorizes a step over unknown flooring',()=>{
  const f=fixture()
  f.target.position.y=64
  f.bot.blockAt=p=>p.y===64&&p.x>=1?null:{
    name:p.y===64?'stone':'air',boundingBox:p.y===64?'block':'empty'}
  assert.equal(safeFollowStep(f.bot,f.target).ok,false)
})
