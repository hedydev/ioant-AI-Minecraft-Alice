'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {safeShelteredFood}=require('../src/food_safety.cjs')
test('eat during a verified wall shelter, never unknown exposure or recent hit',()=>{
 const shield={allowFollow:true,reason:'hostile_behind_observed_barrier'}
 const mobile={allowFollow:true,reason:'escort_moving_owner'}
 assert.equal(safeShelteredFood({health:13}),true)
 assert.equal(safeShelteredFood({health:13,danger:{},escort:shield,now:100000}),true)
 assert.equal(safeShelteredFood({health:13,danger:{},escort:mobile,now:100000}),false)
 assert.equal(safeShelteredFood({health:8,danger:{},escort:shield,now:100000}),false)
 assert.equal(safeShelteredFood({health:13,danger:{},escort:shield,now:100000,recentHurtAt:99000}),false)
 assert.equal(safeShelteredFood({health:13,danger:{},escort:shield,now:100000,recentHurtAt:90000}),true)
})
