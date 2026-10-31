'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url')
const {AliceBedrockRuntime,recognize,parseTask}=require('../src/runtime.cjs')
const {BedrockOperations,chooseRetreat,safeTile}=require('../src/operations.cjs')
const {parseStorage}=require('../src/storage_actions.cjs')
const P=path.resolve(__dirname,'../../../runtime/alice_modules')
let cached
async function policies(){if(cached)return cached;const names=['autonomy_policy','safety_policy','terrain_policy','wood_policy','social_policy','inventory_policy','equipment'];const parts=await Promise.all(names.map(n=>import(pathToFileURL(path.join(P,n+'.js')).href)));return cached=Object.fromEntries(names.map((n,i)=>[n,parts[i]]))}
function vec(x,y,z){return {x,y,z,offset(a,b,c){return vec(x+a,y+b,z+c)},floored(){return vec(Math.floor(x),Math.floor(y),Math.floor(z))},clone(){return vec(x,y,z)},distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}}}
function fixture(clock=()=>100000){
  const calls=[],chat=[],log={log:(...a)=>calls.push(['log',...a]),warn:(...a)=>calls.push(['warn',...a]),error:(...a)=>calls.push(['err',...a])}
  let inventory=[]
  const bot={username:'AliceXbox',health:20,food:20,entity:{position:vec(0,64,0)},players:{Steve:{entity:{position:vec(2,64,2)}}},entities:{},registry:{itemsByName:{}},game:{dimension:'overworld'},
    chat:m=>chat.push(m),inventory:{items:()=>inventory},pathfinder:{setMovements:()=>calls.push(['setMovements']),setGoal:g=>calls.push(['setGoal',g]),goto:async()=>calls.push(['goto']),stop:()=>calls.push(['stop'])},
    blockAt:()=>({name:'air',boundingBox:'empty'}),look:async()=>calls.push(['look']),stopDigging:()=>calls.push(['stopDigging']),clearControlStates:()=>calls.push(['clear'])}
  const core={state:'IDLE',intent:{type:'IDLE',data:{}},learning:{recordKnowledge:()=>calls.push(['learned'])},
    transition(s){this.state=s},stop(){this.state='IDLE';this.intent={type:'IDLE',data:{}}},
    hasFollowIntent(){return this.intent.type==='FOLLOW'},setFollowIntent(s,distance){this.state='FOLLOW';this.intent={type:'FOLLOW',data:{playerName:s,distance}}},
    resumeIntent(){this.state=this.intent.type}}
  const api={Movements:class{},GoalFollow:class{constructor(entity,distance){this.entity=entity;this.distance=distance}},GoalNear:class{constructor(){}}}
  const operator={inventory:()=>inventory,gatherOne:async()=>({ok:false,reason:'no_visible_log'}),craftVerified:async()=>({ok:false,reason:'missing_ingredients_or_crafting_table'}),
    eatIfSafe:async()=>({ok:false}),retreatFrom:async()=>({ok:false}),attackOnce:async()=>({ok:true,verifiedDamage:false}),
    isNight:()=>false,hasNearbyBed:()=>false,sleepNearby:async()=>({ok:false}),
    equipAuto:async()=>({ok:false,reason:'no_better_armor'}),
    transferNearby:async args=>{calls.push(['transfer',args]);return {ok:true,item:args.item,moved:args.amount}}}
  // Previous deterministic-world fixtures explicitly select offline autonomous
  // behavior so safety/door regression tests remain meaningful. Production
  // without a saved agentMode defaults to companion and never starts idle work.
  const settingsReader={read:()=>({revision:0,settings:{followDistance:3,occludedDistance:4,
    autonomyEnabled:true,agentMode:'autonomous'}})}
  return {bot,core,api,clock,log,operator,calls,chat,settingsReader,setItems:x=>{inventory=x}}
}
test('actual canonical Paper policies loaded in Bedrock runtime',async()=>{
  const p=await policies()
  assert.equal(p.safety_policy.decideCombatTactic({health:7,enemyType:'zombie',distance:2}),'RETREAT')
  assert.equal(p.wood_policy.parseCountReply('4个木头'),4)
  assert.equal(p.autonomy_policy.decideIdleWork({hasUsableWeapon:false,woodResources:0}),'LEARN_WEAPON')
})
test('Chinese direct actions, counts and no unrestricted language fallback',()=>{
  assert.equal(recognize('AliceAI 收集10个木头'),'收集10个木头')
  assert.deepEqual(parseTask('收集10个木头'),{type:'WOOD',count:10})
  assert.equal(parseTask('收集100个木头').type,'INVALID_QUANTITY')
  assert.equal(parseTask('保护我').type,'GUARD')
  assert.equal(parseTask('制作木剑').item,'wooden_sword')
  assert.equal(recognize('其它玩家聊天'),null)
})
test('Mac dashboard distance hot change updates an already-running follow without restarting',async()=>{
  let config={revision:0,settings:{followDistance:3,occludedDistance:4,autonomyEnabled:true}}
  const settingsReader={read:()=>config}
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies(),settingsReader})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.bot.players.Steve.entity.position=vec(16,64,0)
  await e.onChat('Steve','AliceAI 跟着我')
  await e.followTick()
  assert.equal(f.calls.filter(x=>x[0]==='setGoal'&&x[1]?.entity).at(-1)[1].distance,3)
  config={revision:1,settings:{followDistance:2,occludedDistance:5,autonomyEnabled:false}}
  await e.followTick() // must not wait for the prior 5-second visual-range cooldown
  assert.equal(f.core.intent.data.distance,2)
  assert.equal(f.calls.filter(x=>x[0]==='setGoal'&&x[1]?.entity).at(-1)[1].distance,2)
  assert.equal(e.liveBehavior.revision,1)
  await e.onChat('Steve','AliceAI 停止')
  e.lastHumanAt=0;e.nextIdleAt=0
  await e.idleTick()
  assert.equal(e.job,null,'autonomy toggle must stop new idle work, not suppress safety')
  e.stop()
})
test('noPath may use one bounded Bedrock input step on provably loaded flat terrain',async()=>{
 const f=fixture(),p=await policies()
 const movements=[]
 f.bot.entity.position=vec(0.5,65,0.5);f.bot.entity.onGround=true
 f.bot.players.Steve.entity.position=vec(6.5,65,0.5)
 f.bot.blockAt=pos=>({name:pos.y===64?'stone':'air',boundingBox:pos.y===64?'block':'empty'})
 f.bot.setControlState=(key,state)=>movements.push([key,state])
 f.bot.look=async()=>f.calls.push(['look'])
 const observer={checkpoint:()=>({events:1,position:{x:0,y:65,z:0}}),
   progress:()=>({confirmed:false,reason:'no_two_server_positions'})}
 const e=new AliceBedrockRuntime({...f,policies:p,movementEvidence:observer})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 await e.onChat('Steve','AliceAI 跟着我')
 await e.followTick()
 e.onPathUpdate({status:'noPath',path:[]})
 await e.followTick()
 assert.equal(e.directFollowActive,true)
 assert(movements.some(x=>x[0]==='forward'&&x[1]===true))
 assert(f.calls.some(x=>x[0]==='setGoal'&&x[1]===null),'release failed A* before direct input')
 await e.onChat('Steve','AliceAI 停止')
 assert.equal(e.directFollowActive,false,'human STOP must preempt direct input immediately')
 assert.equal(movements.at(-1)[1],false,'STOP releases its own controls')
 e.stop()
})
test('short follow recovery never starts without real grounded, loaded safe corridor',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.entity.position=vec(0.5,65,0.5);f.bot.entity.onGround=false
 f.bot.players.Steve.entity.position=vec(6.5,65,0.5)
 let inputs=0
 f.bot.setControlState=()=>{inputs++}
 await e.onChat('Steve','AliceAI 跟着我')
 await e.followTick();e.onPathUpdate({status:'noPath',path:[]})
 await e.followTick()
 assert.equal(e.directFollowActive,false)
 assert.equal(inputs,0,'never issue input on ungrounded Bedrock entity')
 e.stop()
})
test('emergency SURVIVE cancels bounded direct-follow controller before escape',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.entity.position=vec(0.5,65,0.5);f.bot.entity.onGround=true
 f.bot.players.Steve.entity.position=vec(6.5,65,0.5)
 f.bot.blockAt=pos=>({name:pos.y===64?'stone':'air',boundingBox:pos.y===64?'block':'empty'})
 const controls=[]
 f.bot.setControlState=(k,v)=>controls.push([k,v])
 await e.onChat('Steve','AliceAI 跟着我')
 await e.followTick();e.onPathUpdate({status:'noPath',path:[]})
 await e.followTick()
 assert.equal(e.directFollowActive,true)
 f.bot.health=5;e.safetyTick()
 assert.equal(e.directFollowActive,false)
 assert.equal(f.core.state,'SURVIVE')
 assert.equal(controls.at(-1)[1],false)
 e.stop()
})
test('Bedrock noPath captures bounded read-only ground evidence once per cooldown',async()=>{
  let current=100000
  const f=fixture(()=>current),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.bot.entity.position=vec(10.5,69,20.5)
  f.bot.players.Steve.entity.position=vec(19,69,20)
  f.bot._bedrockWorldSupport={supported:true}
  f.bot.blockAt=p=>({name:p.y===68?'stone':'air',
    boundingBox:p.y===68?'block':'empty',type:p.y===68?1:0})
  await e.onChat('Steve','AliceAI 跟着我')
  await e.followTick()
  const emitted=()=>f.calls.filter(x=>x[0]==='log'&&x[1]==='[Alice follow] noPath terrain evidence:')
  e.onPathUpdate({status:'noPath',path:[]})
  assert.equal(emitted().length,1)
  assert.equal(e.lastFollowDiagnostic.centerSupported,true)
  assert.equal(e.lastFollowDiagnostic.nearbySupported,4)
  e.onPathUpdate({status:'noPath',path:[]})
  assert.equal(emitted().length,1)
  current+=12001
  e.onPathUpdate({status:'noPath',path:[]})
  assert.equal(emitted().length,2)
  e.stop()
})
test('follow goes through Pathfinder and STOP cancels without overwriting user intent',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.bot.players.Steve.entity.position=vec(8,64,0)
  await e.onChat('Steve','AliceAI 跟着我')
  await e.followTick()
  assert(f.calls.some(x=>x[0]==='setGoal'&&x[1]?.entity))
  assert.equal(f.core.hasFollowIntent(),true)
  await e.onChat('Steve','AliceAI 停止')
  assert.equal(f.core.hasFollowIntent(),false)
  assert(f.calls.some(x=>x[0]==='clear'))
})
test('critical life gate immediately preempts active navigation; does not invent escape success',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.core.setFollowIntent('Steve');e.followGoal='Steve'
  f.bot.health=5;e.safetyTick()
  assert.equal(f.core.state,'SURVIVE')
  assert.equal(e.followGoal,null)
  assert(f.calls.some(x=>x[0]==='stop'))
})
test('idle chooses Paper weapon policy and attempts nonfictitious action',async()=>{
  let now=100000;const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true;e.lastHumanAt=0;e.nextIdleAt=0
  e.craftWeaponOrTable=async()=>({ok:false,reason:'table unavailable'})
  e.gatherCount=async()=>({ok:false,reason:'no log'})
  await e.idleTick()
  assert(e.job!==null,'idle should start autonomous real action')
  await new Promise(setImmediate)
  assert(f.chat.some(x=>/已开始/.test(x)))
})
test('resource-site failure pauses repeated autonomy work, no indefinite local tree scans',async()=>{
 let now=100000;const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true;e.lastHumanAt=0;e.nextIdleAt=0
 f.bot.time={timeOfDay:6000};f.bot.entity.onGround=true
 let scans=0
 e.gatherCount=async()=>{scans++;return {ok:false,reason:'actual 0/1 no_verified_natural_tree'}}
 await e.idleTick()
 for(let i=0;i<4;i++)await new Promise(setImmediate)
 assert.equal(scans,1)
 assert.equal(e.failureMemory.blocked('wood',f.bot.entity.position).reason,'no_verified_natural_tree')
 e.nextIdleAt=0;now+=125000
 await e.idleTick()
 assert.equal(scans,1,'must not repeat identical protected structure search')
 assert.equal(e.lastIdleDecision.goal,'FIND_NEW_RESOURCE_AREA')
 assert.equal(e.lastIdleDecision.action,'WAIT')
 assert(f.calls.some(x=>x[1]==='[Alice autonomy] world-aware decision:'))
 assert.equal(e.failureMemory.blocked('probe',f.bot.entity.position).reason,'current_ground_unverified')
})
test('unattended blocked weapon work reports stable wait reason without repeated plan logs',async()=>{
 let now=100000;const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true;e.lastHumanAt=0;e.nextIdleAt=0
 f.bot.time={timeOfDay:14000}
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 for(let i=0;i<3;i++){e.nextIdleAt=0;await e.idleTick();now+=120001}
 assert.equal(e.lastIdleDecision.action,'WAIT')
 assert.equal(e.lastIdleDecision.reason,'daylight_or_weather_prevents_safe_scout')
 assert.equal(f.calls.filter(x=>x[1]==='[Alice autonomy] world-aware decision:').length,1,
   'identical fallback plan should not flood logs')
 assert.equal(f.calls.filter(x=>x[1]==='[Alice autonomy] selected canonical Paper idle plan:').length,0)
 assert.equal(e.failureMemory.blocked('probe',f.bot.entity.position),null,
   'nightly wait must not mark known daylight route as bad terrain')
})
test('daylight safe corridor enables one bounded exploration without inventing success',async()=>{
 let now=100000;const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true;e.lastHumanAt=0;e.nextIdleAt=0
 f.bot.time={timeOfDay:6000};f.bot.entity.onGround=true
 f.bot.blockAt=p=>({name:p.y===63?'grass_block':'air',
    boundingBox:p.y===63?'block':'empty'})
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 assert.equal(f.core.state,'EXPLORE')
 for(let i=0;i<4;i++)await new Promise(setImmediate)
 assert(f.calls.some(x=>x[0]==='goto'),'safe flat corridor triggers bounded pathfinder attempt')
 assert(f.calls.some(x=>x[0]==='stop'),'scout must release pathfinder')
 assert.equal(e.failureMemory.blocked('motion',f.bot.entity.position).reason,
   'scout_waypoint_not_reached','local Pathfinder without position progress must stop safely')
})
test('confirmed server arrival, synced local feet, and daylight trigger a next scout survey',async()=>{
 let now=100000;const f=fixture(()=>now)
 const old=vec(0.5,64,0.5),newPos=vec(12.5,64,0.5)
 f.bot.entity.position=old;f.bot.entity.onGround=true;f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>({name:p.y===63?'stone':'air',
   boundingBox:p.y===63?'block':'empty'})
 f.api.GoalNear=class{constructor(x,y,z){this.x=x;this.y=y;this.z=z}}
 f.bot.pathfinder.goto=async goal=>{f.bot.entity.position=vec(goal.x+0.5,goal.y,goal.z+0.5)}
 const evidence={checkpoint:()=>({events:5,position:{x:0.5,y:64,z:0.5}}),
   progress:()=>({confirmed:true,movedBlocks:12,reason:'server_position_changed'}),
   get:()=>({lastAt:now,latestFeet:{x:12.5,y:64,z:0.5}})}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),movementEvidence:evidence})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',old,'no_verified_natural_tree')
 await e.idleTick()
 for(let i=0;i<5;i++)await new Promise(setImmediate)
 assert.equal(e.scoutConfirmedSegments,1)
 assert.equal(e.explorationProgress.summary().confirmed,1)
 assert.equal(e.lastScoutProgress.confirmed,true)
 assert(e.scoutVisited.has('12,64,0'))
 assert.equal(e.failureMemory.blocked('motion',old),null)
 assert.equal(e.nextIdleAt,now+15000,'next segment can be re-evaluated after fresh world sample')
})
test('server position alone does not chain scouts when local collision model is stale',async()=>{
 let now=100000;const f=fixture(()=>now),start=vec(0.5,64,0.5)
 f.bot.entity.position=start;f.bot.entity.onGround=true;f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>({name:p.y===63?'stone':'air',
   boundingBox:p.y===63?'block':'empty'})
 const evidence={checkpoint:()=>({events:5,position:{x:0.5,y:64,z:0.5}}),
   progress:()=>({confirmed:true,movedBlocks:12,reason:'server_position_changed'}),
   get:()=>({lastAt:now,latestFeet:{x:12.5,y:64,z:0.5}})}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),movementEvidence:evidence})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',start,'no_verified_natural_tree')
 await e.idleTick()
 for(let i=0;i<5;i++)await new Promise(setImmediate)
 assert.equal(e.scoutConfirmedSegments,0)
 assert.equal(e.lastScoutProgress.confirmed,false)
 assert.equal(e.lastScoutProgress.reason,'scout_waypoint_not_reached')
 assert(e.failureMemory.blocked('motion',start),'no unsafe next route from old local origin')
})

