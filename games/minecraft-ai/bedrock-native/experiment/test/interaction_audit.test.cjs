'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {attachInteractionAudit}=require('../src/interaction_audit.cjs')
function fixture(){
 const client=new EventEmitter();let calls=0,throwing=false
 client.queue=function(name,params){assert.equal(this,client);calls++;if(throwing)throw Error('serialization_failure');return params}
 const original=client.queue,bot={_client:client,quickBarSlot:0,
  entity:{position:{x:1,y:64,z:1},eyeHeight:1.62},controlState:{sneak:false},usingHeldItem:false}
 return {client,original,bot,audit:attachInteractionAudit(bot),calls:()=>calls,throwNow:()=>{throwing=true}}
}
test('only exact self server ability packets establish an anonymous role',()=>{
 const f=fixture();f.client.emit('start_game',{entity_id:-7n})
 const p={entity_unique_id:-8n,permission_level:'operator',abilities:[{type:'base',enabled:{doors_and_switches:true}}]}
 f.client.emit('update_abilities',p);assert.equal(f.audit.get().permissions.source,'unobserved')
 p.entity_unique_id=-7n;p.permission_level='member';f.client.emit('update_abilities',p)
 assert.deepEqual(f.audit.get().permissions,{source:'self_update_abilities',role:'member',doorsAndSwitches:true,openContainers:null})
 assert(!JSON.stringify(f.audit.get()).includes('entity_unique_id'))
 f.client.emit('start_game',{entity_id:9n});assert.equal(f.audit.get().permissions.source,'unobserved')
})
test('click observation preserves original queue identity, payload and returned result; errors rethrow',()=>{
 const f=fixture(),params={transaction:{transaction_type:'item_use',transaction_data:{action_type:'click_block',face:4,
  hotbar_slot:0,player_pos:{x:1,y:65.62,z:1},held_item:{network_id:0,has_stack_id:false}}}}
 assert.equal(f.client.queue('inventory_transaction',params),params)
 assert.equal(f.calls(),1);assert.equal(f.audit.get().blockClicksSerialized,1)
 assert.equal(f.audit.get().lastClick.eyePositionMatchesLocal,true)
 assert.equal(f.audit.get().lastClick.heldEmpty,true)
 f.throwNow();assert.throws(()=>f.client.queue('inventory_transaction',params),/serialization_failure/)
 assert.equal(f.audit.get().blockClicksSerialized,1);assert.equal(f.audit.get().blockClickErrors,1)
 f.audit.close();assert.equal(f.client.queue,f.original)
})
test('self start-game role and block-network hash mode are not inferred from server defaults',()=>{
 const f=fixture()
 f.client.emit('start_game',{entity_id:-7n,permission_level:1,block_network_ids_are_hashes:true,server_authoritative_inventory:false})
 assert.equal(f.audit.get().permissions.source,'start_game_self')
 assert.equal(f.audit.get().permissions.role,'member')
 assert.equal(f.audit.get().permissions.doorsAndSwitches,null)
 assert.deepEqual(f.audit.get().serverPolicy,{blockNetworkIdsHashed:true,authoritativeInventory:false})
 assert.equal(f.calls(),0)
})
