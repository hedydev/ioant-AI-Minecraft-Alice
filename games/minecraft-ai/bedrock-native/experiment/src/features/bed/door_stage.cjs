'use strict'
// Bed goals reuse the existing door executor; never invent a through-door
// WALK route or clear the bed intent to let unrelated work take its place.
const {surveyEscape}=require('../../escape_survey.cjs')
const {validateApproach,approachDoor}=require('../../escape_approach.cjs')
const {planDoorOpen,attemptDoorOpen}=require('../../escape_door_action.cjs')
const {createDoorStrategy}=require('../autonomy/door_strategy.cjs')
const strategy=createDoorStrategy({validateApproach,approachDoor,planDoorOpen,attemptDoorOpen})
function selectBedDoor(bot,survey,bed){
 const here=bot?.entity?.position
 if(!here||!bed)return null
 const distance=p=>Math.hypot(p[0]+.5-bed.x,p[1]-bed.y,p[2]+.5-bed.z)
 const baseline=Math.hypot(here.x-bed.x,here.y-bed.y,here.z-bed.z)
 return (survey?.doorCandidates||[]).filter(d=>
   Array.isArray(d.position)&&d.position.length===3&&
   d.position.every(Number.isSafeInteger)&&d.approach?.routeComplete===true&&
   d.approach.elevationChanges===0&&distance(d.position)<baseline-.25&&
   (d.approach.steps===0||validateApproach(bot,d).ok))
   .sort((a,b)=>distance(a.position)-distance(b.position))[0]||null
}
function resumeBedDoor(r,p){
 const held=reason=>({state:'waiting',reason})
 if(r.job||r.pendingDoorApproachStep||r.pendingDoorCrossing)
   return held('bed_door_waiting_for_independent_endpoint')
 if(!r.liveBehavior?.settings?.autonomyEnabled)
   return held('bed_door_autonomy_not_enabled')
 // The shared raised-door executor retains its exact original BDS takeoff,
 // open-lane geometry, jump-headroom, ownership and threat checks.
 if(r.verifiedRaisedThreshold){
  const landing=r.resumeRaisedDoorLandingOnWitness()
  if(landing.state==='started')return {state:'approaching',reason:'bed_door_raised_landing_started'}
  return held(landing.reason)
 }
 const survey=surveyEscape(r.bot,{radius:7,maxNodes:160,bedPositions:[p.position]})
 const door=selectBedDoor(r.bot,survey,p.position)
 if(!door)return {state:'rejected',reason:'bed_door_route_no_longer_observed'}
 r.lastEscapeSurvey={...survey,door,observedAt:r.clock()}
 r.lastEscapeSurveyAt=r.clock()
 const started=strategy.runDoorWaitStrategy.call(r,{
   doorDriven:true,movementFailure:false,drive:{driveGoal:'FIND_ROOM_EXIT'}})
 if(started&&r.job)return {state:'approaching',reason:'bed_door_guarded_stage_started'}
 return held(r.lastEscapeDoorAction?.reason||'bed_door_retry_cooldown')
}
module.exports={selectBedDoor,resumeBedDoor}
