'use strict'
const CHESTS=new Set(['chest','trapped_chest','barrel'])
const ALIASES={钻石:'diamond',铁锭:'iron_ingot',金锭:'gold_ingot',绿宝石:'emerald',煤炭:'coal',红石:'redstone',
 木头:'oak_log',橡木原木:'oak_log',木板:'oak_planks',圆石:'cobblestone',石头:'stone',泥土:'dirt',
 小麦:'wheat',种子:'wheat_seeds',面包:'bread',苹果:'apple',烤牛肉:'cooked_beef',牛肉:'beef',
 火把:'torch',箭:'arrow',弓:'bow',木剑:'wooden_sword',铁剑:'iron_sword',钻石剑:'diamond_sword',
 木镐:'wooden_pickaxe',铁镐:'iron_pickaxe',钻石镐:'diamond_pickaxe',铁斧:'iron_axe',钻石斧:'diamond_axe',
 工作台:'crafting_table',箱子:'chest'}
function parseStorage(text) {
 const s=String(text||'').trim()
 let direction,body
 let m=s.match(/^从(?:附近的?)?(?:箱子|储物箱|木桶)(?:里|中)?(?:拿出?|取出?|提取)s*(.+)$/)
 if(m){direction='withdraw';body=m[1]}
 else {
   m=s.match(/^(?:(?:向|往)?(?:附近的?)?(?:箱子|储物箱|木桶)(?:里|中)?(?:存入|存|放入|放进)|(?:存入|放入|放进|放到)(?:附近的?)?(?:箱子|储物箱|木桶)(?:里|中)?)s*(.+)$/)
   if(!m)return null
   direction='deposit';body=m[1]
 }
 body=body.trim()
 let amount=1, raw=body
 const prefix=body.match(/^(\d{1,3})\s*(?:个|块|根|组|份)?\s*(.+)$/)
 const suffix=body.match(/^(.+?)\s*(?:[x×*]\s*|\s+)(\d{1,3})$/i)
 const natural=body.match(/^(.+?)(\d{1,3})个$/)
 if(prefix){amount=Number(prefix[1]);raw=prefix[2]}
 else if(suffix){amount=Number(suffix[2]);raw=suffix[1]}
 else if(natural){amount=Number(natural[2]);raw=natural[1]}
 if(!Number.isSafeInteger(amount)||amount<1||amount>64)return {type:'INVALID_QUANTITY'}
 const normalized=raw.trim().replace(/^minecraft:/,'')
 const item=ALIASES[normalized]||(/^[a-z][a-z_0-9]{1,63}$/.test(normalized)?normalized:null)
 return item?{type:'STORAGE',direction,item,amount}:{type:'UNKNOWN_ITEM',raw:raw.slice(0,45)}
}
const quantity=(items,name)=>(items||[]).filter(x=>x?.name===name&&Number.isFinite(x.count)).reduce((n,x)=>n+x.count,0)
const itemsInChest=w=>(typeof w?.containerItems==='function'?w.containerItems():w?.slots?.slice(0,w.inventoryStart??w.slots.length))||[]
async function limited(action,{signal,ms=16000,abort=()=>{}}={}){
 if(signal?.aborted)throw Error('cancelled')
 let timer,handler
 const interrupt=new Promise((_,reject)=>{
   handler=()=>{abort();reject(Error('cancelled'))}
   signal?.addEventListener('abort',handler,{once:true})
   timer=setTimeout(()=>{abort();reject(Error('timeout'))},ms)
 })
 try{return await Promise.race([Promise.resolve().then(action),interrupt])}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',handler)}
}
async function openVerified(bot,block,signal){
 if(bot.currentWindow)throw Error('another_window_open')
 if(typeof bot.openContainer!=='function'||typeof bot.on!=='function')throw Error('container_api_missing')
 let handler, timer
 const opened=new Promise((resolve,reject)=>{
   handler=w=>{
     if(!w||!(w.bedrockType==='container'||w.bedrockType==='minecraft:container'))return
     // container_open emits a provisional window with no slots. Only the later
     // inventory_content creates a real chest Window with inventoryStart.
     if(!Number.isInteger(w.inventoryStart)||w.inventoryStart<1)return
     clearTimeout(timer);resolve(w)
   }
   bot.on('windowOpen',handler)
   timer=setTimeout(()=>reject(Error('container_open_timeout')),4500)
 })
 try{
   await bot.openContainer(block)
   return await limited(()=>opened,{signal,ms:5000})
 } finally {
   clearTimeout(timer)
   if(handler)bot.off?.('windowOpen',handler)
 }
}
async function transferNearby(bot,api,{direction,item,amount,signal,radius=12}={}){
 if(!['deposit','withdraw'].includes(direction)||!/^[a-z][a-z0-9_]{1,63}$/.test(item)||
    !Number.isSafeInteger(amount)||amount<1||amount>64)
   return {ok:false,reason:'invalid_item_or_count'}
 if(!bot.registry?.itemsByName?.[item])return {ok:false,reason:'unknown_item_in_registry'}
 if(!bot.entity?.position||!bot.findBlocks||!bot.pathfinder?.goto||!bot.inventory?.items||
    typeof bot[direction]!=='function')return {ok:false,reason:'container_capability_missing'}
 const workOrigin=bot.entity.position.clone?.()||bot.entity.position
 const points=bot.findBlocks({matching:b=>CHESTS.has(b?.name),maxDistance:radius,count:24})||[]
 const chests=points.map(p=>bot.blockAt?.(p)).filter(b=>CHESTS.has(b?.name)&&b.position?.distanceTo(workOrigin)<=radius)
  .sort((a,b)=>a.position.distanceTo(workOrigin)-b.position.distanceTo(workOrigin))
 if(!chests.length)return {ok:false,reason:'no_chest_within_radius'}
 let gained=0,visited=0,last='item_not_found_or_no_capacity'
 for(const chest of chests){
   if(signal?.aborted)throw Error('cancelled')
   if(gained>=amount)break
   if(direction==='deposit'&&quantity(bot.inventory.items(),item)<=0){last='inventory_item_missing';break}
   if(chest.position.distanceTo(workOrigin)>radius)continue
   let window=null
   try{
     await limited(()=>bot.pathfinder.goto(new api.GoalNear(chest.position.x,chest.position.y,chest.position.z,2)),
        {signal,ms:14000,abort:()=>bot.pathfinder.stop?.()})
     if(bot.entity.position.distanceTo(chest.position)>3.5){last='container_out_of_reach';continue}
     window=await openVerified(bot,chest,signal)
     visited++
     if(!window||!(window.bedrockType==='container'||window.bedrockType==='minecraft:container'||window.type==='minecraft:container')){
       last='not_a_chest_window';continue
     }
     // A single named item can occupy multiple slots. Retry only while a
     // server-backed inventory AND container delta is confirmed.
     for(let attempts=0;attempts<16&&gained<amount;attempts++){
       if(signal?.aborted)throw Error('cancelled')
       const available=direction==='withdraw'?quantity(itemsInChest(window),item):quantity(bot.inventory.items(),item)
       if(available<=0){last='item_absent';break}
       const src=direction==='withdraw'?itemsInChest(window).find(x=>x?.name===item):bot.inventory.items().find(x=>x?.name===item)
       const moved=Math.min(amount-gained,available,src?.count||0)
       if(moved<1)break
       const beforePlayer=quantity(bot.inventory.items(),item)
       const beforeChest=quantity(itemsInChest(window),item)
       await limited(()=>bot[direction](item,null,moved),{signal,ms:9000})
       let delta=0
       for(let i=0;i<12;i++){
         if(signal?.aborted)throw Error('cancelled')
         const player=quantity(bot.inventory.items(),item),container=quantity(itemsInChest(window),item)
         delta=direction==='withdraw'?Math.min(player-beforePlayer,beforeChest-container):
           Math.min(beforePlayer-player,container-beforeChest)
         if(delta>0)break
         await new Promise(r=>setTimeout(r,100))
       }
       if(delta>0)gained+=Math.min(delta,moved)
       else {last='transaction_not_verified_both_sides';break}
     }
   }catch(e){
     if(signal?.aborted)throw e
     last=String(e?.message||e).slice(0,100)
   }finally{
     if(window&&bot.currentWindow===window){try{bot.closeWindow?.(window)}catch{}}
   }
 }
 return {ok:gained===amount,moved:gained,requested:amount,item,direction,visited,reason:gained===amount?'inventory_and_chest_delta_confirmed':
     ('已确认'+gained+'/'+amount+'个；'+last)}
}
module.exports={parseStorage,transferNearby,quantity,itemsInChest}
