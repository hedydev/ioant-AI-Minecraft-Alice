'use strict'
// The pinned native interact plugin sends referenceBlock.stateId as the wire
// runtime ID. Chunk decoding deliberately exposes a LOCAL palette stateId.
// Adapt only observed wooden doors/beds at the public activateBlock boundary.
// Reuse the installed Block hash and prove its inverse in the ONLINE registry;
// never mutate world blocks, packet serializers, registry data or input flags.
const path=require('node:path'),{createRequire}=require('node:module')
const TARGET=/^(?:(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door|(?:[a-z]+_)?bed)$/
const wireId=n=>Number.isInteger(n)&&n>=-0x80000000&&n<=0xffffffff?n>>>0:null
function installedBlock(registry){
 const entry=require.resolve('mineflayer')
 const fromInteract=createRequire(path.join(path.dirname(entry),'lib','bedrock_plugins','interact.js'))
 return fromInteract('prismarine-block')(registry)
}
function networkBlock(registry,block,Block){
 const stateId=block?.stateId
 if(!Number.isSafeInteger(stateId)||stateId<0)throw Error('block_local_state_unverified')
 const state=registry?.blockStates?.[stateId]
 const name=String(block.name||'').replace(/^minecraft:/,'')
 if(!state||String(state.name).replace(/^minecraft:/,'')!==name||!state.states||
    registry.supportFeature?.('blockHashes')!==true||typeof Block?.getHash!=='function')
  throw Error('block_hash_registry_unverified')
 const hash=Block.getHash(state.name,state.states),id=wireId(hash)
 const inverse=registry.blocksByRuntimeId?.[hash]??registry.blocksByRuntimeId?.[id]
 if(id===null||inverse?.stateId!==stateId)
  throw Error('block_hash_inverse_unverified')
 // _genericPlace reads position and stateId only from this reference. The
 // original observed Block and getProperties must keep their local stateId.
 const reference=Object.create(block)
 Object.defineProperty(reference,'stateId',{value:id,enumerable:true})
 return reference
}
function attachBlockInteractionCompat(bot,{loadBlock=installedBlock}={}){
 let hashed=null,original=null,wrapped=null,closed=false,registry=null,Block=null
 const start=p=>{hashed=typeof p?.block_network_ids_are_hashes==='boolean'?p.block_network_ids_are_hashes:null
  registry=null;Block=null}
 const install=()=>{
  if(closed||wrapped)return
  if(typeof bot.activateBlock!=='function')throw Error('native_activate_block_unavailable')
  original=bot.activateBlock
  wrapped=function(block,...args){
   const targeted=TARGET.test(String(block?.name||'').replace(/^minecraft:/,''))
   if(!targeted||hashed===false)return original.call(this,block,...args)
   if(hashed!==true)throw Error('block_network_mode_unobserved')
   if(registry!==bot.registry){registry=bot.registry;Block=loadBlock(registry)}
   const reference=networkBlock(registry,block,Block)
   return original.call(this,reference,...args)
  }
  bot.activateBlock=wrapped
 }
 const close=()=>{closed=true;bot.off?.('inject_allowed',install);bot._client.off?.('start_game',start)
  if(wrapped&&bot.activateBlock===wrapped)bot.activateBlock=original}
 bot._client.on('start_game',start)
 // Mineflayer injects its native plugins in the earlier registered listener.
 bot.once('inject_allowed',install);bot._client.once('close',close)
 return {close}
}
module.exports={attachBlockInteractionCompat,networkBlock,wireId}