test('legacy four-attempt scout record does not block a newly validated route',async()=>{
 let now=100000;const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 f.bot.time={timeOfDay:6000};f.bot.entity.onGround=true
 f.bot.blockAt=p=>({name:p.y===63?'grass_block':'air',boundingBox:p.y===63?'block':'empty'})
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 for(let i=0;i<4;i++)e.failureMemory.mark('scout',f.bot.entity.position,'no_verified_safe_corridor')
 assert(e.failureMemory.blocked('scout',f.bot.entity.position))
 await e.idleTick()
 assert.equal(e.lastIdleDecision.action,'SCOUT')
 assert.equal(f.core.state,'EXPLORE')
 for(let i=0;i<5;i++)await new Promise(setImmediate)
 assert.equal(e.failureMemory.blocked('motion',f.bot.entity.position).reason,
   'scout_waypoint_not_reached','fake pathfinder progress is never marked verified')
})
test('a failed 3D route is scoped to endpoint and permits another safe target',async()=>{
 let now=100000;const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 f.bot.time={timeOfDay:6000};f.bot.entity.onGround=true
 f.bot.blockAt=p=>({name:p.y===63?'grass_block':'air',boundingBox:p.y===63?'block':'empty'})
 f.bot.pathfinder.goto=async()=>{throw Error('noPath')}
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 assert.equal(e.lastIdleDecision.action,'SCOUT')
 const firstTarget=e.job&&e.action?.label
 assert(firstTarget)
 for(let i=0;i<5;i++)await new Promise(setImmediate)
 assert.equal(e.failureMemory.activeRoutes().size,1)
 assert.equal(e.failureMemory.blocked('motion',f.bot.entity.position),null)
 now+=16000
 await e.idleTick()
 assert.equal(e.lastIdleDecision.action,'SCOUT')
 for(let i=0;i<5;i++)await new Promise(setImmediate)
 assert.equal(e.failureMemory.activeRoutes().size,2,'another endpoint attempted instead of area-wide WAIT')
})
test('sleep failure without a selected bed pauses recheck, not every bed for the whole night',async()=>{
 let now=100000;const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.time={timeOfDay:13000}
 let calls=0
 f.operator.isNight=()=>true
 f.operator.hasNearbyBed=()=>true
 f.operator.sleepNearby=async()=>{calls++;return {ok:false,reason:'bed_navigation_or_sleep_failed:bot did not sleep'}}
 e.startJob('RECOVER','自主生存',signal=>f.operator.sleepNearby({signal}),
   {label:'寻找附近床位睡觉',announce:false})
 for(let i=0;i<4;i++)await new Promise(setImmediate)
 assert.equal(calls,1)
 assert.equal(e.failureMemory.blocked('sleep',f.bot.entity.position),null)
 assert.equal(e.nextSleepAt,now+90000)
 await e.maintenanceTick()
 assert.equal(calls,1,'short observation interval prevents immediate duplicate sleep attempt')
})
test('specific failed bed and local overnight wait remain distinct safety gates',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const badBed=vec(5,64,7)
 e.startJob('RECOVER','自主生存',async()=>({ok:false,bedPosition:badBed,reason:'bed_sleep_rejected:bed was obstructed'}),
   {label:'寻找附近床位睡觉',announce:false})
 for(let i=0;i<4;i++)await new Promise(setImmediate)
 assert(e.failureMemory.blocked('bed',badBed))
 assert.equal(e.failureMemory.blocked('sleep',f.bot.entity.position),null,
   'one selected bed must not block every other nearby bed')
 assert.equal(e.nextSleepAt,f.clock()+30000)
 assert.equal(e.failureMemory.blocked('bed',vec(6,64,7)),null,'other bed is a distinct candidate')
})
test('player FOLLOW outranks optional night bed trip while safety maintenance stays independent',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.time={timeOfDay:14000}
 f.operator.hasNearbyBed=()=>true
 let slept=0
 f.operator.sleepNearby=async()=>{slept++;return {ok:true}}
 f.core.setFollowIntent('Steve')
 await e.maintenanceTick()
 assert.equal(slept,0)
 assert.equal(f.core.hasFollowIntent(),true)
 assert.equal(e.job,null)
})
test('wood question belongs to requesting player, stale message not treated as active count',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  await e.onChat('Steve','AliceAI 收集木头')
  assert(e.pendingWood.has('Steve'))
  await e.onChat('Alex','5个木头')
  assert(!f.chat.some(x=>/Alex.*开始/.test(x)))
  await e.onChat('Steve','5个木头')
  assert(f.chat.some(x=>/已开始/.test(x)))
})
test('real recipe API: success only from observed inventory increase',async()=>{
  const f=fixture(),bot=f.bot;let count=0
  bot.registry.itemsByName.oak_planks={id:23}
  bot.inventory.items=()=>count?[{name:'oak_planks',count}]:[]
  bot.recipesFor=()=>[{id:11,requiresTable:false,result:{count:4}}]
  bot.craft=async()=>{count=4}
  const ops=new BedrockOperations({bot,api:f.api,sleep:async()=>{}})
  assert.equal((await ops.craftVerified('oak_planks')).gained,4)
  bot.craft=async()=>{};assert.equal((await ops.craftVerified('oak_planks')).ok,false)
})
test('retreat rejects unknown terrain and does not blind walk into unloaded chunk',async()=>{
  const f=fixture();const bot=f.bot
  assert.equal(chooseRetreat(bot,{position:vec(1,64,0)}),null)
  assert.equal(safeTile(bot,vec(-4,64,0)),false)
})
test('gather never claims picked up merely because dig promise resolves',async()=>{
  const f=fixture(),bot=f.bot,point=vec(2,64,0)
  bot.findBlocks=()=>[point];bot.blockAt=p=>{const d=p.y-point.y;return d>=5&&d<=7?{name:'oak_leaves',position:p}:{name:'oak_log',position:p}}
  bot.dig=async()=>{};const ops=new BedrockOperations({bot,api:f.api,sleep:async()=>{}})
  assert.deepEqual(await ops.gatherOne(),{ok:false,reason:'no_confirmed_pickup'})
})
test('Ollama tool-call cannot request unallowlisted or unbounded actions',async()=>{
  const {OllamaPlanner,validatedPlan,parseReply}=require('../src/planner.cjs')
  assert.equal(validatedPlan({action:'run_shell',cmd:'rm -rf /'}),null)
  assert.equal(validatedPlan({action:'collect_wood',count:100}),null)
  assert.equal(validatedPlan({action:'craft_item',item:'tnt'}),null)
  assert.deepEqual(validatedPlan({action:'collect_wood',count:4}),{action:'collect_wood',count:4})
  const fake=async(_url,opts)=>{
    const req=JSON.parse(opts.body)
    assert(req.tools[0].function.parameters.properties.action.enum.includes('follow_player'))
    return {ok:true,json:async()=>({message:{tool_calls:[{function:{name:'alice_action',arguments:{action:'follow_player'}}}]}})}
  }
  const p=new OllamaPlanner({url:'http://127.0.0.1:11435',fetcher:fake})
  assert.deepEqual(await p.suggest({message:'来跟我一起走',status:'IDLE'}),{action:'follow_player'})
})
test('immediate STOP invalidates chat before Ollama request starts',async()=>{
  const f=fixture(),p=await policies()
  let calls=0
  const planner={url:'http://127.0.0.1:11435',suggest:()=>{calls++;return Promise.resolve({action:'follow_player'})}}
  const e=new AliceBedrockRuntime({...f,policies:p,planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  const thinking=e.onChat('Steve','AliceAI 帮我找个地方待着')
  assert.equal(e.plannerBusy,true,'reserve chat slot before background-model cancellation awaits')
  await e.onChat('Steve','AliceAI 停止')
  await thinking
  assert.equal(calls,0,'stale request must not even be sent to Ollama')
  assert.equal(e.plannerBusy,false,'stale request releases chat slot')
  assert.equal(f.core.hasFollowIntent(),false)
})
test('new direct command takes priority over an already in-flight slow Ollama response',async()=>{
  const f=fixture(),p=await policies()
  let respond,entered
  const requested=new Promise(resolve=>{entered=resolve})
  const planner={url:'http://127.0.0.1:11435',suggest:()=>new Promise(resolve=>{respond=resolve;entered()})}
  const e=new AliceBedrockRuntime({...f,policies:p,planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  const thinking=e.onChat('Steve','AliceAI 帮我找个地方待着')
  await requested
  await e.onChat('Steve','AliceAI 停止')
  respond({action:'follow_player'})
  await thinking
  assert.equal(f.core.hasFollowIntent(),false,'late result must not override STOP')
  assert.equal(e.plannerBusy,false)
})
test('immediate FOLLOW invalidates pending chat model answer',async()=>{
  const f=fixture(),p=await policies()
  let calls=0
  const planner={url:'http://127.0.0.1:11435',suggest:()=>{calls++;return Promise.resolve({action:'stop'})}}
  const e=new AliceBedrockRuntime({...f,policies:p,planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  const thinking=e.onChat('Steve','AliceAI 帮我找个地方待着')
  await e.onChat('Steve','AliceAI 跟着我')
  await thinking
  assert.equal(calls,0,'stale model must not override immediate player FOLLOW')
  assert.equal(f.core.hasFollowIntent(),true)
})
test('cancelled harvest stops pathfinder and does not proceed to dig',async()=>{
  const f=fixture(),b=f.bot,pos=vec(2,64,0),ctrl=new AbortController()
  b.findBlocks=()=>[pos];b.blockAt=p=>{const d=p.y-pos.y;return d>=5&&d<=7?{name:'oak_leaves',position:p}:{name:'oak_log',position:p}}
  b.pathfinder.goto=()=>new Promise(()=>{})
  b.pathfinder.stop=()=>f.calls.push(['stop'])
  b.dig=()=>{throw Error('should not dig')}
  const ops=new BedrockOperations({bot:b,api:f.api,sleep:async()=>{}})
  const pending=ops.gatherOne({signal:ctrl.signal})
  await new Promise(setImmediate)
  ctrl.abort()
  await assert.rejects(pending,/cancelled/)
  assert(f.calls.some(x=>x[0]==='stop'))
})

test('no autonomous work before authoritative Bedrock inventory snapshot',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true
  assert.equal(e.ready(),false)
  await e.onChat('Steve','AliceAI 跟着我')
  await e.followTick()
  assert(!f.calls.some(x=>x[0]==='setGoal'&&x[1]))
  e.noteInventory({window_id:'armor'})
  assert.equal(e.ready(),false)
  e.noteInventory({window_id:'inventory'})
  assert.equal(e.ready(),true)
})

test('protect player builds: log without leaf evidence is never dug',async()=>{
  const f=fixture(),bot=f.bot,p=vec(2,64,0)
  bot.findBlocks=()=>[p];bot.blockAt=()=>({name:'oak_log',position:p})
  bot.dig=()=>{throw Error('must never dig a potential house log')}
  const ops=new BedrockOperations({bot,api:f.api,sleep:async()=>{}})
  assert.deepEqual(await ops.gatherOne(),{ok:false,reason:'no_verified_natural_tree'})
})

test('tree recognition tolerates missing peripheral chunks but requires loaded trunk/canopy evidence',()=>{
  const {inspectNaturalTree}=require('../src/operations.cjs')
  const p=vec(2,64,0),block={name:'oak_log',position:p}
  const bot={blockAt:x=>{
    if(x.x===p.x+2&&x.z===p.z+1&&x.y===p.y+9)return null
    if(x.x===p.x&&x.z===p.z&&x.y<=p.y+5&&x.y>=p.y)return {name:'oak_log'}
    if(x.y>=p.y+5&&x.y<=p.y+7&&Math.abs(x.x-p.x)<=2&&Math.abs(x.z-p.z)<=2)return {name:'oak_leaves'}
    return {name:'air'}
  }}
  const result=inspectNaturalTree(bot,block)
  assert.equal(result.ok,true,JSON.stringify(result))
  assert(result.unknown>0)
  bot.blockAt=x=>x.x===p.x+1&&x.y===p.y+1&&x.z===p.z?{name:'crafting_table'}:{name:'oak_log'}
  assert.equal(inspectNaturalTree(bot,block).reason,'near_player_structure')
})

test('tree recognition fails closed when immediate trunk surroundings cannot be inspected',()=>{
  const {inspectNaturalTree}=require('../src/operations.cjs')
  const p=vec(2,64,0)
  const bot={blockAt:x=>x.y>=p.y+5?{name:'oak_leaves'}:x.x===p.x&&x.z===p.z?{name:'oak_log'}:null}
  assert.equal(inspectNaturalTree(bot,{position:p}).reason,'insufficient_loaded_proximity')
})

test('safety threat loss requires 4.5s quiet window before restoring FOLLOW',async()=>{
  let clock=100000
  const f=fixture(()=>clock),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  // The owner must actually be OUTSIDE the configured 3-block stop radius.
  f.bot.players.Steve.entity.position=vec(8,64,0)
  f.core.setFollowIntent('Steve');e.followGoal='Steve'
  let danger={type:'GUARD',target:{name:'zombie',position:vec(3,64,0)}}
  e.threat=()=>danger
  e.safetyTick()
  await new Promise(setImmediate) // allow the mocked asynchronous attack to finish
  assert.equal(f.core.state,'GUARD')
  assert.equal(e.followGoal,null)
  danger=null;clock+=800
  e.safetyTick()
  assert.equal(f.core.state,'GUARD')
  await e.followTick()
  assert(!f.calls.some(x=>x[0]==='setGoal'&&x[1]),'no follow restart while threat is clearing')
  clock+=3800;e.safetyTick()
  assert.equal(f.core.state,'FOLLOW')
  await e.followTick()
  assert(f.calls.some(x=>x[0]==='setGoal'&&x[1]),'follow resumes after quiet window')
})

test('autonomous weapon preparation first gathers when no wood and uses GATHER state',async()=>{
  let clock=100000
  const f=fixture(()=>clock),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true;e.lastHumanAt=0;e.nextIdleAt=0
  let gather=0,craft=0
  e.gatherCount=async()=>{gather++;return new Promise(()=>{})}
  e.craftWeaponOrTable=async()=>{craft++;return new Promise(()=>{})}
  await e.idleTick();await new Promise(setImmediate)
  assert.equal(f.core.state,'GATHER')
  assert.equal(gather,1)
  assert.equal(craft,0)
  assert(f.chat.some(x=>x.includes('采集原木')))
})

test('attack API aims first, never treats packet send as a verified hit',async()=>{
  const f=fixture(),t={name:'zombie',position:vec(2,64,0)}
  const events=[]
  f.bot.lookAt=async()=>events.push('aim')
  f.bot.attack=async()=>events.push('attack')
  const ops=new BedrockOperations({bot:f.bot,api:f.api})
  const outcome=await ops.attackOnce(t)
  assert.deepEqual(events,['aim','attack'])
  assert.deepEqual(outcome,{ok:false,attempted:true,aimAttempted:true,verifiedDamage:false,reason:'damage_not_yet_verified'})
})

test('Paper durable FOLLOW: gather temporarily leaves player, then resumes follow on failure',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  // The owner must actually be OUTSIDE the configured 3-block stop radius.
  f.bot.players.Steve.entity.position=vec(8,64,0)
  await e.onChat('Steve','AliceAI 跟着我')
  await e.followTick()
  assert.equal(f.core.hasFollowIntent(),true)
  await e.onChat('Steve','AliceAI 收集3个木头')
  assert.equal(f.core.hasFollowIntent(),true,'temporary GATHER must not erase FOLLOW intent')
  assert.equal(f.core.state,'GATHER')
  assert(f.calls.some(x=>x[0]==='stop'),'moving follow goal was stopped for independent work')
  for(let i=0;i<5;i++)await new Promise(setImmediate)
  assert.equal(f.core.state,'FOLLOW','after bounded gather ends, Paper follow intent resumes')
  await e.followTick()
  assert(f.calls.some(x=>x[0]==='setGoal'&&x[1]?.entity),'follow re-enters pathfinder')
})

test('Paper durable FOLLOW: explicit crafting is a temporary mission; STOP cancels persistent intent',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  await e.onChat('Steve','AliceAI 跟着我')
  await e.onChat('Steve','AliceAI 制作木剑')
  assert(f.core.hasFollowIntent())
  for(let i=0;i<5;i++)await new Promise(setImmediate)
  assert.equal(f.core.state,'FOLLOW')
  await e.onChat('Steve','AliceAI 停止')
  assert.equal(f.core.hasFollowIntent(),false)
  assert.equal(f.core.state,'IDLE')
})

test('tracking uses only 30s fresh same-dimension last-seen waypoint and waits if stale',async()=>{
  let now=100000;const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.bot.players.Steve.entity.position=vec(15,64,0)
  f.core.setFollowIntent('Steve')
  await e.followTick()
  assert.equal(e.lastSeenPlayer.name,'Steve')
  delete f.bot.players.Steve
  now+=2000
  await e.followTick()
  assert.equal(e.followGoal,'Steve@last_seen')
  assert(f.calls.some(x=>x[0]==='setGoal'&&x[1]&&!x[1].entity))
  now+=31000
  await e.followTick()
  assert.equal(e.followGoal,null,'stale location cannot drive pathfinder')
})

test('safety backoff avoids unverified packet spam while guarding; damage event is unattributed',async()=>{
  let now=100000;const f=fixture(()=>now),p=await policies(),e=new AliceBedrockRuntime({...f,policies:p})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.core.setFollowIntent('Steve')
  const enemy={id:55,name:'zombie',position:vec(1,64,0)}
  e.threat=()=>({type:'GUARD',target:enemy})
  let attempts=0
  f.operator.attackOnce=async()=>{attempts++;return {ok:false,attempted:true,verifiedDamage:false,reason:'damage_not_yet_verified'}}
  e.safetyTick()
  await new Promise(setImmediate)
  assert.equal(attempts,1)
  now+=1400;e.safetyTick();await new Promise(setImmediate)
  assert.equal(attempts,1,'unverified attacks must be throttled')
  now+=500;e.safetyTick();await new Promise(setImmediate)
  assert.equal(attempts,2)
  now+=1700;e.safetyTick();await new Promise(setImmediate)
  assert.equal(attempts,2,'second unverified attempt should back off longer')
  assert.equal(f.core.state,'GUARD')
  e.onEntityHurt(enemy)
  assert.equal(e.attackBackoff.has('55'),true,'anonymous target hurt must not erase attack cooldown')
  assert(f.calls.some(x=>x[1]==='[Alice safety] target hurt observed (attacker unverified):'))
})

test('gather searches wider, still refuses built logs, bounds candidates to starting area',async()=>{
  const f=fixture(),opts=[],near=vec(2,64,0),remote=vec(18,64,0)
  f.bot.findBlocks=o=>{opts.push(o);return [near,remote]}
  f.bot.blockAt=p=>({name:'oak_log',position:p}) // unnatural constructed logs, no canopy
  let dug=0;f.bot.dig=()=>{dug++}
  const ops=new BedrockOperations({bot:f.bot,api:f.api,sleep:async()=>{}})
  assert.equal((await ops.gatherOne({origin:vec(0,64,0),maxDistance:18})).reason,'no_verified_natural_tree')
  assert.equal(opts[0].maxDistance,18)
  assert.equal(opts[0].count,128)
  assert.equal(dug,0,'wider search must not disable structural protection')
})

test('protect me follows player during peace and switches to GUARD only for real threats',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  // The owner must actually be OUTSIDE the configured 3-block stop radius.
  f.bot.players.Steve.entity.position=vec(8,64,0)
  await e.onChat('Steve','AliceAI 保护我')
  assert.equal(f.core.state,'FOLLOW','guard order must not freeze movement in peacetime')
  assert.equal(e.lastGuardedPlayer,'Steve')
  await e.followTick()
  assert(f.calls.some(x=>x[0]==='setGoal'&&x[1]?.entity))
})

test('Bedrock follow stuck diagnostics cause bounded re-path without digging',async()=>{
  let time=100000;const f=fixture(()=>time),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.bot.pathfinder.isMoving=()=>false
  f.bot.players.Steve.entity.position=vec(12,64,0)
  f.core.setFollowIntent('Steve')
  await e.followTick()
  const first=f.calls.filter(x=>x[0]==='setGoal'&&x[1]).length
  assert.equal(first,1)
  time+=7000;await e.followTick()
  time+=7000;await e.followTick()
  assert.equal(f.calls.filter(x=>x[0]==='setGoal'&&x[1]).length,2,'stalled follow should trigger one re-path')
  assert(f.calls.some(x=>x[0]==='warn'&&String(x[1]).includes('re-path')))
  e.stop()
})
test('Bedrock autonomous tree search reaches bounded 28-block radius without cutting a structure',async()=>{
  const f=fixture(),p=vec(26,64,0),search=[]
  f.bot.findBlocks=options=>{search.push(options);return [p]}
  f.bot.blockAt=pos=>({name:'oak_log',position:pos})
  f.bot.dig=()=>{throw Error('must not dig unverified structure')}
  const ops=new BedrockOperations({bot:f.bot,api:f.api,sleep:async()=>{}})
  assert.equal((await ops.gatherOne({origin:vec(0,64,0)})).reason,'no_verified_natural_tree')
  assert.equal(search[0].maxDistance,28)
  assert.equal(search[0].count,256)
})
 

test('Bedrock follow keeps three-block spacing consistent across intent, planner and recovery',async()=>{
  let time=100000
  const f=fixture(()=>time),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.bot.players.Steve.entity.position=vec(16,64,0)
  await e.onChat('Steve','AliceAI 跟着我')
  assert.equal(f.core.intent.data.distance,3)
  assert.equal(e.followProgress.safeRadius,3)
  await e.followTick()
  assert.equal(f.calls.filter(x=>x[0]==='setGoal'&&x[1]?.entity).at(-1)[1].distance,3)
  time+=7000;await e.followTick()
  time+=7000;await e.followTick()
  assert.equal(f.calls.filter(x=>x[0]==='setGoal'&&x[1]?.entity).at(-1)[1].distance,3)
  e.stop()
})

test('a named chest command suspends durable FOLLOW and resumes it after exact transfer',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 await e.onChat('Steve','AliceAI 跟着我')
 await e.onChat('Steve','AliceAI 从箱子里拿3个钻石')
 assert(f.core.hasFollowIntent())
 await new Promise(r=>setImmediate(r))
 assert(f.calls.some(x=>x[0]==='transfer'&&x[1].item==='diamond'&&x[1].amount===3))
 await new Promise(r=>setImmediate(r))
 assert.equal(f.core.state,'FOLLOW')
 e.stop()
})
test('visible FOLLOW uses 3 blocks and 4 when target is occluded',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.players.Steve.entity.position=vec(16,64,0)
 f.bot.canSeeEntity=()=>true
 await e.onChat('Steve','AliceAI 跟着我')
 await e.followTick()
 assert.equal(f.core.intent.data.distance,3)
 assert.equal(e.followProgress.safeRadius,3)
 assert.equal(f.calls.filter(c=>c[0]==='setGoal'&&c[1]?.entity).at(-1)[1].distance,3)
 f.bot.canSeeEntity=()=>false
 now+=6000;await e.followTick()
 assert.equal(e.followProgress.safeRadius,4)
 assert.equal(f.calls.filter(c=>c[0]==='setGoal'&&c[1]?.entity).at(-1)[1].distance,4)
 e.stop()
})
test('safe hunger recovery works at full health and cannot be interrupted by low HP alone',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.health=8;f.bot.food=9;f.setItems([{name:'bread',count:2}])
 f.operator.eatIfSafe=async()=>({ok:true,foodBefore:9,foodAfter:16})
 e.safetyTick()
 await e.maintenanceTick()
 assert.equal(e.job?.type,'RECOVER')
 e.safetyTick();assert.equal(f.core.state,'RECOVER')
 e.stop()
 const g=fixture(),other=new AliceBedrockRuntime({...g,policies:await policies()})
 other.started=true;other.seenSpawn=true;other.hasHealth=true;other.hasInventorySync=true
 g.bot.health=20;g.bot.food=9;g.setItems([{name:'bread',count:2}])
 await other.maintenanceTick()
 assert.equal(other.job?.type,'RECOVER')
 other.stop()
})
test('auto-food while following and shelter verified, retains durable owner intent and restores weapon schedule',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.food=10;f.bot.health=13
 f.core.setFollowIntent('Steve',3)
 const danger={target:{name:'zombie'}}
 e.threat=()=>danger
 e.escortDecision=()=>({allowFollow:true,reason:'hostile_behind_observed_barrier'})
 f.setItems([{name:'bread',count:1}])
 f.operator.eatIfSafe=async ({underThreat})=>{
   assert.equal(underThreat,false)
   return {ok:true,foodBefore:10,foodAfter:15}
 }
 await e.maintenanceTick()
 assert.equal(e.job?.type,'RECOVER')
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(f.core.hasFollowIntent(),true)
 assert.equal(e.nextEquipAt,0)
 e.stop()
})
test('auto-food refuses open mobs, unverified barriers and recent hits',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.food=8;f.bot.health=13;f.core.setFollowIntent('Steve',3)
 f.setItems([{name:'bread',count:1}])
 e.threat=()=>({target:{name:'zombie'}})
 e.escortDecision=()=>({allowFollow:true,reason:'escort_moving_owner'})
 await e.maintenanceTick()
 assert.equal(e.job,null)
 e.escortDecision=()=>({allowFollow:true,reason:'hostile_behind_observed_barrier'})
 e.lastSelfDamageAt=f.clock()-1000
 await e.maintenanceTick()
 assert.equal(e.job,null)
 e.stop()
})
test('no nearby known bed means night-time maintenance does not start a job',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.operator.isNight=()=>true
 let attempted=0
 f.operator.sleepNearby=async()=>{attempted++;return {ok:false}}
 await e.maintenanceTick()
 assert.equal(attempted,0)
 assert.equal(e.job,null)
 e.stop()
})
test('native attack faces mob before sending attack packet without inventing hit',async()=>{
 const f=fixture(),calls=[],t={name:'zombie',position:vec(1,64,0)}
 f.bot.lookAt=async()=>calls.push('look')
 f.bot.attack=async()=>calls.push('attack')
 const ops=new BedrockOperations({bot:f.bot,api:f.api,sleep:async()=>{}})
 const r=await ops.attackOnce(t)
 assert.deepEqual(calls,['look','attack'])
 assert.equal(r.attempted,true)
 assert.equal(r.verifiedDamage,false)
})

