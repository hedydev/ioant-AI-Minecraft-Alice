import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectThreat, Priority } from '../runtime/alice_modules/safety_policy.js';
import { chooseTool, chooseWeapon } from '../runtime/alice_modules/equipment.js';

const position = (x,y,z) => ({distanceTo:p=>Math.hypot(x-p.x,y-p.y,z-p.z),x,y,z});
const mob = (name,x,y,z,id) => ({name,position:position(x,y,z),id});
const now = 20000;
function decision(overrides={}) {
  return selectThreat({now,health:20,selfPosition:position(0,0,0),
    ownerPosition:position(8,0,0),hostiles:[],...overrides});
}

test('self defense always wins over owner defense', () => {
  const result=decision({lastSelfDamageAt:now-300, lastOwnerDamageAt:now-200,
    hostiles:[mob('zombie',2,0,0,1),mob('skeleton',8,0,1,2)]});
  assert.equal(result.type,'SELF_DEFENSE');
  assert.equal(result.target.id,1);
  assert.ok(Priority.SELF_DEFENSE>Priority.GUARD);
});

test('critical own health overrides ordinary combat', () => {
  const result=decision({health:5,hostiles:[mob('zombie',6,0,0,1)]});
  assert.equal(result.type,'SURVIVE');
  assert.ok(result.priority>Priority.SELF_DEFENSE);
});

test('guard owner before low-priority work', () => {
  const result=decision({lastOwnerDamageAt:now-300,hostiles:[mob('zombie',8,0,3,2)]});
  assert.equal(result.type,'GUARD');
  assert.ok(result.priority>Priority.PLAYER_TASK);
});

test('no pointless attack without nearby threat', () => {
  assert.equal(decision({hostiles:[mob('zombie',40,0,0,1)]}),null);
});

test('combat equips sword rather than pickaxe or axe of same tier', () => {
  const items=[{name:'iron_axe',type:1},{name:'iron_sword',type:2},{name:'diamond_pickaxe',type:3}];
  assert.equal(chooseWeapon(items).name,'iron_sword');
});

test('harvest tool choice is contextual', () => {
  const items=[{name:'iron_pickaxe'},{name:'iron_axe'},{name:'stone_shovel'}];
  assert.equal(chooseTool(items,'oak_log').name,'iron_axe');
  assert.equal(chooseTool(items,'copper_ore').name,'iron_pickaxe');
  assert.equal(chooseTool(items,'dirt').name,'stone_shovel');
});
