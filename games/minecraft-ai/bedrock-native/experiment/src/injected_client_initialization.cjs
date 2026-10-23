'use strict'
// A supplied client bypasses mineflayer/lib/client/bedrock.js createClient,
// including addClientAuthenticity. Restore that pinned b24015a join sequence
// for the verified protocol 2193 only. bedrock-protocol still owns player init.
// Endstone protocol-docs@0db61859 confirms Start=1, End=2 and optional screen ID.
// No auth changes, second connection, synthetic respawn or repeated sends.
function attachInjectedClientInitialization(client){
  let done=false
  function spawn(packet){
    if(done||packet?.status!=='player_spawn')return
    if(client.options?.protocolVersion!==2193)return
    done=true
    client.off('play_status',spawn)
    client.queue('serverbound_loading_screen',{type:1})
    client.queue('client_camera_aim_assist',{preset_id:'',action:'clear',allow_aim_assist:false})
    client.queue('serverbound_loading_screen',{type:2})
    client.emit('alice_initialization',{status:'loading_complete_queued',packets:3})
  }
  client.on('play_status',spawn)
  client.once('close',()=>client.off('play_status',spawn))
}
module.exports={attachInjectedClientInitialization}