test('Bedrock FOLLOW refreshes destination after owner moves three blocks, without waiting eight',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.players.Steve.entity.position=vec(15,64,0)
 await e.onChat('Steve','AliceAI 跟着我')
 await e.followTick()
 const goal=f.calls.filter(x=>x[0]==='setGoal'&&x[1]?.entity).at(-1)[1]
 assert.equal(goal.distance,3)
 f.bot.players.Steve.entity.position=vec(18,64,0)
 assert.equal(goal.hasChanged(),true,'three blocks of player movement must invalidate the old goal')
 assert.equal(goal.x,18)
 e.stop()
})
test('known wooden doorway is pathable by interaction, never dig or break house blocks',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.registry.blocksArray=[{name:'oak_door',id:115},{name:'iron_door',id:116},{name:'oak_planks',id:117}]
 f.api.Movements=class{constructor(){this.openable=new Set()}}
 let moves
 f.bot.pathfinder.setMovements=m=>{moves=m}
 e.configureMovement()
 assert.equal(moves.canOpenDoors,true)
 assert.equal(moves.canDig,false)
 assert.equal(moves.openable.has(115),true)
 assert.equal(moves.openable.has(116),false)
 assert.equal(moves.openable.has(117),false)
})
test('a positively observed house wall shortens follow range for loss of line of sight',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.players.Steve.entity.position=vec(6,64,0)
 f.bot.blockAt=p=>({name:p.x>2&&p.x<3?'oak_planks':'air',
   boundingBox:p.x>2&&p.x<3?'block':'empty'})
 await e.onChat('Steve','AliceAI 跟着我')
 await e.followTick()
 const goal=f.calls.filter(x=>x[0]==='setGoal'&&x[1]?.entity).at(-1)[1]
 assert.equal(goal.distance,4)
 assert.equal(e.followProgress.safeRadius,4)
 e.stop()
})

test('within configured three blocks Alice releases follow and faces verified visible owner',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.players.Steve.entity.position=vec(7,64,0)
 const faces=[]
 f.bot.lookAt=async(pos)=>faces.push([pos.x,pos.y,pos.z])
 f.bot.pathfinder.isMoving=()=>true
 await e.onChat('Steve','AliceAI 跟着我')
 await e.followTick()
 assert.equal(e.followGoal,'Steve')
 f.bot.players.Steve.entity.position=vec(2.6,64,0)
 await e.followTick()
 assert.equal(e.followGoal,null)
 assert.equal(f.calls.filter(x=>x[0]==='setGoal').at(-1)[1],null)
 assert.deepEqual(faces,[[2.6,65.4,0]])
 await e.followTick()
 assert.equal(faces.length,1,'look packets must be throttled')
 assert.equal(f.calls.filter(x=>x[0]==='setGoal'&&x[1]?.entity).length,1,'no new path inside radius')
 f.bot.players.Steve.entity.position=vec(4,64,0)
 await e.followTick()
 assert.equal(e.followGoal,'Steve','follow resumes beyond configured radius')
 e.stop()
})
test('close XZ but player one floor above must retain safe Pathfinder navigation',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.players.Steve.entity.position=vec(1.5,65,0)
 await e.onChat('Steve','AliceAI 跟着我')
 await e.followTick()
 assert.equal(e.followGoal,'Steve','a one-block rise is not a completed follow')
 e.stop()
})
test('registry-backed item command handles diamond and other Minecraft goals safely',async()=>{
 const p=await policies(),f=fixture(),runtime=new AliceBedrockRuntime({...f,policies:p})
 assert.deepEqual(parseTask('收集5个钻石'),{type:'ITEM_REQUEST',term:'钻石',count:5})
 assert.deepEqual(parseTask('挖钻石'),{type:'ITEM_REQUEST',term:'钻石',count:null})
 assert.equal(parseTask('跟紧我').type,'FOLLOW')
 assert.equal(parseTask('回血').type,'EAT')
 assert.equal(parseTask('记住：闪亮矿=diamond').type,'TEACH_ITEM')
 f.bot.registry.itemsByName.diamond={id:1}
 runtime.started=true;runtime.seenSpawn=true;runtime.hasHealth=true;runtime.hasInventorySync=true
 runtime.acceptAcquire('Steve','钻石',1)
 assert.equal(f.core.state,'CRAFT')
 await new Promise(r=>setImmediate(r))
 assert.equal(f.core.state,'IDLE')
 runtime.stop()
})

test('autonomous scout failure surveys a constructed room without moving or digging',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(0.5,65,0.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:1000}
 let actions=0
 f.bot.dig=()=>{actions++}
 f.bot.activateBlock=()=>{actions++}
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(y===64&&Math.abs(x)<=1&&Math.abs(z)<=1)return {name:'oak_planks',boundingBox:'block'}
   if(y>=65&&y<=66&&Math.abs(x)<=1&&Math.abs(z)<=1)return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 assert.equal(e.lastEscapeSurvey?.status,'no_non_destructive_exit_observed')
 assert.equal(e.lastEscapeSurvey.canModifyWorld,false)
 assert.equal(actions,0)
 assert.equal(f.calls.some(x=>x[0]==='goto'||x[0]==='setGoal'),false)
 const surveys=()=>f.calls.filter(x=>x[0]==='log'&&x[1]==='[Alice exploration] escape survey:')
 assert.equal(surveys().length,1)
 now+=40000;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(surveys().length,1,'short autonomous cycle must not re-survey the room')
 e.stop()
})

test('blocked Alice autonomously opens one nearby observed door without digging or roaming',async()=>{
 let now=100000,opens=0,digs=0
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 let opened=false
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)return {name:'oak_door',boundingBox:'block',
     position:vec(x,y,z),getProperties:()=>({open_bit:opened,upper_block_bit:false})}
   if(y===64&&Math.abs(x)<=1&&Math.abs(z)<=1)return {name:'oak_planks',boundingBox:'block'}
   if(y>=65&&y<=66&&Math.abs(x)<=1&&Math.abs(z)<=1)return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 f.bot.activateBlock=async()=>{opens++;opened=true}
 f.bot.lookAt=async()=>{}
 f.bot.dig=()=>{digs++}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 assert.equal(e.lastEscapeSurvey?.status,'door_interaction_candidate')
 for(let i=0;i<70&&!e.lastEscapePassageAction;i++)
   await new Promise(resolve=>setTimeout(resolve,15))
 assert.equal(opens,1,'only one bounded wooden door interaction')
 assert.equal(digs,0)
 assert.equal(f.calls.some(x=>x[0]==='goto'),false,
   'blocked door exit must be rejected BEFORE any approach movement')
 assert.equal(e.lastEscapePassageAction?.reason,'crossing_opposite_side_blocked_or_unknown')
 assert.equal(e.lastEscapePassageAction?.attempted,false)
 assert.equal(e.lastEscapeDoorAction?.reason,'door_open_observed_exit_unverified')
 assert.equal(e.lastEscapeDoorAction?.serverMovementVerified,false)
 now+=40000;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(opens,1,'door must not be toggled shut by another autonomy cycle')
 e.stop()
})

test('indoor WAIT approaches a four-cell doorway without opening or mining until resurvey',async()=>{
 let now=100000,activations=0,digs=0
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 f.api.GoalNear=class{constructor(x,y,z){this.x=x;this.y=y;this.z=z}}
 f.api.Movements=class{constructor(){this.openable=new Set()}}
 f.bot.pathfinder.goto=async g=>{
   f.calls.push(['goto',g.x,g.y,g.z])
   f.bot.entity.position=vec(g.x+.5,g.y,g.z+.5)
 }
 f.bot.activateBlock=()=>{activations++}
 f.bot.dig=()=>{digs++}
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===0&&z===5&&y===65)return {name:'oak_door',boundingBox:'block',
     getProperties:()=>({open_bit:0,upper_block_bit:0})}
   if(x===0&&z>=0&&z<=4)return y===64?
     {name:'oak_planks',boundingBox:'block'}:
     {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 assert.equal(e.lastEscapeSurvey?.door?.approach?.steps,4)
 for(let i=0;i<15&&!e.lastEscapeDoorAction;i++)await new Promise(r=>setImmediate(r))
 assert.equal(f.calls.filter(x=>x[0]==='goto').length,4)
 assert.equal(e.lastEscapeDoorAction?.reason,'approach_local_only_server_unverified')
 assert.equal(e.lastEscapeDoorAction?.serverMovementVerified,false)
 assert.equal(activations,0,'approach is not automatic door activation')
 assert.equal(digs,0,'constructed room is never mined')
 e.stop()
})

test('doorway movement guard explains safety preemption without bypassing checks',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const controller=new AbortController()
 // Runtime jobs hold both the controller and its signal. stop() must abort both.
 e.job={abort:controller,signal:controller.signal,type:'EXPLORE'}
 f.core.state='EXPLORE'
 assert.equal(e.escapeApproachGuard(controller.signal).ok,true)
 e.safetyBusy=true
 assert.equal(e.escapeApproachGuard(controller.signal).reason,'safety_controller_busy')
 e.safetyBusy=false
 e.lastSafetyAt=now-2000
 assert.equal(e.escapeApproachGuard(controller.signal).reason,'recent_threat_cooldown')
 e.lastSafetyAt=0
 f.bot.health=13
 assert.equal(e.escapeApproachGuard(controller.signal).reason,'health_below_escape_threshold')
 f.bot.health=20
 f.core.intent={type:'FOLLOW',data:{playerName:'Steve'}}
 assert.equal(e.escapeApproachGuard(controller.signal).reason,'follow_intent_preempted')
 f.core.intent={type:'IDLE',data:{}}
 assert.equal(e.escapeApproachGuard(new AbortController().signal).reason,'job_ownership_changed')
 e.stop()
 assert.equal(controller.signal.aborted,true,'stopping a job must cancel its AbortController')
})

test('enclosed Alice opens a known wooden door and attempts observed passage without mining',async()=>{
 let now=100000,opened=false,opens=0,digs=0
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies(),
   movementEvidence:{checkpoint:()=>({events:2}),progress:()=>({confirmed:true,reason:'server_position_changed'}),
     get:()=>({lastAt:now-10,latestFeet:{x:.5,y:65,z:2.5}})}})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 f.bot.registry.blocksArray=[{id:113,name:'oak_door'}]
 f.api.GoalNear=class{constructor(x,y,z){this.x=x;this.y=y;this.z=z}}
 f.api.Movements=class{constructor(){this.openable=new Set()}}
 f.bot.pathfinder.goto=async g=>{
   f.calls.push(['goto',g.x,g.y,g.z])
   f.bot.entity.position=vec(g.x+.5,g.y,g.z+.5)
 }
 f.bot.setControlState=(name,state)=>{
   f.calls.push(['control',name,state])
   if(name==='forward'&&state)f.bot.entity.position=vec(.5,65,f.bot.entity.position.z+.45)
 }
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===0&&z===1&&y===65)return {name:'oak_door',boundingBox:'block',
     position:vec(x,y,z),getProperties:()=>({open_bit:opened?1:0,upper_block_bit:0})}
   if(x===0&&z===1&&y===66)return {name:'oak_door',boundingBox:'block',
     position:vec(x,y,z),getProperties:()=>({open_bit:opened?1:0,upper_block_bit:1})}
   if(x===0&&z>=0&&z<=2)return y===64?{name:'oak_planks',boundingBox:'block'}:
     y===65||y===66?{name:'air',boundingBox:'empty'}:{name:'stone_bricks',boundingBox:'block'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 f.bot.activateBlock=async()=>{opens++;opened=true}
 f.bot.lookAt=async()=>{}
 f.bot.dig=()=>{digs++}
 f.bot.placeBlock=()=>{digs++}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 for(let i=0;i<70&&!e.lastEscapePassageAction;i++)await new Promise(r=>setTimeout(r,15))
 assert.equal(e.lastEscapeSurvey?.door?.position?.join(','),'0,65,1')
 assert.equal(opens,1,'do not click repeatedly or close the door')
 assert.equal(digs,0,'never dig or place parts of a house')
 assert.equal(f.calls.some(x=>x[0]==='goto'),false,'door crossing must not auto-toggle via pathfinder')
 assert(f.calls.filter(x=>x[0]==='control'&&x[1]==='forward'&&x[2]===true).length>=1)
 assert.equal(e.lastEscapeDoorAction?.openObserved,true)
 assert.equal(e.lastEscapePassageAction?.serverMovementVerified,true)
 assert.equal(e.lastEscapePassageAction?.roomExitVerified,false,'door passage is not guaranteed outdoors')
 await new Promise(r=>setImmediate(r))
 const jobs=f.calls.filter(x=>x[0]==='log'&&x[1]==='[Alice Bedrock] verified job result:')
 assert(jobs.some(x=>String(x[2]).includes('"doorOpenObserved":true')&&
   String(x[2]).includes('"serverMovementVerified":true')),
   'overall job is evaluated by doorway passage, not just activation')
 e.stop()
})

