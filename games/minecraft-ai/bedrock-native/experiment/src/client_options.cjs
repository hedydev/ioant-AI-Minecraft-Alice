'use strict'
// Keep the autonomous Alice's transport/auth settings aligned with the
// previously proven chat-only native connector. Do not pass tokens to logs.
const BACKENDS=new Set(['raknet-native','jsp-raknet','raknet-node'])
function clientOptions(c,{platform=process.platform}={}){
  if(!c||c.host!=='127.0.0.1'||![17879,17880].includes(c.port))
    throw Error('Alice Bedrock connection must target verified local 17879 or 17880')
  const raknetBackend=c.raknetBackend||(platform==='linux'?'raknet-native':'jsp-raknet')
  if(!BACKENDS.has(raknetBackend))throw Error('Invalid ALICE_BEDROCK_RAKNET_BACKEND')
  if(!c.authRoot||!c.profile)throw Error('Alice Xbox profile and auth cache directory required')
  return {
    edition:'bedrock',
    version:'bedrock_1.26.51', // Mineflayer blocks/physics registry pin, NOT another Xbox identity
    host:c.host,port:c.port,
    username:c.profile,offline:false,profilesFolder:c.authRoot,
    raknetBackend,useRaknetWorkers:false,followPort:false,
    respawn:true
  }
}
function connectionSummary(options){
  // Safe fields only, never print cached auth tokens, JWT, XUID or certificates.
  return {host:options.host,port:options.port,version:options.version,
    raknetBackend:options.raknetBackend,useRaknetWorkers:options.useRaknetWorkers,
    followPort:options.followPort,offline:options.offline}
}
module.exports={clientOptions,connectionSummary}
