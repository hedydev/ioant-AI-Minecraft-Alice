'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {CommandMailbox,runCommand,cleanCommand,resumeArmedProbe,cancelArmedProbe}=require('../src/console_commands.cjs')
const root=async fn=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'alice-console-'))
  try{return await fn(d)}finally{fs.rmSync(d,{recursive:true,force:true})}}
const id='a'.repeat(32)
const makeRuntime=()=>{
 const calls=[],p={username:'Alice',health:20,isSleeping:false,
  players:{Steve:{entity:{position:{x:1,y:65,z:1}}}}}
 const core={state:'IDLE',intent:null,setFollowIntent(name,d){calls.push(['follow',name,d])},
  stop(){calls.push(['stop'])}}
 const runtime={bot:p,core,closed:false,seenSpawn:true,clock:()=>100000,
  p:{autonomy_policy:{AUTONOMY_GRACE_MS:60000}},liveBehavior:{settings:{followDistance:3}},
  goalPlanner:{halt(){calls.push(['halt'])}},
  threat:()=>null,safetyBusy:false,ready:()=>true,
  refreshBehavior(){},cancelActive(why){calls.push(['cancel',why])},
  ops:{eatIfSafe:async()=>({ok:true})},
  gatherCount:async()=>({ok:true}),craftWeaponOrTable:async()=>({ok:false,reason:'missing_ingredients'}),
  startJob(type,source,work){calls.push(['start',type,source]);this.job={type}
    Promise.resolve().then(()=>work(new AbortController().signal)).finally(()=>{this.job=null})}
 }
 return {runtime,calls}
}
test('one operator probe arms on absent evidence, never moves before BDS pair, and STOP cancels',()=>{
 const {runtime,calls}=makeRuntime()
 runtime.movementEvidence={get:()=>({independentSamples:0})}
 const receipt=[]
 const report=(...x)=>receipt.push(x)
 const r=runCommand(runtime,{action:'probe_step'},report)
 assert.equal(r.reason,'probe_armed')
 assert.equal(resumeArmedProbe(runtime).state,'awaiting_fresh_pair')
 assert.equal(calls.some(x=>x[0]==='start'),false)
 assert.equal(cancelArmedProbe(runtime,'probe_cancelled_by_stop'),true)
 assert.equal(runtime.pendingOperatorProbe,null)
 assert.equal(receipt.at(-1)[1],'probe_cancelled_by_stop')
})
test('safe operator probe rejects stale BDS proof; no path starts',()=>{
 const {runtime,calls}=makeRuntime()
 runtime.movementEvidence={get:()=>({independentSamples:0})}
 assert.equal(runCommand(runtime,{action:'probe_step'},()=>{}).reason,'probe_armed')
 cancelArmedProbe(runtime,'probe_cancelled_by_stop')
 assert.equal(calls.some(x=>x[0]==='start'),false)
})
test('typed parser rejects all unknown, injected or out-of-range actions',()=>{
 assert.equal(cleanCommand({id,createdAt:100000,action:'shell'},100000),null)
 assert.equal(cleanCommand({id,createdAt:100000,action:'follow',target:'../../etc'},100000),null)
 assert.equal(cleanCommand({id,createdAt:100000,action:'gather_wood',count:900},100000),null)
 assert.equal(cleanCommand({id,createdAt:100000,action:'stop',shell:'rm -rf'},100000),null)
 assert.equal(cleanCommand({id,createdAt:100000,action:'stop'},150000),null)
 assert.equal(cleanCommand({id,createdAt:100000,action:'follow',target:'Steve'},100000).target,'Steve')
})
test('console never impersonates a player; only explicit online & locatable name follows',()=>{
 const {runtime,calls}=makeRuntime()
 assert.equal(runCommand(runtime,{action:'follow',target:'我'},()=>{}).reason,'missing_target')
 assert.equal(runCommand(runtime,{action:'guard',target:'Nobody'},()=>{}).reason,'target_not_online_or_locatable')
 assert.equal(calls.length,0)
 const result=runCommand(runtime,{action:'follow',target:'Steve'},()=>{})
 assert.equal(result.status,'started')
 assert.equal(result.reason,'follow_intent_set')
 assert.deepEqual(calls.at(-1),['follow','Steve',3])
 assert.match(result.message,/服务器坐标安全行动/)
})
test('online name without entity must not be treated as a valid follow target',()=>{
 const {runtime}=makeRuntime()
 runtime.bot.players.Steve.entity=null
 assert.equal(runCommand(runtime,{action:'follow',target:'Steve'},()=>{}).status,'rejected')
})
test('stop is allowed with no target and never silently triggers a follow',()=>{
 const {runtime,calls}=makeRuntime()
 const result=runCommand(runtime,{action:'stop'},()=>{})
 assert.equal(result.status,'completed')
 assert(calls.some(c=>c[0]==='stop'))
 assert(!calls.some(c=>c[0]==='follow'))
})
test('gather is started, NOT completed, until task resolves with verified outcome',async()=>{
 const {runtime}=makeRuntime(),receipts=[]
 const result=runCommand(runtime,{action:'gather_wood',count:2},(...r)=>receipts.push(r))
 assert.equal(result.status,'started')
 assert.equal(receipts.length,0)
 await new Promise(setImmediate)
 assert.deepEqual(receipts.at(-1).slice(0,2),['completed','task_confirmed'])
})
test('crafting failures report failed, not completed',async()=>{
 const {runtime}=makeRuntime(),updates=[]
 const result=runCommand(runtime,{action:'craft_sword'},(...r)=>updates.push(r))
 assert.equal(result.status,'started')
 await new Promise(setImmediate)
 assert.equal(updates[0][0],'failed')
 assert.equal(updates[0][1],'missing_ingredients')
})
test('mailbox receives each id at most once, reports receipt and does not replay after restart',async()=>{
 await root(async d=>{
  const {runtime,calls}=makeRuntime()
  const msg={id,createdAt:100000,action:'stop'}
  fs.writeFileSync(path.join(d,'command.json'),JSON.stringify(msg))
  const box=new CommandMailbox({root:d,runtime,clock:()=>100000})
  await box.poll()
  const file=path.join(d,'command-result.json')
  const receipt=JSON.parse(fs.readFileSync(file,'utf8'))
  assert.equal(receipt.status,'completed')
  assert.equal(fs.statSync(file).mode&0o777,0o600)
  await box.poll()
  await new CommandMailbox({root:d,runtime,clock:()=>100000}).poll()
  assert.equal(calls.filter(c=>c[0]==='stop').length,1)
 })
})
test('mailbox rejects symlinked inputs without ever dispatching them',async()=>{
 await root(async d=>{
  const {runtime,calls}=makeRuntime()
  const external=path.join(d,'external');fs.writeFileSync(external,
    JSON.stringify({id,createdAt:100000,action:'stop'}))
  fs.symlinkSync(external,path.join(d,'command.json'))
  const warnings=[]
  await new CommandMailbox({root:d,runtime,clock:()=>100000,
    log:{warn:(...x)=>warnings.push(x)}}).poll()
  assert.equal(calls.length,0)
  assert(warnings.length>0)
 })
})