test('already open wood door triggers safe crossing without a second activation',async()=>{
 let now=100000,opens=0
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 f.bot.registry.blocksArray=[{id:113,name:'oak_door'}]
 f.api.GoalNear=class{constructor(x,y,z){this.x=x;this.y=y;this.z=z}}
 f.api.Movements=class{constructor(){this.openable=new Set()}}
 f.bot.pathfinder.goto=async g=>{f.calls.push(['goto',g.x,g.y,g.z]);f.bot.entity.position=vec(g.x+.5,g.y,g.z+.5)}
 f.bot.lookAt=async()=>{}
 f.bot.setControlState=(name,state)=>{
   f.calls.push(['control',name,state])
   if(name==='forward'&&state)f.bot.entity.position=vec(.5,65,f.bot.entity.position.z+.45)
 }
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===0&&z===1&&y===65)return {name:'oak_door',boundingBox:'block',
     getProperties:()=>({open_bit:1,upper_block_bit:0})}
   if(x===0&&z===1&&y===66)return {name:'oak_door',boundingBox:'block',
     getProperties:()=>({open_bit:1,upper_block_bit:1})}
   if(x===0&&z>=0&&z<=2)return y===64?{name:'oak_planks',boundingBox:'block'}:
     y===65||y===66?{name:'air',boundingBox:'empty'}:{name:'stone_bricks',boundingBox:'block'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 f.bot.activateBlock=()=>{opens++}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 // Each actual Bedrock forward pulse waits ~120ms. A setImmediate loop
 // finishes before crossing completes; use bounded wall-clock polling.
 for(let i=0;i<100&&!e.lastEscapePassageAction;i++)
   await new Promise(r=>setTimeout(r,20))
 assert(e.lastEscapePassageAction,'bounded crossing must settle before assertions')
 assert.equal(opens,0)
 assert.equal(f.calls.filter(x=>x[0]==='goto').length,0)
 assert(f.calls.some(x=>x[0]==='control'&&x[1]==='forward'&&x[2]===true))
 assert.equal(e.lastEscapePassageAction?.reason,'door_passage_local_only_server_unverified')
 e.stop()
})

test('safety-preempted doorway approach does not retain unrelated two-minute idle work cooldown',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 f.api.GoalNear=class{constructor(x,y,z){this.x=x;this.y=y;this.z=z}}
 f.api.Movements=class{constructor(){this.openable=new Set()}}
 f.bot.pathfinder.goto=async g=>{
   f.calls.push(['goto',g.x,g.y,g.z])
   f.bot.entity.position=vec(g.x+.5,g.y,g.z+.5)
   e.safetyBusy=true
 }
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===0&&z===5&&y===65)return {name:'oak_door',boundingBox:'block',
     getProperties:()=>({open_bit:0,upper_block_bit:0})}
   if(x===0&&z>=0&&z<=4)return y===64?
     {name:'oak_planks',boundingBox:'block'}:{name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 for(let i=0;i<20&&!e.lastEscapeDoorAction;i++)await new Promise(r=>setImmediate(r))
 assert.match(e.lastEscapeDoorAction?.reason||'',/approach_preempted_after_move:safety_controller_busy/)
 assert.equal(f.calls.filter(x=>x[0]==='goto').length,1)
 assert.equal(e.lastEscapeApproachRetryAt,now+30000)
 assert.equal(e.nextIdleAt,now+30000)
 assert.equal(e.lastEscapeSurveyAt,Number.NEGATIVE_INFINITY)
 e.stop()
})

test('failed protected-tree gather schedules bounded indoor observation instead of waiting ordinary wood task cooldown',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000} // Daytime work test; nighttime raw-material gather is deferred.
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(y===64&&Math.abs(x)<=1&&Math.abs(z)<=1)
     return {name:'oak_planks',boundingBox:'block'}
   if(y>=65&&y<=66&&Math.abs(x)<=1&&Math.abs(z)<=1)
     return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 let harvestAttempts=0
 e.gatherCount=async()=>{harvestAttempts++;return {ok:false,reason:'no_verified_natural_tree'}}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 for(let i=0;i<8&&e.job;i++)await new Promise(setImmediate)
 assert.equal(harvestAttempts,1)
 assert.equal(e.failureMemory.blocked('wood',f.bot.entity.position).reason,'no_verified_natural_tree')
 assert.equal(e.nextIdleAt,now+5000,'failure advances only the next autonomous eligibility')
 assert(f.calls.some(x=>x[1]==='[Alice exploration] blocked resource site; indoor survey scheduled:'))
 assert.equal(e.lastEscapeSurvey,null,'a finished gather alone cannot perform a world action')
 now+=5001
 await e.idleTick()
 assert(e.lastEscapeSurvey,'next safe autonomy evaluation surveys the enclosed room')
 assert.equal(e.lastEscapeSurvey.canModifyWorld,false)
 assert.equal(harvestAttempts,1,'must not repeat rejected tree harvest')
 assert.equal(f.calls.filter(x=>x[0]==='goto'||x[0]==='dig').length,0)
 e.stop()
})

test('known indoor wooden door takes priority over an otherwise valid natural-ground daytime SCOUT',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)
     return {name:'oak_door',boundingBox:'block',
       getProperties:()=>({open_bit:0,upper_block_bit:0})}
   if(y===64&&Math.abs(x)<=6&&Math.abs(z)<=3)
     return {name:'grass_block',boundingBox:'block'}
   if(y>=65&&y<=66&&Math.abs(x)<=6&&Math.abs(z)<=3)
     return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 assert(e.lastEscapeSurvey?.door,'room scan must keep observed wooden door candidate')
 assert.equal(e.lastIdleDecision.action,'WAIT')
 assert.equal(e.lastIdleDecision.goal,'FIND_ROOM_EXIT')
 assert.equal(e.lastIdleDecision.reason,'observed_indoor_wooden_door_first')
 assert.equal(f.calls.filter(x=>x[0]==='goto').length,0,
   'unknown door bits never authorize a pathfinder motion')
 e.stop()
})

test('server-movement uncertainty forbids all indoor escape actions even with a detected door',async()=>{
 let now=100000,attempts=0
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)
     return {name:'oak_door',boundingBox:'block',
       getProperties:()=>({open_bit:0,upper_block_bit:0})}
   if(y===64&&Math.abs(x)<=1&&Math.abs(z)<=1)
     return {name:'oak_planks',boundingBox:'block'}
   if(y>=65&&y<=66&&Math.abs(x)<=1&&Math.abs(z)<=1)
     return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 f.bot.activateBlock=()=>{attempts++}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 e.failureMemory.mark('motion',f.bot.entity.position,'scout_waypoint_not_reached')
 await e.idleTick()
 await new Promise(setImmediate)
 assert(e.lastEscapeSurvey?.door,'read-only observation remains allowed')
 assert.equal(e.lastIdleDecision.reason,'server_movement_unverified_cooldown')
 assert.equal(e.lastEscapeDoorAction,null)
 assert.equal(e.job,null)
 assert.equal(attempts,0)
 e.stop()
})

test('unknown door state must not preempt an independently known-safe daytime SCOUT',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)
     return {name:'oak_door',boundingBox:'block'}
   if(y===64&&Math.abs(x)<=6&&Math.abs(z)<=3)
     return {name:'grass_block',boundingBox:'block'}
   if(y>=65&&y<=66&&Math.abs(x)<=6&&Math.abs(z)<=3)
     return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 assert(e.lastEscapeSurvey?.door,'read-only survey still detects observed door')
 assert.equal(e.lastIdleDecision.action,'SCOUT',
   'unknown open_bit cannot suppress a fully validated natural terrain scout')
 assert.equal(e.lastEscapeDoorAction,null)
 e.stop()
})

test('nighttime blocked room remains read-only and does not manufacture a movement reason',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)
     return {name:'oak_door',boundingBox:'block'}
   if(y===64&&Math.abs(x)<=1&&Math.abs(z)<=1)
     return {name:'oak_planks',boundingBox:'block'}
   if(y>=65&&y<=66&&Math.abs(x)<=1&&Math.abs(z)<=1)
     return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 e.failureMemory.mark('motion',f.bot.entity.position,'scout_waypoint_not_reached')
 await e.idleTick()
 assert(e.lastEscapeSurvey?.door)
 assert.equal(e.lastIdleDecision.action,'WAIT')
 assert.equal(e.lastIdleDecision.reason,'daylight_or_weather_prevents_safe_scout')
 assert.equal(e.lastEscapeDoorAction,null)
 assert.equal(e.job,null)
 e.stop()
})

test('observed open natural ground prioritizes shelter at night, then restores daylight exploration',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 f.bot.blockAt=p=>{
   const y=Math.floor(p.y)
   return y===64?{name:'grass_block',boundingBox:'block'}:
     {name:'air',boundingBox:'empty'}
 }
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 e.lastEscapeSurveyAt=now-1000
 e.lastEscapeSurvey={
   center:[0,65,0],reachableCells:91,status:'open_frontier_observed',
   openFrontier:{target:[-1,65,-6],steps:7},
   door:{position:[0,65,5],kind:'wooden_door',permitted:false,
     approach:{position:[0,65,4],steps:10,
       routeComplete:true,elevationChanges:0,waypoints:[]}},
   passageAction:{door:[0,65,5],attempted:true,serverMovementVerified:false}
 }
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().goal,'SECURE_SHELTER')
 assert.equal(e.continuousGoal.snapshot().step,'BUILD_SHELTER')
 assert.equal(e.continuousGoal.snapshot().phase,'WAITING')
 assert.equal(e.lastShelterOpportunity.reason,'shelter_materials_missing')
 assert.equal(e.lastIdleHold.goal,'SECURE_SHELTER')
 assert.equal(e.nextIdleAt,now+15000)
 assert.equal(e.job,null,'no materials: night never invents dangerous construction')
 now+=16000
 f.bot.time.timeOfDay=6000
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 assert.equal(e.lastIdleDecision.action,'SCOUT',
   'daylight should resume safe new-area navigation rather than former doorway')
 assert.equal(e.lastIdleDecision.goal,'DISCOVER_RESOURCES')
 assert.equal(e.driveJournal.get().previousGoal,null)
 e.stop()
})

test('night without raw wood defers autonomous harvesting without inventing movement',async()=>{
 let now=100000,harvests=0
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 f.bot.blockAt=p=>({name:Math.floor(p.y)===64?'oak_planks':'air',
   boundingBox:Math.floor(p.y)===64?'block':'empty'})
 e.gatherCount=async()=>{harvests++;return {ok:false,reason:'no_verified_natural_tree'}}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.lastIdleDecision.action,'WAIT')
 assert.equal(e.lastIdleDecision.goal,'PREPARE_DAYLIGHT')
 assert.equal(e.lastIdleDecision.reason,'defer_nonurgent_raw_materials_at_night')
 assert.equal(harvests,0,'no spontaneous night harvest of player house wood')
 assert.equal(e.job,null)
 e.stop()
})

test('companion default prevents idle autonomous jobs without suppressing player commands',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies(),settingsReader:null})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  e.lastHumanAt=0;e.nextIdleAt=0
  await e.idleTick()
  assert.equal(e.job,null)
  assert.equal(e.liveBehavior.settings.agentMode,'companion')
  await e.onChat('Steve','AliceAI 跟着我')
  assert.equal(f.core.hasFollowIntent(),true)
  await e.onChat('Steve','AliceAI 停止')
  e.stop()
})
test('model observe suggestion comes from real request and does not cause world action',async()=>{
  let now=300000,requests=0
  const f=fixture(()=>now)
  const planner={url:'http://127.0.0.1:11435',suggestGoal:async()=>{
    requests++;return {tool:'observe',reason:'terrain unverified'}
  }}
  const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  e.lastHumanAt=0;e.nextIdleAt=0
  await e.idleTick()
  assert.equal(requests,1)
  assert.equal(e.job,null)
  assert.equal(e.goalPlanner.snapshot('autonomous').goalSource,'model')
  now+=125000;e.nextIdleAt=0
  await e.idleTick()
  assert.equal(requests,1,'unchanged facts must not trigger continuous planning')
  e.stop()
})

test('player STOP blocks model-initiated idle jobs until deliberate mode switch',async()=>{
  const f=fixture()
  const e=new AliceBedrockRuntime({...f,policies:await policies(),planner:{
    url:'http://127.0.0.1:11435',
    suggestGoal:async()=>({tool:'gather_wood',reason:'tree observed'})
  }})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  await e.onChat('Steve','AliceAI 停止')
  e.lastHumanAt=0;e.nextIdleAt=0
  await e.idleTick()
  assert.equal(e.job,null)
  assert.equal(e.goalPlanner.snapshot('autonomous').planningRequests,0)
  assert.equal(e.goalPlanner.snapshot('autonomous').pausedByStop,true)
  e.stop()
})


test('verified playerLeft revokes departed owner but NOT entityGone or unrelated players',async()=>{
  const {EventEmitter}=require('node:events')
  const f=fixture(),bus=new EventEmitter()
  f.bot.on=bus.on.bind(bus);f.bot.off=bus.off.bind(bus)
  const e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.start();e.hasHealth=true;e.hasInventorySync=true
  // The owner must actually be OUTSIDE the configured 3-block stop radius.
  f.bot.players.Steve.entity.position=vec(8,64,0)
  f.bot.players.Alex={entity:{position:vec(2,64,3)}}
  await e.onChat('Steve','AliceAI 跟着我')
  await e.followTick()
  assert.equal(e.followGoal,'Steve')
  bus.emit('playerLeft',{username:'Alex'})
  assert(f.core.hasFollowIntent())
  f.bot.players.Steve.entity=null
  bus.emit('entityGone',{username:'Steve'})
  await e.followTick()
  assert(f.core.hasFollowIntent(),'out-of-view/removed entity is NOT logout')
  delete f.bot.players.Steve
  bus.emit('playerLeft',{username:'Steve'})
  assert.equal(f.core.hasFollowIntent(),false)
  assert.equal(f.core.state,'IDLE')
  assert.equal(e.followGoal,null)
  assert.equal(e.lastSeenPlayer,null)
  assert.deepEqual(e.lastFollowEnd,{reason:'player_left_server',at:100000,
    source:'bedrock_player_list_remove',previousMode:'follow'})
  assert(f.calls.some(x=>x[0]==='setGoal'&&x[1]===null))
  f.bot.players.Steve={entity:{position:vec(2,64,2)}}
  bus.emit('playerJoined',{username:'Steve'})
  await e.followTick()
  assert.equal(f.core.hasFollowIntent(),false,'rejoin never auto-resumes old FOLLOW')
  await e.onChat('Steve','AliceAI 跟着我')
  assert.equal(f.core.hasFollowIntent(),true)
  assert.equal(e.lastFollowEnd,null)
  e.stop()
  assert.equal(bus.listenerCount('playerLeft'),0,'listener cleaned up')
})
test('late playerLeft cannot revoke an owner already present in new Bedrock roster',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  await e.onChat('Steve','AliceAI 跟着我')
  e.onPlayerLeft({username:'steve'})
  assert(f.core.hasFollowIntent())
  assert.equal(e.lastFollowEnd,null)
  e.stop()
})
test('departure during safety combat clears GUARD intent without aborting retreat',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  await e.onChat('Steve','AliceAI 保护我')
  assert.equal(e.lastGuardedPlayer,'Steve')
  e.safetyBusy=true;f.core.state='COMBAT'
  delete f.bot.players.Steve
  const before=f.calls.filter(x=>x[0]==='setGoal'||x[0]==='stop').length
  e.onPlayerLeft({username:'Steve'})
  assert.equal(f.core.state,'COMBAT')
  assert.equal(f.core.intent.type,'IDLE')
  assert.equal(e.lastGuardedPlayer,null)
  assert.equal(f.calls.filter(x=>x[0]==='setGoal'||x[0]==='stop').length,before)
  assert.equal(e.lastFollowEnd.previousMode,'guard')
  f.core.resumeIntent('threat passed')
  assert.equal(f.core.state,'IDLE')
  e.stop()
})
test('owner leaving while temporary job executes keeps job, drops stale return-to-follow',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  await e.onChat('Steve','AliceAI 跟着我')
  const ctrl=new AbortController()
  e.job={abort:ctrl,signal:ctrl.signal,type:'GATHER',id:8}
  f.core.state='GATHER'
  delete f.bot.players.Steve
  e.onPlayerLeft({username:'Steve'})
  assert.equal(e.job.type,'GATHER')
  assert.equal(ctrl.signal.aborted,false)
  assert.equal(f.core.intent.type,'IDLE')
  assert.equal(f.core.state,'GATHER')
  e.job=null;f.core.resumeIntent('job done')
  assert.equal(f.core.state,'IDLE')
  e.stop()
})

