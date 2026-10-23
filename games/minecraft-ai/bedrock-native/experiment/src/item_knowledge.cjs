'use strict'
// An edition-aware item resolver. Only the server's actual Bedrock registry
// establishes that a name is a real item. LLM output is never authoritative.
const LOG_GROUP='#natural_logs'
const ALIASES=Object.freeze({
 '木头':LOG_GROUP,'原木':LOG_GROUP,'木材':LOG_GROUP,'树木':LOG_GROUP,'树':LOG_GROUP,
 '橡木':'oak_log','橡木原木':'oak_log','云杉木':'spruce_log','云杉原木':'spruce_log',
 '白桦木':'birch_log','白桦原木':'birch_log','丛林木':'jungle_log',
 '金合欢木':'acacia_log','深色橡木':'dark_oak_log','樱花木':'cherry_log',
 '钻石':'diamond','煤炭':'coal','铁矿石':'iron_ore','铜矿石':'copper_ore',
 '金矿石':'gold_ore','绿宝石':'emerald','红石':'redstone','青金石':'lapis_lazuli',
 '铁锭':'iron_ingot','金锭':'gold_ingot','铜锭':'copper_ingot',
 '圆石':'cobblestone','石头':'stone','泥土':'dirt','沙子':'sand','砂砾':'gravel',
 '木板':'oak_planks','橡木木板':'oak_planks','工作台':'crafting_table',
 '木剑':'wooden_sword','铁剑':'iron_sword','钻石剑':'diamond_sword',
 '木镐':'wooden_pickaxe','铁镐':'iron_pickaxe','钻石镐':'diamond_pickaxe',
 '苹果':'apple','面包':'bread','小麦':'wheat','种子':'wheat_seeds',
 '火把':'torch','箭':'arrow','弓':'bow','腐肉':'rotten_flesh'
})
const canonical=x=>String(x??'').trim().toLowerCase().replace(/^minecraft:/,'')
const isId=x=>/^[a-z][a-z0-9_]{1,63}$/.test(String(x))
function resolveItem(term,registry,learning){
 const raw=String(term??'').trim()
 if(!raw||raw.length>64)return {ok:false,reason:'empty_or_oversize_item'}
 let id=learning?.resolveItemAlias?.(raw)||ALIASES[raw]||canonical(raw)
 if(id===LOG_GROUP)return {ok:true,item:id,display:raw,source:'tag_group'}
 if(!isId(id)||!registry?.itemsByName?.[id])
   return {ok:false,reason:'unknown_registry_item',term:raw.slice(0,48)}
 return {ok:true,item:id,display:raw,source:id===canonical(raw)?'registry':'item_alias'}
}
function parseCollect(text){
 const input=String(text||'').trim().replace(/\s+/g,'')
 const m=input.match(/^(?:收集|采集|搜集|获取|寻找|找来|去找|挖取|挖|砍)(?:一些|一点|些)?(?:(\d{1,3})(?:个|块|根|组|份)?)?(.+?)(?:(\d{1,3})(?:个|块|根|组|份)?)?$/)
 if(!m)return null
 const name=m[2]?.trim()
 if(!name)return null
 const amount=m[1]||m[3]
 const n=amount?Number(amount):null
 if(n!=null&&(!Number.isSafeInteger(n)||n<1||n>32))
   return {type:'INVALID_QUANTITY'}
 return {type:'ITEM_REQUEST',term:name,count:n}
}
function acquisitionStrategy(item,woodLogs){
 if(item===LOG_GROUP||woodLogs?.has(item))return 'verified_natural_tree'
 if(isId(item))return 'recipe_if_available'
 return 'unsupported'
}
module.exports={LOG_GROUP,ALIASES,canonical,resolveItem,parseCollect,acquisitionStrategy}
