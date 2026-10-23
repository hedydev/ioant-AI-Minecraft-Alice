'use strict'
// Alice's bounded goal-selection layer. Separates *what matters next* from
// whether a lower-level executor may move. Does NOT authorize Minecraft actions.
// Input must be freshly observed world state; no AI hallucinated coordinates.
const OPEN_CELLS_MIN=32
function sceneFromSurvey(survey){
  if(!survey||!Array.isArray(survey.center))return {kind:'unobserved',reason:'no_recent_local_survey'}
  if(survey.openFrontier&&survey.reachableCells>=OPEN_CELLS_MIN)
    return {kind:'open_local_area',reason:'wide_loaded_reachable_area',
      reachableCells:survey.reachableCells,frontier:survey.openFrontier.target||null}
  if(survey.door&&!survey.openFrontier)
    return {kind:'door_limited_area',reason:'bounded_reachable_room_with_door',
      reachableCells:survey.reachableCells,door:survey.door.position}
  return {kind:'limited_or_unknown',reason:survey.reason||'insufficient_scene_evidence',
    reachableCells:survey.reachableCells||0}
}
function selectDrive({decision,world,survey,doorExecutable=false,woodFailure=false,
  movementFailure=false,needsRawMaterials=false}={}){
  if(!decision||typeof decision.action!=='string')throw Error('Autonomous decision required')
  const scene=sceneFromSurvey(survey)
  const lowLight=world?.phase==='night'||world?.phase==='dusk'
  let next={...decision}
  // Keep the existing physical safety policy authoritative. Missing verified
  // server movement is not permission to initiate another route.
  if(movementFailure)return {decision:next,scene,
    driveGoal:'VERIFY_MOVEMENT',driveReason:'server_position_evidence_missing',physicalActionAuthorized:false}
  // Autonomous raw-material acquisition is not an emergency worth starting
  // at night. Inventory-only crafting/equipment and direct user commands are
  // separate tasks, so don't suppress those.
  if(lowLight&&needsRawMaterials&&decision.action==='WORK'){
    next={action:'WAIT',goal:'PREPARE_DAYLIGHT',reason:'defer_nonurgent_raw_materials_at_night'}
    return {decision:next,scene,driveGoal:'PREPARE_DAYLIGHT',
      driveReason:'safe_night_priority_over_wood_search',physicalActionAuthorized:false}
  }
  const sameDoorAttempted=survey?.passageAction?.attempted===true&&
    Array.isArray(survey?.passageAction?.door)&&Array.isArray(survey?.door?.position)&&
    survey.passageAction.door.join(',')===survey.door.position.join(',')
  // A fresh, close door may be worth trying even when other cells are open,
  // but never re-treat the old room door as a new unexplored objective.
  if(scene.kind==='open_local_area'&&woodFailure&&doorExecutable&&!sameDoorAttempted&&
     survey?.door?.approach?.steps<=2&&
     ['WAIT','SCOUT'].includes(decision.action)){
    next={action:'WAIT',goal:'FIND_ROOM_EXIT',reason:'observed_indoor_wooden_door_first'}
    return {decision:next,scene,driveGoal:'FIND_ROOM_EXIT',
      driveReason:'fresh_nearby_door_proposal',physicalActionAuthorized:false}
  }
  if(scene.kind==='open_local_area'){
    // An old room door behind Alice must not capture her goals forever.
    // Open locally observed space is NOT an outdoor/remote-server proof.
    if(lowLight&&decision.action==='WAIT'){
      next={action:'WAIT',goal:'PREPARE_DAYLIGHT',reason:'open_area_night_watch'}
      return {decision:next,scene,driveGoal:'PREPARE_DAYLIGHT',
        driveReason:'nighttime_safe_observation',physicalActionAuthorized:false}
    }
    if(decision.action==='SCOUT'){
      next={...decision,goal:'DISCOVER_RESOURCES',reason:'explore_new_observed_area'}
      return {decision:next,scene,driveGoal:'DISCOVER_RESOURCES',
        driveReason:'fresh_local_frontier',physicalActionAuthorized:false}
    }
    return {decision:next,scene,driveGoal:next.action==='WORK'?
      'ACQUIRE_MATERIALS':lowLight?'PREPARE_DAYLIGHT':'FIND_RESOURCES',
      driveReason:'observed_open_area_not_old_door',physicalActionAuthorized:false}
  }
  if(woodFailure&&scene.kind==='door_limited_area'&&doorExecutable&&
     ['WAIT','SCOUT'].includes(decision.action)){
    next={action:'WAIT',goal:'FIND_ROOM_EXIT',reason:'observed_indoor_wooden_door_first'}
    return {decision:next,scene,driveGoal:'FIND_ROOM_EXIT',
      driveReason:'safe_known_door_proposal',physicalActionAuthorized:false}
  }
  if(woodFailure&&scene.kind==='door_limited_area'&&decision.action==='WAIT'){
    next={action:'WAIT',goal:'OBSERVE_ROOM',reason:'indoor_door_needs_verification'}
    return {decision:next,scene,driveGoal:'OBSERVE_ROOM',
      driveReason:'door_not_actionable',physicalActionAuthorized:false}
  }
  return {decision:next,scene,driveGoal:next.action==='SCOUT'?'DISCOVER_RESOURCES':
    next.action==='WORK'?'ACQUIRE_MATERIALS':lowLight?'PREPARE_DAYLIGHT':'REASSESS_WORLD',
    driveReason:next.reason,physicalActionAuthorized:false}
}
class SelfDriveJournal{
  constructor({clock=Date.now,log=console}={}){this.clock=clock;this.log=log;this.current=null;this.transitions=0}
  observe(result){
    const key=result.driveGoal
    if(this.current?.key===key){
      // An expired/unknown survey must not manufacture a fresh goal
      // transition or erase the goal we were pursuing.
      this.current.scene=result.scene.kind
      return this.current
    }
    const entry={key,goal:result.driveGoal,scene:result.scene.kind,
      reason:result.driveReason,previousGoal:this.current?.goal||null,
      at:this.clock(),transitions:++this.transitions}
    this.current=entry
    this.log.log('[Alice drive] goal transition:',JSON.stringify(entry))
    return entry
  }
  recordOutcome({type,source,result}={}){
    if(!this.current||typeof source!=='string'||!source.startsWith('自主'))return null
    const raw=String(result?.reason||'no_result_reason')
    // The Bedrock server rarely emits enough self-position corrections to
    // claim a path succeeded. A local-only move is UNVERIFIED, not a verified
    // success or proof of failure. Preserve that distinction for replanning.
    const uncertainty=/server_endpoint_unconfirmed|local_only_server_unverified|no_two_server_positions/.test(raw)
    const terrainOnly=source==='自主地形'
    const verified=!terrainOnly&&result?.ok===true&&(!uncertainty)
    const resultKind=terrainOnly?
      result?.worldModificationVerified===true?'terrain_modified_not_travel_verified':'blocked':
      verified?'confirmed':uncertainty?'unverified':'blocked'
    const entry={goal:this.current.goal,taskType:String(type||'unknown').slice(0,24),
      result:resultKind,reason:raw.slice(0,90),at:this.clock()}
    this.lastOutcome=entry
    this.log.log('[Alice drive] task feedback:',JSON.stringify(entry))
    return entry
  }
  get(){return this.current}
}
module.exports={sceneFromSurvey,selectDrive,SelfDriveJournal,OPEN_CELLS_MIN}