test('LLM observe cannot disable a separately verified daytime scout skill',async()=>{
  const f=fixture(),p=await policies(),planner={
    url:'http://127.0.0.1:11435',suggestGoal:async()=>({tool:'observe',reason:'inspect surroundings'})
  }
  f.bot.entity.position=vec(.5,64,.5);f.bot.entity.onGround=true
  f.bot.time={timeOfDay:6000}
  f.bot.blockAt=q=>({name:Math.floor(q.y)===63?'grass_block':'air',
    boundingBox:Math.floor(q.y)===63?'block':'empty'})
  const e=new AliceBedrockRuntime({...f,policies:p,planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  e.lastHumanAt=0;e.nextIdleAt=0
  e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
  await e.idleTick()
  assert.equal(e.goalPlanner.snapshot('autonomous').acceptedProposals,1)
  assert.equal(e.lastIdleDecision.action,'SCOUT')
  assert.equal(f.core.state,'EXPLORE','validated local skill is eligible after LLM observation')
  for(let i=0;i<6;i++)await new Promise(setImmediate)
  assert(f.calls.some(x=>x[0]==='goto'),'bounded scout issues path requests')
  assert(f.calls.some(x=>x[1]==='[Alice autonomy] verified local skill after model observation:'))
  assert(e.lastScoutProgress&&!e.lastScoutProgress.confirmed,
    'local prediction cannot be mistaken for BDS movement proof')
  e.stop()
})
test('LLM observe still cannot turn an unknown collision map into a blind move',async()=>{
  const f=fixture(),planner={
    url:'http://127.0.0.1:11435',suggestGoal:async()=>({tool:'observe',reason:'collision unverified'})
  }
  f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
  f.bot.time={timeOfDay:6000}
  f.bot.blockAt=()=>null
  const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  e.lastHumanAt=0;e.nextIdleAt=0
  e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
  await e.idleTick()
  assert.equal(e.job,null)
  assert(!f.calls.some(x=>x[0]==='goto'),'unknown chunks must not be a navigation target')
  e.stop()
})
test('Ollama failure is not an implicit permission to take an unrelated action',async()=>{
  const f=fixture(),planner={
    url:'http://127.0.0.1:11435',suggestGoal:async()=>{throw Error('Ollama HTTP 503')}
  }
  f.bot.entity.position=vec(.5,64,.5);f.bot.entity.onGround=true
  f.bot.time={timeOfDay:6000}
  f.bot.blockAt=q=>({name:Math.floor(q.y)===63?'grass_block':'air',
    boundingBox:Math.floor(q.y)===63?'block':'empty'})
  const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  e.lastHumanAt=0;e.nextIdleAt=0
  e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
  await e.idleTick()
  assert.equal(e.goalPlanner.modelStatus,'error')
  assert(!f.calls.some(x=>x[0]==='goto'))
  assert.equal(e.job,null)
  e.stop()
})
test('OBSERVE with model does not suppress guarded night-time wooden-door interaction',async()=>{
 let opens=0,opened=false
 const f=fixture(),planner={
   url:'http://127.0.0.1:11435',suggestGoal:async()=>({tool:'observe',reason:'door observed'})
 }
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:13000}
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===2&&z===0&&y===65)return {name:'oak_door',boundingBox:'block',
     position:vec(x,y,z),getProperties:()=>({open_bit:opened,upper_block_bit:false})}
   if(y===64&&Math.abs(x)<=1&&Math.abs(z)<=1)return {name:'oak_planks',boundingBox:'block'}
   if(y>=65&&y<=66&&Math.abs(x)<=1&&Math.abs(z)<=1)return {name:'air',boundingBox:'empty'}
   return {name:'stone_bricks',boundingBox:'block'}
 }
 f.bot.activateBlock=async()=>{opens++;opened=true}
 f.bot.lookAt=async()=>{}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('wood',f.bot.entity.position,'no_verified_natural_tree')
 await e.idleTick()
 for(let i=0;i<70&&!e.lastEscapePassageAction;i++)await new Promise(r=>setTimeout(r,15))
 assert.equal(opens,1,'room escape safety executor runs despite OBSERVE tool')
 assert.equal(e.lastEscapePassageAction?.attempted,false,
    'the wall behind a door is still a hard safety gate')
 assert(!f.calls.some(x=>x[0]==='goto'),'no teleport/unverified route')
 e.stop()
})

test('daytime autonomous OBSERVE can try verified flat voxel route before failed wood harvest',async()=>{
  let requests=0
  const f=fixture(),planner={url:'http://127.0.0.1:11435',suggestGoal:async()=>{
    requests++;return {tool:'observe',reason:'new area not surveyed'}
  }}
  f.bot.entity.position=vec(.5,64,.5);f.bot.entity.onGround=true
  f.bot.time={timeOfDay:6000}
  f.bot.blockAt=p=>({
    name:Math.floor(p.y)===63?'oak_planks':'air',
    boundingBox:Math.floor(p.y)===63?'block':'empty',
    shapes:Math.floor(p.y)===63?[[0,0,0,1,1,1]]:[]
  })
  const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  e.lastHumanAt=0;e.nextIdleAt=0
  assert.equal(e.failureMemory.blocked('wood',f.bot.entity.position),null)
  await e.idleTick()
  assert.equal(requests,1)
  assert.equal(e.lastIdleDecision.action,'WORK','resource goal remains semantic; local travel is exploratory')
  assert.equal(f.core.state,'EXPLORE','verified nondestructive flat corridor starts bounded move')
  assert(f.calls.some(x=>x[1]==='[Alice autonomy] verified local skill after model observation:'))
  for(let i=0;i<8;i++)await new Promise(setImmediate)
  assert(f.calls.some(x=>x[0]==='goto'),'safe scout reaches the real pathfinder')
  assert.equal(e.lastScoutProgress?.confirmed,false,'no authoritative server progress must never count as success')
  e.stop()
})
test('autonomous observation refuses unverified voxels even without failed harvest',async()=>{
  const f=fixture(),planner={url:'http://127.0.0.1:11435',
    suggestGoal:async()=>({tool:'observe',reason:'unknown map'})}
  f.bot.entity.position=vec(.5,64,.5);f.bot.entity.onGround=true
  f.bot.time={timeOfDay:6000};f.bot.blockAt=()=>null
  const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  e.lastHumanAt=0;e.nextIdleAt=0
  await e.idleTick()
  assert.equal(e.job,null)
  assert(!f.calls.some(x=>x[0]==='goto'))
  assert(f.calls.some(x=>x[1]==='[Alice autonomy] model observe without local action:'),
    'diagnostic must distinguish no safe route from a model staying idle')
  e.stop()
})
test('model reply cannot start old scout after a newly arrived player FOLLOW order',async()=>{
 const f=fixture()
 f.bot.entity.position=vec(.5,64,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>({name:Math.floor(p.y)===63?'stone_bricks':'air',
   boundingBox:Math.floor(p.y)===63?'block':'empty',
   shapes:Math.floor(p.y)===63?[[0,0,0,1,1,1]]:[]})
 const planner={url:'http://127.0.0.1:11435',suggestGoal:async()=>{
   f.core.setFollowIntent('Steve',3)
   return {tool:'observe',reason:'unsafe stale decision'}
 }}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(f.core.state,'FOLLOW')
 assert(!f.calls.some(x=>x[0]==='goto'),'FOLLOW takes priority over autonomous model proposal')
 e.stop()
})

test('model observe prefers an independently verified detour from a skeleton-exposed flat route',async()=>{
 const f=fixture(),planner={url:'http://127.0.0.1:11435',
   suggestGoal:async()=>({tool:'observe',reason:'visible flat routes'})}
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>({name:Math.floor(p.y)===64?'stone_bricks':'air',
   boundingBox:Math.floor(p.y)===64?'block':'empty',
   shapes:Math.floor(p.y)===64?[[0,0,0,1,1,1]]:[]})
 f.bot.entities={'55':{name:'skeleton',position:vec(8.5,65,4.5)}}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(f.core.state,'EXPLORE')
 assert(e.lastVoxelNavigation.walkSelection.threatRoutes>0)
 assert(e.lastVoxelNavigation.walkSelection.knownHostiles===1)
 assert(f.calls.some(x=>x[1]==='[Alice exploration] flat route selection:'))
 for(let i=0;i<5;i++)await new Promise(setImmediate)
 assert(f.calls.some(x=>x[0]==='goto'))
 e.stop()
})
test('model observe never scouts when every verified route exposes a nearby hostile',async()=>{
 const f=fixture(),planner={url:'http://127.0.0.1:11435',
   suggestGoal:async()=>({tool:'observe',reason:'known hostile'})}
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>({name:Math.floor(p.y)===64?'stone_bricks':'air',
   boundingBox:Math.floor(p.y)===64?'block':'empty',
   shapes:Math.floor(p.y)===64?[[0,0,0,1,1,1]]:[]})
 f.bot.entities={'55':{name:'skeleton',position:vec(.5,65,.5)}}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.job,null)
 assert(!f.calls.some(x=>x[0]==='goto'))
 e.stop()
})

test('real A* noPath inside bounded EXPLORE triggers one Bedrock physical input probe',async()=>{
 const f=fixture(),controls=[]
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>Math.floor(p.y)===64?
   {name:'stone_bricks',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}:
   {name:'air',boundingBox:'empty',shapes:[]}
 f.bot.pathfinder.goto=async()=>{f.calls.push(['goto']);throw Error('No path to the goal!')}
 let active=false
 f.bot.setControlState=(key,v)=>{controls.push([key,v]);active=v}
 f.bot.lookAt=async()=>{}
 const movement={checkpoint:()=>({events:0,position:null}),
   progress:()=>({confirmed:false,reason:'no_two_server_positions'}),
   get:()=>({received:0,latestFeet:null})}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),movementEvidence:movement})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const signal=new AbortController().signal
 f.core.state='EXPLORE';e.job={type:'EXPLORE',signal}
 const candidate={ok:true,kind:'observed_voxel_walking_only',
   target:{x:2,y:65,z:0},waypoints:[{x:1,y:65,z:0},{x:2,y:65,z:0}],
   key:'2,65,0',distance:2,elevationChanges:0}
 const out=await e.boundedScout(candidate,signal)
 assert.equal(out.ok,false)
 assert.equal(out.reason,'direct_flat_no_local_motion')
 assert.equal(out.attempted,true)
 assert(f.calls.some(x=>x[0]==='goto'))
 assert(controls.some(x=>x[0]==='forward'&&x[1]===true))
 assert.deepEqual(controls.at(-1),['forward',false])
 assert(f.calls.some(x=>x[1]==='[Alice movement] A* noPath physical input probe:'))
 e.job=null;e.stop()
})
test('A* noPath cannot bypass verified body collision into unknown Bedrock space',async()=>{
 const f=fixture(),controls=[]
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=()=>null
 f.bot.pathfinder.goto=async()=>{throw Error('No path to the goal!')}
 f.bot.setControlState=(k,v)=>controls.push([k,v])
 f.bot.lookAt=async()=>{}
 const e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const signal=new AbortController().signal
 f.core.state='EXPLORE';e.job={type:'EXPLORE',signal}
 const candidate={ok:true,kind:'observed_voxel_walking_only',
   target:{x:2,y:65,z:0},waypoints:[{x:1,y:65,z:0},{x:2,y:65,z:0}],
   key:'2,65,0',distance:2,elevationChanges:0}
 const out=await e.boundedScout(candidate,signal)
 assert.equal(out.attempted,false)
 assert.equal(out.serverMovementVerified,false)
 assert(!controls.some(x=>x[0]==='forward'&&x[1]===true))
 e.job=null;e.stop()
})

test('A* local first waypoint permits only a separately verified adjacent failed-cell input',async()=>{
 const f=fixture(),p=await policies()
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>Math.floor(p.y)===64?
  {name:'stone_bricks',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}:
  {name:'air',boundingBox:'empty',shapes:[]}
 let keyDown=0
 f.bot.setControlState=(k,v)=>{if(k==='forward'&&v)keyDown++}
 f.bot.lookAt=async()=>{}
 f.bot.pathfinder.goto=async()=>{
   f.bot.entity.position=vec(1.5,65,.5)
   throw Error('No path to the goal!')
 }
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const signal=new AbortController().signal
 f.core.state='EXPLORE';e.job={type:'EXPLORE',signal}
 const candidate={ok:true,kind:'observed_voxel_walking_only',
   target:{x:2,y:65,z:0},waypoints:[{x:1,y:65,z:0},{x:2,y:65,z:0}],
   key:'2,65,0',distance:2,elevationChanges:0}
 const result=await e.boundedScout(candidate,signal)
 assert.equal(result.reason,'direct_flat_no_local_motion')
 assert.equal(result.serverMovementVerified,false)
 assert(keyDown>0,'only the locally adjacent failed voxel may receive new input')
 const row=f.calls.find(x=>x[1]==='[Alice movement] A* waypoint failure:')
 assert(row)
 assert.equal(JSON.parse(row[2]).withinWaypoint,true)
 const selected=f.calls.find(x=>x[1]==='[Alice movement] A* failed waypoint probe selection:')
 assert(selected)
 assert.equal(JSON.parse(selected[2]).selectedIndex,1)
 assert.deepEqual(JSON.parse(selected[2]).probeWaypoint,{x:2,y:65,z:0})
 e.job=null;e.stop()
})

test('A* failed next voxel being an OPEN Bedrock wooden door uses existing guarded crossing',async()=>{
 const f=fixture(),pressed=[],interacted=[]
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=p=>{
   const x=Math.floor(p.x),y=Math.floor(p.y)
   if(x===2&&y===65)return {name:'wooden_door',boundingBox:'block',
      getProperties:()=>({open_bit:1,upper_block_bit:0})}
   if(x===2&&y===66)return {name:'wooden_door',boundingBox:'block',
      getProperties:()=>({open_bit:1,upper_block_bit:1})}
   return {name:y===64?'oak_planks':'air',
     boundingBox:y===64?'block':'empty'}
 }
 f.bot.setControlState=(key,value)=>pressed.push([key,value])
 f.bot.activateBlock=()=>interacted.push('activate')
 f.bot.lookAt=async()=>{}
 f.bot.pathfinder.goto=async()=>{
    f.bot.entity.position=vec(1.5,65,.5)
    throw Error('No path to the goal!')
 }
 const e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const signal=new AbortController().signal
 f.core.state='EXPLORE';e.job={type:'EXPLORE',signal}
 const candidate={ok:true,kind:'observed_voxel_walking_only',
   target:{x:3,y:65,z:0},
   waypoints:[{x:1,y:65,z:0},{x:2,y:65,z:0},{x:3,y:65,z:0}],
   key:'3,65,0',distance:3,elevationChanges:0}
 const result=await e.boundedScout(candidate,signal)
 assert.equal(result.serverMovementVerified,false)
 assert.equal(result.ok,false)
 assert(pressed.some(x=>x[0]==='forward'&&x[1]===true),
    'only observed OPEN door passage may issue a bounded input')
 assert.equal(interacted.length,0,'an open door must never be toggled closed')
 assert(pressed.some(x=>x[0]==='forward'&&x[1]===false))
 assert(f.calls.some(x=>x[1]==='[Alice exploration] scout door passage:'))
 assert.equal(e.lastEscapePassageAction.door.join(','),'2,65,0')
 e.job=null;e.stop()
})
test('A* failed wooden door with CLOSED state or blocked far side never sends forward input',async()=>{
 for(const blocked of ['closed','exit']){
   const f=fixture(),keys=[]
   f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
   f.bot.time={timeOfDay:6000}
   f.bot.blockAt=p=>{
     const x=Math.floor(p.x),y=Math.floor(p.y)
     if(x===2&&(y===65||y===66))return {name:'wooden_door',boundingBox:'block',
        getProperties:()=>({open_bit:blocked==='closed'?0:1,
           upper_block_bit:y===66?1:0})}
     if(x===3&&y===65&&blocked==='exit')return {name:'cobblestone',boundingBox:'block'}
     return {name:y===64?'oak_planks':'air',boundingBox:y===64?'block':'empty'}
   }
   f.bot.lookAt=async()=>{}
   f.bot.setControlState=(key,v)=>keys.push([key,v])
   f.bot.pathfinder.goto=async()=>{f.bot.entity.position=vec(1.5,65,.5);
     throw Error('No path to the goal!')}
   const e=new AliceBedrockRuntime({...f,policies:await policies()})
   e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
   const signal=new AbortController().signal
   f.core.state='EXPLORE';e.job={type:'EXPLORE',signal}
   const c={ok:true,kind:'observed_voxel_walking_only',
     target:{x:3,y:65,z:0},waypoints:[{x:1,y:65,z:0},{x:2,y:65,z:0}],
     key:'3,65,0',distance:2,elevationChanges:0}
   const result=await e.boundedScout(c,signal)
   assert.equal(result.attempted,false)
   assert.equal(result.serverMovementVerified,false)
   assert(!keys.some(([k,v])=>k==='forward'&&v))
   assert.match(result.reason,/crossing_(open_door_state_unverified|opposite_side_blocked_or_unknown)/)
   e.job=null;e.stop()
 }
})

test('safety controller observes abrupt local descent and cancels only autonomous EXPLORE',async()=>{
 let now=1000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.entity.position=vec(.5,98,.5);f.bot.entity.onGround=true
 e.safetyTick()
 const abort=new AbortController()
 e.job={type:'EXPLORE',signal:abort.signal,abort}
 e.action={source:'自主探索',label:'自主走路'}
 f.core.state='EXPLORE'
 now+=5000;f.bot.entity.position=vec(3.5,83.2,6.5)
 f.bot.entity.onGround=false
 e.safetyTick()
 assert.equal(abort.signal.aborted,true,'unverified vertical fall interrupts autonomous scout')
 assert.equal(e.job,null)
 assert.equal(f.core.state,'IDLE','cancellation must not strand Core in EXPLORE')
 assert.equal(e.verticalWatch.active(),true)
 assert(e.nextIdleAt>=now+90000)
 assert(f.calls.some(a=>a[1]==='[Alice safety] vertical displacement observation:'))
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.job,null,'autonomy stays held even if ordinary cooldown is zero')
 e.stop()
})
test('vertical observation never interrupts emergency RECOVER and resets on next spawn',async()=>{
 let now=1000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.entity.position=vec(.5,98,.5);f.bot.entity.onGround=true
 e.safetyTick()
 const abort=new AbortController()
 e.job={type:'RECOVER',signal:abort.signal,abort}
 e.action={source:'自主生存',label:'恢复生命'}
 f.core.state='RECOVER'
 now+=4000;f.bot.entity.position=vec(.5,73,.5)
 e.safetyTick()
 assert.equal(abort.signal.aborted,false,'emergency recovery is not cancelled by local anomaly')
 assert.equal(e.verticalWatch.active(),true)
 e.start() // existing Alice reconnect/spawn resets only the observation baseline
 assert.equal(e.verticalWatch.active(),false)
 e.job=null;e.stop()
})

