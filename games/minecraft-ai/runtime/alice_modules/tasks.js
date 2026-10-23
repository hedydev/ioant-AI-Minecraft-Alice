import { retainedGatherCount } from './task_observation.js';
import { inventorySnapshot, formatLocation } from './inventory_policy.js';
import { nearbyWoodCandidates, woodDistance } from './wood_policy.js';
import { hasMessageEpoch } from './intent_policy.js';
import { craftAndLearn } from './crafting.js';
import { equipForHarvest, equipBestWeapon } from './equipment.js';
import * as skills from '../library/skills.js';
import * as world from '../library/world.js';

const logs = ['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log',
  'mangrove_log','cherry_log','pale_oak_log','crimson_stem','warped_stem'];
const planksByLog = Object.fromEntries(logs.map(n => [n,
  n.replace(/_log$|_stem$/, '_planks')]));
const plankNames = new Set(Object.values(planksByLog));
const count = (bot,pred) => bot.inventory.items().filter(pred).reduce((total,item) => total + item.count,0);
export const countLogs = bot => count(bot,i => logs.includes(i.name));
export const countWoodResources = bot => count(bot,i => logs.includes(i.name)||plankNames.has(i.name));
export const hasUsableWeapon = bot => bot.inventory.items().some(i => i.name.endsWith('_sword') ||
  (i.name.endsWith('_axe') && !i.name.endsWith('_pickaxe')));
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));

export async function collectWoodSmart(agent, requested=10, options={}) {
  const bot = agent.bot;
  const limit = Math.max(1,Math.min(128,Number(requested)||10));
  const start = countLogs(bot), excluded = [];
  const origin=bot.entity?.position?.clone?.() || bot.entity?.position;
  let stopReason='attempt budget / task completed';
  const core = agent.aliceCore;
  if (core) {
    if (!hasMessageEpoch(agent)) {
      // With no verified message-generation counter, a later player's order
      // cannot safely invalidate an older interrupted collection request.
      core.pendingWood = null;
      if (!options.resume)
        console.warn('[Alice gather] optional message epoch unavailable: auto-resume after danger disabled');
    } else if (!options.resume || !core.pendingWood) {
      core.pendingWood = {
        remaining: limit, epoch: agent._aliceMessageEpoch, createdAt: Date.now()
      };
    } else {
      core.pendingWood.remaining = limit;
    }
  }
  let failed = 0, attempts = 0;
  if (core) core.taskProgress={label:'action:aliceCollectWood',collected:0,target:limit};
  console.log('[Alice gather] requested ' + limit + ' logs');
  while (!bot.interrupt_code && bot.health>0 && countLogs(bot)-start < limit && attempts < Math.max(16,limit*4)) {
    const slots=inventorySnapshot(bot);
    if(slots.slotsKnown && slots.freeSlots===0) {
      stopReason='no empty inventory slots';
      console.warn('[Alice gather] stopped: '+stopReason);
      void agent.aliceAutonomy?.social?.say('system','我的背包满了，先把多余物品放到箱子里吧。');
      break;
    }
    const observed=world.getNearestBlocksWhere(bot,b=>b && logs.includes(b.name) &&
      !excluded.some(p=>p.x===b.position.x && p.y===b.position.y && p.z===b.position.z),24,24);
    const targets=nearbyWoodCandidates(observed,origin,bot.entity?.position);
    if (!targets.length) {
      stopReason='no reachable observed tree within 18 blocks of starting position and current bot';
      console.warn('[Alice gather] '+stopReason+'; '+formatLocation(bot));
      void agent.aliceAutonomy?.social?.say('system','附近18格内没有找到能继续采集的树，我先停下，位置可以问我。');
      break;
    }
    const block=targets[0];attempts++;
    const before=countLogs(bot);
    console.log('[Alice gather] candidate '+block.name+' '+block.position+
      ' distance='+woodDistance(block,bot.entity.position).toFixed(1)+
      ' fromStart='+woodDistance(block,origin).toFixed(1)+
      ' attempts='+attempts+'; calling legacy collectBlock by block name (target coordinate not guaranteed)');
    try {
      await equipForHarvest(bot,block);
      await skills.collectBlock(bot,block.name,1,excluded);
    }
    catch(err) { console.warn('[Alice gather] failed '+block.name+': '+String(err)); }
    await sleep(350);
    if (bot.interrupt_code || bot.health<=0) break;
    const delta=countLogs(bot)-before;
    if (delta>0) {
      failed=0;
      if (core?.taskProgress?.label==='action:aliceCollectWood')
        core.taskProgress.collected=countLogs(bot)-start;
      console.log('[Alice gather] progress ' + (countLogs(bot)-start) + '/' + limit);
    } else {
      failed++;
      excluded.push({x:block.position.x,y:block.position.y,z:block.position.z});
      console.warn('[Alice gather] skipping inaccessible candidate ' + block.position);
      if (failed>=8) { stopReason='eight failed targets'; console.warn('[Alice gather] repeated path failures; stopping'); break; }
    }
  }
  // Death destroys inventory; don't report a negative amount or record success.
  const died=bot.health<=0;
  const gathered=retainedGatherCount(start,countLogs(bot));
  const ok=!died && gathered>=limit;
  if (core?.taskProgress?.label==='action:aliceCollectWood') {
    core.taskProgress.collected=gathered;
    core.taskProgress=null;
  }
  const interrupted=Boolean(bot.interrupt_code);
  if (core?.pendingWood) {
    core.pendingWood.remaining=Math.max(0,limit-gathered);
    // Only a safety interruption preserves the pending work. Do not auto-loop on unreachable trees.
    if (ok || !interrupted) core.pendingWood=null;
  }
  if (!interrupted && !died) core?.learning?.recordKnowledge('collect_wood',ok,{gathered,requested:limit,attempts});
  console.log('[Alice gather] '+(died?'interrupted by death, retained ':'collected ')+
    gathered+'/'+limit+' logs; reason='+(died?'death':interrupted?'action interrupted':ok?'target met':stopReason));
  return ok;
}

