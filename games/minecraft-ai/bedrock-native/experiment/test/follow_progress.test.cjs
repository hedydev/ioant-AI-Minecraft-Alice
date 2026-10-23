'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {FollowProgress}=require('../src/follow_progress.cjs')
const p=(x,z=0)=>({x,y:64,z})
test('within 3 blocks is expected to stand still and not repath',()=>{
 const f=new FollowProgress();f.reset('Steve',p(0),p(2),0)
 for(let n=1;n<=6;n++){const r=f.observe({name:'Steve',now:n*7000,self:p(0),target:p(2)})
  assert.equal(r.action,null);assert.equal(r.observation.withinFollowRadius,true)}
})
test('not closing and not moving triggers non-destructive bounded repath, then hold',()=>{
 const f=new FollowProgress();f.reset('Steve',p(0),p(10),0)
 assert.equal(f.observe({name:'Steve',now:7000,self:p(0),target:p(10)}).action,null)
 assert.equal(f.observe({name:'Steve',now:14000,self:p(0),target:p(10)}).action,'repath')
 assert.equal(f.observe({name:'Steve',now:21000,self:p(0),target:p(10)}).action,null)
 assert.equal(f.observe({name:'Steve',now:30000,self:p(0),target:p(10)}).action,'repath')
 assert.equal(f.observe({name:'Steve',now:37000,self:p(0),target:p(10)}).action,null)
 assert.equal(f.observe({name:'Steve',now:47000,self:p(0),target:p(10)}).action,'hold')
 assert.equal(f.onHold(60000),true);assert.equal(f.onHold(67000),false)
})
test('moving away while target is stationary is not counted as successful pursuit',()=>{
 const f=new FollowProgress();f.reset('Steve',p(0),p(8),0)
 assert.equal(f.observe({name:'Steve',now:7000,self:p(-3),target:p(8)}).observation.closingBlocks,-3)
 assert.equal(f.observe({name:'Steve',now:14000,self:p(-5),target:p(8)}).action,'repath')
})
test('advancing toward visible player clears stale retries',()=>{
 const f=new FollowProgress();f.reset('Steve',p(0),p(12),0)
 f.observe({name:'Steve',now:7000,self:p(0),target:p(12)})
 f.observe({name:'Steve',now:14000,self:p(0),target:p(12)})
 assert.equal(f.retries,1)
 const r=f.observe({name:'Steve',now:21000,self:p(4),target:p(12)})
 assert.equal(r.action,null);assert.equal(r.observation.closingBlocks,4)
 assert.equal(f.retries,0)
})
test('path status updates expose no arbitrary upstream packet values',()=>{
 const f=new FollowProgress();assert.deepEqual(f.pathUpdate({status:'noPath',path:[]}),{status:'noPath',pathLength:0})
 assert.deepEqual(f.pathUpdate({status:'auth=TOKEN',path:[1]}),{status:'unknown',pathLength:1})
})
test('real 4.15 blocks outside follow radius, success + no active path is STALLED',()=>{
 const f=new FollowProgress()
 f.reset('HedyCommon',{x:0,y:69,z:0},{x:4.15,y:69,z:0},0)
 f.pathUpdate({status:'success',path:[{x:1},{x:2}]})
 const a=f.observe({name:'HedyCommon',now:7000,
   self:{x:0,y:69,z:0},target:{x:4.15,y:69,z:0},pathMoving:false})
 assert.equal(a.observation.stalledWindows,1)
 assert.equal(a.observation.falseGoalSuccess,true)
 assert.equal(a.action,null)
 const b=f.observe({name:'HedyCommon',now:14000,
   self:{x:0,y:69,z:0},target:{x:4.15,y:69,z:0},pathMoving:false})
 assert.equal(b.action,'repath')
 assert.equal(b.observation.stalledWindows,2)
})
test('a player already within follow distance must not re-path despite pathfinder success',()=>{
 const f=new FollowProgress()
 f.reset('HedyCommon',{x:0,y:69,z:0},{x:2.95,y:69,z:0},0)
 f.pathUpdate({status:'success',path:[]})
 for(let i=1;i<6;i++){
   const r=f.observe({name:'HedyCommon',now:i*7000,
     self:{x:0,y:69,z:0},target:{x:2.95,y:69,z:0},pathMoving:false})
   assert.equal(r.action,null)
   assert.equal(r.observation.stalledWindows,0)
 }
})
test('one 1-block high separation may stall safely, but the progress watcher never presses jump',()=>{
 const f=new FollowProgress()
 f.reset('HedyCommon',{x:0,y:69,z:0},{x:3.8,y:70,z:0},0)
 f.pathUpdate({status:'success',path:[]})
 f.observe({name:'HedyCommon',now:7000,self:{x:0,y:69,z:0},
   target:{x:3.8,y:70,z:0},pathMoving:false})
 const r=f.observe({name:'HedyCommon',now:14000,self:{x:0,y:69,z:0},
   target:{x:3.8,y:70,z:0},pathMoving:false})
 assert.equal(r.action,'repath')
})
