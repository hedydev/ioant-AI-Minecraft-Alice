'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {reconcileRespawnMirror}=require('../src/respawn_position_mirror.cjs')
function scenario({server={x:8,y:64,z:10},local={x:4,y:61,z:10},
 pairTravel=0,first=8700,second=9800}={}){
 let stops=0,clears=0,wire=0
 const bot={health:20,entity:{position:{...local},velocity:{x:1,y:-1,z:1},onGround:true},
 pathfinder:{setGoal:g=>{assert.equal(g,null);stops++}},clearControlStates:()=>clears++,
 _client:{queue:()=>wire++}}
 const evidence={get:()=>({independentSource:'bds_querytarget',independentSamples:2,
 independentPreviousAt:first,independentAt:second,independentPairTravelBlocks:pairTravel,
 independentLatestFeet:server})}
 return {bot,evidence,count:()=>[stops,clears,wire]}
}
test('post-respawn fresh stationary independent BDS pair re-aligns only local feet',()=>{
 const f=scenario(),args={bot:f.bot,evidence:f.evidence,phase:'respawn_verified',
 cycle:7,mirroredCycle:6,clock:()=>10000}
 const r=reconcileRespawnMirror(args)
 assert.equal(r.ok,true);assert.equal(r.distance,5)
 assert.deepEqual(f.bot.entity.position,{x:8,y:64,z:10})
 assert.deepEqual(f.bot.entity.velocity,{x:0,y:0,z:0})
 assert.equal(f.bot.entity.onGround,false)
 assert.deepEqual(f.count(),[1,1,0])
 assert.equal(reconcileRespawnMirror({...args,mirroredCycle:7}).ok,false)
})
test('never use old/unstable/large or non-respawn samples',()=>{
 for(const opt of [{first:5900},{pairTravel:1},{server:{x:35,y:64,z:10}},
   {server:{x:4,y:61,z:10}}]){
  const f=scenario(opt),r=reconcileRespawnMirror({bot:f.bot,evidence:f.evidence,
   phase:'respawn_verified',cycle:7,clock:()=>10000})
  assert.equal(r.ok,false);assert.deepEqual(f.count(),[0,0,0])
 }
 const f=scenario(),a={bot:f.bot,evidence:f.evidence,cycle:7,clock:()=>10000}
 assert.equal(reconcileRespawnMirror({...a,phase:'waiting_for_server_respawn'}).ok,false)
 f.bot.health=0;assert.equal(reconcileRespawnMirror({...a,phase:'respawn_verified'}).ok,false)
})
