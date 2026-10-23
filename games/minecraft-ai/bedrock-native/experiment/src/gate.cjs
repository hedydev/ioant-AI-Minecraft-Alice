'use strict'
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const MARKER='.alice-sandbox.json'
const PORT=17880
function properties(dir) {
  const p={}
  for(const line of fs.readFileSync(path.join(dir,'server.properties'),'utf8').split(/\r?\n/)){
    const at=line.indexOf('=')
    if(at>0&&!line.startsWith('#'))p[line.slice(0,at).trim()]=line.slice(at+1).trim()
  }
  return p
}
function gate(env=process.env,home=os.homedir()) {
  const real=fs.realpathSync(path.join(home,'minecraft-bedrock-alice-lab'))
  const original=fs.realpathSync(path.join(home,'minecraft-bedrock'))
  if(real===original || real.startsWith(original+path.sep))throw Error('Refusing to touch production bedrock-default')
  if(env.ALICE_BEDROCK_LAB_CONFIRM!=='I_UNDERSTAND_THIS_IS_A_COPY')throw Error('Explicit sandbox confirmation required')
  if(!fs.statSync(real).isDirectory())throw Error('Not a sandbox directory')
  const m=JSON.parse(fs.readFileSync(path.join(real,MARKER),'utf8'))
  if(m.version!==1||m.kind!=='alice-disposable-bedrock-lab'||m.source!==original||m.port!==PORT||m.world!=='Bedrock level')
    throw Error('Invalid sandbox marker: do not use original server')
  const p=properties(real)
  if(Number(p['server-port'])!==PORT||Number(p['server-portv6'])!==PORT+1||p['online-mode']!=='true'||p['level-name']!==m.world)
    throw Error('Sandbox config mismatch (port, online mode, world)')
  if(!fs.statSync(path.join(real,'worlds',m.world,'level.dat')).isFile())throw Error('Missing sandbox world')
  return {dir:real,port:PORT,host:'127.0.0.1',world:m.world,authRoot:path.join(home,'.alice-bedrock-auth'),profile:env.ALICE_BEDROCK_PROFILE||'AliceAI-HedydevGame',
    raknetBackend:env.ALICE_BEDROCK_RAKNET_BACKEND||(process.platform==='linux'?'raknet-native':'jsp-raknet')}
}

const {config: nativeConfig, validateStartup} = require('../../src/main.cjs')
const PRODUCTION_PORT=17879
const PRODUCTION_CONFIRM='I_ACCEPT_WORLD_CHANGES'
function productionGate(env=process.env,home=os.homedir(),{verify=validateStartup}={}) {
  if(env.ALICE_BEDROCK_PRODUCTION_CONFIRM!==PRODUCTION_CONFIRM)
    throw Error('Production actions need ALICE_BEDROCK_PRODUCTION_CONFIRM='+PRODUCTION_CONFIRM)
  const original=fs.realpathSync(path.join(home,'minecraft-bedrock'))
  if(!fs.statSync(original).isDirectory())throw Error('Production bedrock-default directory missing')
  const opts=nativeConfig(env)
  if(fs.realpathSync(opts.serverDir)!==original)
    throw Error('Refuse non-production server directory for production Alice')
  if(opts.host!=='127.0.0.1'||opts.port!==PRODUCTION_PORT||opts.worldDir!=='Bedrock level')
    throw Error('Production Alice must use 127.0.0.1:17879 / Bedrock level')
  if(!opts.manifest)throw Error('Verified Bedrock level world backup manifest required')
  // Reuse the known-good native connector gate: exact source, SHA256, isolated
  // temporary restore, online-mode and configured server port.
  verify(opts)
  return {dir:original,port:PRODUCTION_PORT,host:'127.0.0.1',world:opts.worldDir,
    authRoot:opts.authRoot,profile:opts.username,raknetBackend:opts.raknetBackend,mode:'production'}
}
module.exports={gate,productionGate,PORT,PRODUCTION_PORT,PRODUCTION_CONFIRM,MARKER}