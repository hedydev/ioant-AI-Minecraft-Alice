'use strict'
// Opt-in A/B of Mineflayer's Bedrock client factory against the proven
// read-only native connector's exact bedrock-protocol.createClient options.
// Keep auth cache, server online-mode, and gameplay behavior unchanged.
const {clientOptions}=require('./client_options.cjs')
const {attachInjectedClientInitialization}=require('./injected_client_initialization.cjs')
const DEFAULT_MODE='mineflayer'
const BASELINE_MODE='legacy-native-injected'
function connectionMode(env=process.env){
  const mode=env.ALICE_BEDROCK_CLIENT_MODE||DEFAULT_MODE
  if(mode!==DEFAULT_MODE&&mode!==BASELINE_MODE)
    throw Error('Invalid ALICE_BEDROCK_CLIENT_MODE (mineflayer or legacy-native-injected)')
  return mode
}
function legacyNativeOptions(verified,onMsaCode){
  const c=clientOptions(verified) // Must pass the existing local-port/profile checks.
  return {host:c.host,port:c.port,username:c.username,offline:false,
    profilesFolder:c.profilesFolder,raknetBackend:c.raknetBackend,
    useRaknetWorkers:false,followPort:false,onMsaCode}
}
function createLegacyNativeClient(verified,{createClient,onMsaCode}={}){
  if(typeof createClient!=='function')throw Error('bedrock-protocol.createClient is required')
  const client=createClient(legacyNativeOptions(verified,onMsaCode))
  if(!client||!client.options)throw Error('bedrock-protocol client must expose its options')
  // Mineflayer's loader already supports a supplied, Bedrock-marked client.
  client.bedrock=true
  attachInjectedClientInitialization(client)
  return client
}
module.exports={connectionMode,legacyNativeOptions,createLegacyNativeClient,DEFAULT_MODE,BASELINE_MODE}
