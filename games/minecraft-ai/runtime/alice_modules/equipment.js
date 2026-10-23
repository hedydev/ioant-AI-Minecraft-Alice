const TIERS = Object.freeze({ netherite: 6, diamond: 5, iron: 4, stone: 3, golden: 2, wooden: 1, wood: 1 });
const TIER = name => TIERS[String(name).split('_')[0]] || 0;

export function chooseWeapon(items = []) {
  return items.filter(item => /_(sword|axe)$/.test(item.name) && !item.name.endsWith('_pickaxe'))
    .sort((a,b) => {
      const score = item => (item.name.endsWith('_sword') ? 100 : 0) + 10*TIER(item.name) +
        Math.min(9,Number(item.attackDamage)||0);
      return score(b)-score(a);
    })[0] || null;
}

export function chooseTool(items = [], blockName = '') {
  const block = String(blockName);
  const family = /(_log|_stem|_wood|_hyphae|_planks)$/.test(block) ? 'axe' :
    /(^|_)(stone|cobblestone|deepslate|ore|iron|copper|gold|diamond|coal|tuff)/.test(block) ? 'pickaxe' :
    /(dirt|grass_block|sand|gravel|clay|mud|snow)/.test(block) ? 'shovel' : null;
  if (!family) return null;
  return items.filter(item => item.name.endsWith('_'+family))
    .sort((a,b) => TIER(b.name)-TIER(a.name))[0] || null;
}

export async function equipBestWeapon(bot) {
  const chosen = chooseWeapon(bot.inventory.items());
  if (!chosen) { console.warn('[Alice equipment] No weapon, using current item'); return null; }
  if (bot.heldItem?.type !== chosen.type) await bot.equip(chosen,'hand');
  console.log('[Alice equipment] COMBAT ' + chosen.name);
  return chosen;
}

export async function equipForHarvest(bot, block) {
  const item=chooseTool(bot.inventory.items(),block.name);
  if (item) {
    if (bot.heldItem?.type!==item.type) await bot.equip(item,'hand');
    console.log('[Alice equipment] HARVEST '+block.name+' with '+item.name);
    return item;
  }
  if (/(_log|_stem|_wood|_hyphae|_planks)$/.test(block.name)) {
    // Logs are harvestable by hand. Never label dirt/sword/rotten flesh a wood tool.
    if (bot.heldItem && typeof bot.unequip==='function') {
      try {await bot.unequip('hand');}
      catch(err) {console.warn('[Alice equipment] could not clear hand: '+String(err));}
    }
    console.log('[Alice equipment] HARVEST '+block.name+
      ' without an axe ('+(bot.heldItem?.name||'empty hand')+')');
    return null;
  }
  if (bot.tool?.equipForBlock) await bot.tool.equipForBlock(block);
  console.log('[Alice equipment] HARVEST '+block.name+' with '+(bot.heldItem?.name||'hand'));
  return bot.heldItem||null;
}