async function ensurePlanks(agent,minimum) {
  const bot=agent.bot;
  const plankCount=()=>count(bot,i=>plankNames.has(i.name));
  if (plankCount()>=minimum) return true;
  if (countLogs(bot)===0 && !await collectWoodSmart(agent,Math.max(2,Math.ceil((minimum-plankCount())/4)))) {
    if (countLogs(bot)===0) return false;
  }
  let attempts=0;
  while (!bot.interrupt_code && plankCount()<minimum && attempts++<12) {
    const log=bot.inventory.items().find(i=>planksByLog[i.name]);
    if (!log) break;
    const before=plankCount();
    const ok=await craftAndLearn(agent,planksByLog[log.name],1);
    if (!ok || plankCount()<=before) break;
  }
  return plankCount()>=minimum;
}

export async function learnBasicWeapon(agent) {
  const bot=agent.bot;
  console.log('[Alice craft] START prepare basic weapon and workbench');
  try {
    if (hasUsableWeapon(bot)) {
      const weapon=bot.inventory.items().filter(i=>i.name.endsWith('_sword')||
        (i.name.endsWith('_axe') && !i.name.endsWith('_pickaxe')))
        .sort((a,b)=>(b.attackDamage||0)-(a.attackDamage||0))[0];
      if (weapon) await equipBestWeapon(bot);
      agent.aliceCore?.learning?.recordKnowledge('craft_basic_weapon',true,{reused:true,weapon:weapon?.name});
      return true;
    }
    if (!await ensurePlanks(agent,8)) {
      console.warn('[Alice craft] insufficient wood/planks');
      agent.aliceCore?.learning?.recordKnowledge('craft_basic_weapon',false,{stage:'planks'});
      return false;
    }
    if (!bot.inventory.items().some(i=>i.name==='crafting_table')) {
      console.log('[Alice craft] make crafting table');
      if (!await craftAndLearn(agent,'crafting_table',1)) return false;
    }
    if (!bot.inventory.items().some(i=>i.name==='stick')) {
      console.log('[Alice craft] make sticks');
      if (!await craftAndLearn(agent,'stick',1)) return false;
    }
    const quantities=Object.fromEntries(bot.inventory.items().map(i=>[i.name,
      count(bot,x=>x.name===i.name)]));
    const weapon=quantities.diamond>=2 ? 'diamond_sword' :
      quantities.iron_ingot>=2 ? 'iron_sword' :
      (quantities.cobblestone>=2||quantities.blackstone>=2) ? 'stone_sword' : 'wooden_sword';
    console.log('[Alice craft] make ' + weapon);
    if (!await craftAndLearn(agent,weapon,1)) return false;
    const equipped=bot.inventory.items().find(i=>i.name===weapon);
    if (equipped) await equipBestWeapon(bot);
    const success=Boolean(equipped);
    agent.aliceCore?.learning?.recordKnowledge('craft_basic_weapon',success,{weapon});
    console.log('[Alice craft] RESULT ' + (success ? weapon : 'missing product'));
    return success;
  } catch(e) {
    console.warn('[Alice craft] failed: '+String(e));
    agent.aliceCore?.learning?.recordKnowledge('craft_basic_weapon',false,{error:String(e)});
    return false;
  }
}
