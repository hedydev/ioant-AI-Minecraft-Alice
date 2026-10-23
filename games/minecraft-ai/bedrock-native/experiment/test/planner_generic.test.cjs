'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {validatedPlan,parseReply}=require('../src/planner.cjs')
test('LLM may normalize generic collection request but not execute arbitrary commands',()=>{
 assert.deepEqual(validatedPlan({action:'collect_item',item:'diamond',count:3}),{action:'collect_item',item:'diamond',count:3})
 assert.equal(validatedPlan({action:'collect_item',item:'diamond',count:100}),null)
 assert.equal(validatedPlan({action:'delete_world'}),null)
 assert.deepEqual(validatedPlan({action:'eat_food'}),{action:'eat_food'})
})
test('LLM tool calls carry strictly validated item/count, not purported success',()=>{
 const r=parseReply({message:{tool_calls:[{function:{name:'alice_action',arguments:{action:'collect_item',item:'iron_ingot',count:2}}}]}})
 assert.deepEqual(r,{action:'collect_item',item:'iron_ingot',count:2})
})
