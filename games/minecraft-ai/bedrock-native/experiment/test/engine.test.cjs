'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {pathToFileURL}=require('node:url')
const {NativeAutonomyExperiment}=require('../src/engine.cjs')
const {gate}=require('../src/gate.cjs')
const P=path.resolve(__dirname,'..','..','..','runtime','alice_modules')
let shared
async function policies(){
 if(shared)return shared
 const names=['autonomy_policy','safety_policy','terrain_policy','wood_policy','social_policy']
 const items=await Promise.all(names.map(n=>import(pathToFileURL(path.join(P,n+'.js')).href)))
 return shared=Object.fromEntries(names.map((n,i)=>[n,items[i]]))
}
function make(now=()=>30000){
 const calls=[],msgs=[],p={x:0,y:64,z:0,distanceTo:b=>Math.hypot(b.x,b.y-64,b.z),clone(){return this}}
 const bot={username:'AliceXbox',health:20,entity:{position:p},inventory:{items:()=>[]},players:{Steve:{entity:{position:{x:2,y:64,z:3,distanceTo(){return 2}}}}},entities:{},
   chat:s=>msgs.push(s),pathfinder:{setMovements:m=>calls.push('movements'),setGoal:g=>calls.push('goal'),stop:()=>calls.push('stop'),goto:async()=>calls.push('goto')},
   look:async()=>calls.push('look'),clearControlStates:()=>calls.push('clear'),stopDigging:()=>calls.push('stop-dig')}
 const core={state:'IDLE',intent:{type:'IDLE',data:{}},learning:{recordKnowledge:()=>calls.push('learned')},
  transition(state){this.state=state}, stop(){this.state='IDLE';this.intent={type:'IDLE',data:{}}},
  setFollowIntent(name,distance){this.intent={type:'FOLLOW',data:{playerName:name,distance}};this.state='FOLLOW'},
  hasFollowIntent(){return this.intent.type==='FOLLOW'},resumeIntent(){this.state=this.intent.type}}
 const api={Movements:class{},GoalFollow:class{constructor(...args){this.args=args}},GoalNear:class{}}
 const logs={log:s=>calls.push('log:'+s),warn:s=>calls.push('warn:'+s),error:s=>calls.push('error:'+s)}
 return {bot,core,api,calls,msgs,logs,now}
}
test('Original Paper scheduling policy owns 20s grace and action decision',async()=>{
 const p=await policies()
 const a={now:19999,lastHumanAt:0,nextWorkAt:20000,health:20}
 assert.equal(p.autonomy_policy.mayStartIdleWork(a),false)
 assert.equal(p.autonomy_policy.mayStartIdleWork({...a,now:20000}),true)
 assert.equal(p.autonomy_policy.mayStartIdleWork({...a,now:20000,health:13}),false)
 assert.equal(p.autonomy_policy.mayStartIdleWork({...a,now:20000,following:true}),false)
 assert.equal(p.autonomy_policy.decideIdleWork({hasUsableWeapon:false,woodResources:0}),'LEARN_WEAPON')
 assert.equal(p.autonomy_policy.decideIdleWork({hasUsableWeapon:true,woodResources:2}),'COLLECT_WOOD')
 assert.equal(p.autonomy_policy.decideIdleWork({hasUsableWeapon:true,woodResources:8}),'OBSERVE')
})
test('actual follow player command drives sandbox pathfinder, not only chat acknowledgement',async()=>{
 const r=make();const e=new NativeAutonomyExperiment({...r,policies:await policies()})
 e.started=true;e.healthSeen=true
 await e.onChat('Steve','AliceAI 跟着我')
 assert.equal(r.core.state,'FOLLOW')
 await e.tick()
 assert(r.calls.includes('goal'),'GoalFollow should reach pathfinder')
 assert(r.msgs.some(m=>/以服务器位置为准/.test(m)))
 e.stop()
})
test('low health preempts follow, no attack/dig and blocks autonomous work',async()=>{
 const r=make();const e=new NativeAutonomyExperiment({...r,policies:await policies()})
 e.started=true;e.healthSeen=true;r.bot.health=6
 await e.onChat('Steve','跟着我')
 await e.tick()
 assert.equal(r.core.state,'SURVIVE')
 assert(r.calls.includes('stop'))
 assert(!r.calls.includes('goto'))
 e.stop()
})
test('no trusted health => never move, dig or start autonomy',async()=>{
 const r=make();const e=new NativeAutonomyExperiment({...r,policies:await policies()})
 e.started=true
 await e.tick()
 assert.equal(r.calls.length,0)
 e.stop()
})
test('one nearby wood task only records learned success after inventory increases',async()=>{
 const r=make();const pos={x:1,y:64,z:1};let gained=0
 r.bot.inventory.items=()=>gained?[{name:'oak_log',count:gained}]:[]
 r.bot.findBlocks=()=>[pos]
 r.bot.blockAt=p=>({name:'oak_log',position:pos})
 r.bot.dig=async()=>{gained++}
 const e=new NativeAutonomyExperiment({...r,policies:await policies(),sleep:async()=>{}})
 e.started=true;e.healthSeen=true
 const success=await e.runWoodGather(1)
 assert.equal(success,true)
 assert(r.calls.includes('goto'))
 assert(r.calls.includes('learned'))
 assert.equal(r.core.state,'IDLE')
 e.stop()
})
test('never attempt digging when no known nearby log',async()=>{
 const r=make();r.bot.findBlocks=()=>[]
 r.bot.dig=async()=>{throw Error('should not dig')}
 const e=new NativeAutonomyExperiment({...r,policies:await policies(),sleep:async()=>{}})
 e.started=true;e.healthSeen=true
 assert.equal(await e.runWoodGather(1),false)
 assert(!r.calls.includes('learned'))
 e.stop()
})
test('sandbox auth gate refuses existing production and mismatched ports',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'alice-lab-gate-'))
 try{
  const src=path.join(tmp,'minecraft-bedrock');fs.mkdirSync(src)
  const lab=path.join(tmp,'minecraft-bedrock-alice-lab');fs.mkdirSync(lab)
  fs.mkdirSync(path.join(lab,'worlds','Bedrock level'),{recursive:true})
  fs.writeFileSync(path.join(lab,'worlds','Bedrock level','level.dat'),'fixture')
  fs.writeFileSync(path.join(lab,'server.properties'),'server-port=17880\nserver-portv6=17881\nonline-mode=true\nlevel-name=Bedrock level\n')
  // gate() compares canonical realpaths. macOS temp homes may alias /var to /private/var.
  const markerFile=path.join(lab,'.alice-sandbox.json')
  const marker={version:1,kind:'alice-disposable-bedrock-lab',source:fs.realpathSync(src),port:17880,world:'Bedrock level'}
  fs.writeFileSync(markerFile,JSON.stringify(marker))
  assert.throws(()=>gate({},tmp),/confirmation/)
  const confirmed={ALICE_BEDROCK_LAB_CONFIRM:'I_UNDERSTAND_THIS_IS_A_COPY'}
  const valid=gate(confirmed,tmp)
  assert.equal(valid.port,17880)
  assert.equal(valid.dir,fs.realpathSync(lab))
  // A path alias must not weaken the strict source identity check.
  const alias=path.join(tmp,'production-alias')
  fs.symlinkSync(src,alias,'dir')
  fs.writeFileSync(markerFile,JSON.stringify({...marker,source:alias}))
  assert.throws(()=>gate(confirmed,tmp),/Invalid sandbox marker/)
  fs.writeFileSync(markerFile,JSON.stringify(marker))
  fs.writeFileSync(path.join(lab,'server.properties'),'server-port=17879\nserver-portv6=17881\nonline-mode=true\nlevel-name=Bedrock level\n')
  assert.throws(()=>gate({ALICE_BEDROCK_LAB_CONFIRM:'I_UNDERSTAND_THIS_IS_A_COPY'},tmp),/mismatch/)
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})
test('production target requires explicit consent, exact port and real verified backup',()=>{
 const {productionGate,PRODUCTION_CONFIRM}=require('../src/gate.cjs')
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'alice-live-gate-'))
 try{
  const dir=path.join(tmp,'minecraft-bedrock')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir,'server.properties'),'online-mode=true\nserver-port=17879\nlevel-name=Bedrock level\n')
  fs.mkdirSync(path.join(dir,'worlds','Bedrock level'),{recursive:true})
  let checks=0
  const verify=c=>{checks++;assert.equal(c.port,17879);assert.equal(c.worldDir,'Bedrock level');assert.equal(c.manifest,'trusted.json')}
  const env={ALICE_BEDROCK_PROFILE:'AliceAI-HedydevGame',ALICE_BEDROCK_BACKUP_MANIFEST:'trusted.json',ALICE_BEDROCK_SERVER_DIR:dir}
  assert.throws(()=>productionGate(env,tmp,{verify}),/ALICE_BEDROCK_PRODUCTION_CONFIRM/)
  assert.equal(checks,0)
  assert.throws(()=>productionGate({...env,ALICE_BEDROCK_PRODUCTION_CONFIRM:PRODUCTION_CONFIRM,ALICE_BEDROCK_PORT:'17880'},tmp,{verify}),/Production Alice/)
  assert.equal(checks,0)
  assert.throws(()=>productionGate({...env,ALICE_BEDROCK_PRODUCTION_CONFIRM:PRODUCTION_CONFIRM,ALICE_BEDROCK_WORLD_DIR:'wrong world'},tmp,{verify}),/Production Alice/)
  assert.equal(checks,0)
  assert.equal(productionGate({...env,ALICE_BEDROCK_PRODUCTION_CONFIRM:PRODUCTION_CONFIRM},tmp,{verify}).port,17879)
  assert.equal(checks,1)
  assert.throws(()=>productionGate({...env,ALICE_BEDROCK_PRODUCTION_CONFIRM:PRODUCTION_CONFIRM},tmp,{verify:()=>{throw Error('bad SHA256')}}),/bad SHA256/)
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})
test('300ms safetyTick interrupts an existing follow without marking escape successful',async()=>{
 const r=make();const e=new NativeAutonomyExperiment({...r,policies:await policies(),label:'正式基岩世界'})
 e.started=true;e.healthSeen=true;r.core.setFollowIntent('Steve',3);e.followingGoal='Steve'
 r.bot.health=7
 assert.equal(e.safetyTick(),true)
 assert.equal(r.core.state,'SURVIVE')
 assert(r.calls.includes('stop'))
 assert.equal(e.status().includes('正式基岩世界'),true)
 e.stop()
})
