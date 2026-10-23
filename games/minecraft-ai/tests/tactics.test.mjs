import test from 'node:test';
import assert from 'node:assert/strict';
import { decideCombatTactic, selectThreat } from '../runtime/alice_modules/safety_policy.js';
const pos=(x,y,z)=>({x,y,z,distanceTo(other){return Math.hypot(x-other.x,y-other.y,z-other.z)}});
const mob=(name,x)=>({name,position:pos(x,0,0)});
test('critical health retreats; moderate health kites',()=>{
  assert.equal(decideCombatTactic({health:5,enemyType:'zombie',distance:3}),'RETREAT');
  assert.equal(decideCombatTactic({health:11,enemyType:'zombie',distance:3}),'KITE_RECOVER');
});
test('healthy Alice evades recent hit then counters',()=>{
  assert.equal(decideCombatTactic({health:17,enemyType:'zombie',distance:3,lastDamageMs:800}),'EVADE_COUNTER');
  assert.equal(decideCombatTactic({health:17,enemyType:'zombie',distance:3,lastDamageMs:6000}),'ATTACK');
});
test('creeper is not attacked at close range',()=>{
  assert.equal(decideCombatTactic({health:20,enemyType:'creeper',distance:4}),'RETREAT');
});
test('self defense takes priority over command when health moderate',()=>{
  const result=selectThreat({now:10000,health:10,selfPosition:pos(0,0,0),ownerPosition:pos(15,0,0),
    lastSelfDamageAt:9900,hostiles:[mob('zombie',4)]});
  assert.equal(result?.type,'SURVIVE');
});
