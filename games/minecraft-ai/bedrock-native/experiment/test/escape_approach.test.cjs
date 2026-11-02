'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {validateApproach,approachDoor}=require('../src/escape_approach.cjs')
const vec=(x,y,z)=>({x,y,z,offset(a,b,c){return vec(x+a,y+b,z+c)}})
const delay=()=>new Promise(resolve=>setImmediate(resolve))
function fixture({unknown=false,noPath=false}={}){
 const events=[],bot={entity:{position:vec(.5,65,.5),onGround:true},
  blockAt(p){
   const x=Math.floor(p.x),z=Math.floor(p.z),y=Math.floor(p.y)
   if(unknown&&z===2)return null
   if(x!==0||z<0||z>5)return {name:'stone_bricks',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
   return y===64?{name:'oak_planks',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}:
     {name:'air',boundingBox:'empty',shapes:[]}
  },
  pathfinder:{setMovements(m){events.push(['moves',m])},
   async goto(g){events.push(['goto',g.x,g.y,g.z]);if(noPath)throw Error('No path to the goal!')
     bot.entity.position=vec(g.x+.5,g.y,g.z+.5)},
   stop(){events.push(['stop'])}},
  dig(){events.push(['dig'])},activateBlock(){events.push(['activate'])}
 }
 const door={kind:'wooden_door',permitted:false,position:[0,65,5],
  approach:{position:[0,65,4],steps:4,routeComplete:true,
   elevationChanges:0,serverVerified:false,
   waypoints:[[0,65,1],[0,65,2],[0,65,3],[0,65,4]]}}
 return {bot,door,events}
}
const GoalNear=class{constructor(x,y,z){Object.assign(this,{x,y,z})}}
const Movements=class{constructor(){this.openable=new Set()}}
const witness={get:()=>({independentSource:'bds_querytarget',
 independentSamples:3,independentAt:99980,independentPreviousAt:99950,
 independentLatestFeet:{x:.5,y:65,z:.5},loginAt:90000,lifeEpochAt:null})}
const config={GoalNear,Movements,configureMoves:()=>{},clock:()=>100000,
 movementEvidence:witness}
test('four-step proposal sends only ONE swept WALK and waits for new BDS pair',async()=>{
 const f=fixture()
 const gate=validateApproach(f.bot,f.door)
 assert.equal(gate.ok,true)
 const result=await approachDoor(f.bot,f.door,config)
 assert.equal(result.ok,false)
 assert.equal(result.reason,'approach_first_cell_awaits_independent_bds_pair')
 assert.equal(result.remainingSteps,3)
 assert.deepEqual(result.witnessStart.target,{x:0,y:65,z:1})
 assert.equal(result.serverMovementVerified,false)
 assert.equal(f.events.filter(e=>e[0]==='goto').length,1)
 assert.equal(f.events.some(e=>e[0]==='activate'||e[0]==='dig'),false)
 assert.equal(f.events.at(-1)[0],'stop')
})
test('missing terrain denies approach before any movement',async()=>{
 const f=fixture({unknown:true})
 assert.equal(validateApproach(f.bot,f.door).reason,'approach_cell_blocked_or_unloaded')
 const r=await approachDoor(f.bot,f.door,config)
 assert.equal(r.attempted,false)
 assert.equal(f.events.length,0)
})
test('STOP and threat preemption deny approach immediately',async()=>{
 const f=fixture()
 const result=await approachDoor(f.bot,f.door,{...config,safe:()=>false})
 assert.equal(result.reason,'approach_preempted')
 assert.equal(result.attempted,false)
 assert.equal(f.events.length,0)
})
test('noPath during walking is a failed observation, not a confirmed escape',async()=>{
 const f=fixture({noPath:true})
 const r=await approachDoor(f.bot,f.door,config)
 assert.equal(r.ok,false)
 assert.match(r.reason,/No path/)
 assert.equal(r.serverMovementVerified,false)
 assert.equal(f.events.filter(e=>e[0]==='goto').length,1)
 assert.equal(f.events.some(e=>e[0]==='activate'||e[0]==='dig'),false)
})
test('unbounded, vertical or broken sequences are rejected',()=>{
 const f=fixture()
 const broken={...f.door,approach:{...f.door.approach,
  waypoints:[[0,65,1],[0,65,3],[0,65,4]],steps:3}}
 assert.equal(validateApproach(f.bot,broken).ok,false)
 const vertical={...f.door,approach:{...f.door.approach,elevationChanges:1}}
 assert.equal(validateApproach(f.bot,vertical).ok,false)
 const tooLong={...f.door,approach:{...f.door.approach,steps:7,
  waypoints:[[0,65,1],[0,65,2],[0,65,3],[0,65,4],[0,65,5],[0,65,6],[0,65,7]]}}
 assert.equal(validateApproach(f.bot,tooLong).ok,false)
})
test('packet-level movement does not authorize next cell or claim BDS arrival',async()=>{
 const f=fixture()
 const r=await approachDoor(f.bot,f.door,config)
 assert.equal(r.ok,false)
 assert.equal(r.serverMovementVerified,false)
 assert.equal(r.reason,'approach_first_cell_awaits_independent_bds_pair')
 assert.equal(f.events.filter(x=>x[0]==='goto').length,1)
})
test('door approach rejects stale BDS or blocked player-width corridor before input',async()=>{
 const a=fixture()
 const denied=await approachDoor(a.bot,a.door,{...config,movementEvidence:null})
 assert.equal(denied.reason,'scout_bds_position_unavailable')
 assert.equal(a.events.filter(x=>x[0]==='goto').length,0)
 const b=fixture()
 const original=b.bot.blockAt
 b.bot.blockAt=p=>Math.floor(p.x)===0&&Math.floor(p.z)===1&&Math.floor(p.y)===66?
   {name:'cobblestone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}:original(p)
 const collision=await approachDoor(b.bot,b.door,config)
 assert.equal(collision.attempted,false)
 assert.equal(b.events.filter(x=>x[0]==='goto').length,0)
})

test('typed threat guard identifies the exact reason after first attempted waypoint',async()=>{
 const f=fixture()
 let checks=0
 const safe=()=>++checks>=3?{ok:false,reason:'hostile_threat_detected'}:{ok:true}
 const r=await approachDoor(f.bot,f.door,{...config,safe})
 assert.equal(r.ok,false)
 assert.equal(r.reason,'approach_preempted_after_move:hostile_threat_detected')
 assert.equal(r.attempted,true)
 assert.equal(r.serverMovementVerified,false)
 assert.equal(f.events.filter(x=>x[0]==='goto').length,1)
 assert.equal(f.events.some(x=>x[0]==='activate'||x[0]==='dig'),false)
})
test('typed initial safety-controller hold rejects all movement',async()=>{
 const f=fixture()
 const r=await approachDoor(f.bot,f.door,{...config,safe:()=>({ok:false,reason:'safety_controller_busy'})})
 assert.equal(r.ok,false)
 assert.equal(r.reason,'approach_preempted:safety_controller_busy')
 assert.equal(r.attempted,false)
 assert.equal(f.events.length,0)
})
