'use strict'
const {planScoutSegment,MAX_STEPS}=require('./scout_routes.cjs')
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
// Deterministic Bedrock world awareness, location cooldown and bounded scouting.
const WOOD_COOLDOWN_MS=600000,SLEEP_COOLDOWN_MS=720000,BED_COOLDOWN_MS=1200000
const HOSTILES=new Set(['zombie','husk','drowned','skeleton','stray','bogged','spider',
  'cave_spider','creeper','witch','pillager','ravager','phantom','slime','silverfish','endermite'])
function environment(bot){
 const overworld=bot?.game?.dimension==='overworld'
 const tick=Number.isFinite(bot?.time?.timeOfDay)?Math.floor(bot.time.timeOfDay):null
 const raining=bot?.isRaining===true
 const thunder=raining&&Number.isFinite(bot?.thunderState)&&bot.thunderState>0
 const sleepWindow=tick!==null&&(raining?(tick>=12010&&tick<23992):(tick>=12542&&tick<23460))
 const phase=tick===null?'unknown':tick>=23460?'dawn':tick>=12542?'night':tick>=11000?'dusk':'day'
 return {phase,tick,weather:thunder?'thunder':raining?'rain':'clear',
   canSleep:overworld&&(sleepWindow||thunder),canUseBed:overworld,
   safeToExplore:overworld&&phase==='day'&&!thunder}
}
function cell(pos){return pos&&[pos.x,pos.y,pos.z].every(Number.isFinite)
  ?{x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)}:null}
