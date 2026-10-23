import test from 'node:test';
import assert from 'node:assert/strict';
import {planMaterialNeeds} from '../runtime/alice_modules/recipe_plan.js';
const recipes={wooden_sword:{ingredients:{oak_planks:2,stick:1},produced:1,requiresTable:true},
 stick:{ingredients:{oak_planks:2},produced:4},
 oak_planks:{ingredients:{oak_log:1},produced:4},
 crafting_table:{ingredients:{oak_planks:4},produced:1}};
const get=n=>recipes[n]||null;
test('dependency chain identifies raw logs and workbench',()=>{
 const p=planMaterialNeeds('wooden_sword',1,{},get);
 assert.equal(p.missing.oak_log,2);assert.equal(p.materialsAvailable,false);
 assert.ok(p.steps.some(s=>s.item==='crafting_table'));
 assert.equal(p.steps.at(-1).item,'wooden_sword');
});
test('existing inventory reduces the missing list',()=>{
 const p=planMaterialNeeds('wooden_sword',1,{oak_planks:4,stick:1,crafting_table:1},get);
 assert.deepEqual(p.missing,{});assert.equal(p.materialsAvailable,true);
});
test('unknown materials explicit and cycles rejected',()=>{
 assert.deepEqual(planMaterialNeeds('diamond',2,{},get).missing,{diamond:2});
 assert.throws(()=>planMaterialNeeds('a',1,{},n=>({ingredients:{a:1}})),/cycle/);
});
