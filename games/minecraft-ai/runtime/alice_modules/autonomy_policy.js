// Shared Paper / Bedrock Alice idle-work policy. No Minecraft client dependency.
export const AUTONOMY_GRACE_MS = 20_000;
export const AUTONOMY_WORK_COOLDOWN_MS = 120_000;
export function mayStartIdleWork({now,lastHumanAt,nextWorkAt,busy=false,state='IDLE',following=false,activeAction=false,health=null,underThreat=false}) {
  return !busy && state==='IDLE' && !following && !activeAction &&
    Number.isFinite(health) && health>=14 && !underThreat &&
    now>=nextWorkAt && now-lastHumanAt>=AUTONOMY_GRACE_MS;
}
export function decideIdleWork({hasUsableWeapon,woodResources}) {
  if (typeof hasUsableWeapon!=='boolean' || !Number.isFinite(woodResources) || woodResources<0)
    throw new Error('Cannot choose autonomous task without trustworthy equipment and inventory');
  return !hasUsableWeapon ? 'LEARN_WEAPON' : woodResources<4 ? 'COLLECT_WOOD' : 'OBSERVE';
}