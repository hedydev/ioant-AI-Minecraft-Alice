import test from 'node:test';
import assert from 'node:assert/strict';
import {planExtraDeposit,storeExtrasInNearbyChest,takeItemsForTrip,tossItemNearVisiblePlayer} from '../runtime/alice_modules/storage.js';
const pos=x=>({x,distanceTo(o){return Math.abs(x-o.x)}});
function fixture(){
 const items=[{name:'oak_log',type:10,count:20},{name:'iron_sword',type:77,count:1}];
 const bot={entity:{position:pos(0)},health:20,interrupt_code:false,
 inventory:{items:()=>items,inventoryStart:0,inventoryEnd:3,slots:[items[0],items[1],null]},
 players:{Steve:{entity:{position:pos(2)}}}};
 return {bot,items,block:{name:'chest',position:pos(3)}};
}
test('extras planner retains supplies and never chooses equipment',()=>{
 const p=planExtraDeposit([{name:'oak_log',type:1,count:20},{name:'iron_sword',type:2,count:1}]);
 assert.equal(p.length,1);assert.equal(p[0].amount,12);
});
test('deposit verifies real decrement and closes container',async()=>{
 const {bot,items,block}=fixture();let closed=false;
 bot.openContainer=async()=>({async deposit(type,meta,n){assert.equal(type,10);items[0].count-=n;},async close(){closed=true;}});
 const r=await storeExtrasInNearbyChest(bot,block);
 assert.deepEqual(r.moved,[{name:'oak_log',count:12}]);assert.equal(closed,true);assert.equal(items[1].count,1);
});
test('withdraw rejects absent materials; closes the window',async()=>{
 const {bot,items,block}=fixture();let closed=0;
 bot.openContainer=async()=>({containerItems(){return [{name:'oak_log',type:10,count:20}];},
 async withdraw(type,meta,n){items[0].count+=n;},async close(){closed++;}});
 assert.equal((await takeItemsForTrip(bot,block,'oak_log',5)).received,5);assert.equal(closed,1);
 await assert.rejects(()=>takeItemsForTrip(bot,block,'diamond',3),/Insufficient/);assert.equal(closed,2);
});
test('toss checks player proximity and never claims confirmed pickup',async()=>{
 const {bot,items}=fixture();bot.toss=async(_,__,n)=>{items[0].count-=n;};
 assert.deepEqual(await tossItemNearVisiblePlayer(bot,'Steve','oak_log',4),
 {name:'oak_log',tossed:4,recipient:'Steve',pickupConfirmed:false});
 await assert.rejects(()=>tossItemNearVisiblePlayer(bot,'Alex','oak_log',4),/visible/);
});
