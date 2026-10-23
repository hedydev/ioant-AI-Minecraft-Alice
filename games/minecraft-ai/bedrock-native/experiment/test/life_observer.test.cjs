'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {LifeObserver,personalSpawn}=require('../src/life_observer.cjs')
const withDir=fn=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'alice-life-'))
  try{fn(d)}finally{fs.rmSync(d,{recursive:true,force:true})}}
test('new installation does not pretend zero lifetime deaths or known respawn',()=>withDir(root=>{
 const life=new LifeObserver({root,clock:()=>12000})
 assert.equal(life.summary().deathCountIsLifetime,false)
 assert.equal(life.summary().trackingSince,null)
 assert.equal(life.summary().respawnStatus,'not_verified')
}))
test('one death per spawn is tracked and private, survives restart',()=>withDir(root=>{
 const life=new LifeObserver({root,clock:()=>15000})
 assert.equal(life.death(),true)
 assert.equal(life.death(),false)
 assert.equal(life.summary().deathsSinceTracking,1)
 assert.equal(fs.statSync(path.join(root,'life.json')).mode&0o777,0o600)
 life.spawn()
 assert.equal(life.death(),true)
 assert.equal(new LifeObserver({root}).summary().deathsSinceTracking,2)
}))
test('world spawn never masquerades as personal respawn; only Bedrock player spawn packet is used',()=>withDir(root=>{
 const life=new LifeObserver({root,clock:()=>1000})
 assert.equal(personalSpawn({spawn_type:'world',player_position:{x:10,y:65,z:2}}),null)
 assert.equal(personalSpawn({spawn_type:'player',world_position:{x:10,y:65,z:2}}),null)
 assert.equal(life.playerSpawnPacket({spawn_type:'world',player_position:{x:10,y:65,z:2}}),false)
 assert.equal(life.summary().respawnStatus,'not_verified')
 assert.equal(life.playerSpawnPacket({spawn_type:'player',player_position:{x:10,y:65,z:2}}),true)
 life.spawn() // packet often precedes Mineflayer spawn
 assert.equal(life.summary().respawnStatus,'observed_server_player_spawn_packet')
 assert.deepEqual(life.summary().respawnPoint,{x:10,y:65,z:2})
 const next=new LifeObserver({root})
 assert.equal(next.summary().respawnStatus,'last_observed_prior_session')
}))
test('symbolic linked persistence never overwrites outside user file',()=>withDir(root=>{
 const outside=path.join(root,'outside')
 fs.writeFileSync(outside,'untouched')
 fs.symlinkSync(outside,path.join(root,'life.json'))
 const warnings=[]
 const life=new LifeObserver({root,log:{warn:(...a)=>warnings.push(a)}})
 life.death()
 assert.equal(fs.readFileSync(outside,'utf8'),'untouched')
 assert(warnings.length>0)
}))

test('death tracking begins at first spawn even with zero observed deaths',()=>withDir(root=>{
 const life=new LifeObserver({root,clock:()=>9999})
 life.spawn()
 assert.equal(life.summary().deathsSinceTracking,0)
 assert.equal(life.summary().trackingSince,9999)
 assert.equal(new LifeObserver({root}).summary().deathsSinceTracking,0)
}))
