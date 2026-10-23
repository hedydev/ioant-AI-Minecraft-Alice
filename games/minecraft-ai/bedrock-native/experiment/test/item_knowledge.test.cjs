'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {resolveItem,parseCollect,acquisitionStrategy,LOG_GROUP}=require('../src/item_knowledge.cjs')
const registry={itemsByName:{diamond:{id:1},iron_ingot:{id:2},oak_log:{id:3},wooden_sword:{id:4}}}
test('general gathering instructions normalize many nouns, not only wood',()=>{
 assert.deepEqual(parseCollect('收集5个钻石'),{type:'ITEM_REQUEST',term:'钻石',count:5})
 assert.deepEqual(parseCollect('挖钻石'),{type:'ITEM_REQUEST',term:'钻石',count:null})
 assert.deepEqual(parseCollect('采集3个铁锭'),{type:'ITEM_REQUEST',term:'铁锭',count:3})
 assert.deepEqual(parseCollect('砍木头'),{type:'ITEM_REQUEST',term:'木头',count:null})
 assert.equal(parseCollect('跟着我'),null)
 assert.equal(parseCollect('收集100个钻石').type,'INVALID_QUANTITY')
})
test('only server registry and canonical aliases may identify executable items',()=>{
 assert.equal(resolveItem('钻石',registry).item,'diamond')
 assert.equal(resolveItem('minecraft:diamond',registry).item,'diamond')
 assert.equal(resolveItem('木头',registry).item,LOG_GROUP)
 assert.equal(resolveItem('铁锭',registry).item,'iron_ingot')
 assert.equal(resolveItem('陨石精华',registry).ok,false)
 assert.equal(resolveItem('item_that_does_not_exist',registry).ok,false)
 const memory={resolveItemAlias:term=>term==='闪亮矿'?'diamond':null}
 assert.equal(resolveItem('闪亮矿',registry,memory).item,'diamond')
})
test('Minecraft knowledge strategy never turns ore mining into a wood dig',()=>{
 const logs=new Set(['oak_log','spruce_log'])
 assert.equal(acquisitionStrategy('oak_log',logs),'verified_natural_tree')
 assert.equal(acquisitionStrategy(LOG_GROUP,logs),'verified_natural_tree')
 assert.equal(acquisitionStrategy('diamond',logs),'recipe_if_available')
})
