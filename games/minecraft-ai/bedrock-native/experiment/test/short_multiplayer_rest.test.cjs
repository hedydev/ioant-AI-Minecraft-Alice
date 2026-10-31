'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {finishShortMultiplayerRest,otherPlayersOnline}=require('../src/life_actions.cjs')
test('with an online companion, enter bed then wake; night need not be skipped',async()=>{
 const bot={username:'AliceXbox',isSleeping:true,players:{
  AliceXbox:{username:'AliceXbox'},Steve:{username:'Steve',entity:{position:{x:2,y:64,z:2}}}},
  async wake(){this.isSleeping=false}}
 assert.equal(Boolean(otherPlayersOnline(bot)),true)
 const r=await finishShortMultiplayerRest(bot,{sleep:async()=>{}})
 assert.equal(r.ok,true);assert.equal(r.entered,true);assert.equal(r.woke,true)
 assert.equal(r.insomniaResetInferred,true);assert.equal(bot.isSleeping,false)
})
test('alone: stay asleep to skip night, never wake for imagined players',async()=>{
 let woke=0
 const bot={username:'AliceXbox',isSleeping:true,
   players:{AliceXbox:{username:'AliceXbox'}},async wake(){woke++}}
 const r=await finishShortMultiplayerRest(bot)
 assert.equal(r.ok,true);assert.equal(r.woke,false);assert.equal(woke,0)
})
test('without observed bed entry or wake response never claim rest success',async()=>{
 assert.equal((await finishShortMultiplayerRest({isSleeping:false})).entered,false)
 const bot={username:'AliceXbox',isSleeping:true,
  players:{Steve:{username:'Steve',entity:{position:{x:0,y:0,z:0}}}},wake:async()=>{}}
 const r=await finishShortMultiplayerRest(bot,{sleep:async()=>{}})
 assert.equal(r.ok,false);assert.equal(r.reason,'wake_not_confirmed')
 assert.equal(r.entered,true)
})
