'use strict'
const {attachOutboundInputAudit}=require('./outbound_input_audit.cjs')
const {attachAnalogMoveCompat}=require('./analog_move_compat.cjs')
function attachOutboundInputPipeline(client,{audit=false,analog=false}={}){
  // queue -> compatibility -> audit -> serializer. The probe must compare
  // the corrected object with its bytes, not the pre-correction caller input.
  const outboundInputAudit=audit?attachOutboundInputAudit(client):null
  const analogCompat=attachAnalogMoveCompat(client,{enabled:analog})
  const detach=()=>{analogCompat.detach();outboundInputAudit?.detach()}
  client.prependOnceListener('close',detach)
  return {outboundInputAudit,analogCompat,detach}
}
module.exports={attachOutboundInputPipeline}
