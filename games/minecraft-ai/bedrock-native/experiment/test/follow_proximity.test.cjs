'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {followProximity}=require('../src/follow_proximity.cjs')
test('configured three-block stop and vertically separate stair target',()=>{
 const a={x:0,y:64,z:0}
 assert.equal(followProximity(a,{x:3,y:64,z:0},3).inside,true)
 assert.equal(followProximity(a,{x:3.01,y:64,z:0},3).inside,false)
 assert.equal(followProximity(a,{x:1,y:65,z:0},3).inside,false)
 assert.equal(followProximity(a,{x:1,y:64.5,z:0},3).inside,true)
 assert.equal(followProximity(a,{x:NaN,y:64,z:0},3).inside,false)
 assert.equal(followProximity(a,{x:2,y:64,z:0},0).inside,false)
})
