'use strict'
// Read-only HOME candidate recognition. A confirmed bed is a landmark;
// no door opening, block placement, teleport or Pathfinder calls here.
// Door/room observation is NOT authoritative proof of a traversable route.
const fs=require('node:fs'),path=require('node:path')
const {surveyEscape,fullSupport}=require('./escape_survey.cjs')
const {environment}=require('./world_routine.cjs')
const {knownHostiles}=require('./night_survival.cjs')
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const cell=p=>finite(p)?{x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)}:null
const bed=n=>typeof n==='string'&&(n==='bed'||n.endsWith('_bed'))
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
function observeHome(bot,confirmedBed,{maxDistance=12,escape=null}={}){
 const self=bot?.entity?.position,ref=cell(confirmedBed)
 const fail=reason=>({status:'unverified',reason,bed:ref,door:null,
   roofSamples:0,roofConfirmed:0,reachableCells:0,returnVerified:false})
 if(!finite(self)||!ref||bot?.game?.dimension!=='overworld'||
    typeof self.offset!=='function'||typeof bot?.blockAt!=='function'||
    dist(self,ref)>maxDistance)return fail('bed_out_of_loaded_observation_range')
 const at=(x,y,z)=>{try{return bot.blockAt(self.offset(x-self.x,y-self.y,z-self.z))}catch{return null}}
 if(!bed(at(ref.x,ref.y,ref.z)?.name))return fail('bed_block_not_loaded')
 const survey=escape||surveyEscape(bot,{radius:7,maxNodes:100})
 // Unknown blocks at the OUTER survey frontier are not evidence that the
 // observed bed, interior roof or reachable door approach are unknown.
 // Preserve separate unknown/open-frontier evidence and NEVER classify this
 // as a fully sealed monster-proof house or a route verified by BDS.
 if(!survey?.center||survey.reachableCells<3)
  return fail('reachable_room_floor_unverified')
 const candidates=(survey.doorCandidates||[]).filter(d=>
  d.kind==='wooden_door'&&d.permitted===false&&
  Array.isArray(d.position)&&d.position.length===3&&
  d.position.every(Number.isSafeInteger)&&d.approach?.routeComplete===true&&
  d.approach?.serverVerified===false&&d.approach.position?.length===3&&
  dist({x:d.position[0],y:d.position[1],z:d.position[2]},ref)<=12)
 if(!candidates.length)return fail('wooden_door_or_approach_unverified')
 candidates.sort((a,b)=>a.approach.steps-b.approach.steps)
 const door=candidates[0]
 const points=[cell(self),ref,
  {x:door.approach.position[0],y:door.approach.position[1],z:door.approach.position[2]}]
 let roofSamples=0,roofConfirmed=0
 for(const p of points){
  if(!p||Math.abs(p.y-Math.floor(self.y))>1)continue
  roofSamples++
  let known=true,top=false
  for(let h=2;h<=5;h++){
   const b=at(p.x,p.y+h,p.z)
   if(!b){known=false;break}
   if(fullSupport(b)){top=true;break}
  }
  if(known&&top)roofConfirmed++
 }
 if(roofSamples<2||roofConfirmed<2)
  return {...fail('roof_or_room_height_unverified'),roofSamples,roofConfirmed,
    reachableCells:survey.reachableCells}
 return {status:'observed_indoor_home_candidate',reason:'bed_roof_and_wooden_door_observed',
   bed:ref,door:{x:door.position[0],y:door.position[1],z:door.position[2]},
   doorApproach:{x:door.approach.position[0],y:door.approach.position[1],z:door.approach.position[2]},
   roofSamples,roofConfirmed,reachableCells:survey.reachableCells,
   outerSurveyUnknown:Math.max(0,Number(survey.unknownCells)||0),
   outerSurveyFrontierObserved:!!survey.openFrontier,
   enclosureVerified:false,roofAndDoorObserved:true,
   returnVerified:false,doorPassageVerified:false,hostilesNear:!!knownHostiles(bot).near}
}
function homeAgenda(bot,base,{mode='companion',stopped=false,following=false,
  threat=false,serverProof=false}={}){
 const env=environment(bot),pos=bot?.entity?.position
 const fail=reason=>({phase:env.phase,objective:'none',reason,returnRouteVerified:false})
 if(mode!=='autonomous')return fail('companion_mode_does_not_override_owner')
 if(stopped||following||threat)return fail('higher_priority_human_or_safety_order')
 if(!base?.bed||!base?.door)return fail('home_door_or_bed_unverified')
 if(bot?.game?.dimension!=='overworld'||!finite(pos))
  return fail('home_dimension_or_position_unknown')
 const near=dist(pos,base.bed)<=5
 if(env.phase==='night'||env.phase==='dusk'){
  return near?{phase:env.phase,objective:'stay_near_home',
    reason:'home_candidate_present_bed_sleep_priority',returnRouteVerified:false}:
   {phase:env.phase,objective:'return_home',reason:serverProof?
     'requires_observed_server_verified_return_segments':
     'independent_bds_gate_not_ready',returnRouteVerified:false}
 }
 if(env.phase==='day'&&env.tick!==null&&env.tick>=8500){
  return near?{phase:env.phase,objective:'prepare_night_at_home',
    reason:'near_home_before_dusk',returnRouteVerified:false}:
   {phase:env.phase,objective:'return_home',reason:serverProof?
     'requires_observed_server_verified_return_segments':
     'independent_bds_gate_not_ready',returnRouteVerified:false}
 }
 return fail('daytime_home_not_urgent')
}
class HomeBaseMemory{
 constructor({file=null,clock=Date.now}={}){
  this.file=file;this.clock=clock;this.record=null;this.last=null;this.nextObserveAt=0
  if(file)try{
   const s=fs.lstatSync(file,{throwIfNoEntry:false})
   if(s?.isFile()&&!s.isSymbolicLink()&&s.size<=1200&&!(s.mode&0o077)){
    const d=JSON.parse(fs.readFileSync(file,'utf8'))
    if(d?.version===1&&d.dimension==='overworld'&&cell(d.bed)&&
       cell(d.door)&&cell(d.doorApproach)&&
       Number.isSafeInteger(d.observedAt)&&d.observedAt>0)
      this.record=d
   }
  }catch{}
 }
 observe(bot,verifiedBed,{clock=this.clock,escape=null,spawnConfirmed=false}={}){
  const now=clock()
  if(now<this.nextObserveAt)return this.last||{status:'scan_cooldown'}
  this.nextObserveAt=now+30000
  const result=observeHome(bot,verifiedBed,{escape})
  this.last={...result,at:now}
  // A visibly enclosed room with a BED is not yet Alice's persistent HOME
  // until this BED was independently confirmed as personal spawn.
  if(result.status!=='observed_indoor_home_candidate'||!spawnConfirmed)return this.last
  const record={version:1,dimension:'overworld',bed:result.bed,
    door:result.door,doorApproach:result.doorApproach,observedAt:now,
    verifiedExit:false,verifiedReturn:false,enclosureVerified:false}
  this.record=record
  if(this.file)try{
   const dir=path.dirname(this.file)
   if(fs.lstatSync(dir,{throwIfNoEntry:false})?.isSymbolicLink()||
      fs.lstatSync(this.file,{throwIfNoEntry:false})?.isSymbolicLink())
    throw Error('unsafe_home_record_path')
   fs.mkdirSync(dir,{recursive:true,mode:0o700})
   const temp=path.join(dir,'.home-base-'+process.pid+'.tmp')
   fs.writeFileSync(temp,JSON.stringify(record),{mode:0o600})
   fs.renameSync(temp,this.file)
  }catch{}
  return this.last
 }
 summary(){return {status:!this.record?'not_established':
    'observed_candidate_not_route_verified',
   bed:this.record?.bed||null,door:this.record?.door||null,
   observedAt:this.record?.observedAt||null,
   exitVerified:false,returnVerified:false,enclosureVerified:false,
   outerSurveyUnknown:this.last?.outerSurveyUnknown??null,
   outerSurveyFrontierObserved:this.last?.outerSurveyFrontierObserved??null,
   lastSurvey:this.last?.status||null,
   lastReason:this.last?.reason||null,
   // Transient geometry is not persisted HOME or verified passage.
   lastObservedAt:this.last?.at??null}}
}
module.exports={observeHome,homeAgenda,HomeBaseMemory}
