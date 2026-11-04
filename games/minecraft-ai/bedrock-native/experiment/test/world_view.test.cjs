'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {mkdtempSync,readFileSync,lstatSync,symlinkSync,rmSync}=require('node:fs')
const os=require('node:os'),path=require('node:path')
const {snapshot,ViewRecorder,ViewPublisher,RADIUS,BELOW,ABOVE,MAX_BYTES}=require('../src/world_view.cjs')
const pos=(x,y,z)=>({x,y,z,offset(a,b,c){return pos(x+a,y+b,z+c)}})
function fixture(){
 let reads=0
 const bot={entity:{position:pos(10.5,65,20.5),yaw:.7,id:100},
   game:{dimension:'overworld'},health:18,food:19,
   entities:{s:{id:101,name:'zombie',position:pos(13,65,20)}},
   blockAt(p){reads++;if(Math.floor(p.x)===10&&Math.floor(p.z)===20&&Math.floor(p.y)===66)return null
     return {name:Math.floor(p.y)===64?'grass_block':'air',boundingBox:Math.floor(p.y)===64?'block':'empty'}
   }}
 return {bot,reads:()=>reads}
}
test('only a bounded, real cached 3D block neighborhood is exposed',()=>{
 const {bot,reads}=fixture()
 const view=snapshot(bot,{connected:true,now:()=>10000})
 assert.equal(view.version,1)
 assert.deepEqual(view.origin,[10,65,20])
 assert.equal(view.scanned,(RADIUS*2+1)**2*(BELOW+ABOVE+1))
 assert.equal(reads(),view.scanned)
 assert.equal(view.unknown,1)
 assert.deepEqual(view.unknownCells,[[0,1,0]],'unloaded block must not be represented as air')
 assert(view.voxels.length>0)
 assert(view.voxels.every(v=>v.length===4))
 assert(!JSON.stringify(view).includes('xuid'))
 assert.deepEqual(view.alice.local,[10.5,65,20.5])
 assert.equal(view.alice.positionLabel,'client_prediction_unverified')
 assert.equal(view.alice.onGround,null,'unknown client contact must stay unknown')
 assert.equal(view.entities.length,1)
 assert.equal(view.entities[0].kind,'zombie')
})
test('passive client ground contact is tri-state and cannot grant movement',()=>{
 const {bot}=fixture()
 bot.entity.onGround=true
 let view=snapshot(bot,{connected:true,now:()=>20000})
 assert.equal(view.alice.onGround,true)
 bot.entity.onGround=false
 view=snapshot(bot,{connected:true,now:()=>21000,cachedTerrain:view})
 assert.equal(view.alice.onGround,false,'collision cache reuse must not reuse contact')
 bot.entity.onGround='true'
 view=snapshot(bot,{connected:true,now:()=>22000})
 assert.equal(view.alice.onGround,null)
 view=snapshot(bot,{connected:false,now:()=>23000})
 assert.equal(view.alice.onGround,null)
 assert.equal(view.alice.positionLabel,'client_prediction_unverified')
})
test('reuse terrain sample only within same coarse coordinates and 4s',()=>{
 const {bot,reads}=fixture()
 const prev=snapshot(bot,{connected:true,now:()=>10000})
 const before=reads()
 bot.entity.position=pos(10.85,65,20.5)
 const next=snapshot(bot,{connected:true,now:()=>11700,cachedTerrain:prev})
 assert.equal(next.terrainAt,10000)
 assert.deepEqual(next.unknownCells,prev.unknownCells)
 assert.equal(reads(),before)
 assert.equal(next.alice.local[0],10.85)
 bot.entity.position=pos(11.02,65,20.5)
 const shifted=snapshot(bot,{connected:true,now:()=>12000,cachedTerrain:next})
 assert.equal(shifted.origin[0],11)
 assert(reads()>before)
})
test('server packet position is visibly distinct and expires, never inferred',()=>{
 const {bot}=fixture()
 const observed={get:()=>({latestFeet:{x:10.4,y:65,z:20.4},lastAt:9500,received:3})}
 const fresh=snapshot(bot,{connected:true,movement:observed,now:()=>10000})
 assert.deepEqual(fresh.alice.server,[10.4,65,20.4])
 assert.equal(fresh.alice.positionLabel,'server_packet_observed')
 const stale=snapshot(bot,{connected:true,movement:observed,now:()=>18000})
 assert.equal(stale.alice.server,null)
 assert.equal(stale.alice.positionLabel,'client_prediction_unverified')
 assert.equal(snapshot(bot,{connected:false}).voxels.length,0)
})
test('event recorder filters authentication and arbitrary player chat, remains bounded',()=>{
 const rec=new ViewRecorder({limit:2})
 const out={log(){},warn(){},error(){}},logger=rec.logger(out)
 logger.log('[Alice connection audit]','TOKEN_PRIVATE')
 logger.log('Player chat:','password blah')
 logger.log('[Alice exploration] segment outcome:',JSON.stringify({ok:false,reason:'noPath'}))
 logger.warn('[Alice safety] retreat:', 'No path to the goal!')
 logger.log('[Alice autonomy] world-aware decision:',JSON.stringify({goal:'WAIT'}))
 assert.equal(rec.rows.length,2)
 assert(rec.rows.every(x=>!x.message.includes('TOKEN_PRIVATE')))
 assert(rec.rows.some(x=>x.level==='warn'))
})
test('world-view publisher is private, atomic and refuses symlink targets',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'alice-world-view-'))
 try{
  const writer=new ViewPublisher({root,log:{warn(){}}})
  const sample=snapshot(fixture().bot,{connected:true})
  writer.publish(sample)
  const file=path.join(root,'world-view.json')
  assert.deepEqual(JSON.parse(readFileSync(file,'utf8')).origin,sample.origin)
  assert.equal(lstatSync(file).mode&0o777,0o600)
  rmSync(file);symlinkSync(path.join(root,'missing-target'),file)
  writer.publish(sample)
  assert.equal(writer.lastError,'Unsafe viewer target',
    'a dangling symlink is unsafe even though fs.existsSync would return false')
  assert.equal(lstatSync(file).isSymbolicLink(),true,
    'publisher must never replace the symlink with a real file')
 }finally{rmSync(root,{recursive:true,force:true})}
})
test('world-view publisher refuses a dangling symlink directory',()=>{
 const parent=mkdtempSync(path.join(os.tmpdir(),'alice-view-root-'))
 try{
  const linked=path.join(parent,'linked-root')
  symlinkSync(path.join(parent,'absent-root'),linked)
  const writer=new ViewPublisher({root:linked,log:{warn(){}}})
  writer.publish({version:1})
  assert.equal(writer.lastError,'Unsafe viewer directory')
  assert.equal(lstatSync(linked).isSymbolicLink(),true)
 }finally{rmSync(parent,{recursive:true,force:true})}
})

