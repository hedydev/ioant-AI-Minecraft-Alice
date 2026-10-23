'use strict'
// The pinned Bedrock 1.26.51 Mineflayer fork sends nonzero move_vector and
// raw_move_vector, but hardcodes analogue_move_vector to {x:0,z:0}.
// Official Mojang 2193 documents analog as another form of movement vector.
// Conservative operator-only experiment: align analog to the raw/desired
// direction ONLY when all other movement fields are consistent.
// Does not generate input, modify client position, or touch BDS/world/auth.
const ENABLE='official_2193_analog'
const isVec=v=>!!v&&Number.isFinite(v.x)&&Number.isFinite(v.z)&&
  Math.abs(v.x)<=1.001&&Math.abs(v.z)<=1.001
const close=(a,b)=>Math.abs(a-b)<0.0001
const same=(a,b)=>close(a.x,b.x)&&close(a.z,b.z)
function correct(packet){
  if(!packet||!isVec(packet.move_vector)||!isVec(packet.raw_move_vector)||
     !isVec(packet.analogue_move_vector))return null
  const vector=packet.move_vector,raw=packet.raw_move_vector,analog=packet.analogue_move_vector
  if(same(vector,{x:0,z:0})||!same(vector,raw)||!same(analog,{x:0,z:0}))
    return null
  if(packet.input_mode!=='mouse'||packet.play_mode!=='screen'||
     packet.interaction_model!=='touch')return null
  // Never touch vehicle inputs, where movement intent may refer to a mount.
  if(packet.predicted_vehicle!=null||
     (Array.isArray(packet.input_data)&&packet.input_data.includes('client_predicted_vehicle')))
    return null
  // Clone only two tiny plain objects. All other protocol fields retain
  // their original identity and value, including tick, position and flags.
  return {...packet,analogue_move_vector:{x:vector.x,z:vector.z}}
}
function attachAnalogMoveCompat(client,{enabled=false}={}){
  if(!client||typeof client.queue!=='function')throw Error('missing_bedrock_packet_queue')
  let corrected=0,skipped=0
  if(!enabled)return {enabled:false,summary:()=>({enabled:false,corrected:0,skipped:0}),
    detach:()=>{}}
  const original=client.queue
  function wrapper(name,packet){
    if(name!=='player_auth_input')return original.apply(this,arguments)
    const patched=correct(packet)
    if(!patched){skipped++;return original.apply(this,arguments)}
    const args=Array.from(arguments);args[1]=patched
    const ret=original.apply(this,args)
    corrected++
    return ret
  }
  client.queue=wrapper
  return {
    enabled:true,summary:()=>({enabled:true,corrected,skipped}),
    detach:()=>{if(client.queue===wrapper)client.queue=original}
  }
}
module.exports={ENABLE,correct,attachAnalogMoveCompat}
