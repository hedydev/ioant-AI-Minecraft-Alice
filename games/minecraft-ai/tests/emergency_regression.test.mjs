import test from 'node:test';
import assert from 'node:assert/strict';
import { AliceCore, AliceState } from '../runtime/alice_modules/core.js';
import { retainedGatherCount, waitForItemIncrease } from '../runtime/alice_modules/task_observation.js';
import { shouldInterveneAfterRetreat, selectThreat } from '../runtime/alice_modules/safety_policy.js';
import { equipForHarvest } from '../runtime/alice_modules/equipment.js';

test('broken legacy self_preservation never interrupts AliceSafety', () => {
  const core = Object.create(AliceCore.prototype);
  core.safetyActive = true;
  core.state = AliceState.SURVIVE;
  assert.equal(core.allowsMode('self_preservation'), false);
  assert.equal(core.allowsMode('self_defense'), false);
  assert.equal(core.allowsMode('cowardice'), false);
  core.safetyActive = false;
  core.state = AliceState.IDLE;
  assert.equal(core.allowsMode('self_preservation'), false);
  assert.equal(core.allowsMode('self_defense'), true);
});

test('low health at a distant but loaded mob does not endlessly restart retreat', () => {
  const position=x=>({x,distanceTo(other){return Math.abs(x-other.x)}});
  const selfPosition=position(0);
  const hostile=x=>({name:'zombie',position:position(x)});
  const base={now:20000,health:4,selfPosition,ownerPosition:null,lastSelfDamageAt:0,hostiles:[hostile(10)]};
  assert.equal(selectThreat(base), null);
  assert.equal(selectThreat({...base,hostiles:[hostile(6)]})?.type, 'SURVIVE');
  assert.equal(selectThreat({...base,lastSelfDamageAt:19900})?.type, 'SURVIVE');
});

test('recent damage or imminent proximity overrides retreat cooldown', () => {
  const params={now:10000,cooldownUntil:13000,distance:7,newSelfHit:false,newOwnerHit:false};
  assert.equal(shouldInterveneAfterRetreat(params),false);
  assert.equal(shouldInterveneAfterRetreat({...params,distance:2}),true);
  assert.equal(shouldInterveneAfterRetreat({...params,newSelfHit:true}),true);
  assert.equal(shouldInterveneAfterRetreat({...params,newOwnerHit:true}),true);
  assert.equal(shouldInterveneAfterRetreat({...params,now:14000}),true);
});

test('inventory after death never reports negative wood collection', () => {
  assert.equal(retainedGatherCount(1,0),0);
  assert.equal(retainedGatherCount(3,3),0);
  assert.equal(retainedGatherCount(3,9),6);
});

test('craft verification waits for real Mineflayer inventory update', async () => {
  let calls=0;
  const bot={health:20,inventory:{items(){calls++;return calls<3?[]:[{name:'wooden_sword',count:1}]}}};
  assert.equal(await waitForItemIncrease(bot,'wooden_sword',0,5,0),1);
});
test('unconfirmed craft output is not treated as a real item', async () => {
  const bot={health:20,inventory:{items(){return []}}};
  assert.equal(await waitForItemIncrease(bot,'wooden_sword',0,2,0),0);
});

test('wood without an axe clears unrelated inventory items from hand', async () => {
  let unequipped=0;
  const bot={heldItem:{type:1,name:'rotten_flesh'},
    inventory:{items(){return [{type:1,name:'rotten_flesh',count:1}]}},
    async unequip(slot){assert.equal(slot,'hand');this.heldItem=null;unequipped++}};
  await equipForHarvest(bot,{name:'oak_log'});
  assert.equal(unequipped,1);
  assert.equal(bot.heldItem,null);
});
