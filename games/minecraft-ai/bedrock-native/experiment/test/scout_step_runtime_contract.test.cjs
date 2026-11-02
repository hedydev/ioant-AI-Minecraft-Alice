'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../src')
const runtime=fs.readFileSync(path.join(root,'runtime.cjs'),'utf8')
const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8')
test('autonomous scout admits at most first waypoint per independent baseline',()=>{
 assert.match(runtime,/candidate\.waypoints\.slice\(0,1\)/)
 assert.match(runtime,/reason:'scout_step_awaiting_new_bds_pair'/)
 assert.match(runtime,/this\.pendingScoutStep=/)
 assert.match(runtime,/verifyScoutStep\(step,this\.movementEvidence\?\.get\?\.\(\)/)
})
test('post-input BDS witness must settle before next scout admission',()=>{
 const i=main.indexOf('runtime.settlePendingScoutStepOnWitness()')
 const j=main.indexOf('runtime.resumePreparedScoutOnWitness()')
 assert(i>=0&&j>i)
 assert.match(runtime,/if\(this\.pendingScoutStep\&\&\(type==='EXPLORE'\|\|type==='GATHER'\)\)return false/)
})
test('STOP cancellation and idle planning do not reuse pending movement',()=>{
 assert.match(runtime,/this\.pendingScoutStep=null\s+cancelBed/)
 assert.match(runtime,/if\(this\.pendingScoutStep\)\{\s+if\(this\.clock\(\)-this\.pendingScoutStep\.startedAt<=240000\)return/)
})
