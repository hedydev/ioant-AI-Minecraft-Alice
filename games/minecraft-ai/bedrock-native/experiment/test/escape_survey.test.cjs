'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {surveyEscape}=require('../src/escape_survey.cjs')
const pos=(x,y,z)=>({x,y,z,offset(dx,dy,dz){return pos(x+dx,y+dy,z+dz)}})
const air={name:'air',boundingBox:'empty'}
const solid=name=>({name,boundingBox:'block'})
function room({radius=6,door=false,stairs=false,artificialFloor=true,openHall=false,unknown=false}={}){
 let reads=0,actions=0
 const bot={entity:{position:pos(.5,65,.5),onGround:true},
  blockAt(p){reads++;const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
    if(unknown && x>=1)return null
    if(y===64)return (Math.abs(x)<=1&&Math.abs(z)<=1)||openHall&&x>=0&&x<=radius&&z===0?
       solid(artificialFloor?'oak_planks':'grass_block'):air
    if(openHall&&x>=0&&x<=radius&&z===0)return air
    if(x===2&&z===0&&y===65&&door)return solid('oak_door')
    if(x===2&&z===0&&y===65&&stairs)return solid('oak_stairs')
    if(y===65&&Math.abs(x)<=1&&Math.abs(z)<=1)return air
    if(y===66&&Math.abs(x)<=1&&Math.abs(z)<=1)return air
    if(y>=65&&y<=66)return solid('stone_bricks')
    return air
  },
  dig(){actions++},activateBlock(){actions++},setControlState(){actions++}}
 return {bot,reads:()=>reads,actions:()=>actions}
}
test('artificial plank room with closed wooden door suggests interaction, never digs',()=>{
 const r=room({door:true}),s=surveyEscape(r.bot,{radius:4})
 assert.equal(s.status,'door_interaction_candidate',JSON.stringify(s))
 assert.equal(s.openFrontier,null)
 assert(s.doorCandidates.some(d=>d.kind==='wooden_door'))
 assert.equal(s.canModifyWorld,false)
 assert.equal(r.actions(),0)
 assert(s.reachableCells>=9)
})
test('artificial-floor corridor is an observed frontier, not a confirmed exit',()=>{
 const r=room({openHall:true,radius:5}),s=surveyEscape(r.bot,{radius:5})
 assert.equal(s.status,'open_frontier_observed',JSON.stringify(s))
 assert.equal(s.openFrontier.kind,'observed_open_frontier_not_confirmed_exit')
 assert(s.openFrontier.steps>=4)
 assert.equal(r.actions(),0)
})
test('constructed walls are not automatically eligible for mining',()=>{
 const r=room(),s=surveyEscape(r.bot)
 assert.equal(s.status,'no_non_destructive_exit_observed')
 assert(s.breakCandidates.some(p=>p.builtStructureLikely))
 assert(s.breakCandidates.every(p=>p.permitted===false&&p.breakable==='unverified'))
 assert.equal(r.actions(),0)
})
test('unknown chunk is not air nor break permission',()=>{
 const r=room({unknown:true}),s=surveyEscape(r.bot)
 assert(s.unknownCells>0)
 assert.equal(s.canModifyWorld,false)
 assert.equal(r.actions(),0)
})
test('stairs require shape-aware traversal validation',()=>{
 const r=room({stairs:true}),s=surveyEscape(r.bot)
 assert.equal(s.status,'shape_or_climb_unverified',JSON.stringify(s))
 assert(s.verticalObstacles.some(p=>p.kind==='oak_stairs'))
})
test('lower-level door records a bounded adjacent approach without authorizing motion',()=>{
 const r=room()
 r.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(z===0&&x===0)return y===64?solid('oak_planks'):y===65||y===66?air:solid('stone_bricks')
   if(z===0&&x===1)return y===63?solid('stone_bricks'):y===64||y===65?air:solid('stone_bricks')
   if(z===0&&x===2&&y===64)return solid('oak_door')
   return solid('stone_bricks')
 }
 const s=surveyEscape(r.bot,{radius:4})
 assert.equal(s.status,'door_interaction_candidate',JSON.stringify(s))
 const d=s.doorCandidates[0]
 assert.deepEqual(d.position,[2,64,0])
 assert.deepEqual(d.approach.position,[1,64,0])
 assert.deepEqual(d.approach.waypoints,[[1,64,0]])
 assert.equal(d.approach.elevationChanges,1)
 assert.equal(d.approach.routeComplete,true)
 assert.equal(d.approach.serverVerified,false)
 assert.equal(d.permitted,false)
 assert.equal(r.actions(),0)
})

