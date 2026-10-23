'use strict'
/** Isolated native Bedrock connector for AliceAI phase 1 (chat/status only).
 * DOES NOT MOVE, DIG, PLACE, FIGHT, OR ACCESS SERVER WORLD FILES.
 * Existing Paper/Mindcraft Alice remains a separate process.
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const cp = require('node:child_process')
const { parseInstruction, responseFor } = require('./commands.cjs')
const { createNativeAliceBrain } = require('./shared_brain.cjs')
const { attachConnectionAudit } = require('../connection_audit.cjs')
const { acquireAliceInstanceLock } = require('../instance_lock.cjs')
const { installSignalShutdown } = require('../session_lifecycle.cjs')
const { assertBdsSessionReleased } = require('../server_session_guard.cjs')

const PROJECT = path.resolve(__dirname, '..', '..')
const ALICE_SERVER = path.join(os.homedir(), 'minecraft-bedrock')
const BACKUP_VERIFY = path.join(PROJECT, 'scripts', 'verify-world-backup.py')

function config(env = process.env) {
  const host = env.ALICE_BEDROCK_HOST || '127.0.0.1'
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('Bedrock target must be the local Mint server (127.0.0.1)')
  const port = Number(env.ALICE_BEDROCK_PORT || '17879')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Bedrock port')
  const username = (env.ALICE_BEDROCK_PROFILE || 'AliceAI-Bedrock').trim()
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(username)) throw new Error('Invalid Bedrock auth profile/cache name')
  const authRoot = path.join(os.homedir(), '.alice-bedrock-auth')
  const raknetBackend = env.ALICE_BEDROCK_RAKNET_BACKEND || (process.platform === 'linux' ? 'raknet-native' : 'jsp-raknet')
  if (!['raknet-native', 'jsp-raknet', 'raknet-node'].includes(raknetBackend)) throw new Error('Invalid RakNet backend')
  return { host, port, username, authRoot, raknetBackend, botName: 'AliceAI',
    manifest: env.ALICE_BEDROCK_BACKUP_MANIFEST,
    serverDir: env.ALICE_BEDROCK_SERVER_DIR || ALICE_SERVER,
    worldDir: env.ALICE_BEDROCK_WORLD_DIR || 'Bedrock level' }
}

function readProperties(dir) {
  const file = path.join(dir, 'server.properties')
  const contents = fs.readFileSync(file, 'utf8')
  const p = {}
  for (const line of contents.split(/\r?\n/)) {
    if (line.startsWith('#') || !line.includes('=')) continue
    const idx=line.indexOf('=')
    p[line.slice(0,idx).trim()]=line.slice(idx+1).trim()
  }
  return p
}

function validateStartup(c, { run = cp.spawnSync, read = fs.readFileSync } = {}) {
  if (!c.manifest) throw new Error('Real bedrock-default world backup required: set ALICE_BEDROCK_BACKUP_MANIFEST')
  if (!c.worldDir || c.worldDir.includes('/') || c.worldDir === '.' || c.worldDir === '..')
    throw new Error('Invalid world directory name')
  const props=readProperties(c.serverDir)
  if (props['online-mode'] !== 'true') throw new Error('Expected online-mode=true; do not disable Xbox authentication')
  if (Number(props['server-port']) !== c.port) throw new Error('Configured server-port differs from target; inspect bedrock-default')
  const manifest=JSON.parse(read(c.manifest, 'utf8'))
  if (!Array.isArray(manifest.worlds) || !manifest.worlds.includes('worlds/'+c.worldDir))
    throw new Error('World backup does not include intended bedrock-default world directory')
  const v=run('python3',[BACKUP_VERIFY,'--manifest',c.manifest,'--expected-server',c.serverDir],
    { encoding:'utf8',timeout:180000,maxBuffer:1024*1024 })
  if (v.error || v.status !== 0)
    throw new Error('Backup restore verification failed: '+(v.error?.message||v.stderr||v.status))
  console.log('[Alice Bedrock] verified world backup and isolated restore:',c.worldDir)
}

function sendChat(client, message, { isReady = true, log = console }={}) {
  if (!isReady || typeof client.queue !== 'function') return false
  const text=String(message||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,170)
  if (!text) return false
  try {
    client.queue('text',{type:'chat',needs_translation:false,
      source_name:client.username || '',xuid:'',platform_chat_id:'',filtered_message:'',message:text})
    return true
  } catch(err) {
    log.error('[Alice Bedrock] failed to send chat:',err.message)
    return false
  }
}

function createMessageHandler({ client, ownName = 'AliceAI', brain = null, log=console, cooldownMs=1300, now=Date.now }) {
  const responses=new Map()
  let spawned=false
  let alive=true
  return {
    onSpawn() {spawned=true; brain?.onSpawn()},
    onEnd() {alive=false; brain?.onEnd()},
    onText(packet) {
      if (!alive || !spawned || !packet || packet.type !== 'chat') return
      const sender=String(packet.source_name||'').trim()
      if (!sender || sender.toLowerCase() === ownName.toLowerCase() ||
          sender.toLowerCase() === String(client?.username||'').toLowerCase() ||
          sender.startsWith('§')) return
      // A bare count reply is accepted ONLY while this player's own
      // pending request is still valid; no broad numeric command routing.
      let cmd=parseInstruction(packet.message,ownName)
      if (!cmd && brain?.hasPendingCount(sender)) cmd=String(packet.message||'').trim()
      if (!cmd) return
      const timestamp=now()
      const last=responses.get(sender)||0
      if (timestamp-last<cooldownMs) return
      responses.set(sender,timestamp)
      const response=brain ? brain.respond(cmd,sender) : responseFor(cmd,{spawned})
      if (response) {
        log.log('[Alice Bedrock] command from '+sender+': '+cmd)
        sendChat(client,response,{log})
      }
    }
  }
}

function assertSupportedNode(version=process.versions.node) {
  const major = Number(String(version).split('.')[0])
  if (!Number.isInteger(major) || major < 24)
    throw new Error('Native Bedrock protocol requires Node.js >=24; install isolated Node 24 with scripts/setup-node24-bedrock.sh (do not replace Paper Alice Node 20)')
}

async function main(argv=process.argv.slice(2)) {
  const mode=argv[0] || '--help'
  if (!['--ping','--connect'].includes(mode) || argv.length!==1) {
    console.log('Usage: node src/main.cjs --ping | --connect')
    console.log('--connect requires a verified offline backup manifest and a dedicated Xbox account.')
    return mode==='--help'?0:2
  }
  assertSupportedNode()
  const c=config()
  const bedrock=require('bedrock-protocol')
  if (mode==='--ping') {
    const result=await bedrock.ping({host:c.host,port:c.port})
    console.log('[Alice Bedrock] server ping:',JSON.stringify({motd:result.motd,version:result.version,
      protocol:result.protocol,portV4:result.portV4,playersOnline:result.playersOnline},null,2))
    return 0
  }
  // No server or gameplay changes before this gate passes.
  validateStartup(c)
  // Load the SAME versioned Paper policy functions; movement/dig/combat remain
  // disabled until a Bedrock packet executor has passed disposable-world tests.
  const brain=await createNativeAliceBrain()
  console.log('[Alice Bedrock] shared Paper decision rules loaded (safe observation/chat only)')
  fs.mkdirSync(c.authRoot,{recursive:true,mode:0o700})
  const releaseLogin=acquireAliceInstanceLock()
  let client
  try{
    if(c.port===17879){
      const session=assertBdsSessionReleased()
      if(session.status==='unconfigured') console.warn('[Alice BDS session] strict server session check NOT configured; local PID lock alone cannot prove server logout')
      else console.log('[Alice BDS session] verified most recent configured player event:',session.status)
    }
    client=bedrock.createClient({host:c.host,port:c.port,username:c.username,
    offline:false,profilesFolder:c.authRoot,raknetBackend:c.raknetBackend,
    useRaknetWorkers:false,followPort:false,
    onMsaCode:info=>{
      // Only printed to a private terminal. Never sent to GitHub or Alice logs.
      console.error('[Alice Bedrock] Sign into the bot\'s dedicated Xbox account using: '+(info.verification_uri||'https://www.microsoft.com/link'))
      console.error('[Alice Bedrock] One-time device code: '+(info.user_code||'see device sign-in prompt'))
    }})}catch(err){releaseLogin();throw err}
  client.once('close',releaseLogin)
  attachConnectionAudit(client,{mode:'legacy-chat-only'})
  const state=createMessageHandler({client,brain,ownName:c.botName})
  client.on('start_game',packet=>brain.observeStartGame(packet))
  client.on('move_player',packet=>brain.observeMovePlayer(packet))
  client.on('update_attributes',packet=>brain.observeAttributes(packet))
  client.on('join',()=>console.log('[Alice Bedrock] authenticated, waiting for spawn'))
  client.on('spawn',()=>{state.onSpawn();console.log('[Alice Bedrock] spawned in native Bedrock world; shared Paper policies active; no action/motion packets')})
  client.on('text',packet=>state.onText(packet))
  client.on('error',err=>console.error('[Alice Bedrock] client error:',err.message||String(err)))
  client.on('disconnect',why=>{state.onEnd();console.error('[Alice Bedrock] disconnected:',String(why).slice(0,180))})
  client.on('close',()=>{state.onEnd();console.log('[Alice Bedrock] connection closed')})
  installSignalShutdown({client,stop:()=>state.onEnd()})
  return 0
}

if (require.main===module) main().then(code=>{if(code)process.exitCode=code}).catch(err=>{
  console.error('[Alice Bedrock] '+(err.stack||err));process.exitCode=1
})
module.exports={config,readProperties,validateStartup,sendChat,createMessageHandler,assertSupportedNode}