test('autonomous mission rejects a fake pickup or craft success without a real inventory delta',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.operator.gatherOne=async()=>({ok:true,gained:1})
 let gather=await e.runVerifiedResourceStep('GATHER',new AbortController().signal)
 assert.equal(gather.ok,false)
 assert.equal(gather.reason,'server_inventory_delta_not_observed')
 f.operator.gatherOne=async()=>{f.setItems([{name:'oak_log',count:1}]);return {ok:true,gained:1}}
 gather=await e.runVerifiedResourceStep('GATHER',new AbortController().signal)
 assert.equal(gather.ok,true)
 assert.equal(gather.verifiedDelta,1)
 f.operator.craftVerified=async()=>({ok:true,gained:1})
 const sword=await e.runVerifiedResourceStep('CRAFT',new AbortController().signal)
 assert.equal(sword.ok,false,'a claimed craft result without new sword is not mission completion')
 f.operator.craftVerified=async()=>{f.setItems([{name:'wooden_sword',count:1}]);return {ok:true,gained:1}}
 const realSword=await e.runVerifiedResourceStep('CRAFT',new AbortController().signal)
 assert.equal(realSword.ok,true)
 assert.equal(realSword.verifiedDelta,1)
 e.stop()
})
test('verified nearby natural tree creates one guarded autonomous work mission before model observe',async()=>{
 const f=fixture(),p=await policies()
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 const at=q=>{
  const x=Math.floor(q.x),y=Math.floor(q.y),z=Math.floor(q.z)
  const name=x===0&&z===0&&y>=65&&y<=68?'oak_log':
   y>=68&&y<=70&&Math.abs(x)<=1&&Math.abs(z)<=1?'oak_leaves':
   y<65?'dirt':'air'
  return {name,position:vec(x,y,z),boundingBox:name==='air'?'empty':'block'}
 }
 f.bot.blockAt=at;f.bot.findBlocks=()=>[vec(0,65,0),vec(0,66,0)]
 f.operator.gatherOne=async()=>{
   f.setItems([{name:'oak_log',count:1}])
   return {ok:true,gained:1}
 }
 let modelRequests=0
 const planner={url:'http://127.0.0.1:11435',
   suggestGoal:async()=>{modelRequests++;return {tool:'observe'}}}
 const e=new AliceBedrockRuntime({...f,policies:p,planner})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert(f.calls.some(x=>x[1]==='[Alice mission] resource opportunity:'))
 assert.equal(modelRequests,0,'a strictly verified tree should not need model permission')
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(e.lastResourceOpportunity.action,'gather_one_log')
 assert(f.calls.some(x=>x[1]==='[Alice mission] inventory milestone:'))
 assert(f.calls.some(x=>x[1]==='[Alice Bedrock] verified job result:'&&
   JSON.parse(x[2]).verifiedDelta===1))
 e.stop()
})
test('failed server movement evidence forbids autonomous tree pathfinding',async()=>{
 const f=fixture(),p=await policies()
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.findBlocks=()=>[vec(0,65,0)]
 f.bot.blockAt=q=>{
   const x=Math.floor(q.x),y=Math.floor(q.y),z=Math.floor(q.z)
   return {name:x===0&&z===0&&y>=65&&y<=68?'oak_log':
     y>=68&&y<=70?'oak_leaves':y<65?'dirt':'air',
     position:vec(x,y,z),boundingBox:y<65?'block':'empty'}
 }
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 e.failureMemory.mark('motion',f.bot.entity.position,'scout_waypoint_not_reached')
 await e.idleTick()
 assert(!f.calls.some(x=>x[1]==='[Alice Bedrock] verified job result:'&&x[2]?.ok))
 assert(!f.calls.some(x=>x[0]==='goto'),'unknown server movement cannot be used to auto-harvest')
 e.stop()
})


test('equipped autonomous Alice continues scouting during daytime without Ollama',async()=>{
 const f=fixture(),p=await policies()
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=q=>({name:Math.floor(q.y)===64?'stone_bricks':'air',
   boundingBox:Math.floor(q.y)===64?'block':'empty',
   shapes:Math.floor(q.y)===64?[[0,0,0,1,1,1]]:[]})
 f.setItems([{name:'stone_sword',count:1},{name:'oak_log',count:4}])
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.lastIdleDecision.action,'OBSERVE')
 assert.equal(f.core.state,'EXPLORE')
 for(let i=0;i<6;i++)await new Promise(setImmediate)
 assert(f.calls.some(x=>x[0]==='goto'))
 assert.equal(e.scoutConfirmedSegments,0)
 e.stop()
})
test('blocked model OBSERVE records 30 second read-only scene review',async()=>{
 let now=300000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies(),planner:{
   url:'http://127.0.0.1:11435',suggestGoal:async()=>({tool:'observe',reason:'unknown floor'})
 }})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.job,null)
 assert.equal(e.nextIdleAt,now+30000)
 assert.equal(e.lastIdleHold.nextReviewAt,now+30000)
 assert(!f.calls.some(x=>x[0]==='goto'))
 e.stop()
})
test('model event cooldown does not veto a fresh safe scout after terrain loads',async()=>{
 let now=300000,requests=0
 const f=fixture(()=>now)
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000};f.bot.blockAt=()=>null
 const planner={url:'http://127.0.0.1:11435',suggestGoal:async()=>{
   requests++;return {tool:'observe',reason:'unverified terrain'}
 }}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(requests,1)
 now+=30001
 f.bot.blockAt=q=>({name:Math.floor(q.y)===64?'stone_bricks':'air',
   boundingBox:Math.floor(q.y)===64?'block':'empty',
   shapes:Math.floor(q.y)===64?[[0,0,0,1,1,1]]:[]})
 await e.idleTick()
 assert.equal(requests,1,'model minimum interval is unchanged')
 assert.equal(f.core.state,'EXPLORE','trusted route can run while inference rate limited')
 e.stop()
})


test('equipped Alice without Ollama still read-only reviews a blocked room every 30 seconds',async()=>{
 let now=300000
 const f=fixture(()=>now)
 f.setItems([{name:'iron_sword',count:1},{name:'oak_log',count:4}])
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000};f.bot.blockAt=()=>null
 const e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.lastIdleDecision.action,'OBSERVE')
 assert.equal(e.job,null)
 assert.equal(e.nextIdleAt,now+30000)
 assert.equal(e.lastIdleHold.nextReviewAt,now+30000)
 assert(!f.calls.some(x=>x[0]==='goto'))
 e.stop()
})


test('model-origin scout records an attempted endpoint and holds after unverified movement',async()=>{
 let now=300000
 const f=fixture(()=>now)
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.bot.blockAt=q=>({name:Math.floor(q.y)===64?'stone_bricks':'air',
   boundingBox:Math.floor(q.y)===64?'block':'empty',
   shapes:Math.floor(q.y)===64?[[0,0,0,1,1,1]]:[]})
 const planner={url:'http://127.0.0.1:11435',
   suggestGoal:async()=>({tool:'scout_safe',reason:'new verified area'})}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),planner})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 const logs=()=>f.calls.filter(v=>v[1]==='[Alice exploration] endpoint attempt:')
 assert.equal(logs().length,1,'model-initiated route must be recorded before the physical attempt')
 assert(e.explorationProgress.summary().excludedEndpoints>=1)
 for(let i=0;i<12;i++)await new Promise(setImmediate)
 assert.equal(e.scoutConfirmedSegments,0,'no independent Bedrock packet means no server-confirmed route')
 assert.equal(e.explorationProgress.summary().unverified,1)
 assert.equal(e.explorationProgress.summary().excludedEndpoints,1)
 assert(e.failureMemory.blocked('motion',f.bot.entity.position),
   'failed local waypoint traversal still engages genuine movement cooldown')
 assert.equal(e.lastScoutProgress.failureKind,'motion')
 assert.equal(e.lastScoutProgress.confirmed,false)
 e.nextIdleAt=0
 await e.idleTick()
 assert.equal(logs().length,1,'real waypoint failure stops immediate A/B model retries')
 assert.equal(e.job,null)
 e.stop()
})


test('safe one-block high platform can start a bounded vertical scout, never a dig',async()=>{
 const f=fixture()
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 f.setItems([{name:'iron_sword',count:1},{name:'oak_log',count:4}])
 f.bot.blockAt=q=>{
  const x=Math.floor(q.x),y=Math.floor(q.y),z=Math.floor(q.z)
  const wall=y===65&&!(x===0&&z===0)
  const solid=y<=64||wall
  return {name:solid?'stone':'air',boundingBox:solid?'block':'empty',
   shapes:solid?[[0,0,0,1,1,1]]:[],position:vec(x,y,z)}
 }
 let dig=0,place=0
 f.bot.dig=async()=>dig++;f.bot.placeBlock=async()=>place++
 const e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.lastTerrainAdaptation.vertical.action,'JUMP_UP')
 assert.equal(f.core.state,'EXPLORE')
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert(f.calls.some(x=>x[0]==='goto'),'up-step reaches original guarded pathfinder')
 assert.equal(dig,0);assert.equal(place,0)
 assert.equal(e.scoutConfirmedSegments,0)
 e.stop()
})
test('autonomous terrain edits refuse missing Bedrock self-position evidence',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:6000}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 let touched=0;f.bot.dig=async()=>touched++;f.bot.placeBlock=async()=>touched++
 const readyWork={candidate:{action:'DIG_SOIL',key:'1,65,0',target:{x:1,y:65,z:0}}}
 assert.equal(e.maybeStartEarthwork(readyWork,null,null),false)
 assert.equal(touched,0)
 assert.equal(e.job,null)
 e.stop()
})

test('locally reached scout with zero Bedrock correction packets is unknown, never a motion fault',async()=>{
 let now=300000
 const f=fixture(()=>now)
 const e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=now+120000
 const c={key:'4,64,0',target:{x:4,y:64,z:0},waypoints:[{x:4,y:64,z:0}],
   distance:4,elevationChanges:0}
 e.startJob('EXPLORE','自主模型',
   async()=>({ok:false,reason:'scout_server_endpoint_unconfirmed',
     serverMovementVerified:false,serverEvidenceReason:'no_two_server_positions',
     localEstimateBlocks:3.5,distance:4}),{scoutCandidate:c,announce:false})
 for(let i=0;i<12;i++)await new Promise(setImmediate)
 assert.equal(e.lastScoutProgress.confirmed,false,'still no server arrival proof')
 assert.equal(e.lastScoutProgress.failureKind,'evidence_gap')
 assert.equal(e.failureMemory.blocked('motion',f.bot.entity.position),null)
 assert.equal(e.explorationProgress.summary().unverified,1)
 assert.equal(e.explorationProgress.excluded().has('4,64,0'),true)
 assert.equal(e.nextIdleAt,now+90000,'does not enforce 5–15 minute bogus transport failure')
 assert(f.calls.some(x=>x[1]==='[Alice exploration] server position evidence missing:'))
 e.stop()
})

test('a failed Bedrock bed allows a different bed after 30s without waking all-day sleep lock',async()=>{
 let now=100000
 const f=fixture(()=>now)
 const first=vec(2,64,2),second=vec(4,64,2)
 let attempts=0
 f.bot.time={timeOfDay:14000}
 f.operator.hasNearbyBed=(radius,{avoidBed})=>!avoidBed(second)
 f.operator.sleepNearby=async ({avoidBed})=>{
  attempts++
  if(attempts===1)return {ok:false,reason:'bed_sleep_unconfirmed_no_state_ack',
    bedPosition:first,bedDiagnosis:{phase:'night',observedSleeping:false}}
  assert(avoidBed(first),'previous failed bed must be excluded')
  assert(!avoidBed(second),'other bed must be eligible')
  return {ok:true,bedPosition:second,bedDiagnosis:{phase:'night',observedSleeping:true}}
 }
 const e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 // Two previously observed and still locally valid beds. Sleep failure
 // only blocks the attempted one; the other remains a remembered option.
 f.bot.blockAt=q=>({name:(Math.floor(q.x)===2||Math.floor(q.x)===4)&&
   Math.floor(q.y)===64&&Math.floor(q.z)===2?'red_bed':'air',
   boundingBox:'empty'})
 e.observedBeds.records=[first,second].map(p=>({dimension:'overworld',
   position:{x:p.x,y:p.y,z:p.z},seenAt:now}))
 e.startJob('RECOVER','自主生存',signal=>f.operator.sleepNearby({signal,
   avoidBed:p=>!!e.failureMemory.blocked('bed',p)}),
   {label:'寻找附近床位睡觉',announce:false})
 for(let i=0;i<10;i++)await new Promise(setImmediate)
 assert.equal(attempts,1)
 assert.equal(e.failureMemory.blocked('sleep',f.bot.entity.position),null)
 assert.equal(e.failureMemory.blocked('bed',first).remainingMs,120000)
 assert.equal(e.lastBedFailure.reason,'bed_sleep_unconfirmed_no_state_ack')
 assert.equal(e.lastBedFailure.diagnosis.phase,'night')
 assert.equal(e.nextSleepAt,now+30000)
 now+=35000
 await e.maintenanceTick()
 for(let i=0;i<10;i++)await new Promise(setImmediate)
 assert.equal(attempts,2,'a different verified bed is retried after only 30 seconds')
 assert.equal(e.lastBedFailure,null)
 e.stop()
})

test('Bedrock follow 4.15-block false-success standoff repaths instead of freezing forever',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(0,69,0);f.bot.entity.onGround=true
 f.bot.players.Steve.entity.position=vec(4.15,69,0)
 f.bot.pathfinder.isMoving=()=>false
 f.bot.getControlState=k=>k==='jump'?false:k==='forward'?true:false
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.core.setFollowIntent('Steve')
 e.followGoal='Steve'
 e.followProgress.reset('Steve',f.bot.entity.position,
   f.bot.players.Steve.entity.position,now)
 e.onPathUpdate({status:'success',path:[{x:1,y:69,z:0},{x:2,y:69,z:0}]})
 const goals=()=>f.calls.filter(x=>x[0]==='setGoal'&&x[1]?.entity)
 e.onFollowInputTick();e.onFollowInputTick()
 now+=7000
 await e.followTick()
 assert.equal(e.followProgress.stalledWindows,1)
 assert.equal(goals().length,0)
 now+=7000
 await e.followTick()
 assert.equal(goals().length,1,'must issue a fresh bounded follow goal')
 assert.equal(f.core.hasFollowIntent(),true)
 const logs=f.calls.filter(x=>x[1]==='[Alice follow] movement observation:')
   .map(x=>JSON.parse(x[2]))
 assert(logs.some(x=>x.falseGoalSuccess===true))
 assert(logs.some(x=>x.physicsSamples===2))
 assert(logs.every(x=>x.jumpEdges===0),'no fake jump claim')
 e.stop()
})


test('sleep review deadline does not remain zero after failed job (regression)',async()=>{
 for(const [initial,result,expected] of [
   [0,{ok:false,reason:'bed_navigation_or_sleep_failed'},190000],
   [0,{ok:false,reason:'bed_sleep_unconfirmed_no_state_ack',bedPosition:vec(1,64,1)},130000],
   [250000,{ok:false,reason:'bed_sleep_unconfirmed_no_state_ack',bedPosition:vec(1,64,1)},130000],
   [250000,{ok:true,reason:'sleep_confirmed',bedPosition:vec(1,64,1)},250000]
 ]){
   const f=fixture(()=>100000),e=new AliceBedrockRuntime({...f,policies:await policies()})
   e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
   e.nextSleepAt=initial
   e.startJob('RECOVER','自主生存',async()=>result,
     {label:'寻找附近床位睡觉',announce:false})
   for(let i=0;i<8;i++)await new Promise(setImmediate)
   assert.equal(e.nextSleepAt,expected,
     'initial '+initial+', '+(result.bedPosition?'specific bed':'no bed')+
     ', sleep result '+result.ok)
   assert.equal(e.job,null,'job finalized before assertion')
   e.stop()
 }
})

test('autonomous gathering exception is bounded and marks the site so the same tree is not retried indefinitely',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=now+120000
 e.startJob('GATHER','自主任务',async()=>{
   throw new Error('No path to the goal! confidential_session_token')
 },{label:'天然树木：实际收集一块原木',announce:false})
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(e.job,null)
 const memory=e.failureMemory.blocked('wood',f.bot.entity.position)
 assert(memory,'a thrown resource task must populate the normal wood-site failure memory')
 assert.equal(memory.reason,'pathfinder_no_path')
 assert.equal(e.nextIdleAt,now+5000,
   'bounded survey should be possible without waiting another 120s identical task')
 assert.equal(e.goalPlanner.pendingTrigger,'tool_blocked')
 const errors=f.calls.filter(c=>c[1]==='[Alice job] exception:')
 assert.equal(errors.length,1)
 const data=JSON.parse(errors[0][2])
 assert.deepEqual({taskType:data.taskType,source:data.source,reason:data.reason},
   {taskType:'GATHER',source:'autonomous',reason:'pathfinder_no_path'})
 assert(!JSON.stringify(errors).includes('confidential_session_token'),
   'raw exception text must not enter acceptance log')
 assert(!f.chat.join(' ').includes('confidential_session_token'))
 e.stop()
})
test('a human-ordered gather exception never bans autonomy resource sites',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.startJob('GATHER','Steve',async()=>{
   throw TypeError('Cannot read properties of undefined: PRIVATE_ACCOUNT')
 },{label:'采集原木',announce:false})
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(e.failureMemory.blocked('wood',f.bot.entity.position),null)
 const errors=f.calls.filter(c=>c[1]==='[Alice job] exception:')
 assert.equal(JSON.parse(errors[0][2]).reason,'adapter_api_exception')
 assert(!JSON.stringify(errors).includes('PRIVATE_ACCOUNT'))
 e.stop()
})

test('continuous long goal persists after short GATHER failure while Core resumes IDLE',async()=>{
 let now=100000
 const f=fixture(()=>now),policies0=await policies()
 const policy={...policies0,autonomy_policy:{
   ...policies0.autonomy_policy,mayStartIdleWork:()=>false}}
 const e=new AliceBedrockRuntime({...f,policies:policy})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 assert.equal(e.continuousGoal.snapshot().step,'ACQUIRE_WOOD')
 const revision=e.continuousGoal.snapshot().revision
 e.startJob('GATHER','自主任务',async()=>({ok:false,reason:'no_verified_pickup'}),
   {label:'天然树木：实际收集一块原木',announce:false})
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(f.core.state,'IDLE')
 assert.equal(e.continuousGoal.snapshot().phase,'BLOCKED')
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 assert.equal(e.continuousGoal.snapshot().revision,revision)
 now+=15000
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().phase,'BLOCKED',
   'another autonomous idle cycle cannot falsely clear failure')
 assert.equal(e.continuousGoal.snapshot().revision,revision)
 e.stop()
})
test('resource inventory evidence advances continuous goal through weapon crafting',async()=>{
 const f=fixture(),p=await policies()
 const e=new AliceBedrockRuntime({...f,policies:{...p,autonomy_policy:{
   ...p.autonomy_policy,mayStartIdleWork:()=>false}}})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 f.setItems([{name:'oak_log',count:2}])
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().step,'CRAFT_WEAPON')
 e.startJob('CRAFT','自主任务',async()=>({ok:true,verifiedDelta:1}),
   {label:'制作木剑',announce:false})
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 f.setItems([{name:'wooden_sword',count:1},{name:'oak_log',count:2}])
 await e.idleTick()
 assert.equal(e.continuousGoal.lastCompleted.goal,'LEARN_WEAPON')
 assert.equal(e.continuousGoal.snapshot().goal,'COLLECT_WOOD')
 e.stop()
})
test('explicit STOP pauses continuous objective and prevents idle resumption',async()=>{
 const f=fixture(),p=await policies()
 const e=new AliceBedrockRuntime({...f,policies:{...p,autonomy_policy:{
   ...p.autonomy_policy,mayStartIdleWork:()=>false}}})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 await e.idleTick()
 await e.onChat('Steve','AliceAI 停止')
 assert.equal(e.continuousGoal.snapshot().phase,'PAUSED')
 assert.equal(e.continuousGoal.snapshot().reason,'user_stop')
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().phase,'PAUSED')
 assert.equal(e.job,null)
 e.stop()
})

