'use strict'
// Adapted from Codex's 2026-10-22 actual Mint reproduction. No BDS login,
// network connection, user credentials or world writes.
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events')
const root=path.resolve(__dirname,'..'),fromRoot=createRequire(path.join(root,'package.json'))
const Vec3=fromRoot('vec3'),registry=fromRoot('minecraft-data')('bedrock_1.26.51')
const plugin=path.join(root,'src/bedrock_client_input_sync.cjs')
const source=fs.readFileSync(plugin,'utf8'),fromPlugin=createRequire(plugin)
function run({delayMs=1500,goal=true,injectCallback=null,stopAfterTick=null}={}){
 let now=100000,timer=null,liveTicks=0,lastPhysical=null
 const bot=new EventEmitter(),client=new EventEmitter(),packets=[]
 bot._client=client;bot.registry=registry;bot.entities={}
 bot.game={minY:-64,height:384};bot.inventory={slots:[],items:()=>[]}
 bot.entity={position:new Vec3(.5,69,.5),velocity:new Vec3(0,0,0),yaw:0,
   pitch:0,eyeHeight:1.62,onGround:true,effects:{},attributes:{}}
 bot.blockAt=p=>({name:p.y<69?'stone':'air',
   type:(p.y<69?registry.blocksByName.stone:registry.blocksByName.air).id,
   position:new Vec3(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)),
   boundingBox:p.y<69?'block':'empty',
   shapes:p.y<69?[[0,0,0,1,1,1]]:[],getProperties:()=>({})})
 client.queue=(name,p)=>{
   if(name!=='player_auth_input')return
   packets.push({tick:String(p.tick),move:{...p.move_vector},
     flags:[...p.input_data],rotation:{yaw:p.yaw,pitch:p.pitch},
     position:{...p.position},delta:{...p.delta},
     expected:lastPhysical?{
       position:{...lastPhysical.position},delta:{...lastPhysical.delta}
     }:null})
 }
 const mod={exports:{}}
 vm.runInNewContext(source,{module:mod,exports:mod.exports,
   require:fromPlugin,Date:{now:()=>now},
   setInterval:fn=>{timer=fn;return {unref(){}}},
   clearInterval(){},setTimeout,clearTimeout,console},{filename:plugin})
 mod.exports(bot)
 client.emit('start_game',{current_tick:1000n,movement_authority:'server'})
 bot.emit('spawn');packets.length=0
 bot.on('physicsTick',()=>{
   liveTicks++
   if(stopAfterTick===liveTicks)bot.pathfinder?.stop?.()
   injectCallback?.({bot,liveTicks})
 })
 const originalSim=bot.physics.simulatePlayer
 bot.physics.simulatePlayer=(state,world)=>{
   const result=originalSim(state,world)
   // Ignore Pathfinder's speculative physics calls: only the real
   // bot.controlState is used for committed entity simulations.
   if(state.control===bot.controlState)lastPhysical={
     position:{x:result.pos.x,y:result.pos.y+1.62,z:result.pos.z},
     delta:{x:result.vel.x,y:result.vel.y,z:result.vel.z}
   }
   return result
 }
 if(goal){
   const pf=fromRoot('mineflayer-pathfinder')
   pf.pathfinder(bot)
   const movement=new pf.Movements(bot)
   movement.canDig=false;movement.allow1by1towers=false
   movement.allowParkour=false;movement.allowSprinting=false
   bot.pathfinder.setMovements(movement)
   bot.pathfinder.setGoal(new pf.goals.GoalNear(0,69,-2,1))
 }else{
   bot.setControlState('forward',true)
 }
 now+=delayMs;timer()
 const state={packets,liveTicks,stats:bot._aliceBedrockInputSync.summary(),
   clientFeet:{...bot.entity.position},velocity:{...bot.entity.velocity}}
 client.emit('close')
 return state
}
function mismatch(p){
 if(!p.expected)return false
 for(const k of ['x','y','z']){
   if(Math.abs(p.position[k]-p.expected.position[k])>1e-8||
      Math.abs(p.delta[k]-p.expected.delta[k])>1e-8)return true
 }
 return false
}
test('real Pathfinder goal arrival cannot overwrite previous physics output or next-tick origin',()=>{
 const r=run()
 assert.equal(r.liveTicks,30)
 assert.equal(r.packets.length,30)
 assert.equal(r.packets.filter(mismatch).length,0,
   'No packet may use post-callback position/velocity instead of physical result')
 assert(r.stats.callbackPositionMutationsPrevented>=1,
   'The real pinned Pathfinder must exercise fullStop recenter branch')
 assert(r.stats.callbackVelocityMutationsPrevented>=1)
 assert(r.packets.some(p=>p.move.z===1&&p.flags.includes('up')))
})
test('goal interruption never retroactively changes a committed input frame',()=>{
 const r=run({delayMs:500,stopAfterTick:5})
 assert.equal(r.packets.length,10)
 assert.equal(r.packets.filter(mismatch).length,0)
 assert.deepEqual(r.packets.map(p=>p.tick),Array.from({length:10},(_,i)=>String(1001+i)))
})
test('turn, jump and stop during physicsTick affect next frame but not its predecessor',()=>{
 const r=run({delayMs:300,goal:false,injectCallback:({bot,liveTicks})=>{
   if(liveTicks===1){bot.entity.yaw=0.9;bot.setControlState('jump',true)}
   if(liveTicks===3){bot.setControlState('forward',false);bot.setControlState('jump',false)}
 }})
 assert.equal(r.packets.length,6)
 assert.equal(r.packets.filter(mismatch).length,0)
 assert.equal(r.packets[0].move.z,1)
 // The pinned Mineflayer converter uses degrees on the wire:
 // toNotchianYaw(0 radians) = 180 degrees, not 0 degrees.
 assert.equal(r.packets[0].rotation.yaw,180)
 const nextYawDegrees=(Math.PI-0.9)*180/Math.PI
 assert(Math.abs(r.packets[1].rotation.yaw-nextYawDegrees)<1e-10)
 assert.notEqual(r.packets[1].rotation.yaw,r.packets[0].rotation.yaw)
 assert(r.packets[1].flags.includes('start_jumping'))
 assert.equal(r.packets[3].move.z,0)
 assert(r.packets[3].flags.includes('up')===false)
})
test('an unrelated physicsTick subscriber cannot teleport the player or alter the emitted frame',()=>{
 const r=run({delayMs:200,goal:false,injectCallback:({bot,liveTicks})=>{
   if(liveTicks===2){
     bot.entity.position.x+=12;bot.entity.position.z-=3
     bot.entity.velocity.z=0;bot.entity.onGround=false
   }
 }})
 assert.equal(r.packets.length,4)
 assert.equal(r.packets.filter(mismatch).length,0)
 assert.equal(r.stats.callbackPositionMutationsPrevented,1)
 assert.equal(r.stats.callbackContactMutationsPrevented,1)
 assert(r.clientFeet.x<1.2)
})
