'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {parseStorage,transferNearby}=require('../src/storage_actions.cjs')
const {isNight,bestArmorChoice,armorScore}=require('../src/life_actions.cjs')
test('storage Chinese instructions and explicit bounded counts',()=>{
 assert.deepEqual(parseStorage('从箱子里拿5个钻石'),{type:'STORAGE',direction:'withdraw',item:'diamond',amount:5})
 assert.deepEqual(parseStorage('箱子存入3个铁锭'),{type:'STORAGE',direction:'deposit',item:'iron_ingot',amount:3})
 assert.equal(parseStorage('从箱子里拿100个钻石').type,'INVALID_QUANTITY')
 assert.equal(parseStorage('从箱子里拿不明物').type,'UNKNOWN_ITEM')
 assert.equal(parseStorage('普通聊天'),null)
})
test('night verification prevents daytime sleeping',()=>{
 assert.equal(isNight({time:{timeOfDay:14000},game:{dimension:'overworld'}}),true)
 assert.equal(isNight({time:{timeOfDay:8000},game:{dimension:'overworld'}}),false)
 assert.equal(isNight({time:{timeOfDay:14000},game:{dimension:'the_nether'}}),false)
})
test('armor chooser does not downgrade current equipment',()=>{
 const bot={inventory:{slots:{5:{name:'diamond_helmet'}},items:()=>[
   {name:'iron_helmet',count:1},{name:'netherite_helmet',count:1}]}}
 assert.equal(bestArmorChoice(bot).item.name,'netherite_helmet')
 assert(armorScore('diamond_helmet','helmet')>armorScore('iron_helmet','helmet'))
})
test('chest search fails closed without registry data, never opens anything',async()=>{
 const b={entity:{position:{x:0,y:0,z:0}},registry:{itemsByName:{}},inventory:{items:()=>[]}}
 const r=await transferNearby(b,{}, {direction:'withdraw',item:'diamond',amount:1})
 assert.equal(r.reason,'unknown_item_in_registry')
})


test('unknown bed occupancy is not treated as an empty bed',()=>{
 const {hasNearbyBed}=require('../src/life_actions.cjs')
 const p={x:1,y:64,z:0,distanceTo(){return 1}}
 const bot={time:{timeOfDay:14000},game:{dimension:'overworld'},
  entity:{position:{x:0,y:64,z:0}},findBlocks:()=>[p],blockAt:()=>({name:'red_bed',position:p})}
 assert.equal(hasNearbyBed(bot),false)
 bot.parseBedMetadata=()=>({occupied:1})
 assert.equal(hasNearbyBed(bot),false)
 bot.parseBedMetadata=()=>({occupied:0})
 assert.equal(hasNearbyBed(bot),true)
})