test('verified autonomous GATHER milestone continues goal after 5s, not generic 120s',async()=>{
 let now=100000
 const f=fixture(()=>now),p=await policies()
 const e=new AliceBedrockRuntime({...f,policies:{...p,autonomy_policy:{
   ...p.autonomy_policy,mayStartIdleWork:()=>false}}})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.nextIdleAt=now+120000
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 e.startJob('GATHER','自主任务',async()=>({
   ok:true,verifiedDelta:1,reason:'server_inventory_delta_verified'}),
   {label:'天然树木：实际收集一块原木',announce:false})
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(e.nextIdleAt,now+5000)
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 f.setItems([{name:'oak_log',count:2}])
 now+=5000
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().step,'CRAFT_WEAPON')
 assert(f.calls.some(c=>c[1]==='[Alice goal] verified milestone review scheduled:'))
 e.stop()
})
test('an unverified resource report never accelerates the 120s action timer',async()=>{
 const f=fixture(),p=await policies()
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.continuousGoal.reconcile({plan:'LEARN_WEAPON',wood:0,hasWeapon:false})
 e.nextIdleAt=220000
 e.startJob('GATHER','自主任务',async()=>({ok:true,verifiedDelta:0}),
   {label:'采集失败的伪成功',announce:false})
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(e.nextIdleAt,220000)
 assert.equal(e.continuousGoal.snapshot().phase,'BLOCKED')
 e.stop()
})

test('outdoor night prioritizes shelter rather than generic PREPARE_DAYLIGHT idle wait',async()=>{
 let now=100000
 const f=fixture(()=>now),p=await policies()
 f.bot.time={timeOfDay:15000}
 f.bot.entity.position=vec(.5,64,.5)
 f.bot.blockAt=q=>({name:Math.floor(q.y)===63?'grass_block':'air',
   boundingBox:Math.floor(q.y)===63?'block':'empty',
   position:vec(Math.floor(q.x),Math.floor(q.y),Math.floor(q.z))})
 f.setItems([{name:'dirt',count:25}])
 const e2=new AliceBedrockRuntime({...f,policies:p})
 e2.started=true;e2.seenSpawn=true;e2.hasHealth=true;e2.hasInventorySync=true
 e2.lastHumanAt=0;e2.nextIdleAt=0
 let physical=0
 f.bot.placeBlock=async()=>{physical++}
 await e2.idleTick()
 const g=e2.continuousGoal.snapshot()
 assert.equal(g.goal,'SECURE_SHELTER')
 assert.equal(g.step,'BUILD_SHELTER')
 assert.equal(g.phase,'WAITING')
 assert.equal(g.reason,'shelter_position_unconfirmed')
 assert.equal(e2.lastShelterOpportunity.reason,'shelter_one_verified_block_candidate')
 assert.equal(e2.lastShelterOpportunity.canBuildWithCurrentProof,false)
 assert.equal(physical,0,'no reliable BDS feet proof means NO world edits')
 assert.equal(e2.lastIdleHold.goal,'SECURE_SHELTER')
 assert.notEqual(e2.lastIdleHold.reason,'daylight_required')
 assert.equal(f.core.state,'IDLE')
 e2.stop()
})
test('after daylight returns, survival priorities restore resource objective',async()=>{
 let now=100000
 const f=fixture(()=>now),p=await policies()
 // This is an OUTDOOR shelter test. The shared fixture deliberately reports
 // every block as air, including the floor: that is NOT verified wilderness.
 // Model a fully loaded natural 3x3 support without inventing build materials.
 f.bot.entity.position=vec(.5,64,.5)
 f.bot.blockAt=q=>({name:Math.floor(q.y)===63?'grass_block':'air',
   boundingBox:Math.floor(q.y)===63?'block':'empty',
   position:vec(Math.floor(q.x),Math.floor(q.y),Math.floor(q.z))})
 f.bot.time={timeOfDay:15000};f.setItems([])
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().goal,'SECURE_SHELTER')
 f.bot.time.timeOfDay=2000
 now+=10000
 e.nextIdleAt=now+120000
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 assert.equal(e.continuousGoal.snapshot().reason,'priority_changed')
 e.stop()
})

test('unknown or ungrounded nighttime terrain cannot impersonate an outdoor shelter site',async()=>{
 const f=fixture(),p=await policies()
 f.bot.time={timeOfDay:15000}
 // Default fixture: even the feet support is air. This is not outdoor proof.
 let placements=0
 f.bot.placeBlock=async()=>{placements++}
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.continuousGoal.snapshot().goal,'LEARN_WEAPON')
 assert.equal(e.lastShelterOpportunity?.reason,'shelter_not_natural_ground')
 assert.equal(e.job,null)
 assert.equal(placements,0)
 e.stop()
})

test('second waypoint rejection distinguishes earlier local travel from failed-leg zero',async()=>{
 const f=fixture(),p=await policies()
 f.bot.time={timeOfDay:6000}
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 let calls=0
 f.bot.pathfinder.goto=async()=>{
   calls++
   if(calls===1){f.bot.entity.position=vec(-.5,68,.5);return}
   throw Error('navigation_scout_client_server_position_diverged')
 }
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const signal=new AbortController().signal
 f.core.state='EXPLORE';e.job={type:'EXPLORE',signal}
 const candidate={ok:true,kind:'observed_voxel_walking_only',
   target:{x:-2,y:69,z:0},waypoints:[{x:-1,y:68,z:0},{x:-2,y:69,z:0}],
   key:'-2,69,0',distance:2,elevationChanges:2}
 const result=await e.boundedScout(candidate,signal)
 assert.equal(result.ok,false)
 assert.equal(result.reason,'navigation_scout_client_server_position_diverged')
 assert.equal(calls,2)
 const entry=f.calls.find(row=>row[1]==='[Alice movement] A* waypoint failure:')
 assert(entry)
 const detail=JSON.parse(entry[2])
 assert.equal(detail.completedLocalWaypoints,1)
 assert.equal(detail.localMovedBlocks,0)
 assert(detail.totalLocalEstimateBlocks>1.3)
 assert.deepEqual(detail.firstWaypoint,{x:-1,y:68,z:0})
 assert.deepEqual(detail.failedWaypoint,{x:-2,y:69,z:0})
 assert.equal(detail.serverPositionSamples,0)
 e.job=null;e.stop()
})


test('nighttime with no bed/materials chooses guarded short relocation instead of unconditional daylight WAIT',async()=>{
 const now=100000,f=fixture(()=>now),p=await policies()
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:15000}
 f.bot.blockAt=pos=>{
   const floor=Math.floor(pos.y)===68
   return {name:floor?'oak_planks':'air',boundingBox:floor?'block':'empty',
     shapes:floor?[[0,0,0,1,1,1]]:[],position:vec(Math.floor(pos.x),Math.floor(pos.y),Math.floor(pos.z))}
 }
 f.setItems([])
 const evidence={get:()=>({independentSource:'bds_querytarget',
   independentLatestFeet:{x:.5,y:69,z:.5},independentAt:now,
   independentPreviousAt:now-500,independentSamples:4,authoritativeSamples:4,received:0}),
   checkpoint:()=>({events:4,position:{x:.5,y:69,z:.5}})}
 const e=new AliceBedrockRuntime({...f,policies:p,movementEvidence:evidence})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 let started=null
 e.startJob=(type,origin,task,options)=>{started={type,origin,task,options}}
 await e.idleTick()
 assert.equal(e.lastShelterOpportunity?.reason,'shelter_not_natural_ground')
 assert.equal(e.lastNightPlan?.status,'started',JSON.stringify(e.lastNightPlan))
 assert.equal(e.lastNightPlan?.reason,'night_verified_two_step_reposition')
 assert.equal(started?.type,'EXPLORE')
 assert.equal(started?.options?.scoutCandidate?.distance,2)
 assert.equal(started?.options?.scoutCandidate?.waypoints?.length,2)
 assert.equal(started?.options?.scoutCandidate?.elevationChanges,0)
 e.boundedScout=async()=>({ok:false,reason:'scout_server_endpoint_unconfirmed',serverMovementVerified:false})
 await started.task(new AbortController().signal)
 assert.equal(e.lastNightPlan.status,'unverified','no BDS movement must never be reported as successful night walking')
 e.stop()
})
test('nighttime cannot dispatch short relocation without independent BDS start alignment',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.time={timeOfDay:15000};f.bot.entity.position=vec(.5,69,.5)
 f.bot.entity.onGround=true
 const dispatched=e.tryNightReposition('no_safe_shelter_or_bed')
 assert.equal(dispatched,false)
 assert.equal(e.lastNightPlan?.reason,'scout_bds_position_unavailable')
 assert.equal(e.job,null)
 e.stop()
})
test('daytime never invokes night emergency movement strategy',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.time={timeOfDay:6000}
 assert.equal(e.tryNightReposition('test'),false)
 assert.equal(e.lastNightPlan,undefined)
 e.stop()
})


test('night shelter without building supplies can still craft defensive weapon from observed inventory',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:15000}
 f.bot.blockAt=q=>({name:Math.floor(q.y)===68?'grass_block':'air',
   boundingBox:Math.floor(q.y)===68?'block':'empty'})
 f.setItems([{name:'oak_planks',count:3}])
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 let started=null
 e.startJob=(type,origin,task,opts)=>{started={type,origin,opts}}
 await e.idleTick()
 assert.equal(e.lastShelterOpportunity.reason,'shelter_materials_missing')
 assert.equal(started?.type,'CRAFT')
 assert.equal(started?.origin,'夜间生存')
 assert.equal(e.lastNightPlan,undefined,'craft before optional night relocation')
 e.stop()
})

test('night fallback proceeds to second waypoint without recalculating route origin',async()=>{
 const f=fixture(),p=await policies()
 f.bot.time={timeOfDay:15000}
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const signal=new AbortController().signal
 e.job={type:'EXPLORE',signal};f.core.state='EXPLORE'
 let calls=0
 f.bot.pathfinder.goto=async()=>{
   calls++
   if(calls===1){f.bot.entity.position=vec(1.5,69,.5);return}
   throw Error('second_waypoint_reached')
 }
 const candidate={ok:true,kind:'observed_voxel_walking_only',
   target:{x:2,y:69,z:0},waypoints:[{x:1,y:69,z:0},{x:2,y:69,z:0}],
   key:'2,69,0',distance:2,elevationChanges:0}
 const out=await e.boundedScout(candidate,signal,{allowNightFallback:true})
 assert.equal(calls,2,'safe second waypoint must be attempted after local first waypoint')
 assert.equal(out.reason,'second_waypoint_reached')
 e.job=null;e.stop()
})
test('night fallback rechecks hazards before the second waypoint',async()=>{
 const f=fixture(),p=await policies()
 f.bot.time={timeOfDay:15000}
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const signal=new AbortController().signal
 e.job={type:'EXPLORE',signal};f.core.state='EXPLORE'
 let calls=0
 f.bot.pathfinder.goto=async()=>{
   calls++
   f.bot.entity.position=vec(1.5,69,.5)
   f.bot.isRaining=true
 }
 const candidate={ok:true,kind:'observed_voxel_walking_only',
   target:{x:2,y:69,z:0},waypoints:[{x:1,y:69,z:0},{x:2,y:69,z:0}],
   key:'2,69,0',distance:2,elevationChanges:0}
 const out=await e.boundedScout(candidate,signal,{allowNightFallback:true})
 assert.equal(calls,1,'storm during first step must prohibit next waypoint')
 assert.equal(out.reason,'scout_conditions_changed')
 e.job=null;e.stop()
})

// Startup and infrastructure recovery: do not confuse transport readiness with
// a human command or a failed tree. These exercise the actual idle controller.
test('trusted spawn readiness starts a decision immediately without invented human grace',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 let choices=0
 const run=e.runIdleDecision.bind(e)
 e.runIdleDecision=async()=>{choices++;return run()}
 e.start();e.noteHealth()
 await new Promise(setImmediate)
 assert.equal(choices,0,'wait for server inventory_content')
 e.noteInventory({window_id:'inventory'})
 await new Promise(setImmediate)
 assert.equal(choices,1)
 assert(e.continuousGoal.goal,'select a goal in the readiness event, before any timer')
 assert(e.nextIdleAt>f.clock(),'first eligible decision was evaluated at the same clock time')
 e.noteHealth();e.noteInventory({window_id:'inventory'})
 await new Promise(setImmediate)
 assert.equal(choices,1,'duplicate readiness packets do not start another decision')
 e.stop()
})
test('real player command grace and STOP still override immediate startup',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.start();e.noteHealth()
 await e.onChat('Steve','AliceAI 停止')
 e.noteInventory({window_id:'inventory'})
 await new Promise(setImmediate)
 assert.equal(e.job,null)
 assert.equal(e.goalPlanner.stoppedByHuman,true)
 assert.equal(e.lastHumanAt,now)
 assert.equal(e.p.autonomy_policy.mayStartIdleWork({now,lastHumanAt:e.lastHumanAt,
   nextWorkAt:now,state:'IDLE',following:false,health:20,underThreat:false}),false)
 e.stop()
})
test('readiness and timer evaluations cannot overlap an asynchronous decision',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 let finish,entered=0
 e.runIdleDecision=async()=>{entered++;await new Promise(r=>{finish=r})}
 const first=e.idleTick()
 await e.idleTick()
 assert.equal(entered,1)
 finish();await first
 assert.equal(e.idleBusy,false)
 e.stop()
})
test('missing BDS evidence refuses GATHER before tree work without banning the site',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies(),requireBdsAlignedExplore:true})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 let attempts=0
 assert.equal(e.startJob('GATHER','自主任务',async()=>{attempts++}),false)
 await new Promise(setImmediate)
 assert.equal(attempts,0)
 assert.equal(e.failureMemory.blocked('wood',f.bot.entity.position),null)
 assert.equal(e.lastIdleHold.reason,'scout_bds_position_unavailable')
 e.stop()
})
test('navigation loss during gathering retains the precise reason without wood cooldown',async()=>{
 for(const reason of ['navigation_bds_position_unavailable','navigation_bds_position_diverged','navigation_local_position_unavailable']){
   const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
   e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
   e.startJob('GATHER','自主任务',async()=>{
     throw Object.assign(new Error('PRIVATE_ADAPTER_DETAIL'),{stage:'pathfinder',reasonCode:reason})
   },{announce:false})
   for(let i=0;i<8;i++)await new Promise(setImmediate)
   assert.equal(e.failureMemory.blocked('wood',f.bot.entity.position),null)
   assert(e.navigationHold)
   const event=f.calls.find(c=>c[1]==='[Alice job] exception:')
   assert.equal(JSON.parse(event[2]).reason,reason)
   assert(!JSON.stringify(f.calls).includes('PRIVATE_ADAPTER_DETAIL'))
   e.stop()
 }
})
test('fresh aligned BDS evidence wakes the next decision without waiting the action cooldown',async()=>{
 let now=100000,proof=null
 const f=fixture(()=>now);f.bot.entity.onGround=true
 const e=new AliceBedrockRuntime({...f,policies:await policies(),
   movementEvidence:{get:()=>proof},requireBdsAlignedExplore:true})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.startJob('GATHER','自主任务',async()=>({ok:false}),{announce:false})
 await e.idleTick()
 assert.equal(e.lastIdleHold.reason,'scout_bds_position_unavailable')
 e.nextIdleAt=now+120000
 proof={independentSource:'bds_querytarget',independentSamples:2,
   independentLatestFeet:f.bot.entity.position,independentAt:now,
   independentPreviousAt:now-500}
 await e.idleTick()
 assert.equal(e.navigationHold,null)
 assert(e.lastWorldRoutine)
 assert.equal(e.nextIdleAt,now+120000,'a new eligible review consumed the ordinary action budget')
 e.stop()
})
test('production startup chooses intent while waiting for landing, without spending an action cooldown',async()=>{
 let now=100000
 const f=fixture(()=>now)
 const proof={get:()=>({independentSource:'bds_querytarget',independentSamples:2,
   independentLatestFeet:f.bot.entity.position,independentAt:now,
   independentPreviousAt:now-500})}
 const e=new AliceBedrockRuntime({...f,policies:await policies(),movementEvidence:proof,
   requireBdsAlignedExplore:true})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 await e.idleTick()
 assert(e.continuousGoal.goal)
 assert.equal(e.lastIdleHold.reason,'startup_terrain_sync_pending')
 assert.equal(e.goalPlanner.snapshot('autonomous').planningRequests,0)
 assert(e.nextIdleAt<=now+5000)
 now+=5000;f.bot.entity.onGround=true
 await e.idleTick()
 assert.equal(e.startupObservationPending,false)
 assert(e.lastResourceOpportunity,'evaluate real work on first observed landing')
 e.stop()
})
test('returned navigation rejection records a dependency hold instead of a failed exploration site',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.nextIdleAt=f.clock()+120000
 const candidate={key:'1,64,1',target:{x:1,y:64,z:1},distance:2}
 e.startJob('EXPLORE','自主探索',async()=>({ok:false,
   reason:'navigation_scout_client_server_position_diverged'}),{announce:false,scoutCandidate:candidate})
 for(let i=0;i<8;i++)await new Promise(setImmediate)
 assert.equal(e.failureMemory.blocked('probe',f.bot.entity.position),null)
 assert.equal(e.lastIdleHold.reason,'scout_client_server_position_diverged')
 assert.equal(e.nextIdleAt,f.clock()+5000)
 assert.equal(e.lastScoutProgress.failureKind,'prerequisite')
 e.stop()
})


