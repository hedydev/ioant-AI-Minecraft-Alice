'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {BedrockOperations}=require('../src/operations.cjs')
const vec=(x,y,z)=>({x,y,z,offset(a,b,c){return vec(x+a,y+b,z+c)},
  clone(){return vec(x,y,z)},distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}})
function fixture(failAt='pathfinder'){
  let items=[]
  const trunk=vec(1,65,0),events=[]
  const bot={
    entity:{position:vec(0,65,0)},inventory:{items:()=>items},
    blockAt(pos){
      const n=pos.x===1&&pos.z===0&&pos.y>=65&&pos.y<=66?'oak_log':
        pos.y>=68&&pos.y<=69&&Math.abs(pos.x-1)<=1&&Math.abs(pos.z)<=1?'oak_leaves':'air'
      return {name:n,position:pos,boundingBox:n==='air'?'empty':'block'}
    },
    findBlocks:()=>[trunk],
    pathfinder:{goto:async()=>{
      if(failAt==='pathfinder')throw Error('action timed out')
    },stop(){}},
    dig:async()=>{
      if(failAt==='dig')throw new TypeError('secret content not journal safe')
      items=[{name:'oak_log',count:1}]
    },stopDigging(){}
  }
  return {bot,events,ops:new BedrockOperations({
    bot,api:{GoalNear:class{constructor(){} }},
    sleep:async()=>{}
  })}
}
test('GATHER records exact failing navigation stage without exception text',async()=>{
  const f=fixture()
  await assert.rejects(()=>f.ops.gatherOne({
    onStage:e=>f.events.push(e)
  }),err=>err.stage==='pathfinder'&&err.reasonCode==='action_timeout')
  assert.deepEqual(f.events.map(e=>[e.stage,e.status]),[
    ['tree_scan','started'],['tree_scan','completed'],
    ['pathfinder','started'],['pathfinder','failed']])
  assert(!JSON.stringify(f.events).includes('secret'))
})
test('GATHER maps adapter TypeError to dig stage, no raw exception leakage',async()=>{
  const f=fixture('dig')
  await assert.rejects(()=>f.ops.gatherOne({onStage:e=>f.events.push(e)}),
    err=>err.stage==='dig'&&err.reasonCode==='adapter_api_exception')
  assert.equal(f.events.at(-1).stage,'dig')
  assert.equal(f.events.at(-1).reason,'adapter_api_exception')
})
test('GATHER only succeeds after inventory actually increases',async()=>{
  const f=fixture('none')
  const result=await f.ops.gatherOne({onStage:e=>f.events.push(e)})
  assert.equal(result.ok,true)
  assert.equal(result.gained,1)
  assert.equal(f.events.at(-1).stage,'pickup')
  assert.equal(f.events.at(-1).status,'completed')
})

test('GATHER pathfinder preserves BDS/client divergence without hiding it as generic exception',async()=>{
  const f=fixture('none')
  f.bot.pathfinder.goto=async()=>{throw Error('navigation_scout_client_server_position_diverged')}
  await assert.rejects(()=>f.ops.gatherOne({onStage:e=>f.events.push(e)}),
    e=>e.stage==='pathfinder'&&e.reasonCode==='navigation_bds_position_diverged')
  assert.equal(f.events.at(-1).reason,'navigation_bds_position_diverged')
})
test('GATHER pathfinder rejects missing independent BDS position using stable code',async()=>{
  const f=fixture('none')
  f.bot.pathfinder.goto=async()=>{throw Error('navigation_scout_bds_position_unavailable')}
  await assert.rejects(()=>f.ops.gatherOne({onStage:e=>f.events.push(e)}),
    e=>e.stage==='pathfinder'&&e.reasonCode==='navigation_bds_position_unavailable')
  assert.equal(f.events.at(-1).status,'failed')
})
