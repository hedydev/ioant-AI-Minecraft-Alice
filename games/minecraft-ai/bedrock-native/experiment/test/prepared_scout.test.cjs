'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {PreparedScout,flatCandidate,equalPath,TTL_MS}=
  require('../src/prepared_scout.cjs')
const candidate=()=>({ok:true,kind:'observed_voxel_walking_only',
  key:'2,65,0',target:{x:2,y:65,z:0},distance:2,
  waypoints:[{x:1,y:65,z:0},{x:2,y:65,z:0}]})
const origin=()=>({x:.5,y:65,z:.5})
const context=(o={})=>({position:origin(),epoch:12,loginAt:100,
  lifeEpochAt:null,dimension:'overworld',phase:'day',weather:'clear',
  source:'自主探索',eligibleAt:1000,...o})
function setup(){
 let now=2000
 const clock=()=>now
 const stage=new PreparedScout({clock})
 return {stage,now:()=>now,advance:ms=>{now+=ms},clock}
}
test('only observed, bounded, flat walking plans can be staged',()=>{
 const f=setup()
 assert.equal(f.stage.prepare(candidate(),context()),true)
 assert.equal(f.stage.has(),true)
 for(const c of [
  {...candidate(),kind:'observed_one_cell_vertical'},
  {...candidate(),distance:9},
  {...candidate(),waypoints:[{x:1,y:65,z:0},{x:NaN,y:65,z:0}]},
  {...candidate(),key:'unsafe'},
  {...candidate(),target:{x:Infinity,y:65,z:0}},
  {...candidate(),ok:false},
  {...candidate(),waypoints:[]}
 ]){
  assert.equal(f.stage.prepare(c,context()),false)
  assert.equal(f.stage.has(),false)
 }
})
test('original life/owner, dimension and clock qualify one one-shot intent',()=>{
 const f=setup()
 assert(f.stage.prepare(candidate(),context()))
 const got=f.stage.take(context())
 assert.equal(got.ok,true)
 assert.equal(got.source,'自主探索')
 assert.equal(got.candidate.key,'2,65,0')
 assert.equal(f.stage.has(),false)
 assert.equal(f.stage.take(context()).ok,false)
})
test('snapshot path copy cannot be changed by caller after preparation',()=>{
 const f=setup(),c=candidate()
 f.stage.prepare(c,context())
 c.waypoints[0].x=42;c.target.x=42
 const got=f.stage.take(context())
 assert.equal(got.candidate.waypoints[0].x,1)
 assert.equal(got.candidate.target.x,2)
})
test('expired plan never prolongs four-second BDS proof window',()=>{
 const f=setup()
 f.stage.prepare(candidate(),context())
 f.advance(TTL_MS+1)
 assert.equal(f.stage.take(context()).ok,false)
 assert.equal(f.stage.has(),false)
})
test('work cooldown is not bypassed by fresh BDS witness',()=>{
 const f=setup()
 assert(f.stage.prepare(candidate(),context({eligibleAt:5000})))
 assert.equal(f.stage.take(context()).ok,false)
})
test('STOP, FOLLOW or any new job epoch invalidate prepared plan',()=>{
 const f=setup()
 f.stage.prepare(candidate(),context())
 assert.equal(f.stage.take(context({epoch:13})).ok,false)
})
test('relogin or death/respawn invalidate the old independent frame',()=>{
 for(const extra of [{loginAt:101},{lifeEpochAt:1900}]){
  const f=setup()
  f.stage.prepare(candidate(),context())
  assert.equal(f.stage.take(context(extra)).ok,false)
 }
})
test('environment, dimension or origin drift invalidates route',()=>{
 for(const extra of [
  {phase:'night'},{weather:'rain'},{dimension:'nether'},
  {position:{x:1,y:65,z:.5}},{position:{x:.5,y:65.5,z:.5}}
 ]){
  const f=setup()
  f.stage.prepare(candidate(),context())
  assert.equal(f.stage.take(context(extra)).ok,false,JSON.stringify(extra))
 }
})
test('model tool source is restricted and invalid context never stages anything',()=>{
 const f=setup()
 assert.equal(f.stage.prepare(candidate(),context({source:'STOP'})),false)
 assert.equal(f.stage.prepare(candidate(),context({source:'自主模型'})),true)
 assert.equal(f.stage.take(context()).ok,true)
 assert.equal(f.stage.prepare(candidate(),context({loginAt:null})),false)
 assert.equal(f.stage.prepare(candidate(),context({position:null})),false)
})
test('revalidated candidate must match every target and waypoint exactly',()=>{
 const c=candidate()
 assert.equal(equalPath(c,candidate()),true)
 assert.equal(equalPath(c,{...candidate(),waypoints:[{x:0,y:65,z:0},{x:2,y:65,z:0}]}),false)
 assert.equal(equalPath(c,{...candidate(),target:{x:3,y:65,z:0}}),false)
 assert.equal(equalPath(c,{...candidate(),key:'3,65,0'}),false)
 assert.equal(equalPath(c,{...candidate(),kind:'observed_one_cell_vertical'}),false)
})
test('main only responds to accepted BDS samples after bed/spawnpoint check',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8')
 const source=fs.readFileSync(path.join(__dirname,'../src/runtime.cjs'),'utf8')
 assert.match(main,/onFreshIndependentBdsWitness/)
 assert.match(main,/Promise\.resolve\(bedCheck\)\.then\(\(\)=>\{/)
 assert.match(main,/runtime\.resumePreparedScoutOnWitness\(\)/)
 assert.match(source,/scoutStartProof\(this\.bot,this\.movementEvidence,this\.clock\)/)
 assert.match(source,/equalPath\(chosen\.candidate,saved\.candidate\)/)
 assert.match(source,/this\.startJob\('EXPLORE',saved\.source/)
 assert.match(source,/this\.preparedScout\.clear\(\)/)
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src/prepared_scout.cjs'),'utf8'),
  /querytarget|child_process|\.writeFile|setControlState|\.goto\(/)
})
