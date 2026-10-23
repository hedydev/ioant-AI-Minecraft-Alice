'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {normalizeRemotePlayerSpawn,attachBedrockPlayerCoordinates}=require('../src/bedrock_player_coordinates.cjs')
function player(y=70.62){return {type:'player',username:'Rainted3333',position:{x:3,y,z:7}}}
test('1.26.51 remote AddPlayer eye Y is normalized to MovePlayer feet convention',()=>{
 const self=player(69),other=player()
 const r=normalizeRemotePlayerSpawn(other,self)
 assert.equal(r.eyeHeight,1.62)
 assert(Math.abs(other.position.y-69)<1e-9)
})
test('initial spawn correction only once; later authoritative movement untouched',()=>{
 const bot=new EventEmitter();bot.entity=player(63)
 const reports=[];const stop=attachBedrockPlayerCoordinates(bot,{log:{log:(...x)=>reports.push(x.join(' '))}})
 const target=player(70.62)
 bot.emit('entitySpawn',target)
 bot.emit('entitySpawn',target)
 assert(Math.abs(target.position.y-69)<1e-9)
 assert.equal(reports.length,1)
 target.position.y=75 // Mineflayer move_player parser already subtracts eyeHeight
 bot.emit('entityMoved',target)
 assert.equal(target.position.y,75)
 stop();bot.emit('entitySpawn',player(80))
 assert.equal(reports.length,1)
})
test('never adjust own entity, mobs, or invalid unknown coordinates',()=>{
 const self=player(70.62)
 assert.equal(normalizeRemotePlayerSpawn(self,self),null)
 assert.equal(self.position.y,70.62)
 const mob={type:'mob',position:{x:0,y:70,z:0}}
 assert.equal(normalizeRemotePlayerSpawn(mob,self),null)
 assert.equal(mob.position.y,70)
 const notReady=player(NaN)
 assert.equal(normalizeRemotePlayerSpawn(notReady,self),null)
})
test('crouching players use observed eye height',()=>{
 const self=player(70),remote={...player(70.27),eyeHeight:1.27}
 normalizeRemotePlayerSpawn(remote,self)
 assert.equal(remote.position.y,69)
})
