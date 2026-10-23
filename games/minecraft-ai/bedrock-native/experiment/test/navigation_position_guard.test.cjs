'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {installNavigationPositionGuard}=require('../src/navigation_position_guard.cjs')
function setup(pos={x:0.5,y:69,z:0.5}){
 const calls=[]
 const bot={entity:{position:{...pos}},pathfinder:{
   goto(goal){calls.push(['goto',goal]);return Promise.resolve('ok')},
   setGoal(goal){calls.push(['setGoal',goal]);return 'set'},
   stop(){calls.push(['stop'])}
 }}
 const e={get:()=>({lastSource:'bds_querytarget',latestFeet:{x:.5,y:69,z:.5},
   independentSamples:3,lastAt:9000})}
 return {bot,e,calls}
}
test('pathfinder goto and setGoal both admit fresh aligned BDS position',async()=>{
 const {bot,e,calls}=setup()
 const origGoto=bot.pathfinder.goto,origGoal=bot.pathfinder.setGoal
 const gate=installNavigationPositionGuard(bot,e,{clock:()=>10000})
 assert.equal(await bot.pathfinder.goto({x:1}),'ok')
 assert.equal(bot.pathfinder.setGoal({x:2}),'set')
 assert.equal(calls.length,2)
 assert.equal(gate.snapshot().rejected,0)
 gate.detach()
 assert.equal(bot.pathfinder.goto,origGoto)
 assert.equal(bot.pathfinder.setGoal,origGoal)
})
test('GATHER goto refuses local/server drift; cancellation remains allowed',()=>{
 const {bot,e,calls}=setup({x:3,y:69,z:.5})
 const rejected=[]
 const gate=installNavigationPositionGuard(bot,e,{clock:()=>10000,onReject:x=>rejected.push(x)})
 assert.throws(()=>bot.pathfinder.goto({x:4}),/navigation_scout_client_server_position_diverged/)
 assert.equal(bot.pathfinder.setGoal({x:4}),false)
 assert.equal(bot.pathfinder.setGoal(null),'set')
 assert.equal(rejected.length,2)
 assert.equal(gate.snapshot().rejected,2)
 assert.deepEqual(calls,[['setGoal',null]])
 gate.detach()
})
test('untrusted stale BDS witness fails closed for normal follow',()=>{
 const {bot,e}=setup()
 e.get=()=>({lastSource:'bds_querytarget',latestFeet:{x:.5,y:69,z:.5},
    independentSamples:1,lastAt:9000})
 installNavigationPositionGuard(bot,e,{clock:()=>10000})
 assert.equal(bot.pathfinder.setGoal({dynamic:true}),false)
})
test('original methods not changed when disabled',()=>{
 const {bot,e}=setup({x:90,y:69,z:0})
 const gate=installNavigationPositionGuard(bot,e,{enabled:false})
 assert.doesNotThrow(()=>bot.pathfinder.setGoal({x:22}))
 assert.equal(gate.snapshot().rejected,0)
 gate.detach()
})
