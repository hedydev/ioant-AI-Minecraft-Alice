'use strict'
// Validate the installed stable BDS 1.26.51.1 mapping, never renumber it.
// Endstone protocol-docs@0db6185921974b5aba4a30af33a5eed842dd2cb9
// extracts explicit numeric values from that server: Up=10, StartJumping=31.
// Mojang's beta.1 JSON enum omits reserved members and has no numeric values;
// array offsets are NOT wire IDs. The former 63-entry rewrite was incorrect.
// Keep the old environment switch as a validation-only migration alias.
const {createRequire}=require('node:module')
const VERSION='bedrock_1.26.51'
const OPT_IN='official_2193'
const OMITTED_ENUM_NAMES=Object.freeze((
  'ascend descend jump_down sprint_down change_height jumping auto_jumping_in_water sneaking sneak_down '+
  'up down left right up_left up_right want_up want_down want_down_slow want_up_slow sprinting '+
  'ascend_block descend_block sneak_toggle_down persist_sneak start_sprinting stop_sprinting '+
  'start_sneaking stop_sneaking start_swimming stop_swimming start_jumping start_gliding stop_gliding '+
  'item_interact block_action item_stack_request handled_teleport emoting missed_swing start_crawling '+
  'stop_crawling start_flying stop_flying received_server_data client_predicted_vehicle '+
  'paddling_left paddling_right block_breaking_delay_enabled horizontal_collision vertical_collision '+
  'down_left down_right start_using_item start_spin_attack stop_spin_attack hotbar_only_touch '+
  'jump_released_raw jump_pressed_raw jump_current_raw sneak_released_raw sneak_pressed_raw '+
  'sneak_current_raw internal_update'
).split(' '))
const WIRE_2193=Object.freeze((()=>{
  const flags=OMITTED_ENUM_NAMES.slice()
  flags.splice(2,0,'north_jump')
  flags.splice(54,0,'camera_relative_movement_enabled','rot_controlled_by_move_direction')
  return flags
})())
const SCHEMA_CHECKS=Object.freeze(['up','down','left','right','start_sprinting',
  'start_jumping','block_action','vertical_collision','start_spin_attack','internal_update'])
function mapper(schema){
  const t=schema?.types?.InputData
  if(!Array.isArray(t)||t[0]!=='mapper'||t[1]?.type!=='zigzag32'||
     !t[1]?.mappings||typeof t[1].mappings!=='object'||Array.isArray(t[1].mappings))
    throw Error('unsupported_input_data_schema')
  return t[1].mappings
}
function matches(map,list){
  const keys=Object.keys(map)
  return keys.length===list.length&&keys.every(key=>/^(0|[1-9][0-9]*)$/.test(key))&&
    list.every((name,i)=>map[String(i)]===name)
}
function category(schema){
  const m=mapper(schema)
  if(matches(m,WIRE_2193))return 'stable_bds_2193'
  if(matches(m,OMITTED_ENUM_NAMES))return 'incorrect_63_entry_override'
  return 'unknown_schema'
}
function snapshot(schema){
  const m=mapper(schema)
  const state=category(schema)
  const result={version:VERSION,protocol:2193,status:state,entries:Object.keys(m).length}
  result.codes=Object.fromEntries(SCHEMA_CHECKS.map(name=>[
    name,Number(Object.keys(m).find(k=>m[k]===name)??-1)]))
  return result
}
function apply(schema,{optIn}={}){
  const before=category(schema)
  if(optIn!==OPT_IN)return {status:before,applied:false}
  if(before!=='stable_bds_2193')throw Error('refuse_unverified_input_flag_mapping')
  return {status:before,applied:false}
}

function loadSerializerData(){
  const serializer=require.resolve('bedrock-protocol/src/transforms/serializer')
  const fromSerializer=createRequire(serializer)
  const registry=fromSerializer('minecraft-data')(VERSION)
  if(!registry?.protocol)throw Error('bedrock_1_26_51_protocol_missing')
  return registry
}
function probeInstalled(){
  const data=loadSerializerData()
  return snapshot(data.protocol)
}
function applyInstalled(env=process.env){
  const flag=env.ALICE_BEDROCK_INPUT_FLAG_COMPAT
  if(flag!==undefined&&flag!==OPT_IN)
    throw Error('invalid_ALICE_BEDROCK_INPUT_FLAG_COMPAT')
  const data=loadSerializerData()
  return apply(data.protocol,{optIn:flag})
}
module.exports={VERSION,OPT_IN,WIRE_2193,category,snapshot,apply,
  loadSerializerData,probeInstalled,applyInstalled}
