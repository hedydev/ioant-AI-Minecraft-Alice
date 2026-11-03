'use strict'
// Passive, bounded diagnostic. No packet edits, extra sends or permissions.
const bit=(v)=>typeof v==='boolean'?v:null
function uniqueId(v){
 try{
  if(Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))
   return BigInt.asIntN(64,(BigInt(v[0])<<32n)|BigInt(v[1])).toString()
  if(typeof v==='number'&&!Number.isSafeInteger(v))return null
  if(!['number','string','bigint'].includes(typeof v)||!/^[-0-9]{1,21}$/.test(String(v)))return null
  const n=BigInt(v)
  return n>=-(1n<<63n)&&n<(1n<<63n)?n.toString():null
 }catch{return null}
}
function attachInteractionAudit(bot){
 const client=bot._client,original=client.queue
 let own=null,closed=false,permission=null,clicks=0,errors=0,last=null
 const start=p=>{own=uniqueId(p?.entity_id);permission=null;clicks=0;errors=0;last=null}
 const abilities=p=>{
  const self=own??uniqueId(bot.entity?.uniqueId)
  if(!self||uniqueId(p?.entity_unique_id)!==self)return
  const level=p.permission_level
  const role=typeof level==='string'&&['visitor','member','operator','custom'].includes(level)?level:
   Number.isSafeInteger(level)?['visitor','member','operator','custom'][level]??'unknown':'unknown'
  const layers=Array.isArray(p.abilities)?p.abilities:[]
  const flags=(layers.find(x=>x.type==='base')||layers[0])?.enabled||{}
  permission={source:'self_update_abilities',role,
   doorsAndSwitches:bit(flags.doors_and_switches),openContainers:bit(flags.open_containers)}
 }
 function tapped(name,params){
  const transaction=name==='inventory_transaction'&&params?.transaction
  const click=!closed&&transaction?.transaction_type==='item_use'&&
   transaction.transaction_data?.action_type==='click_block'
  let summary=null
  if(click)try{
   const d=transaction.transaction_data,pos=bot.entity?.position
   const eye=bot.entity?.eyeHeight||1.62,p=d.player_pos
   summary={face:Number.isInteger(d.face)&&d.face>=0&&d.face<=5?d.face:null,
    hotbarMatchesLocal:Number.isInteger(d.hotbar_slot)&&d.hotbar_slot===bot.quickBarSlot,
    heldEmpty:d.held_item?.network_id===0,
    hasStackId:bit(d.held_item?.has_stack_id),
    eyePositionMatchesLocal:!!pos&&!!p&&[p.x,p.y,p.z,pos.x,pos.y,pos.z].every(Number.isFinite)&&
      Math.hypot(p.x-pos.x,p.y-pos.y-eye,p.z-pos.z)<=.03}
  }catch{}
  try{
   const result=original.apply(this,arguments)
   if(click){clicks++;last=summary}
   return result
  }catch(err){if(click)errors++;throw err}
 }
 client.on('start_game',start);client.on('update_abilities',abilities)
 client.queue=tapped
 const close=()=>{closed=true;client.off?.('start_game',start);client.off?.('update_abilities',abilities)
  if(client.queue===tapped)client.queue=original}
 client.once('close',close)
 return {get:()=>({version:1,queueOnlyNotNetworkProof:true,
   permissions:permission||{source:'unobserved',role:'unknown',doorsAndSwitches:null,openContainers:null},
   sneaking:bit(bot.controlState?.sneak),usingItem:bit(bot.usingHeldItem),
   blockClicksSerialized:clicks,blockClickErrors:errors,lastClick:last}),close}
}
module.exports={attachInteractionAudit}
