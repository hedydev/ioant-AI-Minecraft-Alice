'use strict'
// A narrow, read-only physics shape analysis for an already observed OPEN
// Bedrock wooden door. All results are local collision estimates, never proof
// that the remote BDS player walked. Never edit block.shapes or input packets.
const {observedDoorBits}=require('./escape_door_action.cjs')
const PLAYER_HALF_WIDTH=.3,EDGE_MARGIN=.018
const finite=n=>Number.isFinite(n)
const xyz=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isSafeInteger)
function planOpenDoorLane(bot,geometry,{halfWidth=PLAYER_HALF_WIDTH,margin=EDGE_MARGIN}={}){
 const fail=reason=>({ok:false,reason})
 const p=bot?.entity?.position,d=geometry?.door,a=geometry?.from
 if(!p||![p.x,p.y,p.z].every(finite)||!p.offset||!xyz(d)||!xyz(a)||
    d[1]!==a[1]||Math.abs(d[0]-a[0])+Math.abs(d[2]-a[2])!==1||
    !finite(halfWidth)||halfWidth<.25||halfWidth>.4||!finite(margin)||margin<0||margin>.05)
   return fail('door_lane_geometry_unverified')
 const axis=d[0]===a[0]?'x':'z'
 const coord=axis==='x'?0:2
 let blocks
 try{
   blocks=[0,1].map(dy=>bot.blockAt(p.offset(d[0]-p.x,d[1]+dy-p.y,d[2]-p.z)))
 }catch{return fail('door_lane_block_unavailable')}
 const intervals=[]
 for(let i=0;i<blocks.length;i++){
   const block=blocks[i],state=observedDoorBits(block)
   if(!block||!/_door$/.test(String(block.name||''))||
      (i===0&&(state.open!==true||state.upper!==false))||
      (i===1&&state.upper!==true))
      return fail('door_lane_open_state_unverified')
   if(!Array.isArray(block.shapes)||block.shapes.length<1||block.shapes.length>8)
      return fail('door_lane_collision_shapes_unavailable')
   for(const shape of block.shapes){
     if(!Array.isArray(shape)||shape.length!==6||!shape.every(finite)||
       shape.some((v,j)=>v<0||v>1||j<3&&v>shape[j+3]))
       return fail('door_lane_collision_shape_invalid')
     // Both Bedrock door halves may expose open_bit differently. Their
     // actual collision boxes, not upper-half open_bit, determine passage.
     intervals.push([shape[coord],shape[coord+3]])
   }
 }
 intervals.sort((a,b)=>a[0]-b[0])
 const blocked=[]
 for(const range of intervals){
   if(!blocked.length||range[0]>blocked.at(-1)[1])blocked.push(range.slice())
   else blocked.at(-1)[1]=Math.max(blocked.at(-1)[1],range[1])
 }
 let prev=0,options=[]
 for(const [lo,hi] of blocked.concat([[1,1]])){
   const min=prev+halfWidth+margin,max=lo-halfWidth-margin
   if(max>=min)options.push({min,max,target:(min+max)/2})
   prev=Math.max(prev,hi)
 }
 if(!options.length)return fail('door_lane_no_body_width_clearance')
 const current=p[axis]-d[coord],chosen=options
   .sort((a,b)=>Math.abs(a.target-current)-Math.abs(b.target-current))[0]
 const correction=chosen.target-current
 // Keep the whole avatar inside the already verified one-cell-wide passage.
 return {ok:true,axis,target:d[coord]+chosen.target,requiredShift:correction,
   localLateral:current,validMin:d[coord]+chosen.min,validMax:d[coord]+chosen.max,
   physicalHalfWidth:halfWidth,shapeCount:intervals.length,
   worldModification:false,serverMovementVerified:false}
}
module.exports={planOpenDoorLane,PLAYER_HALF_WIDTH,EDGE_MARGIN}
