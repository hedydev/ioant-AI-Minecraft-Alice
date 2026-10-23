'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {BedrockOperations}=require('../src/operations.cjs')
test('requested spruce logs never cause an oak block to be dug',async()=>{
  const p={x:2,y:64,z:0,distanceTo(){return 2},offset(){return this}}
  let calls=0,logFilter,foliageProbes=0
  const bot={inventory:{items:()=>[]},entity:{position:{clone:()=>p}},
    pathfinder:{goto:async()=>{},stop(){}},dig:async()=>{calls++},
    findBlocks:({matching})=>{
      if(!logFilter)logFilter=matching
      else foliageProbes++
      return []
    },
    blockAt:()=>({name:'oak_log',position:p})}
  const o=new BedrockOperations({bot,api:{GoalNear:class{}},sleep:async()=>{}})
  const r=await o.gatherOne({targetItem:'spruce_log'})
  assert.equal(r.ok,false);assert.equal(calls,0)
  assert.equal(logFilter({name:'oak_log'}),false)
  assert.equal(logFilter({name:'spruce_log'}),true)
  assert.equal(foliageProbes,1,'missing trees trigger a separate read-only leaf probe')
})
test('non-tree goods are never harvested through the tree executor',async()=>{
 const o=new BedrockOperations({bot:{},api:{}})
 const r=await o.gatherOne({targetItem:'diamond'})
 assert.equal(r.reason,'unsupported_natural_tree_item')
})