function siteKey(pos){const p=cell(pos);return p?[Math.floor(p.x/16),Math.floor(p.y/8),Math.floor(p.z/16)].join(','):'unknown'}
function simpleReason(value){
 const text=String(value||'unknown')
 if(text.includes('no_verified_natural_tree'))return 'no_verified_natural_tree'
 if(text.includes('no_visible_log'))return 'no_visible_log'
 if(text.includes('missing_ingredients'))return 'missing_ingredients'
 if(text.includes('bed_navigation_or_sleep_failed'))return 'bed_navigation_or_sleep_failed'
 if(text.includes('no_free_bed'))return 'no_free_bed'
 if(text.includes('noPath')||text.includes('timeout'))return 'navigation_failure'
 return text.slice(0,45).replace(/[^a-z0-9_:]/gi,'_')
}
class FailureMemory {
 constructor(clock=Date.now,file=null){
  this.clock=clock;this.file=file;this.items=new Map();this.persistenceError=null;this.load()
 }
 load(){
  if(!this.file)return
  try{
   const stat=fs.lstatSync(this.file)
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)throw Error('Unsafe routine memory')
   const raw=JSON.parse(fs.readFileSync(this.file,'utf8'))
   if(!Array.isArray(raw))throw Error('Invalid routine memory')
   for(const item of raw.slice(-32)){
    if(!Array.isArray(item)||item.length!==2)continue
    const [key,value]=item
    if(typeof key!=='string'||!/^(wood|sleep|scout|bed|route|probe|motion):-?\d+,-?\d+,-?\d+$/.test(key)||
      !value||typeof value!=='object'||typeof value.reason!=='string'||
      !/^[a-z0-9_:]{1,45}$/i.test(value.reason)||
      !Number.isSafeInteger(value.attempts)||value.attempts<1||value.attempts>4||
      !Number.isFinite(value.until)||value.until<=this.clock()||value.until>this.clock()+3600000)continue
    this.items.set(key,{reason:value.reason,attempts:value.attempts,until:value.until})
   }
  }catch(e){if(e.code!=='ENOENT')this.persistenceError='read_unavailable'}
 }
 save(){
  if(!this.file)return
  const dir=path.dirname(this.file)
  if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('Unsafe routine memory directory')
  fs.mkdirSync(dir,{recursive:true,mode:0o700})
  if(fs.existsSync(this.file)&&fs.lstatSync(this.file).isSymbolicLink())throw Error('Unsafe routine memory target')
  const encoded=JSON.stringify([...this.items])
  if(Buffer.byteLength(encoded)>8192)throw Error('Routine memory too large')
  const temp=path.join(dir,'.routine-'+process.pid+'-'+crypto.randomBytes(4).toString('hex')+'.tmp')
  try{fs.writeFileSync(temp,encoded,{mode:0o600,flag:'wx'});fs.renameSync(temp,this.file)}
  finally{try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
 }
 key(kind,pos){const p=cell(pos);return kind+':'+((kind==='bed'||kind==='route'||kind==='probe')&&p?[p.x,p.y,p.z].join(','):siteKey(pos))}
 blocked(kind,pos){
  const r=this.items.get(this.key(kind,pos))
  // Historical records incorrectly labelled absence of optional Bedrock
  // correction packets as failed client motion. Keep on-disk evidence intact,
  // but do not enforce the now-invalid site-wide failure penalty.
  if(kind==='motion'&&r?.reason==='scout_server_endpoint_unconfirmed')return null
  if(kind==='sleep'&&r?.reason.startsWith('bed_sleep_rejected:bot_did_not_sleep'))return null
  // Previous versions disabled a bed for the *entire* Minecraft night merely
  // because the Bedrock client didn't see the sleeping-state event. Limit
  // that historical unconfirmed acknowledgement to a two-minute remainder.
  if(kind==='bed'&&r?.reason.startsWith('bed_sleep_rejected:bot_did_not_sleep')&&
     r.until-this.clock()>120000)r.until=this.clock()+120000
  return r&&r.until>this.clock()?{reason:r.reason,remainingMs:r.until-this.clock(),attempts:r.attempts}:null
 }
 mark(kind,pos,reason){
  const key=this.key(kind,pos),record=this.items.get(key),now=this.clock()
  // Do not compound a real later failure with invalid historical attempts.
  const prior=kind==='motion'&&record?.reason==='scout_server_endpoint_unconfirmed'?
    null:record
  const attempts=Math.min(((kind==='bed'&&prior?.reason.startsWith('bed_sleep_rejected:bot_did_not_sleep'))?
    0:prior?.attempts||0)+1,4)
  const wait=kind==='sleep'?SLEEP_COOLDOWN_MS:
    kind==='bed'&&reason==='bed_sleep_unconfirmed_no_state_ack'?
      Math.min(120000*2**(attempts-1),480000):
    kind==='bed'?BED_COOLDOWN_MS:
    kind==='motion'?Math.min(300000*2**(attempts-1),900000):
    kind==='route'?Math.min(120000*2**(attempts-1),900000):
    kind==='probe'?Math.min(60000*2**(attempts-1),180000):
    kind==='scout'?Math.min(180000*2**(attempts-1),900000):
    Math.min(WOOD_COOLDOWN_MS*2**(attempts-1),3600000)
  const next={reason:simpleReason(reason),attempts,until:now+wait}
  this.items.delete(key);this.items.set(key,next)
  while(this.items.size>32)this.items.delete(this.items.keys().next().value)
  try{this.save();this.persistenceError=null}catch{this.persistenceError='write_unavailable'}
  return {...next,kind,site:siteKey(pos),position:['bed','route','probe'].includes(kind)?cell(pos):undefined}
 }
 activeRoutes(){return new Set([...this.items].filter(([key,v])=>key.startsWith('route:')&&v.until>this.clock()).map(([key])=>key.slice(6)))}
 summary(pos){return {
  wood:this.blocked('wood',pos),sleep:this.blocked('sleep',pos),
  scout:this.blocked('probe',pos),motion:this.blocked('motion',pos),
  blockedRoutes:this.activeRoutes().size,
  legacyScoutIgnored:!!this.blocked('scout',pos)
 }}
}
// Failed-area "scout" entries are legacy evidence, not path bans. A newer
// 3D planner is free to try other fully verified routes from the same sector.
// Only a genuine unverified-movement event pauses all physical scouting there.
function classifyScoutFailure(reason){
 const r=String(reason||'')
 if(/cancelled|conditions_changed|unsafe_scout_start|crossing_aborted|crossing_preempted/.test(r))return 'none'
 // Mojang PlayerAuthInput semantics: no server correction can mean that the
 // client's prediction was accepted. It is NO PROOF of arrival or failure.
 // Never convert missing corrections into a 5–15 minute motion penalty.
 if(/^(scout_server_endpoint_unconfirmed|scout_first_waypoint_local_only_server_unverified|scout_local_movement_not_server_verified|door_passage_local_only_server_unverified|crossing_local_endpoint_unverified)$/.test(r))
   return 'evidence_gap'
 if(/scout_waypoint_not_reached|scout_server_endpoint_unconfirmed|scout_timeout|server_movement_not_verified|scout_local_movement_not_server_verified|direct_flat_no_local_motion|direct_flat_first_waypoint_already_local|scout_first_waypoint_local_only_server_unverified|direct_flat_input_error|direct_flat_geometry_changed|door_passage_local_only_server_unverified|crossing_no_local_forward_progress|crossing_local_endpoint_unverified/.test(r))return 'motion'
 if(/vertical_transition_changed_or_unverified|noPath|No path to the goal!|navigation_failure|scout_navigation_failed|direct_flat_stateful_door|direct_flat_hazard|direct_flat_unknown_block|direct_flat_collision_shape_unverified|direct_flat_collision_observed|direct_flat_unsupported_footprint|direct_flat_failed_waypoint_not_adjacent|direct_flat_route_prefix_unverified|direct_flat_failed_waypoint_not_in_route|crossing_open_door_state_unverified|crossing_opposite_side_blocked_or_unknown|crossing_full_floor_unverified|crossing_collision_lane_blocked/.test(r))return 'route'
 return 'probe'
}
// Translate an exhausted local resource task into a real alternative goal.
// This never grants permission to move: only fully verified scout routes do.
function decideAutonomousResponse({plan,woodCount,woodFailure,movementFailure,world,scoutCandidate}={}){
 const resourceNeed=plan==='COLLECT_WOOD'||plan==='LEARN_WEAPON'&&woodCount<2
 if(!resourceNeed)return {action:plan==='OBSERVE'?'OBSERVE':'WORK',
   reason:plan==='OBSERVE'?'inventory_ready':'materials_available',goal:plan}
 if(!woodFailure)return {action:'WORK',reason:'site_not_rejected',goal:plan}
 if(!world?.safeToExplore)return {action:'WAIT',
   reason:world?.phase==='unknown'?'world_time_unknown':'daylight_or_weather_prevents_safe_scout',
   goal:'FIND_NEW_RESOURCE_AREA'}
 if(movementFailure)return {action:'WAIT',reason:'server_movement_unverified_cooldown',goal:'FIND_NEW_RESOURCE_AREA'}
 if(scoutCandidate?.ok)return {action:'SCOUT',reason:'wood_site_rejected_find_new_area',
   goal:'FIND_NEW_RESOURCE_AREA',candidate:scoutCandidate}
 return {action:'WAIT',reason:scoutCandidate?.reason||'no_safe_exploration_route',
   goal:'FIND_NEW_RESOURCE_AREA'}
}
// A bounded *segment* is only a candidate, never a total travel limit.
// When a fresh server position confirms the goal, the next idle cycle can
// re-evaluate another segment with new terrain, time and resource observations.
function candidateScout(bot,{maxSteps=MAX_STEPS,avoid=new Set(),blockedCells=new Set(),previousDirection=null}={}){
 const env=environment(bot)
 if(!env.safeToExplore)return {ok:false,reason:'daylight_or_weather_prevents_safe_scout'}
 if(!Number.isFinite(bot?.health)||bot.health<16)return {ok:false,reason:'low_health_prevents_scout'}
 return planScoutSegment(bot,{maxSteps,avoid,blockedCells,previousDirection})
}
module.exports={environment,siteKey,simpleReason,FailureMemory,candidateScout,
 decideAutonomousResponse,classifyScoutFailure,WOOD_COOLDOWN_MS,SLEEP_COOLDOWN_MS,BED_COOLDOWN_MS,MAX_STEPS}