test('3D passive wider area, visible item ID and job age',()=>{
  const {bot}=fixture()
  bot.entities.item={id:456,name:'item',position:pos(11,65,21),
    getDroppedItem:()=>({name:'oak_log'})}
  const view=snapshot(bot,{connected:true,now:()=>10000,job:'采集原木',jobStartedAt:7500})
  assert.equal(RADIUS,15)
  assert.equal(view.scanned,31*31*12)
  assert.equal(view.alice.jobElapsedMs,2500)
  assert.equal(view.entities.find(e=>e.kind==='item').itemName,'oak_log')
  bot.entities.item.getDroppedItem=()=>null
  const unknown=snapshot(bot,{connected:true,now:()=>12000})
  assert.equal(unknown.entities.find(e=>e.kind==='item').itemName,undefined)
})

test('radius fifteen produces a bounded 31-by-31 scene and private snapshot under transport cap',()=>{
  const {bot}=fixture()
  bot.blockAt=()=>({name:'stone'})
  const view=snapshot(bot,{connected:true,now:()=>10000})
  assert.equal(RADIUS,15)
  assert.equal(view.scanned,31*31*12)
  assert.equal(view.voxels.length,31*31*12)
  assert(Buffer.byteLength(JSON.stringify(view))<=512*1024,
    'full solid-world snapshot must fit the producer and SSH read-only transport')
  const writer=new ViewPublisher({root:path.join(os.tmpdir(),'alice-view-large-not-written'),log:{warn(){}}})
  assert.equal(typeof writer.publish,'function')
})

test('collision witness captures observed roof, torch and both real door bits without movement',()=>{
 const bot={entity:{position:pos(.5,65,.5),onGround:true},
  game:{dimension:'overworld'},entities:{},
  blockAt(p){
   const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z)
   if(x===-3&&z===-4&&(y===65||y===66))return {
    name:'spruce_door',boundingBox:'block',shapes:[[0,0,0,.1875,1,1]],
    getProperties:()=>({open_bit:1,upper_block_bit:y===66?1:0})}
   if(x===0&&z===0&&y===66)return {name:'torch',boundingBox:'empty',shapes:[]}
   if(y===67)return {name:'cobblestone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
   if(y===64)return {name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}
   return {name:'air',boundingBox:'empty',shapes:[]}
  }}
 const view=snapshot(bot,{connected:true,now:()=>120000})
 const probe=view.collisionSurvey
 assert.equal(probe.radius,7)
 assert.equal(probe.cells.length,15*15*6)
 assert.equal(probe.unknown,0)
 const at=(x,y,z)=>probe.cells.find(q=>q[0]===x&&q[1]===y&&q[2]===z)
 assert.equal(probe.shapes[at(0,1,0)[4]].boundingBox,'empty')
 assert.equal(probe.shapes[at(0,2,0)[4]].boundingBox,'block')
 assert.equal(at(-3,0,-4)[5],true)
 assert.equal(at(-3,0,-4)[6],false)
 assert.equal(at(-3,1,-4)[6],true)
 assert.equal(probe.shapes[at(-3,0,-4)[4]].shapes[0][3],.1875)
 assert.equal(view.collisionSurvey.source,'client_chunk_cache_not_bds')
 assert(Buffer.byteLength(JSON.stringify(view))<=MAX_BYTES)
})
test('unknown and malformed collision shapes are explicitly unverified',()=>{
 const {bot}=fixture()
 const before=bot.blockAt
 bot.blockAt=p=>{
  if(Math.floor(p.x)===10&&Math.floor(p.y)===65&&Math.floor(p.z)===20)
   return {name:'stone',boundingBox:'block',shapes:[[0,0,0,2,1,1]]}
  return before(p)
 }
 const view=snapshot(bot,{connected:true,now:()=>1000})
 const center=view.collisionSurvey.cells.find(a=>a[0]===0&&a[1]===0&&a[2]===0)
 assert.equal(view.collisionSurvey.shapes[center[4]].shapes,null)
 assert.equal(view.collisionSurvey.unknown,1)
})
