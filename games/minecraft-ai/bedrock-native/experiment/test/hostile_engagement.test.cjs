'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {HostileEngagement,incomingProjectile,likelyShooter}=
 require('../src/hostile_engagement.cjs')
const at=(x,y=64,z=0)=>({x,y,z})
const mob=(name,x,y=64,z=0,id=1)=>({id,name,position:at(x,y,z)})
const arrow=(x,vx=-1,y=65.2)=>({name:'arrow',position:at(x,y,0),velocity:at(vx,0,0)})
const tick=()=>{
 let now=1000
 return {clock:()=>now,advance:ms=>{now+=ms}}
}
const select=(f,mobs,opt={})=>f.guard.select({
 hostiles:mobs,selfPosition:at(0),barrierFor:()=> 'clear',...opt})
function fixture(){
 const time=tick()
 return {...time,guard:new HostileEngagement({clock:time.clock})}
}
test('stationary hostile one or two blocks away is NOT combat just by proximity',()=>{
 const f=fixture(),m=mob('zombie',1.5)
 assert.equal(select(f,[m]),null)
 for(let i=0;i<12;i++){f.advance(300);assert.equal(select(f,[m]),null)}
})
test('same-close-range creeper without ignition or directed pursuit is not automatically attacked',()=>{
 const f=fixture(),m=mob('creeper',2.5)
 for(let i=0;i<4;i++){assert.equal(select(f,[m]),null);f.advance(300)}
})
test('only an actually observed lit creeper fuse makes a stationary creeper urgent',()=>{
 const f=fixture(),m=mob('creeper',2.5)
 assert.equal(select(f,[m]),null)
 m.isIgnited=true
 const d=select(f,[m])
 assert.equal(d?.evidence,'observed_creeper_ignition')
 assert.equal(d?.urgentAttack,true)
 const g=fixture()
 assert.equal(select(g,[m],{barrierFor:()=> 'blocked'}),null)
})
test('observed directed approach for multiple frames within three blocks is real engagement',()=>{
 const f=fixture(),m=mob('zombie',2.9)
 assert.equal(select(f,[m]),null)
 f.advance(300);m.position=at(2.65)
 assert.equal(select(f,[m]),null)
 f.advance(300);m.position=at(2.36)
 const d=select(f,[m])
 assert.equal(d?.type,'SELF_DEFENSE')
 assert.equal(d?.target,m)
 assert.equal(d?.evidence,'directed_close_approach')
})
test('wall or unverified LOS veto close approach and fight',()=>{
 for(const barrier of ['blocked','unknown']){
  const f=fixture(),m=mob('zombie',2.9)
  select(f,[m],{barrierFor:()=>barrier})
  f.advance(300);m.position=at(2.6);select(f,[m],{barrierFor:()=>barrier})
  f.advance(300);m.position=at(2.3)
  assert.equal(select(f,[m],{barrierFor:()=>barrier}),null,barrier)
 }
})
test('passing or moving away without target approach is not aggression',()=>{
 const f=fixture(),m=mob('zombie',1,64,2.1)
 select(f,[m])
 f.advance(300);m.position=at(1,64,2.45);select(f,[m])
 f.advance(300);m.position=at(1,64,2.8)
 assert.equal(select(f,[m]),null)
})
test('mob actually approaching nearby player can trigger GUARD, without follow intent',()=>{
 const f=fixture(),m=mob('zombie',8),ownerPosition=at(5)
 select(f,[m],{ownerPosition})
 f.advance(300);m.position=at(7.7);select(f,[m],{ownerPosition})
 f.advance(300);m.position=at(7.4)
 const d=select(f,[m],{ownerPosition})
 assert.equal(d?.type,'GUARD')
 assert.equal(d?.target,m)
})
test('protect player based on player-to-hostile LOS even if Alice is behind a wall',()=>{
 const f=fixture(),m=mob('zombie',8),ownerPosition=at(5)
 const visibleToVictim=(mob,point,role)=>role==='owner'?'clear':'blocked'
 select(f,[m],{ownerPosition,barrierFor:visibleToVictim})
 f.advance(300);m.position=at(7.7)
 select(f,[m],{ownerPosition,barrierFor:visibleToVictim})
 f.advance(300);m.position=at(7.4)
 const d=select(f,[m],{ownerPosition,barrierFor:visibleToVictim})
 assert.equal(d?.type,'GUARD')
 const g=fixture(),b=mob('zombie',8)
 select(g,[b],{ownerPosition,barrierFor:()=> 'blocked'})
 g.advance(300);b.position=at(7.7)
 select(g,[b],{ownerPosition,barrierFor:()=> 'blocked'})
 g.advance(300);b.position=at(7.4)
 assert.equal(select(g,[b],{ownerPosition,barrierFor:()=> 'blocked'}),null)
})
test('unobserved attacker cannot be attributed to distant zombie after unrelated damage',()=>{
 const f=fixture(),m=mob('zombie',9)
 select(f,[m])
 f.advance(400)
 assert.equal(select(f,[m],{lastSelfDamageAt:1200}),null)
})
test('unattributed damage never blames a nearby mob; point-blank contact only allows escape',()=>{
 const f=fixture(),m=mob('zombie',1.5)
 assert.equal(select(f,[m],{lastSelfDamageAt:900}),null,
  'damage plus 1.5-block proximity does not identify an attacker')
 m.position=at(1.0)
 const d=select(f,[m],{lastSelfDamageAt:900})
 assert.equal(d?.evidence,'unattributed_close_damage')
 assert.equal(d?.type,'SURVIVE')
 assert.equal(d?.urgentAttack,false)
 const g=fixture()
 assert.equal(select(g,[m],{lastSelfDamageAt:900,barrierFor:()=> 'blocked'}),null)
})
test('projectile must actually be flying toward Alice for a ranged threat',()=>{
 const f=fixture(),s=mob('skeleton',7)
 const d=select(f,[s],{projectiles:[arrow(5)]})
 assert.equal(d?.target,s)
 assert.equal(d?.evidence,'incoming_projectile')
 assert.equal(select(f,[s],{projectiles:[arrow(5,1)]}),null)
})
test('incoming arrow aimed at nearby player protects player without attributing passive zombies',()=>{
 const f=fixture(),z=mob('zombie',5,64,0,1),s=mob('skeleton',9,64,3,2)
 const d=select(f,[z,s],{ownerPosition:at(5,64,3),
   projectiles:[{name:'arrow',position:at(7,65.2,3),velocity:at(-1,0,0)}]})
 assert.equal(d?.type,'GUARD')
 assert.equal(d?.target,s)
})
test('multiple equally plausible shooters cannot be assigned as attacker',()=>{
 const f=fixture(),m1=mob('skeleton',7,64,0,1),m2=mob('stray',7.2,64,0,2)
 assert.equal(select(f,[m1,m2],{projectiles:[arrow(5)]}),null)
})
test('line-of-fire and shooter geometry reject clearly irrelevant missiles',()=>{
 const s=mob('skeleton',7)
 assert.equal(incomingProjectile(arrow(5),at(0)),true)
 assert.equal(incomingProjectile(arrow(5,1),at(0)),false)
 assert.equal(likelyShooter(s,arrow(5)),true)
 assert.equal(likelyShooter(s,arrow(5,1)),false)
})
test('unknown or invalid snapshots never silently authorize combat',()=>{
 const f=fixture(),m=mob('zombie',2)
 m.position=at(NaN)
 assert.equal(select(f,[m]),null)
 assert.equal(f.guard.select({selfPosition:null,hostiles:[m]}),null)
})
test('stop, relog and reset erase accumulated pursuit evidence',()=>{
 const f=fixture(),m=mob('zombie',2.9)
 select(f,[m]);f.advance(300);m.position=at(2.6);select(f,[m])
 f.guard.reset();f.advance(300);m.position=at(2.3)
 assert.equal(select(f,[m]),null)
})
