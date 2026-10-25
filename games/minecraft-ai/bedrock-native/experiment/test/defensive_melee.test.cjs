'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {stationaryDefense,defenseDelay}=require('../src/defensive_melee.cjs')
const p=(x,y,z)=>({x,y,z})
function fixture(){
 const mob={id:7,name:'zombie',position:p(1,64,0)}
 const bot={health:8,isAlive:true,entity:{position:p(0,64,0)},
   entities:{7:mob}}
 const check=(retreat,over={})=>stationaryDefense({
   retreat,bot,target:mob,hostiles:new Set(['zombie','spider','skeleton','creeper']),
   ready:true,now:100000,...over})
 return {mob,bot,check}
}
test('no observed corridor permits only bounded non-creeper stationary defense',()=>{
 const f=fixture()
 assert.equal(f.check({ok:false,attempted:false,reason:'retreat_no_verified_away_corridor'}).ok,true)
 assert.equal(f.check({ok:false,attempted:false,reason:'retreat_flat_geometry_not_verified'}).ok,true)
 f.mob.name='creeper'
 assert.equal(f.check({ok:false,attempted:false,reason:'retreat_no_verified_away_corridor'}).ok,false)
 f.mob.name='zombie'
 f.mob.position=p(4,64,0)
 assert.equal(f.check({ok:false,attempted:false,reason:'retreat_no_verified_away_corridor'}).ok,false)
 f.mob.position=p(1,67,0)
 assert.equal(f.check({ok:false,attempted:false,reason:'retreat_no_verified_away_corridor'}).ok,false)
 f.mob.position=p(1,64,0)
 f.bot.health=0
 assert.equal(f.check({ok:false,attempted:false,reason:'retreat_no_verified_away_corridor'}).ok,false)
})
test('Pathfinder error only allows defense after recorded stop and very close target',()=>{
 const f=fixture()
 for(const reason of ['retreat_pathfinder_error','retreat_pathfinder_no_path']){
   assert.equal(f.check({ok:false,attempted:true,reason,pathfinderStopRequested:true}).ok,true)
   assert.equal(f.check({ok:false,attempted:true,reason}).ok,false)
 }
 assert.equal(f.check({ok:false,attempted:true,reason:'unknown',pathfinderStopRequested:true}).ok,false)
 assert.equal(f.check({ok:false,attempted:true,reason:'retreat_pathfinder_error',
   pathfinderStopRequested:true},{ready:false}).ok,false)
 f.mob.position=p(3,64,0)
 assert.equal(f.check({ok:false,attempted:true,reason:'retreat_pathfinder_error',
   pathfinderStopRequested:true}).ok,false)
})
test('missing BDS witness permits no path bypass; static melee needs fresh aligned server packet',()=>{
 const f=fixture()
 const r={ok:false,attempted:false,reason:'retreat_bds_position_unavailable'}
 const m={get:()=>({latestFeet:p(.1,64,0),lastAt:99000,
   lastSource:'correct_player_move_prediction'})}
 assert.equal(f.check(r).ok,false)
 assert.equal(f.check(r,{movementEvidence:m}).reason,'static_guarded_packet_aligned')
 assert.equal(f.check(r,{movementEvidence:{get:()=>({...m.get(),lastAt:94000})}}).ok,false)
 assert.equal(f.check(r,{movementEvidence:{get:()=>({...m.get(),latestFeet:p(20,64,0)})}}).ok,false)
 assert.equal(f.check(r,{movementEvidence:{get:()=>({...m.get(),lastSource:'client_prediction'})}}).ok,false)
 assert.equal(f.check({...r,reason:'retreat_bds_client_position_diverged'},
   {movementEvidence:m}).ok,false)
 assert.equal(f.check({...r,reason:'retreat_client_position_unavailable'},
   {movementEvidence:m}).ok,false)
 assert.equal(f.check({...r,attempted:true},{movementEvidence:m}).ok,false)
})
test('no unverified target or active movement is silently upgraded to self defense',()=>{
 const f=fixture(),r={ok:false,attempted:false,reason:'retreat_no_verified_away_corridor'}
 delete f.bot.entities[7]
 assert.equal(f.check(r).ok,false)
 f.bot.entities[7]=f.mob
 assert.equal(f.check({...r,ok:true}).ok,false)
 assert.equal(f.check({...r,attempted:true}).ok,false)
})
test('desperate attack cooldown stays bounded, not unconditional packet spam',()=>{
 assert.equal(defenseDelay(1,{health:8,distance:1}),1750)
 assert.equal(defenseDelay(4,{health:8,distance:1}),2500)
 assert.equal(defenseDelay(4,{health:20,distance:1}),12000)
 assert.equal(defenseDelay(4,{health:8,distance:3.3}),12000)
})