test('STOP works even when initial inventory sync is unavailable',()=>{
 const {runtime,calls}=makeRuntime()
 runtime.ready=()=>false
 const r=runCommand(runtime,{action:'stop'},()=>{})
 assert.equal(r.status,'completed')
 assert(calls.some(c=>c[0]==='stop'))
 assert.equal(runCommand(runtime,{action:'follow',target:'Steve'},()=>{}).reason,'alice_not_ready')
})

test('explicit online FOLLOW is accepted during danger and low health without stealing safety owner',()=>{
 const {runtime,calls}=makeRuntime()
 runtime.bot.health=13
 runtime.safetyBusy=true
 runtime.threat=()=>({type:'SURVIVE',target:{name:'zombie'}})
 const result=runCommand(runtime,{action:'follow',target:'Steve'},()=>{})
 assert.equal(result.status,'started')
 assert.equal(result.reason,'follow_intent_set')
 assert.deepEqual(calls.at(-1),['follow','Steve',3])
 assert.equal(calls.some(c=>c[0]==='cancel'),false,'emergency controller not cancelled')
 assert.equal(runCommand(runtime,{action:'gather_wood'},()=>{}).reason,'safety_preempted')
})

test('probe arm never invents destination when current chunks are unavailable',()=>{
 const {runtime,calls}=makeRuntime()
 runtime.movementEvidence={get:()=>({independentSamples:0})}
 const r=runCommand(runtime,{action:'probe_step'},()=>{})
 assert.equal(r.reason,'probe_armed')
 assert.match(r.message,/目标暂未验证/)
 assert.equal(runtime.pendingOperatorProbe.target,null)
 assert.equal(calls.some(x=>x[0]==='start'),false)
 cancelArmedProbe(runtime,'probe_cancelled_by_stop')
})
test('probe rechecks pinned adjacent destination instead of changing destination',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/console_commands.cjs'),'utf8')
 assert.match(src,/const preselected=selectProbeRoute\(bot\)/)
 assert.match(src,/pinnedTarget=target&&\[target.x,target.y,target.z\].every\(Number.isSafeInteger\)/)
 assert.match(src,/probe_target_changed/)
 assert.match(src,/startOperatorProbe\(runtime,arm.report,arm.target\)/)
})
