'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {clientOptions,connectionSummary}=require('../src/client_options.cjs')
function c(){return {host:'127.0.0.1',port:17879,profile:'AliceAI-HedydevGame',authRoot:'/tmp/alice-mock-auth',raknetBackend:'raknet-native'}}
test('autonomous Alice uses native connector RakNet and explicit no-follow-port',()=>{
 const opts=clientOptions(c())
 assert.equal(opts.offline,false)
 assert.equal(opts.followPort,false)
 assert.equal(opts.useRaknetWorkers,false)
 assert.equal(opts.raknetBackend,'raknet-native')
 assert.equal(opts.port,17879)
 assert.equal(opts.version,'bedrock_1.26.51')
})
test('Alice propagates validated backend rather than hardcoding it',()=>{
 assert.equal(clientOptions({...c(),raknetBackend:'jsp-raknet'}).raknetBackend,'jsp-raknet')
 assert.throws(()=>clientOptions({...c(),raknetBackend:'bad'}),/ALICE_BEDROCK_RAKNET_BACKEND/)
 assert.throws(()=>clientOptions({...c(),port:19132}),/verified local/)
})
test('safe connection log excludes identity and cache directory',()=>{
 const s=JSON.stringify(connectionSummary(clientOptions(c())))
 assert(s.includes('"followPort":false'))
 assert(!s.includes('AliceAI-HedydevGame'))
 assert(!s.includes('alice-mock-auth'))
})
test('Mineflayer Bedrock fork is constrained to native connector bedrock-protocol version',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'))
 assert.equal(pkg.dependencies['bedrock-protocol'],'3.60.1')
 assert.equal(pkg.overrides['bedrock-protocol'],'$bedrock-protocol')
})
