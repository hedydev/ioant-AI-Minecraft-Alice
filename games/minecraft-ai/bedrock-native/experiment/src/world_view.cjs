'use strict'
// Read-only, bounded visualization feed from the chunk cache held by Alice.
// No server commands, chunk loading, movement packets or world mutation.
const fs=require('node:fs'),path=require('node:path')
const RADIUS=15,BELOW=6,ABOVE=5,MAX_BYTES=512*1024
const SAFE_NAMES=/^[a-z0-9_:.-]{1,64}$/
const isFiniteXYZ=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const coord=p=>[Number(p.x.toFixed(2)),Number(p.y.toFixed(2)),Number(p.z.toFixed(2))]
const inside=(p,center,radius)=>Math.abs(p.x-center[0])<=radius+1&&
  Math.abs(p.z-center[2])<=radius+1&&Math.abs(p.y-center[1])<=ABOVE+2
function cleanBlockName(b){
  const name=String(b?.name||'').replace(/^minecraft:/,'')
  return SAFE_NAMES.test(name)?name:'unknown'
}
function snapshot(bot,{connected=false,movement=null,state='IDLE',job=null,jobStartedAt=null,
  events=[],cachedTerrain=null,now=Date.now}={}){
  const self=bot?.entity?.position,ready=connected&&isFiniteXYZ(self)
  const server=movement?.get?.()||null
  const ownFeet=server?.latestFeet
  const age=Number.isFinite(server?.lastAt)?now()-server.lastAt:null
  const authoritative=age!=null&&age>=0&&age<=5000&&isFiniteXYZ(ownFeet)
  const center=ready?[Math.floor(self.x),Math.floor(self.y),Math.floor(self.z)]:null
  const data={
    version:1,connected:!!ready,observedAt:now(),
    origin: center,radius:RADIUS,below:BELOW,above:ABOVE,
    dimension:String(bot?.game?.dimension||'unknown').slice(0,25),
    alice:{
      local:ready?coord(self):null,
      yaw:Number.isFinite(bot?.entity?.yaw)?Math.round(bot.entity.yaw*1000)/1000:null,
      server:authoritative?coord(ownFeet):null,
      serverSampleAgeMs:authoritative?age:null,
      serverSamples:server?.received||0,
      positionLabel:authoritative?'server_packet_observed':'client_prediction_unverified',
      state:String(state||'UNKNOWN').slice(0,24),
      job:String(job||'').slice(0,100),
      jobElapsedMs:Number.isFinite(jobStartedAt)&&jobStartedAt>0?Math.max(0,now()-jobStartedAt):null,
      health:Number.isFinite(bot?.health)?bot.health:null,
      food:Number.isFinite(bot?.food)?bot.food:null,
    },
    palette:['air'],voxels:[],unknown:0,unknownCells:[],scanned:0,entities:[],
    events:Array.isArray(events)?events.slice(-24):[],terrainAt:null
  }
  if(!ready||typeof bot.blockAt!=='function'||typeof self.offset!=='function')return data
  if(cachedTerrain&&cachedTerrain.dimension===data.dimension&&
     Array.isArray(cachedTerrain.origin)&&cachedTerrain.origin.every((v,i)=>v===center[i])&&
     Number.isFinite(cachedTerrain.terrainAt)&&now()-cachedTerrain.terrainAt<4000){
    data.palette=cachedTerrain.palette;data.voxels=cachedTerrain.voxels
    data.scanned=cachedTerrain.scanned;data.unknown=cachedTerrain.unknown
    data.unknownCells=cachedTerrain.unknownCells
    data.terrainAt=cachedTerrain.terrainAt
    // Position, nearby entities and behavior updates still refresh each tick.
  }
  if(data.terrainAt===null){
  const ids=new Map([['air',0]])
  // Relative coordinates fit a tiny bounded payload. Air isn't drawn.
  for(let dy=-BELOW;dy<=ABOVE;dy++)for(let dz=-RADIUS;dz<=RADIUS;dz++)
    for(let dx=-RADIUS;dx<=RADIUS;dx++){
      const p=self.offset(center[0]+dx-self.x,center[1]+dy-self.y,center[2]+dz-self.z)
      let block
      try{block=bot.blockAt(p)}catch{}
      data.scanned++
      if(!block){data.unknown++;data.unknownCells.push([dx,dy,dz]);continue}
      const name=cleanBlockName(block)
      if(name==='air'||name==='cave_air'||name==='void_air')continue
      let id=ids.get(name)
      if(id==null){id=data.palette.length;ids.set(name,id);data.palette.push(name)}
      // Invisible decorative plants are still represented as their own voxels.
      data.voxels.push([dx,dy,dz,id])
    }
  data.terrainAt=now()
  }
  for(const entity of Object.values(bot.entities||{})){
    if(data.entities.length>=20)break
    if(!isFiniteXYZ(entity?.position)||!inside(entity.position,center,RADIUS))continue
    if(entity===bot.entity||(entity?.id!=null&&bot.entity?.id!=null&&
       String(entity.id)===String(bot.entity.id)))continue
    const kind=String(entity.name||entity.kind||'entity').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,32)
    // Only trust an item name actually exposed by the adapter. No metadata
    // slot guess, world mutation, fake identification or client RPC.
    let itemName=null
    if(['item','item_entity','dropped_item'].includes(kind)){
      let item=null
      try{item=typeof entity.getDroppedItem==='function'?entity.getDroppedItem():null}catch{}
      if(!item&&entity.item&&typeof entity.item==='object')item=entity.item
      const raw=String(item?.name||'').replace(/^minecraft:/,'')
      if(SAFE_NAMES.test(raw))itemName=raw
    }
    data.entities.push({kind:kind||'entity',position:coord(entity.position),
      ...(itemName?{itemName}:{})})
  }
  return data
}
class ViewRecorder {
  constructor({limit=24}={}){this.limit=limit;this.rows=[]}
  add(level,args){
    const first=String(args?.[0]||'')
    if(!/^\[Alice (?:autonomy|exploration|safety|sleep|follow|wood|movement|equipment|job|life|agent)\]/.test(first) &&
      first!=='[Alice Bedrock] verified job result:')return
    // Ignore arbitrary message strings, sensitive handshake logs and accounts.
    const safe=args.slice(1).map(v=>typeof v==='string'?v:typeof v==='number'?String(v):'').join(' ')
    const message=(first+' '+safe).replace(/[\x00-\x1f]/g,' ').slice(0,220)
    this.rows.push({at:Date.now(),level,message})
    while(this.rows.length>this.limit)this.rows.shift()
  }
  logger(base=console){
    return {
      log:(...args)=>{this.add('info',args);base.log(...args)},
      warn:(...args)=>{this.add('warn',args);base.warn(...args)},
      error:(...args)=>{this.add('error',args);base.error(...args)}
    }
  }
}
class ViewPublisher {
  constructor({root=path.join(require('node:os').homedir(),'.alice-bedrock-control'),log=console}={}){
    this.root=root;this.log=log;this.lastError=null
  }
  publish(view){
    try{
      // existsSync follows symlinks; a dangling link therefore appears absent.
      // lstat inspects the link itself, including when its target is missing.
      if(fs.lstatSync(this.root,{throwIfNoEntry:false})?.isSymbolicLink())
        throw Error('Unsafe viewer directory')
      fs.mkdirSync(this.root,{recursive:true,mode:0o700})
      const file=path.join(this.root,'world-view.json')
      if(fs.lstatSync(file,{throwIfNoEntry:false})?.isSymbolicLink())
        throw Error('Unsafe viewer target')
      const bytes=Buffer.from(JSON.stringify(view))
      if(bytes.length>MAX_BYTES)throw Error('World view snapshot too large')
      const temp=path.join(this.root,'.view-'+process.pid+'.tmp')
      try{fs.writeFileSync(temp,bytes,{mode:0o600,flag:'w'});fs.renameSync(temp,file)}
      finally{try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
      this.lastError=null
    }catch(err){if(this.lastError!==err.message)this.log.warn('[Alice view] snapshot unavailable:',err.message);this.lastError=err.message}
  }
}
module.exports={snapshot,ViewRecorder,ViewPublisher,RADIUS,BELOW,ABOVE,MAX_BYTES}
