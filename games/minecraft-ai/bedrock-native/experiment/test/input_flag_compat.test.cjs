'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {WIRE_2193,category,snapshot,apply,applyInstalled}=require('../src/input_flag_compat.cjs')
function schema(list){return {types:{InputData:['mapper',{type:'zigzag32',
 mappings:Object.fromEntries(list.map((name,i)=>[String(i),name]))}]}}}
// Explicit values from the 1.26.51.1 BDS dump, not array offsets in beta JSON.
const codes={up:10,down:11,left:12,right:13,start_sprinting:25,start_jumping:31,
 block_action:35,vertical_collision:50,start_spin_attack:56,internal_update:65}
test('stable BDS wire numbering retains reserved entries',()=>{
 assert.equal(WIRE_2193.length,66)
 assert.deepEqual(snapshot(schema(WIRE_2193)).codes,codes)
 assert.equal(WIRE_2193[2],'north_jump')
 assert.equal(WIRE_2193[54],'camera_relative_movement_enabled')
 assert.equal(WIRE_2193[55],'rot_controlled_by_move_direction')
})
test('default and legacy opt-in never renumber the correct installed mapping',()=>{
 const d=schema(WIRE_2193),ref=d.types.InputData[1].mappings,before=JSON.stringify(d)
 for(const options of [{},{optIn:'official_2193'}]){
  assert.deepEqual(apply(d,options),{status:'stable_bds_2193',applied:false})
  assert.equal(d.types.InputData[1].mappings,ref);assert.equal(JSON.stringify(d),before)
 }
})
test('previous 63-entry override is rejected, never mistaken for verified protocol',()=>{
 const d=schema(WIRE_2193.filter(x=>!['north_jump','camera_relative_movement_enabled','rot_controlled_by_move_direction'].includes(x)))
 assert.equal(category(d),'incorrect_63_entry_override')
 assert.throws(()=>apply(d,{optIn:'official_2193'}),/refuse_unverified_input_flag_mapping/)
})
test('unknown mapping is rejected without modification',()=>{
 const flags=WIRE_2193.slice();flags[10]='unexpected_flag'
 const d=schema(flags),before=JSON.stringify(d)
 assert.equal(category(d),'unknown_schema')
 assert.throws(()=>apply(d,{optIn:'official_2193'}),/refuse_unverified_input_flag_mapping/)
 assert.equal(JSON.stringify(d),before)
})
test('unsupported mapper shapes fail explicitly',()=>{
 for(const d of [null,{types:{}},{types:{InputData:['bitflags',{flags:[]}]}}])
  assert.throws(()=>category(d),/unsupported_input_data_schema/)
})
let codec
try{codec=require('bedrock-protocol/src/transforms/serializer')}catch{}
test('legacy opt-in retains actual serializer bytes for stable BDS IDs',{skip:!codec},()=>{
 const result=applyInstalled({ALICE_BEDROCK_INPUT_FLAG_COMPAT:'official_2193'})
 assert.equal(result.applied,false)
 const p=codec.createProtocol('1.26.51')
 // Signed-varint zigzag for explicit enum IDs 10,31,50,65 respectively.
 for(const [flag,hex] of [['up','14'],['start_jumping','3e'],['vertical_collision','64'],['internal_update','8201']])
  assert.equal(p.createPacketBuffer('InputData',flag).toString('hex'),hex)
})
