'use strict'
// Read-only local protocol compatibility check. No Minecraft connection,
// account access, BDS commands, packet writes or world modification.
const {probeInstalled}=require('../src/input_flag_compat.cjs')
try{
  const state=probeInstalled()
  console.log(JSON.stringify({
    schema:state.status,version:state.version,protocol:state.protocol,
    flagCount:state.entries,installedCodes:state.codes,
    officialCodes:{up:9,down:10,left:11,right:12,start_sprinting:24,
      start_jumping:30,block_action:34,vertical_collision:49,
      start_spin_attack:53,internal_update:62},
    correctionAvailable:state.status==='known_newer_layout_misnumbered',
    note:'read_only_no_world_or_login'
  },null,2))
  if(state.status==='unknown_schema')process.exitCode=2
}catch(err){
  console.error('protocol_probe_unavailable:',/^[a-z_]{1,60}$/.test(err.message)
    ?err.message:err.constructor.name)
  process.exitCode=2
}
