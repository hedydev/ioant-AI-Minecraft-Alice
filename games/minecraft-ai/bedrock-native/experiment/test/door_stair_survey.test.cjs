'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {surveyEscape}=require('../src/escape_survey.cjs')
const {validatePassageGeometry}=require('../src/escape_crossing.cjs')
const v=(x,y,z)=>({x,y,z,offset(a,b,c){return v(x+a,y+b,z+c)}})
function room({rise=true,roof=false,closed=false}={}){
 return {entity:{position:v(.5,65,.5),onGround:true},entities:{},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(y===64)return {name:'stone',boundingBox:'block'}
   if(x===1&&z===0&&(y===65||y===66))
    return {name:'spruce_door',boundingBox:'block',getProperties:()=>({
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
