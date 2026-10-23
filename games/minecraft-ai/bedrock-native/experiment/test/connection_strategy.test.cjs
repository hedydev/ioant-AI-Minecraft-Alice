'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {connectionMode,legacyNativeOptions,createLegacyNativeClient}=require('../src/connection_strategy.cjs')
function target(){return {host:'127.0.0.1',port:17879,profile:'AliceAI-HedydevGame',authRoot:'/safe/private-cache',raknetBackend:'raknet-native'}}
test('new A/B mode is explicitly opt-in; unknown modes fail closed',()=>{
  assert.equal(connectionMode({}),'mineflayer')
  assert.equal(connectionMode({ALICE_BEDROCK_CLIENT_MODE:'legacy-native-injected'}),'legacy-native-injected')
  assert.throws(()=>connectionMode({ALICE_BEDROCK_CLIENT_MODE:'other'}),/Invalid ALICE_BEDROCK_CLIENT_MODE/)
})
test('baseline injected client uses the exact known-good native login option names',()=>{
  const cb=()=>{}
  const opts=legacyNativeOptions(target(),cb)
  assert.deepEqual(Object.keys(opts).sort(),['host','port','username','offline','profilesFolder','raknetBackend','useRaknetWorkers','followPort','onMsaCode'].sort())
  assert.equal(opts.onMsaCode,cb)
  assert.equal(opts.username,'AliceAI-HedydevGame')
  assert.equal(opts.offline,false)
  assert.equal(opts.followPort,false)
  assert(!Object.hasOwn(opts,'version'))
  assert(!Object.hasOwn(opts,'brand'))
  assert(!Object.hasOwn(opts,'plugins'))
})
test('baseline builds precisely one reusable Bedrock client, no second Mineflayer transport',()=>{
  let calls=0
  const c=createLegacyNativeClient(target(),{onMsaCode:()=>{},createClient:opts=>{calls++;return Object.assign(new EventEmitter(),{options:{...opts}})}})
  assert.equal(calls,1)
  assert.equal(c.bedrock,true)
  assert.equal(c.options.port,17879)
})
test('baseline refuses remote and malformed targets before invoking any client factory',()=>{
  let calls=0
  assert.throws(()=>createLegacyNativeClient({...target(),port:19132},{createClient:()=>{calls++}}),/verified local/)
  assert.equal(calls,0)
})
