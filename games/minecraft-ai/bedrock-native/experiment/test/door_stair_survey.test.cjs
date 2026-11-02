'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {surveyEscape}=require('../src/escape_survey.cjs')
const {validatePassageGeometry}=require('../src/escape_crossing.cjs')
const {planRaisedDoorThreshold}=require('../src/raised_door_threshold.cjs')
const {candidateOneBlockJump}=require('../src/one_block_jump.cjs')
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}})
function room({rise=true,roof=false,closed=false,unsupportedBelowRise=false}={}){
 return {game:{dimension:'overworld'},entity:{position:v(.5,65,.5),onGround:true},entities:{},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(y===64&&x===2&&z===0&&unsupportedBelowRise)
    return {name:'air',boundingBox:'empty'}
   if(y===64)return {name:'stone',boundingBox:'block'}
   if(x===1&&z===0&&(y===65||y===66))
    return {name:'spruce_door',boundingBox:'block',
     shapes:[[0,0,0,1,1,.125]],getProperties:()=>({
     open_bit:closed?0:1,upper_block_bit:y===66?1:0})}
   if(rise&&x===2&&z===0&&y===65)return {name:'stone',boundingBox:'block'}
   if(roof&&y===67)return {name:'stone',boundingBox:'block'}
   if((x===1&&Math.abs(z)>0)||x===2&&z!==0)
    return {name:'stone',boundingBox:'block'}
   return {name:'air',boundingBox:'empty'}
  }}
}
test('read-only survey sees full-cube rise immediately after a two-high wooden door',()=>{
 const bot=room(),r=surveyEscape(bot,{radius:4,maxNodes:100})
 const d=r.doorCandidates.find(x=>x.position.join(',')==='1,65,0')
 assert(d)
 assert.equal(d.beyondDoorTerrain,'observed_one_full_block_rise')
 assert.equal(d.doorToStairsVerified,false)
 assert.equal(d.permitted,false)
 assert.equal(validatePassageGeometry(bot,d).reason,'crossing_raised_full_block_landing_requires_jump')
})
test('unknown or blocked stair headroom is not an observed safe one-block ascent',()=>{
 const bot=room({roof:true}),r=surveyEscape(bot,{radius:4,maxNodes:100})
 const d=r.doorCandidates.find(x=>x.position.join(',')==='1,65,0')
 assert(d)
 assert.notEqual(d.beyondDoorTerrain,'observed_one_full_block_rise')
})
test('flat terrain beyond door must not be reported as requiring a jump',()=>{
 const bot=room({rise:false}),r=surveyEscape(bot,{radius:4,maxNodes:100})
 const d=r.doorCandidates.find(x=>x.position.join(',')==='1,65,0')
 assert(d)
 assert.notEqual(d.beyondDoorTerrain,'observed_one_full_block_rise')
})

test('raised doorway permits only a separate observed door-cell threshold, not flat crossing',()=>{
 const bot=room(),door=surveyEscape(bot,{radius:4,maxNodes:100})
   .doorCandidates.find(d=>d.position.join(',')==='1,65,0')
 assert.equal(planRaisedDoorThreshold(bot,door).ok,true)
 assert.equal(validatePassageGeometry(bot,door).ok,false)
})
test('open door cell can become one-block jump takeoff only with its collision lane',()=>{
 const bot=room()
 bot.entity.position=v(1.5,65,.5)
 const c=candidateOneBlockJump(bot,{toward:{x:3.5,y:66,z:.5}})
 assert.equal(c.ok,true)
 assert.deepEqual(c.target,{x:2,y:66,z:0})
 const original=bot.blockAt
 bot.blockAt=p=>Math.floor(p.x)===1&&Math.floor(p.y)===65&&Math.floor(p.z)===0?
   {name:'spruce_door',boundingBox:'block',
    shapes:[[0,0,0,1,1,.125]],
    getProperties:()=>({open_bit:0,upper_block_bit:0})}:original(p)
 assert.equal(candidateOneBlockJump(bot,{toward:{x:3.5,y:66,z:.5}}).ok,false)
})

test('a raised full cube is recognized even without another lower floor beyond the door',()=>{
 const bot=room({unsupportedBelowRise:true})
 const result=surveyEscape(bot,{radius:4,maxNodes:100})
 const door=result.doorCandidates.find(d=>d.position.join(',')==='1,65,0')
 assert(door)
 assert.equal(door.beyondDoorTerrain,'observed_one_full_block_rise')
 assert.equal(validatePassageGeometry(bot,door).reason,
   'crossing_raised_full_block_landing_requires_jump')
 assert.equal(planRaisedDoorThreshold(bot,door).ok,true)
})
