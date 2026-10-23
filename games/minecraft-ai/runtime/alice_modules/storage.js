// Explicit, bounded container actions; only a versioned ActionManager task may call them.
import { inventorySnapshot } from './inventory_policy.js';
const SAFE_EXTRA=Object.freeze({oak_log:8,spruce_log:8,birch_log:8,jungle_log:8,acacia_log:8,
 dark_oak_log:8,mangrove_log:8,cherry_log:8,dirt:16,cobblestone:32,cobbled_deepslate:32,
 oak_planks:16,spruce_planks:16});
const count=(bot,name)=>(bot.inventory?.items?.()||[]).filter(i=>i.name===name)
 .reduce((sum,i)=>sum+(Number(i.count)||0),0);
export function planExtraDeposit(items,minimums=SAFE_EXTRA){
 const result=[],totals=new Map();
 for(const item of items||[]){
  if(item?.name in minimums && Number.isInteger(item.count) && item.count>0 && Number.isInteger(item.type))
   totals.set(item.name,(totals.get(item.name)||0)+item.count);
 }
 for(const item of items||[]){
  if(!(item?.name in minimums)||!Number.isInteger(item.type))continue;
  const spare=Math.max(0,(totals.get(item.name)||0)-minimums[item.name]);
  const amount=Math.min(spare,item.count);
  if(amount>0){result.push({item,amount});totals.set(item.name,totals.get(item.name)-amount);}
 }
 return result;
}
function requireChest(bot,block){
 if(!['chest','barrel'].includes(block?.name)||!block.position||!bot?.entity?.position)
  throw new Error('Expected a visible chest/barrel block');
 if(bot.entity.position.distanceTo(block.position)>4.5)throw new Error('Chest is out of interaction range');
 if(bot.health<=0||bot.interrupt_code)throw new Error('Alice cannot transfer during interruption/death');
 if(typeof bot.openContainer!=='function')throw new Error('Mineflayer container API unavailable');
}
export async function storeExtrasInNearbyChest(bot,block){
 requireChest(bot,block);
 const plan=planExtraDeposit(bot.inventory.items());
 if(!plan.length)return {moved:[],message:'没有需要存放的多余基础材料'};
 const chest=await bot.openContainer(block),moved=[];
 try{
  for(const {item,amount} of plan){
   if(bot.health<=0||bot.interrupt_code)break;
   const before=count(bot,item.name);
   await chest.deposit(item.type,item.metadata??null,amount,item.nbt??null);
   const verified=Math.max(0,before-count(bot,item.name));
   if(!verified)throw new Error('Inventory did not confirm deposit of '+item.name);
   moved.push({name:item.name,count:verified});
  }
 }finally{await chest.close();}
 return {moved,message:'箱子存放完成；以背包真实减少数量为准'};
}
export async function takeItemsForTrip(bot,block,itemName,amount){
 requireChest(bot,block);
 if(!/^[a-z0-9_]{1,70}$/.test(String(itemName))||!Number.isSafeInteger(amount)||amount<1||amount>128)
  throw new Error('Invalid exact item name or bounded quantity');
 const capacity=inventorySnapshot(bot);
 if(capacity.slotsKnown&&capacity.freeSlots===0)
  throw new Error('No free inventory slots for safe withdrawal');
 const chest=await bot.openContainer(block);
 try{
  const contained=chest.containerItems();
  const available=contained.filter(i=>i.name===itemName).reduce((a,i)=>a+i.count,0);
  if(available<amount)throw new Error('Insufficient chest quantity '+itemName);
  const item=contained.find(i=>i.name===itemName),before=count(bot,itemName);
  await chest.withdraw(item.type,item.metadata??null,amount,item.nbt??null);
  const verified=Math.max(0,count(bot,itemName)-before);
  if(!verified)throw new Error('Inventory did not confirm withdrawal of '+itemName);
  return {name:itemName,requested:amount,received:verified};
 }finally{await chest.close();}
}
export async function tossItemNearVisiblePlayer(bot,playerName,itemName,amount){
 const pos=bot.players?.[playerName]?.entity?.position;
 if(!pos||!bot.entity?.position||bot.entity.position.distanceTo(pos)>4)
  throw new Error('Target player must be visible and within 4 blocks');
 if(bot.health<=0||bot.interrupt_code)throw new Error('Cannot toss while interrupted/dead');
 if(!Number.isInteger(amount)||amount<=0||amount>64)throw new Error('Invalid toss quantity');
 const item=bot.inventory.items().find(i=>i.name===itemName);
 if(!item||count(bot,itemName)<amount)throw new Error('Not enough items to toss');
 const before=count(bot,itemName);
 await bot.toss(item.type,item.metadata??null,amount);
 const actual=Math.max(0,before-count(bot,itemName));
 if(!actual)throw new Error('Inventory did not confirm toss');
 return {name:itemName,tossed:actual,recipient:playerName,pickupConfirmed:false};
}