test('recent damage activates 10-block Bedrock threat memory and evade-retreat tactic',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.startupDecisionQueued=true
 f.bot.health=20;e.noteHealth()
 const zombie={id:18,name:'zombie',position:vec(9,64,0)}
 f.bot.entities[18]=zombie
 assert.equal(e.threat(),null,'distant mobs without recent damage are not an emergency')
 now+=100
 f.bot.health=18;e.noteHealth()
 assert.equal(e.lastSelfDamageAt,now)
 assert.equal(e.threat()?.target,zombie,'recent self-damage extends detection to 10 blocks')
 let retreats=0,attacks=0
 f.operator.retreatFrom=async()=>{retreats++;return {ok:false,reason:'retreat_no_verified_corridor',
   attempted:false,serverMovementVerified:false}}
 f.operator.attackOnce=async()=>{attacks++;return {ok:false}}
 e.safetyTick()
 await new Promise(setImmediate)
 assert.equal(retreats,1,'EVADE_COUNTER must actually enter the retreat branch')
 assert.equal(attacks,0,'do not attack just because self was hit')
 assert(f.calls.some(x=>x[1]==='[Alice safety] retreat not independently confirmed:'))
 e.stop()
})
test('no recent damage and distant mob does not trigger spurious Bedrock retreat',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.entities[13]={id:13,name:'zombie',position:vec(9,64,0)}
 e.safetyTick()
 assert.equal(e.lastRetreatAt,0)
 assert.equal(f.core.state,'IDLE')
 e.stop()
})
test('retreat adapter requires fresh BDS travel away from hostile before verified success',async()=>{
 const f=fixture(),enemy={name:'creeper',position:vec(-2.5,65,.5)}
 f.bot.entity.position=vec(.5,65,.5)
 f.bot.entity.onGround=true
 const solid={name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
 const empty={name:'air',boundingBox:'empty',shapes:[]}
 f.bot.blockAt=pos=>pos.y<65?solid:empty
 f.bot.pathfinder.goto=async()=>{f.bot.entity.position=vec(1.5,65,.5)}
 const witness={
   checkpoint:()=>({events:4,position:{x:.5,y:65,z:.5}}),
   progress:()=>({confirmed:true,movedBlocks:1}),
   get:()=>({latestFeet:{x:1.5,y:65,z:.5},lastAt:Date.now()})
 }
 const ops=new BedrockOperations({bot:f.bot,api:f.api,movementEvidence:witness})
 const result=await ops.retreatFrom(enemy)
 assert.equal(result.ok,true,JSON.stringify(result))
 assert.equal(result.serverMovementVerified,true)
 assert.equal(result.serverMovedBlocks,1)
 assert.equal(result.serverEvidenceReason,'server_away_movement_confirmed')
})
test('retreat adapter cannot treat client-only movement or BDS correction toward hostile as escape',async()=>{
 const f=fixture(),enemy={name:'zombie',position:vec(-2.5,65,.5)}
 f.bot.entity.position=vec(.5,65,.5);f.bot.entity.onGround=true
 const solid={name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
 const empty={name:'air',boundingBox:'empty',shapes:[]}
 f.bot.blockAt=pos=>pos.y<65?solid:empty
 f.bot.pathfinder.goto=async()=>{f.bot.entity.position=vec(1.5,65,.5)}
 const mkEvidence=(observed)=>({
    checkpoint:()=>({events:2,position:{x:.5,y:65,z:.5}}),
    progress:()=>({confirmed:true,movedBlocks:1}),
    get:()=>({latestFeet:observed,lastAt:Date.now()})
 })
 const stale=new BedrockOperations({bot:f.bot,api:f.api,
   movementEvidence:mkEvidence({x:-.5,y:65,z:.5})})
 let result=await stale.retreatFrom(enemy)
 assert.equal(result.serverMovementVerified,false)
 assert.notEqual(result.serverEvidenceReason,'server_away_movement_confirmed')
 f.bot.entity.position=vec(.5,65,.5)
 const none=new BedrockOperations({bot:f.bot,api:f.api})
 result=await none.retreatFrom(enemy)
 assert.equal(result.serverMovementVerified,false)
 assert.equal(result.reason,'retreat_local_only_server_unverified')
})

test('Bedrock respawn clears prior-life recent hit memory',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastSelfDamageAt=99234
 e.start()
 assert.equal(e.lastSelfDamageAt,0)
 e.stop()
})


test('new creeper emergency retreat is not blocked by a recent melee attack cooldown',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const danger={name:'creeper',id:77,position:vec(7,64,0)}
 e.threat=()=>({type:'SELF_DEFENSE',target:danger})
 e.lastCombatAt=now-200 // still in the attack-only 1250ms cooldown
 let retreats=0
 f.operator.retreatFrom=async()=>{retreats++;return {ok:false,reason:'retreat_no_verified_corridor',
   serverMovementVerified:false,attempted:false}}
 e.safetyTick()
 await new Promise(setImmediate)
 assert.equal(retreats,1,'urgent creeper retreat must bypass attack cooldown')
 e.stop()
})
test('recent self-hit target outside melee reach continues retreating after 4500ms attack phase',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const enemy={id:88,name:'zombie',position:vec(9,64,0)}
 e.threat=()=>({type:'SELF_DEFENSE',target:enemy})
 e.lastSelfDamageAt=now-5000
 let retreats=0,attacks=0
 f.operator.retreatFrom=async()=>{retreats++;return {ok:false,reason:'retreat_no_verified_corridor'}}
 f.operator.attackOnce=async()=>{attacks++;return {ok:false}}
 e.safetyTick()
 await new Promise(setImmediate)
 assert.equal(retreats,1)
 assert.equal(attacks,0,'out-of-reach targets should never absorb emergency melee attack attempt')
 e.stop()
})


test('night survival checks a fresh route despite two-minute raw-material cooldown',async()=>{
 let now=100000
 const f=fixture(()=>now),p=await policies()
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:15000}
 f.bot.blockAt=q=>{
   const floor=Math.floor(q.y)===68
   return {name:floor?'oak_planks':'air',boundingBox:floor?'block':'empty',
     shapes:floor?[[0,0,0,1,1,1]]:[]}
 }
 const evidence={get:()=>({independentSource:'bds_querytarget',
   independentLatestFeet:{x:.5,y:69,z:.5},independentAt:now,
   independentPreviousAt:now-500,independentSamples:4,authoritativeSamples:4}),
   checkpoint:()=>({events:4,position:{x:.5,y:69,z:.5}})}
 const e=new AliceBedrockRuntime({...f,policies:p,movementEvidence:evidence})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=now+120000
 let started=null
 e.startJob=(type,source,task,options)=>{started={type,source,task,options}}
 await e.idleTick()
 assert.equal(started?.type,'EXPLORE')
 assert.equal(started?.source,'夜间生存')
 assert.equal(started.options.scoutCandidate.distance,2)
 assert.equal(e.lastNightPlan?.status,'started')
 assert.equal(e.nextIdleAt,now+120000,'ordinary resource cooldown remains unchanged')
 assert.equal(e.nextNightSafetyReviewAt,now+15000)
 e.stop()
})
test('night WAIT timeline reports missing BDS proof rather than only daylight_required',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:15000}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 await e.idleTick()
 assert.equal(e.lastNightPlan?.status,'blocked')
 assert.equal(e.lastNightPlan?.reason,'scout_bds_position_unavailable')
 assert.equal(e.lastIdleDecision?.action,'WAIT')
 assert.equal(e.lastIdleDecision?.reason,'defer_nonurgent_raw_materials_at_night')
 assert.equal(e.lastIdleDecision?.nightSafetyReason,'scout_bds_position_unavailable')
 assert.equal(e.lastIdleHold?.reason,'scout_bds_position_unavailable')
 e.stop()
})
test('periodic night survival never overrides recent human-command grace',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:15000}
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=now-1000;e.nextIdleAt=now+120000
 await e.idleTick()
 assert.equal(e.lastNightPlan,undefined)
 assert.equal(e.job,null)
 e.stop()
})


test('night defensive weapon crafting outranks a separately buildable shelter',async()=>{
 const f=fixture(),p=await policies()
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 f.bot.time={timeOfDay:15000}
 f.bot.blockAt=q=>{
   const floor=Math.floor(q.y)===68
   return {name:floor?'grass_block':'air',boundingBox:floor?'block':'empty',
     shapes:floor?[[0,0,0,1,1,1]]:[]}
 }
 f.setItems([{name:'oak_planks',count:3},{name:'cobblestone',count:8}])
 const e=new AliceBedrockRuntime({...f,policies:p})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 e.lastHumanAt=0;e.nextIdleAt=0
 let selected=null
 e.startJob=(type,source,task,opts)=>{selected={type,source,opts}}
 await e.idleTick()
 assert.equal(e.lastShelterOpportunity.status,'placement_candidate')
 assert.equal(selected?.type,'CRAFT')
 assert.equal(selected?.source,'夜间生存')
 e.stop()
})
test('known-bed sleep is an opportunity after equip and never scans for beds every 5 seconds',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.time={timeOfDay:15000}
 f.bot.entity.position=vec(.5,69,.5);f.bot.entity.onGround=true
 let seen=0,equips=0,sleeps=0
 e.observedBeds.observe=()=>{seen++;return {changed:false}}
 e.observedBeds.nearby=()=>[{x:2,y:69,z:0}]
 f.setItems([{name:'wooden_sword',count:1}])
 f.operator.equipAuto=async()=>{equips++;return {ok:false,reason:'already_best'}}
 f.operator.inspectNightBeds=()=>({status:'safe_bed_candidate',phase:'night',
   found:1,eligible:1,hostile:0,excluded:0,occupied:0,unknown:0})
 f.operator.sleepNearby=async()=>{sleeps++}
 let selected=null
 e.startJob=(type,source,task,options)=>{selected={type,source,task,options}}
 await e.maintenanceTick()
 assert.equal(equips,1)
 assert.equal(selected?.type,'RECOVER')
 assert(selected.options.label.includes('床'))
 assert.equal(seen,1)
 e.stop()
})

test('bed observations remain passive during exploration but never start a competing sleep job',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.time={timeOfDay:15000}
 let observations=0,sleepJobs=0
 e.observedBeds.observe=()=>{observations++;return {changed:false}}
 e.startJob=()=>{sleepJobs++}
 e.job={id:77,type:'EXPLORE',signal:new AbortController().signal}
 await e.maintenanceTick()
 assert.equal(observations,1)
 assert.equal(sleepJobs,0)
 assert.equal(e.job.type,'EXPLORE')
 e.job=null;e.stop()
})


test('cornered spider permits one cooldown-limited defense only when every escape route is blocked',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const spider={id:741,name:'spider',position:vec(1.5,64,0)}
 f.bot.entities[741]=spider
 e.threat=()=>({type:'SURVIVE',target:spider})
 let retreats=0,attacks=0
 f.operator.retreatFrom=async()=>{retreats++;return {
   ok:false,reason:'retreat_no_verified_away_corridor',attempted:false}}
 f.operator.attackOnce=async()=>{attacks++;return {ok:false,attempted:true,verifiedDamage:false}}
 e.safetyTick()
 for(let i=0;i<4;i++)await new Promise(setImmediate)
 assert.equal(retreats,1)
 assert.equal(attacks,1,'only a cornered nearby hostile permits one defensive swing')
 assert(f.calls.some(x=>x[1]==='[Alice safety] cornered defense:'))
 assert.equal(e.attackBackoff.get('741')?.misses,1)
 e.safetyTick()
 for(let i=0;i<4;i++)await new Promise(setImmediate)
 assert.equal(attacks,1,'rate limit prevents repeated unverified attacks')
 e.stop()
})
test('cornered fallback never attacks creeper or fights when nav has attempted movement',async()=>{
 for(const scenario of [
   {name:'creeper',attempted:false},
   {name:'spider',attempted:true},
   {name:'spider',attempted:false,far:true}]){
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  const mob={id:180,name:scenario.name,position:vec(scenario.far?6:2,64,0)}
  f.bot.entities[180]=mob
  e.threat=()=>({type:'SURVIVE',target:mob})
  f.operator.retreatFrom=async()=>({
    ok:false,reason:'retreat_no_verified_away_corridor',attempted:scenario.attempted})
  let attacks=0;f.operator.attackOnce=async()=>{attacks++;return {attempted:true}}
  e.safetyTick()
  for(let i=0;i<4;i++)await new Promise(setImmediate)
  assert.equal(attacks,0,JSON.stringify(scenario))
  e.stop()
 }
})

test('persistent IDLE gate diagnosis separates intentional companion mode, safety and witness hold',async()=>{
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  assert.equal(e.idleGateReason(),'sync_incomplete')
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  e.lastHumanAt=0;e.nextIdleAt=0
  assert.equal(e.idleGateReason(),'eligible_for_work')
  // A missing independent BDS witness can also keep the startup flag active.
  // Diagnose the specific witness hold, not an endless generic startup wait.
  e.startupObservationPending=true
  e.navigationHold='scout_bds_position_unavailable'
  assert.equal(e.idleGateReason(),'position_witness_unverified')
  e.navigationHold=null
  assert.equal(e.idleGateReason(),'startup_observation_pending')
  e.startupObservationPending=false
  assert.equal(e.idleGateReason(),'eligible_for_work')
  e.liveBehavior.settings.agentMode='companion'
  assert.equal(e.idleGateReason(),'companion_mode')
  e.liveBehavior.settings.agentMode='autonomous'
  e.navigationHold='bds_witness_stale'
  assert.equal(e.idleGateReason(),'position_witness_unverified')
  e.navigationHold=null;e.bot.health=8
  assert.equal(e.idleGateReason(),'low_health')
  e.bot.health=20;e.liveBehavior.settings.autonomyEnabled=false
  assert.equal(e.idleGateReason(),'autonomy_disabled')
  e.stop()
})

test('stopped failed Pathfinder near a zombie falls back to one stationary strike',async()=>{
 let now=100000
 const f=fixture(()=>now),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.health=8
 const mob={id:999,name:'zombie',position:vec(1.5,64,0)}
 f.bot.entities[999]=mob
 e.threat=()=>({type:'SURVIVE',target:mob})
 f.operator.retreatFrom=async()=>({ok:false,attempted:true,
   pathfinderStopRequested:true,reason:'retreat_pathfinder_error'})
 let swings=0
 f.operator.attackOnce=async()=>{swings++;return {ok:false,attempted:true,verifiedDamage:false}}
 e.safetyTick()
 for(let i=0;i<4;i++)await new Promise(setImmediate)
 assert.equal(swings,1)
 assert.equal(e.attackBackoff.get('999')?.misses,1)
 assert(f.calls.some(x=>x[1]==='[Alice safety] cornered defense:'))
 now+=500;e.safetyTick()
 for(let i=0;i<4;i++)await new Promise(setImmediate)
 assert.equal(swings,1,'emergency melee must respect cooldown')
 e.stop()
})

test('unstopped failed Pathfinder and diverged BDS coordinates forbid fallback attack',async()=>{
 for(const retreat of [
   {ok:false,attempted:true,pathfinderStopRequested:false,reason:'retreat_pathfinder_error'},
   {ok:false,attempted:false,reason:'retreat_bds_client_position_diverged'},
   {ok:false,attempted:false,reason:'retreat_bds_position_unavailable'}
 ]){
  const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
  e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
  f.bot.health=8
  const enemy={id:182,name:'zombie',position:vec(1,64,0)}
  f.bot.entities[182]=enemy
  e.threat=()=>({type:'SURVIVE',target:enemy})
  f.operator.retreatFrom=async()=>retreat
  let swings=0
  f.operator.attackOnce=async()=>{swings++;return {attempted:true}}
  e.safetyTick()
  for(let i=0;i<4;i++)await new Promise(setImmediate)
  assert.equal(swings,0,retreat.reason)
  e.stop()
 }
})

test('low-health Alice can inspect and use an adjacent safe bed at night instead of refusing all recovery',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.time={timeOfDay:15000};f.bot.health=13;f.bot.food=16
 f.bot.entity.position=vec(.5,69,.5)
 let scanned=0,sleepJobs=0
 e.observedBeds.observe=()=>{scanned++;return {changed:false}}
 e.observedBeds.nearby=()=>[{x:1,y:69,z:1}]
 f.operator.inspectNightBeds=()=>({status:'safe_bed_candidate',phase:'night',
   found:1,eligible:1,hostile:0,excluded:0,occupied:0,unknown:0})
 e.startJob=(type,source,task,options)=>{
   sleepJobs++;assert.equal(type,'RECOVER')
   assert(options.label.includes('床'))
 }
 await e.maintenanceTick()
 assert.equal(scanned,1)
 assert.equal(sleepJobs,1,'a nearby safe bed is not blocked by health<14')
 assert.equal(e.lastSleepOpportunity.status,'safe_bed_candidate')
 e.stop()
})
test('bed observations and honest monster-blocked diagnosis persist during survival',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.time={timeOfDay:15000};f.bot.health=13
 let seen=0,sleepJobs=0
 e.threat=()=>({type:'SURVIVE',target:{name:'zombie'}})
 e.observedBeds.observe=()=>{seen++;return {changed:false}}
 e.observedBeds.nearby=()=>[{x:1,y:64,z:1}]
 f.operator.inspectNightBeds=()=>({status:'nearby_hostile_bed_unavailable',phase:'night',
    found:1,eligible:0,hostile:1,excluded:0,occupied:0,unknown:0})
 e.startJob=()=>{sleepJobs++}
 await e.maintenanceTick()
 assert.equal(seen,1,'reading nearby blocks must not require NO threats')
 assert.equal(sleepJobs,0,'sleep is rejected by Bedrock monster radius')
 assert.equal(e.lastSleepOpportunity.status,'nearby_hostile_bed_unavailable')
 e.stop()
})
test('equipment is attempted in threatened survival while new sleep work stays gated',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.health=13;f.bot.time={timeOfDay:15000}
 e.threat=()=>({type:'SURVIVE',target:{name:'zombie'}})
 let equips=0,starts=0
 f.operator.equipAuto=async()=>{equips++;return {ok:false,reason:'no_weapon'}}
 e.startJob=()=>{starts++}
 await e.maintenanceTick()
 assert.equal(equips,1)
 assert.equal(starts,0)
 assert.equal(e.lastEquipObservation.reason,'no_weapon')
 e.stop()
})

test('bed spawnpoint preflight reports loaded bed reach separately from BDS admission',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 f.bot.entity.position=vec(.5,64,.5)
 const bedPos=vec(6,64,0)
 f.bot.blockAt=()=>({name:'red_bed',position:bedPos})
 f.bot.parseBedMetadata=()=>({occupied:0})
 f.bot.activateBlock=()=>{throw Error('bed activation without BDS verification')}
 e.observedBeds.nearby=()=>[bedPos]
 assert.equal(await e.spawnpointTick(),false)
 assert.equal(e.lastSpawnpointAttempt.reason,'bed_needs_verified_approach')
 assert.equal(e.lastSpawnpointAttempt.bedReach,'bed_needs_verified_approach')
 assert.equal(e.lastSpawnpointAttempt.positionGate,'scout_bds_position_unavailable')
 assert.equal(e.lastSpawnpointAttempt.attempted,false)
 assert.equal(e.job,null)
 e.stop()
})
test('reachable loaded bed without independent BDS proof is not activated',async()=>{
 const f=fixture(),e=new AliceBedrockRuntime({...f,policies:await policies()})
 e.started=true;e.seenSpawn=true;e.hasHealth=true;e.hasInventorySync=true
 const bedPos=vec(1,64,0)
 f.bot.blockAt=()=>({name:'red_bed',position:bedPos})
 f.bot.parseBedMetadata=()=>({occupied:0})
 f.bot.activateBlock=()=>{throw Error('no bed activation without BDS proof')}
 e.observedBeds.nearby=()=>[bedPos]
 assert.equal(await e.spawnpointTick(),false)
 assert.equal(e.lastSpawnpointAttempt.bedReach,'loaded_free_bed_in_reach')
 assert.equal(e.lastSpawnpointAttempt.reason,'scout_bds_position_unavailable')
 assert.equal(e.lastSpawnpointAttempt.attempted,false)
 e.stop()
})
