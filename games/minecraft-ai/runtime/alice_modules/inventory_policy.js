// Read-only inventory facts: never claim slot capacity if Mineflayer does not expose its bounds.
const LABELS=Object.freeze({oak_log:'橡木原木',spruce_log:'云杉原木',birch_log:'白桦原木',oak_planks:'橡木木板',dirt:'泥土',cobblestone:'圆石',crafting_table:'工作台',wooden_sword:'木剑',stone_sword:'石剑',iron_sword:'铁剑',stick:'木棍',chest:'箱子',bread:'面包',apple:'苹果',iron_ingot:'铁锭'});
const strip=v=>String(v||'').trim().replace(/^[\s@]*(?:alice|艾丽丝|爱丽丝)[，,:：\s]*/i,'').replace(/[？?!！。．\s]+$/g,'');
export const displayItem=name=>LABELS[name]||name;
export function isInventoryQuery(message){
 return /^(?:我的)?(?:你的)?(?:背包|背包里|物品栏|物资)(?:里)?(?:有(?:什么|哪些|多少东西|多少物品|多少格)?|还(?:有|剩)多少(?:空位|格子)?|状态|清单|情况)?$|^(?:查看|检查|报告|列出)(?:一下)?(?:你的)?(?:背包|物品栏|物资)$/.test(strip(message));
}
export function isLocationQuery(message){
 return /^(?:你(?:现在)?在(?:哪|哪里|什么位置|哪个位置)|你(?:现在)?的(?:位置|坐标)|(?:报告|告诉我|发我)(?:一下)?(?:你(?:现在)?的)?(?:位置|坐标)|当前位置|你的坐标)$/.test(strip(message));
}
export function inventorySnapshot(bot){
 const inv=bot?.inventory;
 if(typeof inv?.items!=='function')return {items:[],slotsKnown:false,totalSlots:null,usedSlots:null,freeSlots:null};
 const grouped=new Map();
 for(const item of inv.items()||[]){
  if(!item?.name||!Number.isInteger(item.count)||item.count<=0)continue;
  grouped.set(item.name,(grouped.get(item.name)||0)+item.count);
 }
 const items=[...grouped].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 const known=Array.isArray(inv.slots)&&Number.isInteger(inv.inventoryStart)&&Number.isInteger(inv.inventoryEnd)&&inv.inventoryStart>=0&&inv.inventoryEnd>inv.inventoryStart&&inv.inventoryEnd<=inv.slots.length;
 const totalSlots=known?inv.inventoryEnd-inv.inventoryStart:null;
 const usedSlots=known?inv.slots.slice(inv.inventoryStart,inv.inventoryEnd).filter(Boolean).length:null;
 return {items,slotsKnown:known,totalSlots,usedSlots,freeSlots:known?totalSlots-usedSlots:null};
}
export function formatInventory(s){
 const head=s.slotsKnown?`背包${s.usedSlots}/${s.totalSlots}格，剩${s.freeSlots}格。`:'背包格数暂时无法确认。';
 if(!s.items.length)return head+'目前没有可统计的物品。';
 return head+s.items.slice(0,7).map(x=>`${displayItem(x.name)}×${x.count}`).join('、')+(s.items.length>7?`等共${s.items.length}种物品。`:'。');
}
export function formatLocation(bot){
 const p=bot?.entity?.position;
 if(![p?.x,p?.y,p?.z].every(Number.isFinite))return '我现在无法确定自己的坐标。';
 return `我在${String(bot.game?.dimension||'当前维度')}，坐标 ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}。`;
}
