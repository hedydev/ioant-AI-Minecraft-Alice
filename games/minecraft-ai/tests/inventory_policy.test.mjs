import test from 'node:test';
import assert from 'node:assert/strict';
import {inventorySnapshot,formatInventory,isInventoryQuery,isLocationQuery,formatLocation} from '../runtime/alice_modules/inventory_policy.js';
import {nearbyWoodCandidates,parseWoodCountRequest,parseCountReply,woodDistance} from '../runtime/alice_modules/wood_policy.js';
test('inventory counts real slots; never guesses capacity when metadata missing',()=>{
 const inventory={inventoryStart:2,inventoryEnd:5,slots:[{name:'helmet'},null,{name:'oak_log'},{name:'oak_log'},null],items(){return [{name:'oak_log',count:5},{name:'oak_log',count:3}]}};
 let s=inventorySnapshot({inventory});assert.equal(s.freeSlots,1);assert.equal(s.totalSlots,3);
 assert.equal(s.items[0].count,8);assert.match(formatInventory(s),/橡木原木×8/);
 inventory.slots[4]={name:'dirt'};assert.equal(inventorySnapshot({inventory}).freeSlots,0);
 delete inventory.inventoryEnd;s=inventorySnapshot({inventory});assert.equal(s.slotsKnown,false);
 assert.doesNotMatch(formatInventory(s),/剩0格/);
});
test('inventory/location read-only requests do not swallow movement/storage commands',()=>{
 for(const s of ['背包','背包有什么','你的背包里有什么','查看背包','物品栏状态'])assert.equal(isInventoryQuery(s),true,s);
 for(const s of ['你在哪里','你现在在哪里','你的坐标','报告位置'])assert.equal(isLocationQuery(s),true,s);
 assert.equal(isInventoryQuery('把木头放箱子里'),false);
 assert.equal(isLocationQuery('去坐标 5 3 2'),false);
 assert.match(formatLocation({entity:{position:{x:1.9,y:64.4,z:-2.1}},game:{dimension:'minecraft:overworld'}}),/1, 64, -3/);
});
test('wood candidate chooses truly near wood inside original work area',()=>{
 const b=x=>({name:'oak_log',position:{x,y:64,z:0}});
 const start={x:0,y:64,z:0},current={x:5,y:64,z:0};
 const chosen=nearbyWoodCandidates([b(22),b(12),b(7),b(1)],start,current);
 assert.deepEqual(chosen.map(x=>x.position.x),[7,1,12]);assert.equal(woodDistance(chosen[0],current),2);
 assert.deepEqual(nearbyWoodCandidates([b(7)],start,current,{excluded:[{x:7,y:64,z:0}]}),[]);
});
test('wood amount clarification is bounded and does not replace explicit-count commands',()=>{
 assert.deepEqual(parseWoodCountRequest('Alice，收集木头'),{needsCount:true});
 assert.equal(parseWoodCountRequest('收集10个木头'),null);
 assert.equal(parseCountReply('10个'),10);assert.equal(parseCountReply('128'),128);
 assert.equal(parseCountReply('129'),null);assert.equal(parseCountReply('你好'),null);
});
