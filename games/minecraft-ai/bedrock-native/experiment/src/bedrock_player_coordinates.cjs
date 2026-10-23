'use strict'
// Mineflayer Bedrock fork add_player currently stores packet.position directly;
// its move_player handler later converts wire eye Y to Prismarine feet Y.
// Normalise ONLY the initial add_player event for OTHER players, once per
// entity instance. This is read-only game-world-wise: changes no packets.
const DEFAULT_PLAYER_EYE_HEIGHT=1.62
const finitePosition=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
function normalizeRemotePlayerSpawn(entity, selfEntity){
  if(!selfEntity||!entity||entity===selfEntity||entity.type!=='player'||!finitePosition(entity.position))return null
  const offset=Number.isFinite(entity.eyeHeight)&&entity.eyeHeight>0&&entity.eyeHeight<=2
    ?entity.eyeHeight:DEFAULT_PLAYER_EYE_HEIGHT
  entity.position.y-=offset
  return {username:typeof entity.username==='string'?entity.username.slice(0,48):'unknown',eyeHeight:offset}
}
function attachBedrockPlayerCoordinates(bot,{log=console}={}){
  if(!bot||typeof bot.on!=='function')throw Error('Bedrock bot event emitter required')
  const normalized=new WeakSet()
  const onSpawn=entity=>{
    if(!entity||normalized.has(entity))return
    const result=normalizeRemotePlayerSpawn(entity,bot.entity)
    if(!result)return
    normalized.add(entity)
    log.log('[Alice follow] remote player spawn position aligned to feet:',JSON.stringify(result))
  }
  bot.on('entitySpawn',onSpawn)
  return ()=>bot.off?.('entitySpawn',onSpawn)
}
module.exports={normalizeRemotePlayerSpawn,attachBedrockPlayerCoordinates,DEFAULT_PLAYER_EYE_HEIGHT}
