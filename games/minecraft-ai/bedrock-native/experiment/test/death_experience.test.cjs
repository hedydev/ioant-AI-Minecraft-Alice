'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {DeathExperience,MAX_RECORDS}=require('../src/death_experience.cjs')
const quiet={warn(){}}
test('death analysis distinguishes nearby hostile from confirmed attacker',()=>{
  let now=1000000
  const mem=new DeathExperience({clock:()=>now,log:quiet})
  const a=mem.record({nearbyMob:'spider',recentDamage:true,healthBefore:4,food:15})
  assert.equal(a.verifiedCause,false)
  assert.equal(a.reason,'recent_damage_and_hostile_nearby')
  assert.equal(a.repeatedRisk,false)
  now+=5000
  assert.equal(mem.record({nearbyMob:'spider',recentDamage:true}).repeatedRisk,true)
  assert.equal(mem.assess('spider').strategy,'prefer_verified_retreat_over_unconfirmed_attack')
  assert.equal(mem.assess('creeper').repeatedRisk,false)
  now+=7*60*60*1000
  assert.equal(mem.assess('spider').repeatedRisk,false)
})
test('death observations persist, remain private, sanitize hostile names and cap',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alice-death-'))
  try{
    const file=path.join(dir,'death-experience.json')
    let now=2000000
    const mem=new DeathExperience({file,clock:()=>++now,log:quiet})
    for(let i=0;i<MAX_RECORDS+5;i++)mem.record({nearbyMob:i%2?'creeper':'private_account'})
    const next=new DeathExperience({file,clock:()=>now,log:quiet})
    assert.equal(next.records.length,MAX_RECORDS)
    assert.equal(next.summary().nearbyMob,'unknown')
    assert.equal(fs.statSync(file).mode&0o777,0o600)
    assert(!fs.readFileSync(file,'utf8').includes('private_account'))
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('symlink history refuses writes and does not follow arbitrary file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alice-death-link-'))
  try{
    const file=path.join(dir,'death-experience.json'),outside=path.join(dir,'outside')
    fs.writeFileSync(outside,'untouched');fs.symlinkSync(outside,file)
    new DeathExperience({file,log:quiet}).record({nearbyMob:'zombie'})
    assert.equal(fs.readFileSync(outside,'utf8'),'untouched')
    assert(fs.lstatSync(file).isSymbolicLink())
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
