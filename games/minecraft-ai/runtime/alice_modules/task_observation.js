export function retainedGatherCount(start,current) {
  return Math.max(0,(Number(current)||0)-(Number(start)||0));
}
export function inventoryItemCount(items,name) {
  return (items||[]).filter(item=>item?.name===name)
    .reduce((total,item)=>total+(Number(item.count)||0),0);
}
export async function waitForItemIncrease(bot,name,before,attempts=10,delayMs=200) {
  let amount=before;
  for(let attempt=0;attempt<attempts;attempt++) {
    amount=inventoryItemCount(bot.inventory.items(),name);
    if(amount>before || bot.health<=0) break;
    await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  return amount;
}
