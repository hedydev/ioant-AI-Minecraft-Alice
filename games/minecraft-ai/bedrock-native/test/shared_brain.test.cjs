'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const {createNativeAliceBrain} = require('../src/shared_brain.cjs')

test('native imports EXACT Paper pure policy code, no rule fork', async()=>{
  const brain=await createNativeAliceBrain(()=>100000)
  assert.equal(brain.policies.wood_policy.parseCountReply('12个木头'),12)
  assert.equal(brain.policies.safety_policy.decideCombatTactic({health:5,enemyType:'zombie',distance:3}),'RETREAT')
  assert.equal(brain.policies.social_policy.isStatusQuery('你在干嘛？'),true)
  assert.equal(brain.policies.recipe_plan.planMaterialNeeds('stone',1,{},()=>null).missing.stone,1)
  assert.equal(brain.policies.task_observation.retainedGatherCount(7,3),0)
  assert.equal(brain.policies.intent_policy.hasMessageEpoch({_aliceMessageEpoch:2}),true)
  assert.equal(brain.policies.terrain_policy.classifyAdvance({}).status,'UNKNOWN')
})

test('Bedrock chat recognizes Paper wood count with no fictional gather',async()=>{
  let now=100000
  const b=await createNativeAliceBrain(()=>now)
  b.onSpawn()
  assert.match(b.respond('收集木头','Player A'),/需要多少个木头/)
  assert.equal(b.hasPendingCount('Player B'),false)
  assert.match(b.respond('12个木头','Player A'),/没有开始砍树/)
  assert.equal(b.intent.amount,12)
  assert.equal(b.intent.state,'GATHER_REQUESTED')
  assert.match(b.respond('状态','Player A'),/动作接口尚未验证/)
  assert.match(b.respond('跟着我','Player A'),/不会假装/)
  assert.equal(b.intent.state,'FOLLOW_REQUESTED')
  assert.match(b.respond('停止','Player A'),/已取消/)
  assert.equal(b.intent.state,'IDLE')
  b.respond('收集木头','Player A');now+=46000
  assert.equal(b.hasPendingCount('Player A'),false)
})

test('native location values are observed with timestamps, never invented',async()=>{
  let now=100000
  const b=await createNativeAliceBrain(()=>now)
  b.onSpawn()
  assert.match(b.respond('你在哪里'),/还没有/)
  b.observeStartGame({runtime_entity_id:22n,dimension:0,player_position:{x:15.9,y:70,z:-3}})
  assert.match(b.respond('你在哪里'),/生成时位置/)
  b.observeMovePlayer({runtime_entity_id:23n,position:{x:30,y:60,z:10}})
  assert.match(b.respond('你在哪里'),/生成时位置/)
  b.observeMovePlayer({runtime_entity_id:22n,position:{x:16,y:70,z:-4}})
  assert.match(b.respond('你在哪里'),/最近收到的角色坐标 16, 70, -4/)
  now+=32000
  assert.match(b.respond('你在哪里'),/已过期/)
})

test('inventory status reuses Paper formatter only after verified name adapter',async()=>{
  const b=await createNativeAliceBrain(()=>100000)
  assert.match(b.respond('背包有什么'),/不能报告物品数量/)
  assert.throws(()=>b.observeVerifiedInventory([{name:'block_id_7',count:-1}]),/validated/)
  b.observeVerifiedInventory([{name:'oak_log',count:6},{name:'oak_log',count:2}],
    {slots:[null,{name:'oak_log'},null],inventoryStart:0,inventoryEnd:3})
  assert.match(b.respond('背包有什么'),/橡木原木×8/)
  assert.match(b.respond('背包有什么'),/剩2格/)
})

test('health updates require matching own runtime entity and real attributes',async()=>{
  const b=await createNativeAliceBrain(()=>100000)
  b.onSpawn()
  b.observeStartGame({runtime_entity_id:19n,dimension:0})
  b.observeAttributes({runtime_entity_id:999n,attributes:[{name:'minecraft:health',current:4,max:20}]})
  assert.match(b.respond('状态'),/尚未有可信同步/)
  b.observeAttributes({runtime_entity_id:19n,attributes:[{name:'minecraft:health',current:4,max:20}]})
  assert.match(b.respond('状态'),/4\/20/)
  // Safety policy imported unchanged: this is a recommendation, not a fight action.
  assert.equal(b.policies.safety_policy.decideCombatTactic({health:b.health,enemyType:'skeleton',distance:6}),'RETREAT')
})