test('ungrounded client position fails closed without probing blocks',()=>{
 const r=room();r.bot.entity.onGround=false
 const s=surveyEscape(r.bot)
 assert.equal(s.status,'unknown')
 assert.equal(s.reason,'position_ground_or_cache_unverified')
 assert.equal(r.reads(),0)
})
test('inspection budget is finite in large open world',()=>{
 const r=room({openHall:true,radius:100}),s=surveyEscape(r.bot,{radius:100,maxNodes:10000})
 assert(s.observedCells<=1600)
 assert(s.reachableCells<=160)
 assert.equal(r.actions(),0)
})
test('survey traces one-full-block rise over known full support',()=>{
 const r=room();r.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(z!==0||x<0||x>4)return null
   const floorY=x===0?64:65
   return y===floorY?solid(x===0?'oak_planks':'stone_bricks'):air
 }
 const s=surveyEscape(r.bot,{radius:4})
 assert.equal(s.status,'open_frontier_observed',JSON.stringify(s))
 assert(s.openFrontier.elevationChanges>=1)
 assert.equal(r.actions(),0)
})
test('slab cannot count as known full support',()=>{
 const r=room()
 r.bot.blockAt=p=>({name:p.y===64?'oak_slab':'air',boundingBox:p.y===64?'block':'empty',
  shapes:p.y===64?[[0,0,0,1,0.5,1]]:[]})
 const s=surveyEscape(r.bot)
 assert.equal(s.status,'current_tile_unverified')
 assert.equal(r.actions(),0)
})

test('door on one-block raised landing is observed from a proven adjacent floor, not traversed',()=>{
 const r=room()
 const original=r.bot.blockAt
 r.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)return solid('oak_planks')
   if(x===2&&z===0&&(y===66||y===67))return solid('spruce_door')
   return original(p)
 }
 const s=surveyEscape(r.bot,{radius:4})
 assert.equal(s.status,'door_interaction_candidate',JSON.stringify(s))
 const d=s.doorCandidates.find(d=>d.position.join(',')==='2,66,0')
 assert(d,JSON.stringify(s))
 assert.deepEqual(d.approach.position,[1,65,0])
 assert.equal(d.doorLevelAboveApproach,1)
 assert.equal(d.approach.routeComplete,true)
 assert.equal(d.approach.serverVerified,false)
 assert.equal(d.permitted,false)
 assert.equal(r.actions(),0)
})
test('raised door with unknown or nonfull underlying landing is NOT trusted',()=>{
 for(const floor of [null,{name:'oak_slab',boundingBox:'block',shapes:[[0,0,0,1,.5,1]]}]){
  const r=room()
  const original=r.bot.blockAt
  r.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)return floor
   if(x===2&&z===0&&(y===66||y===67))return solid('spruce_door')
   return original(p)
  }
  const s=surveyEscape(r.bot,{radius:4})
  assert.equal(s.doorCandidates.length,0,JSON.stringify(s))
  assert.equal(r.actions(),0)
 }
})

test('read-only raised door room can propose loaded safe approach to free bed, never execute',()=>{
 const r=room({openHall:true,radius:6})
 r.bot.parseBedMetadata=()=>({occupied:0})
 const original=r.bot.blockAt
 r.bot.blockAt=p=>Math.floor(p.x)===5&&Math.floor(p.z)===0&&Math.floor(p.y)===65?
  {name:'red_bed',boundingBox:'block'}:original(p)
 const s=surveyEscape(r.bot,{radius:6,bedPositions:[pos(5,65,0)]})
 assert.equal(s.bedApproach.status,'observed_route_candidate',JSON.stringify(s))
 assert(s.bedApproach.steps>=3&&s.bedApproach.steps<=6)
 assert.equal(s.bedApproach.routeComplete,true)
 assert.equal(s.bedApproach.permitted,false)
 assert.equal(s.bedApproach.serverVerified,false)
 assert.equal(r.actions(),0)
})
test('unknown, occupied and blocked bed approaches are never suggested as paths',()=>{
 for(const opt of [{unknown:true},{door:true}]){
  const r=room(opt)
  r.bot.parseBedMetadata=()=>({occupied:0})
  assert.equal(surveyEscape(r.bot,{radius:5,bedPositions:[pos(5,65,0)]}).bedApproach,null)
  assert.equal(r.actions(),0)
 }
 const r=room({openHall:true,radius:6})
 const original=r.bot.blockAt
 r.bot.blockAt=p=>Math.floor(p.x)===5&&Math.floor(p.z)===0&&Math.floor(p.y)===65?
  {name:'red_bed',boundingBox:'block'}:original(p)
 r.bot.parseBedMetadata=()=>({occupied:1})
 assert.equal(surveyEscape(r.bot,{radius:6,bedPositions:[pos(5,65,0)]}).bedApproach,null)
 assert.equal(r.actions(),0)
})
