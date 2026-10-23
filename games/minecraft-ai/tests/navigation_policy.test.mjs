import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAdvance } from '../runtime/alice_modules/terrain_policy.js';
import { normalizeFix } from '../runtime/alice_modules/tracking.js';

const block=(name,solid=true)=>({name,boundingBox:solid?'block':'empty'});
const stone=block('stone'),air=block('air',false),lava=block('lava');
const floor={
  currentFloor:stone,aheadFloor:stone,aheadFeet:air,aheadHead:air,stepHead:air,
  leftFloor:stone,rightFloor:stone
};
test('one block wide bridge is a cautious passable walkway',()=>{
  const result=classifyAdvance({...floor,leftFloor:air,rightFloor:air});
  assert.deepEqual([result.status,result.canStep,result.narrow],['NARROW',true,true]);
});
test('unloaded or unknown forward blocks are not presumed safe',()=>{
  const result=classifyAdvance({...floor,aheadFloor:null});
  assert.equal(result.status,'UNKNOWN');assert.equal(result.canStep,false);
});
test('cliff gap and lava rejected before forward jump',()=>{
  assert.equal(classifyAdvance({...floor,aheadFloor:air}).status,'DROP_OR_VOID');
  assert.equal(classifyAdvance({...floor,aheadFloor:lava}).status,'HAZARD');
});
test('supported one block step requires sufficient headroom',()=>{
  assert.equal(classifyAdvance({...floor,aheadFeet:stone}).status,'STEP_UP');
  assert.equal(classifyAdvance({...floor,aheadFeet:stone,stepHead:stone}).canStep,false);
});
test('trusted remote location requires current dimension and timestamp',()=>{
  const now=Date.now();
  const valid={x:120,y:70,z:-40,dimension:'minecraft:overworld',updatedAt:now};
  assert.equal(normalizeFix(valid,'minecraft:overworld')?.x,120);
  assert.equal(normalizeFix({...valid,updatedAt:now-120000},'minecraft:overworld'),null);
  assert.equal(normalizeFix(valid,'minecraft:the_nether'),null);
  assert.equal(normalizeFix({...valid,x:Infinity},'minecraft:overworld'),null);
});
