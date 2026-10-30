'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {BedrockOperations}=require('../src/operations.cjs')
const life=require('../src/life_actions.cjs')
const position=(x,y,z)=>({x,y,z,
 offset(a,b,c){return position(x+a,y+b,z+c)},
 distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}})
test('real item in inventory is equipped as held sword before broken armor flow',async()=>{
 const sword={name:'iron_sword',count:1},armor={name:'iron_chestplate',count:1}
 let held=null,armors=0
 const bot={inventory:{items:()=>[sword,armor],slots:[]},
  get heldItem(){return held},async equip(item,dest){
   if(dest==='hand')held=item;else armors++
  }}
 const ops=new BedrockOperations({bot,api:{}})
 const result=await ops.equipAuto({chooseWeapon:items=>items.find(i=>i.name==='iron_sword')})
 assert.equal(result.ok,true)
 assert.equal(result.kind,'weapon')
 assert.equal(bot.heldItem.name,'iron_sword')
 assert.equal(armors,0)
 const evidence=life.equipmentSnapshot(bot,items=>items.find(i=>i.name==='iron_sword'))
 assert.equal(evidence.heldItem,'iron_sword')
 assert.equal(evidence.weaponInInventory,'iron_sword')
})
test('adjacent clear Bedrock bed can sleep without moving injured Alice',async()=>{
 const bedPosition=position(1,64,0),here=position(0.5,64,0.5)
 const bed={name:'red_bed',position:bedPosition,boundingBox:'block'}
 let walks=0,sleeps=0
 const bot={health:13,food:16,entity:{position:here},game:{dimension:'overworld'},
   time:{timeOfDay:15000},entities:{},blockAt:()=>bed,
   parseBedMetadata:()=>({occupied:0}),findBlocks:()=>[bedPosition],
   pathfinder:{goto:async()=>{walks++},stop(){}},
   async sleep(){sleeps++;this.isSleeping=true}}
 const api={GoalNear:class{}}
 const r=await life.sleepNearby(bot,api,{knownPositions:[bedPosition]})
 assert.equal(r.ok,true)
 assert.equal(sleeps,1)
 assert.equal(walks,0,'within 2.4 blocks never uses unverified navigation')
})
test('Bedrock hostile bed exclusion is 8 blocks horizontal and 5 vertical even behind wall',()=>{
 const bed={position:position(0,64,0)}
 const bot={entities:{one:{name:'zombie',position:position(8.1,64,0)}}}
 assert.equal(life.monstersNearBed(bot,bed),false)
 bot.entities.one.position=position(7.9,64,0)
 assert.equal(life.monstersNearBed(bot,bed),true)
 bot.entities.one.position=position(4,69.1,0)
 assert.equal(life.monstersNearBed(bot,bed),false)
})
