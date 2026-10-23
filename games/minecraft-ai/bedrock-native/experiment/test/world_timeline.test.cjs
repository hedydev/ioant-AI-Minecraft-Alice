'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {timelineSignature,shouldReplaceTimeline}=require('../../../dashboard/world_timeline.js');
test('identical one-second snapshots leave selected log DOM intact',()=>{
 const rows=[{at:100,level:'info',message:'[Alice autonomy] state: IDLE'}];
 const prev=timelineSignature(rows),next=timelineSignature(rows.map(x=>({...x})));
 assert.equal(prev,next);
 assert.equal(shouldReplaceTimeline({previous:prev,next}),false);
});
test('new records are deferred during mouse drag or text selection',()=>{
 const old=timelineSignature([{at:100,level:'info',message:'IDLE'}]);
 const next=timelineSignature([{at:101,level:'info',message:'IDLE gate: companion_mode'}]);
 assert.equal(shouldReplaceTimeline({previous:old,next,pointerActive:true}),false);
 assert.equal(shouldReplaceTimeline({previous:old,next,selectionActive:true}),false);
 assert.equal(shouldReplaceTimeline({previous:old,next}),true);
});
test('copy protection does not suppress updates after selection clears',()=>{
 const previous=timelineSignature([], 'waiting'),next=timelineSignature([], 'offline');
 assert.notEqual(previous,next);
 assert.equal(shouldReplaceTimeline({previous,next,selectionActive:false,pointerActive:false}),true);
});
