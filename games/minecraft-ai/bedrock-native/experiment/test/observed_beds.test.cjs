'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {ObservedBeds,SCAN_INTERVAL_MS}=require('../src/observed_beds.cjs')
const v=(x,y,z)=>({x,y,z,offset(dx,dy,dz){return v(x+dx,y+dy,z+dz)},
 distanceTo(p){return Math.hypot(x-p.x,y-p.y,z-p.z)}})
function fixture(){
 let searches=0
 const blocks=new Map([['3,69,0','red_bed']])
 const bot={entity:{position:v(.5,69,.5)},game:{dimension:'overworld'},
   findBlocks:()=>{searches++;return [v(3,69,0)]},
   blockAt:p=>({name:blocks.get([Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)].join(','))||'air',
      position:v(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z))})}
 return {bot,blocks,searches:()=>searches}
}
const withDir=fn=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alice-observed-beds-'))
 try{fn(dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('observed bed persists across processes, but old coordinates must be revalidated',()=>withDir(dir=>{
 let now=100000
 const file=path.join(dir,'observed-beds.json'),f=fixture()
 const memory=new ObservedBeds({file,clock:()=>now})
 assert.equal(memory.observe(f.bot).added,1)
 assert.equal(memory.summary().knownBeds,1)
 assert.equal(f.searches(),1)
 assert.deepEqual(memory.nearby(f.bot),[{x:3,y:69,z:0}])
 assert.equal(fs.statSync(file).mode&0o777,0o600)
 const restarted=new ObservedBeds({file,clock:()=>now})
 assert.deepEqual(restarted.nearby(f.bot),[{x:3,y:69,z:0}])
 f.blocks.set('3,69,0','air')
 assert.deepEqual(restarted.nearby(f.bot),[],'historical memory cannot invent a current bed')
}))
test('bed discovery is passive, paced, bounded and not tied to nighttime',()=>{
 let now=100000
 const f=fixture(),m=new ObservedBeds({clock:()=>now})
 assert.equal(m.observe(f.bot).added,1)
 assert.equal(m.observe(f.bot).reason,'scan_not_due')
 assert.equal(f.searches(),1)
 now+=SCAN_INTERVAL_MS
 assert.equal(m.observe(f.bot).added,0)
 assert.equal(f.searches(),2)
 f.bot.game.dimension='the_nether'
 now+=SCAN_INTERVAL_MS
 assert.equal(m.observe(f.bot).reason,'scan_unavailable')
 assert.deepEqual(m.nearby(f.bot),[])
})
test('bed memory never follows a bed beyond observed local distance',()=>{
 const f=fixture(),m=new ObservedBeds({clock:()=>100000})
 m.observe(f.bot)
 f.bot.entity.position=v(100,69,0)
 assert.deepEqual(m.nearby(f.bot),[])
})
test('dangerous on-disk bed memory file is never followed',()=>withDir(dir=>{
 const target=path.join(dir,'fake.json')
 fs.writeFileSync(target,JSON.stringify({version:1,beds:[]}))
 const symlink=path.join(dir,'observed-beds.json')
 fs.symlinkSync(target,symlink)
 const m=new ObservedBeds({file:symlink,log:{log(){},warn(){}}})
 assert.equal(m.summary().knownBeds,0)
 const f=fixture()
 m.observe(f.bot)
 assert.equal(fs.readFileSync(target,'utf8'),JSON.stringify({version:1,beds:[]}))
}))
