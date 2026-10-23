'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {environment,siteKey,FailureMemory,candidateScout,decideAutonomousResponse,classifyScoutFailure,BED_COOLDOWN_MS,SLEEP_COOLDOWN_MS}=require('../src/world_routine.cjs')
function vec(x,y,z){return {x,y,z,floored(){return vec(Math.floor(x),Math.floor(y),Math.floor(z))},
 offset(a,b,c){return vec(x+a,y+b,z+c)},distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}}}
function bot(t=6000){
 return {game:{dimension:'overworld'},time:{timeOfDay:t},isRaining:false,thunderState:0,health:20,
 entity:{position:vec(1.5,65,1.5),onGround:true},entities:{},blockAt:p=>({
   name:p.y===64?'grass_block':'air',boundingBox:p.y===64?'block':'empty'})}
}
test('time/day/night/dusk and thunder sleep rules use actual Bedrock observations',()=>{
 const b=bot()
 assert.equal(environment(b).phase,'day')
 assert.equal(environment(b).canSleep,false)
 b.time.timeOfDay=11500;assert.equal(environment(b).phase,'dusk')
 assert.equal(environment(b).canSleep,false)
 b.time.timeOfDay=13000;assert.equal(environment(b).canSleep,true)
 assert.equal(environment(b).safeToExplore,false)
 b.time.timeOfDay=6000;b.isRaining=true;b.thunderState=0.9
 assert.equal(environment(b).canSleep,true,'daytime thunderstorm allows sleeping')
 assert.equal(environment(b).safeToExplore,false)
 b.thunderState=0
 assert.equal(environment(b).canSleep,false,'ordinary rain at noon is not thunder')
 b.game.dimension='the_nether'
 assert.equal(environment(b).canSleep,false,'beds must never be used outside overworld')
 b.game.dimension='overworld';b.time.timeOfDay=12020
 assert.equal(environment(b).canSleep,true,'rain changes the sleep boundary')
})
test('site failure history backs off repeated wood/sleep/scout attempts by location',()=>{
 let now=100000
 const m=new FailureMemory(()=>now),p=vec(0,65,0)
 assert.equal(m.blocked('wood',p),null)
 const first=m.mark('wood',p,'actual 0/1 no_verified_natural_tree')
 assert.equal(first.reason,'no_verified_natural_tree')
 assert.equal(m.blocked('wood',p).attempts,1)
 now+=30000
 const next=m.mark('wood',p,'no_visible_log')
 assert.equal(next.attempts,2)
 assert(m.blocked('wood',p).remainingMs>600000)
 assert.equal(m.blocked('wood',vec(80,65,0)),null)
 assert.equal(m.mark('sleep',p,'bed_navigation_or_sleep_failed:bot did not sleep').reason,'bed_navigation_or_sleep_failed')
 now+=4000000
 assert.equal(m.blocked('wood',p),null)
 assert.equal(siteKey(vec(17,65,0)),'1,8,0')
})
test('failed-site cooldown persists privately across restart without touching skill memory',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-routine-'))
 try{
  const filename=path.join(root,'routine-failures.json'),p=vec(32,65,8)
  let now=100000
  const first=new FailureMemory(()=>now,filename)
  first.mark('wood',p,'no_verified_natural_tree')
  assert.equal(fs.statSync(filename).mode&0o777,0o600)
  const renewed=new FailureMemory(()=>now+1000,filename)
  assert.equal(renewed.blocked('wood',p).reason,'no_verified_natural_tree')
  const raw=fs.readFileSync(filename,'utf8')
  assert(!raw.includes('Xbox')&&!raw.includes('password'))
  now+=7200000
  assert.equal(new FailureMemory(()=>now,filename).blocked('wood',p),null)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('malformed history or symlink is ignored instead of blocking survival decisions',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-routine-'))
 try{
  const filename=path.join(root,'routine-failures.json')
  fs.writeFileSync(filename,'{}')
  const m=new FailureMemory(()=>100000,filename)
  assert.equal(m.blocked('wood',vec(0,64,0)),null)
  assert.equal(m.persistenceError,'read_unavailable')
  fs.rmSync(filename)
  const outside=path.join(root,'other')
  fs.writeFileSync(outside,'[]')
  fs.symlinkSync(outside,filename)
  const n=new FailureMemory(()=>100000,filename)
  n.mark('wood',vec(0,64,0),'no_verified_natural_tree')
  assert.equal(n.persistenceError,'write_unavailable')
  assert.equal(fs.readFileSync(outside,'utf8'),'[]')
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('scouting requires loaded flat natural corridor and rejects builds/void/hazard',()=>{
 const b=bot()
 const first=candidateScout(b)
 assert.equal(first.ok,true)
 assert(first.distance>=3&&first.distance<=12)
 assert.equal(first.target.x,1+first.distance)
 b.blockAt=p=>({name:p.y===64?'oak_planks':'air',boundingBox:p.y===64?'block':'empty'})
 assert.equal(candidateScout(b).reason,'current_ground_unverified','do not scout across player build')
 b.blockAt=p=>Math.abs(p.x-1)>2||Math.abs(p.z-1)>2?null:{name:p.y===64?'grass_block':'air',boundingBox:p.y===64?'block':'empty'}
 assert.equal(candidateScout(b).reason,'terrain_unloaded_or_incomplete','do not trust unloaded areas')
 b.game.dimension='the_nether'
 assert.equal(candidateScout(b).reason,'daylight_or_weather_prevents_safe_scout')
})
test('scout rejects low health, night and bot not grounded',()=>{
 const b=bot()
 b.health=12;assert.equal(candidateScout(b).reason,'low_health_prevents_scout')
 b.health=20;b.time.timeOfDay=14000;assert.equal(candidateScout(b).reason,'daylight_or_weather_prevents_safe_scout')
 b.time.timeOfDay=5000;b.entity.onGround=false;assert.equal(candidateScout(b).reason,'ground_contact_or_terrain_unknown')
})

test('autonomous weapon objective falls back to a safe scout goal or explicit wait',()=>{
 const world=environment(bot()),woodFailure={reason:'no_verified_natural_tree'}
 assert.deepEqual(decideAutonomousResponse({plan:'LEARN_WEAPON',woodCount:0,
   woodFailure:null,world}),{action:'WORK',reason:'site_not_rejected',goal:'LEARN_WEAPON'})
 const step={ok:true,target:{x:7,y:65,z:1}}
 const scout=decideAutonomousResponse({plan:'LEARN_WEAPON',woodCount:0,
   woodFailure,world,scoutCandidate:step})
 assert.equal(scout.action,'SCOUT')
 assert.equal(scout.goal,'FIND_NEW_RESOURCE_AREA')
 assert.equal(scout.candidate,step)
 assert.equal(decideAutonomousResponse({plan:'LEARN_WEAPON',woodCount:0,
   woodFailure,movementFailure:{reason:'scout_server_endpoint_unconfirmed'},world}).reason,
   'server_movement_unverified_cooldown')
 assert.equal(decideAutonomousResponse({plan:'LEARN_WEAPON',woodCount:0,
   woodFailure,world,scoutCandidate:step,scoutFailure:{reason:'no_verified_safe_corridor'}}).action,
   'SCOUT','obsolete area cooldown must never override valid 3D route')
 const nighttime=environment(bot(14000))
 assert.equal(decideAutonomousResponse({plan:'LEARN_WEAPON',woodCount:0,
   woodFailure,world:nighttime}).reason,'daylight_or_weather_prevents_safe_scout')
 assert.equal(decideAutonomousResponse({plan:'OBSERVE',woodCount:5,world}).action,'OBSERVE')
})
test('bed-specific failure avoids only chosen coordinates and survives safe persistence',()=>{
 let now=100000
 const m=new FailureMemory(()=>now),bed=vec(11,65,3),otherBed=vec(12,65,3)
 m.mark('bed',bed,'bed_sleep_rejected: obstruction')
 assert.equal(m.blocked('bed',bed).reason,'bed_sleep_rejected:_obstruction')
 assert.equal(m.blocked('bed',otherBed),null)
 assert.equal(m.blocked('bed',bed).remainingMs,BED_COOLDOWN_MS)
 const rest=m.mark('sleep',bed,'bed_navigation_failed: noPath')
 assert.equal(rest.until-now,SLEEP_COOLDOWN_MS)
})

test('adaptive segment length responds to daylight and energy without a fixed six-block cap',()=>{
 const noon=bot(6000),nearDusk=bot(10400)
 assert.equal(candidateScout(noon).ok,true)
 assert.equal(candidateScout(noon).distance,12)
 assert.equal(candidateScout(nearDusk).distance,6)
 nearDusk.food=5
 assert(candidateScout(nearDusk).distance<6)
 const exhausted=bot(10900)
 assert.equal(candidateScout(exhausted).ok,false)
 assert.equal(candidateScout(exhausted).reason,'daylight_or_energy_budget_exhausted')
})
test('3D planner accepts verified one-block ascents/descents, rejects sheer two-block cliffs',()=>{
 const {planScoutSegment}=require('../src/scout_routes.cjs')
 const b=bot()
 b.entity.position=vec(0.5,65,0.5)
 const base=b.blockAt
 const shape=(x,z)=>x<=0&&z!==0?null:x>=2?65:64
 b.blockAt=p=>{
   const x=Math.floor(p.x),z=Math.floor(p.z),top=shape(x,z)
   if(top==null||z!==0||x<0)return null
   return p.y<=top?{name:'stone',boundingBox:'block'}:{name:'air',boundingBox:'empty'}
 }
 const uphill=planScoutSegment(b,{maxSteps:5})
 assert.equal(uphill.ok,true,JSON.stringify(uphill))
 assert.equal(uphill.target.y,66)
 assert.equal(uphill.elevationChanges,1)
 assert(uphill.waypoints.some(n=>n.y===66))
 b.blockAt=p=>{
   const x=Math.floor(p.x),z=Math.floor(p.z),top=x>=2?63:64
   if(z!==0||x<0)return null
   return p.y<=top?{name:'stone',boundingBox:'block'}:{name:'air',boundingBox:'empty'}
 }
 const down=planScoutSegment(b,{maxSteps:5})
 assert.equal(down.ok,true,JSON.stringify(down))
 assert.equal(down.target.y,64)
 assert.equal(down.elevationChanges,1)
 b.blockAt=p=>{
   const x=Math.floor(p.x),z=Math.floor(p.z),top=x>=2?66:64
   if(z!==0||x<0)return null
   return p.y<=top?{name:'stone',boundingBox:'block'}:{name:'air',boundingBox:'empty'}
 }
 assert.equal(planScoutSegment(b,{maxSteps:5}).ok,false,
  'two-block upward cliff is not a supported unassisted step')
})
test('half slabs and uncertain collision shapes do not masquerade as full safe ground',()=>{
 const {planScoutSegment}=require('../src/scout_routes.cjs')
 const b=bot()
 b.entity.position=vec(0.5,65,0.5)
 b.blockAt=p=>({
   name:p.y===64?((p.x>=1||p.z>=1||p.x<0||p.z<0)?'stone_slab':'stone'):'air',
   boundingBox:p.y===64?'block':'empty',
   shapes:p.y===64?[[0,0,0,1,(p.x>=1||p.z>=1||p.x<0||p.z<0)?0.5:1,1]]:[]
 })
 assert.equal(planScoutSegment(b,{maxSteps:5}).ok,false)
 b.blockAt=p=>p.x<0||p.z<0||p.x+p.z>2?null:{
   name:p.y===64?'stone':'air',boundingBox:p.y===64?'block':'empty'
 }
 assert.equal(planScoutSegment(b,{maxSteps:5}).ok,false,
   'no planning across unloaded chunks even when the next few cells look safe')
})

test('3D bounded terrain graph can turn around an obstacle without digging or blind jumping',()=>{
 const {planScoutSegment}=require('../src/scout_routes.cjs')
 const b=bot();b.entity.position=vec(0.5,65,0.5)
 // A natural L-shaped path: east twice then north along the ledge.
 // All shortcut cells are unknown so the route must bend.
 b.blockAt=p=>{
  const x=Math.floor(p.x),z=Math.floor(p.z)
  const permitted=(z===0&&x>=0&&x<=2)||(x===2&&z>=1&&z<=5)
  if(!permitted)return null
  return {name:p.y===64?'grass_block':'air',
    boundingBox:p.y===64?'block':'empty'}
 }
 const found=planScoutSegment(b,{maxSteps:7})
 assert.equal(found.ok,true,JSON.stringify(found))
 assert(found.turns>=1,'route must actually turn')
 assert(found.waypoints.some(p=>p.x===2&&p.z===1),'turn must follow loaded ledge')
 assert(found.distance>3,'route does not end after an arbitrary six-cell scan')
 assert.equal(found.waypoints.every(p=>p.y===65),true)
 b.entities={zombie:{name:'zombie',kind:'Hostile mobs',position:vec(2,65,2)}}
 assert.equal(planScoutSegment(b,{maxSteps:7}).ok,false,'known hostile invalidates only route')
})
test('planner can avoid already-visited endpoints and propose another frontier',()=>{
 const {planScoutSegment}=require('../src/scout_routes.cjs')
 const b=bot()
 const initial=planScoutSegment(b)
 const next=planScoutSegment(b,{avoid:new Set([initial.key])})
 assert.equal(initial.ok,true)
 assert.equal(next.ok,true)
 assert.notEqual(next.key,initial.key)
})

test('legacy scout area failure is retained as evidence but cannot suppress new 3D paths',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-legacy-scout-'))
 try{
  const file=path.join(root,'routine-failures.json'),pos=vec(-1258,99,651)
  const now=100000
  fs.writeFileSync(file,JSON.stringify([
   ['scout:-79,12,40',{reason:'no_verified_safe_corridor',attempts:4,until:now+900000}],
   ['wood:-79,12,40',{reason:'no_verified_natural_tree',attempts:3,until:now+900000}]
  ]),{mode:0o600})
  const memory=new FailureMemory(()=>now,file)
  assert.equal(memory.blocked('scout',pos).attempts,4,'retain legacy record without deleting it')
  assert.equal(memory.summary(pos).legacyScoutIgnored,true)
  assert.equal(memory.summary(pos).scout,null,'dashboard no longer calls it an active scouting lock')
  assert.equal(memory.blocked('wood',pos).reason,'no_verified_natural_tree')
  assert.equal(memory.activeRoutes().size,0)
  memory.mark('probe',pos,'terrain_unloaded_or_incomplete')
  const loaded=new FailureMemory(()=>now,file)
  assert.equal(loaded.summary(pos).legacyScoutIgnored,true)
  assert.equal(loaded.blocked('probe',pos).reason,'terrain_unloaded_or_incomplete')
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('route failures exclude exact endpoint only while unverified movement pauses the origin sector',()=>{
 let now=100000
 const m=new FailureMemory(()=>now),a=vec(10,65,3),b=vec(11,65,3)
 m.mark('route',a,'noPath')
 assert.equal(m.activeRoutes().has('10,65,3'),true)
 assert.equal(m.activeRoutes().has('11,65,3'),false)
 assert.equal(m.blocked('route',b),null)
 m.mark('probe',a,'terrain_unloaded_or_incomplete')
 assert.equal(m.blocked('motion',a),null,'unloaded terrain alone never freezes movement')
 m.mark('motion',a,'scout_waypoint_not_reached')
 assert.equal(m.blocked('motion',b).reason,'scout_waypoint_not_reached')
 assert.equal(classifyScoutFailure('scout_waypoint_not_reached'),'motion')
 assert.equal(classifyScoutFailure('scout_server_endpoint_unconfirmed'),'evidence_gap')
 assert.equal(classifyScoutFailure('scout_timeout'),'motion')
 assert.equal(classifyScoutFailure('navigation_failure'),'route')
 assert.equal(classifyScoutFailure('terrain_unloaded_or_incomplete'),'probe')
 assert.equal(classifyScoutFailure('scout_conditions_changed'),'none')
 now+=3600000
 assert.equal(m.activeRoutes().size,0,'route cooldown expires without history reset')
})

test('failed first waypoint blocks the path, not the whole map or a different endpoint',()=>{
 const {planScoutSegment}=require('../src/scout_routes.cjs')
 const b=bot()
 const first=planScoutSegment(b,{maxSteps:5})
 assert.equal(first.ok,true)
 const bad=first.waypoints[0]
 const key=[bad.x,bad.y,bad.z].join(',')
 const after=planScoutSegment(b,{maxSteps:5,blockedCells:new Set([key])})
 assert.equal(after.ok,true,'another loaded safe direction must still work')
 assert(!after.waypoints.some(p=>[p.x,p.y,p.z].join(',')===key),
   'failure of first step must not be repeated via a new terminal node')
})
test('missing initial Bedrock ground is distinct from a loaded but blocked support block',()=>{
 const {planScoutSegment}=require('../src/scout_routes.cjs')
 const b=bot()
 b.blockAt=()=>null
 assert.equal(planScoutSegment(b).reason,'current_ground_unloaded')
 b.blockAt=p=>({name:p.y===64?'oak_planks':'air',
   boundingBox:p.y===64?'block':'empty'})
 assert.equal(planScoutSegment(b).reason,'current_ground_unverified')
})

test('A* noPath is a route failure while local-only Bedrock pulse requires motion backoff',()=>{
 assert.equal(classifyScoutFailure('No path to the goal!'),'route')
 assert.equal(classifyScoutFailure('scout_local_movement_not_server_verified'),'evidence_gap')
 assert.equal(classifyScoutFailure('direct_flat_no_local_motion'),'motion')
 assert.equal(classifyScoutFailure('scout_waypoint_not_reached'),'motion')
})

test('locally reached first waypoint without BDS proof is not classified as failed native input',()=>{
 assert.equal(classifyScoutFailure('scout_first_waypoint_local_only_server_unverified'),'evidence_gap')
 assert.equal(classifyScoutFailure('direct_flat_first_waypoint_already_local'),'motion')
})

test('blocked native probe against stateful doors is a route geometry problem, not failed server movement',()=>{
 assert.equal(classifyScoutFailure('direct_flat_stateful_door'),'route')
 assert.equal(classifyScoutFailure('direct_flat_unknown_block'),'route')
 assert.equal(classifyScoutFailure('direct_flat_failed_waypoint_not_adjacent'),'route')
 assert.equal(classifyScoutFailure('direct_flat_no_local_motion'),'motion')
})

test('door passage outcomes preserve server-evidence cooldown while closed door is a route issue',()=>{
 assert.equal(classifyScoutFailure('door_passage_local_only_server_unverified'),'evidence_gap')
 assert.equal(classifyScoutFailure('crossing_no_local_forward_progress'),'motion')
 assert.equal(classifyScoutFailure('crossing_open_door_state_unverified'),'route')
 assert.equal(classifyScoutFailure('crossing_opposite_side_blocked_or_unknown'),'route')
 assert.equal(classifyScoutFailure('crossing_preempted:hostile_threat_detected'),'none')
})

test('historical missing-correction cooldown is ignored but genuine motion failures remain active',()=>{
 let now=200000
 const m=new FailureMemory(()=>now)
 const p={x:-1260.84,y:98,z:653.62}
 m.mark('motion',p,'scout_server_endpoint_unconfirmed')
 assert.equal(m.blocked('motion',p),null,'historical inference is not a transport failure')
 m.mark('motion',p,'scout_waypoint_not_reached')
 assert(m.blocked('motion',p),'real local waypoint failure still requires cooldown')
 assert.equal(m.blocked('motion',p).attempts,1,'invalid historical inference is not counted')
 assert.equal(m.blocked('motion',p).remainingMs,300000,'genuine first failed step retains its ordinary bounded cooldown')
 assert.equal(classifyScoutFailure('scout_server_endpoint_unconfirmed'),'evidence_gap')
 assert.equal(classifyScoutFailure('direct_flat_no_local_motion'),'motion')
 assert.equal(classifyScoutFailure('crossing_no_local_forward_progress'),'motion')
 assert.equal(classifyScoutFailure('No path to the goal!'),'route')
})

test('an unconfirmed bed sleep is scoped to that bed, not a 12-minute site lock',()=>{
 let now=100000
 const mem=new FailureMemory(()=>now)
 const here={x:-1259,y:99,z:652},bed={x:-1258,y:99,z:651}
 mem.mark('bed',bed,'bed_sleep_unconfirmed_no_state_ack')
 assert.equal(mem.blocked('bed',bed).remainingMs,120000)
 assert.equal(mem.blocked('bed',bed).attempts,1)
 assert.equal(mem.blocked('bed',{x:-1254,y:99,z:651}),null)
 assert.equal(mem.blocked('sleep',here),null)
 now+=120001
 assert.equal(mem.blocked('bed',bed),null)
 mem.mark('bed',bed,'bed_sleep_unconfirmed_no_state_ack')
 assert.equal(mem.blocked('bed',bed).remainingMs,240000,
   'failed acknowledgements back off only this bed')
})
test('legacy generic sleep-site ban and old 20-minute unconfirmed bed are not enforced for a whole night',()=>{
 let now=100000
 const mem=new FailureMemory(()=>now)
 const here={x:-1259,y:99,z:652},bed={x:-1258,y:99,z:651}
 mem.mark('sleep',here,'bed_sleep_rejected:bot did not sleep (not night, monsters nearby, or bed obstructed?)')
 assert.equal(mem.blocked('sleep',here),null)
 mem.mark('bed',bed,'bed_sleep_rejected:bot did not sleep (not night, monsters nearby, or bed obstructed?)')
 assert(mem.blocked('bed',bed).remainingMs<=120000)
 mem.mark('bed',bed,'bed_sleep_unconfirmed_no_state_ack')
 assert.equal(mem.blocked('bed',bed).attempts,1)
})
