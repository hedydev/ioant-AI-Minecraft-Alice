'use strict'
// A two-high OPEN wooden door followed immediately by a FULL-CUBE rise.
// Move only from the proven near-side cell INTO the door cell. Independent BDS
// evidence must confirm this threshold before a separate one-block jump.
const {fullSupport}=require('./escape_survey.cjs')
const {knownAir}=require('./scout_routes.cjs')
const {observedDoorBits}=require('./escape_door_action.cjs')
const {planOpenDoorLane}=require('./door_lane.cjs')
const DOOR=/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door$/
const fin=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isSafeInteger)
const name=b=>String(b?.name||'').replace(/^minecraft:/,'')
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const sources=new Set(['bds_querytarget','bds_script_api','bds_stable_actionbar'])
function planRaisedDoorThreshold(bot,door,{requireNearSide=true}={}){
 const fail=reason=>({ok:false,reason,permitted:false,serverMovementVerified:false})
 const p=bot?.entity?.position
 if(!fin(p)||typeof p.offset!=='function'||typeof bot.blockAt!=='function'||
    bot.entity.onGround!==true||bot.game?.dimension!=='overworld')
   return fail('threshold_position_or_ground_unverified')
 const d=door?.position,a=door?.approach?.position
 if(door?.kind!=='wooden_door'||door.permitted!==false||
    door.approach?.routeComplete!==true||door.approach?.steps!==0||
    door.approach?.elevationChanges!==0||!point(d)||!point(a)||
    d[1]!==a[1]||Math.abs(d[0]-a[0])+Math.abs(d[2]-a[2])!==1)
   return fail('threshold_door_route_invalid')
 if(requireNearSide&&(Math.floor(p.x)!==a[0]||Math.floor(p.y)!==a[1]||
    Math.floor(p.z)!==a[2]||
    Math.hypot(p.x-a[0]-.5,p.y-a[1],p.z-a[2]-.5)>.85))
   return fail('threshold_not_at_near_side')
 const b=[d[0]*2-a[0],d[1],d[2]*2-a[2]]
 const read=(x,y,z)=>{try{return bot.blockAt(p.offset(x-p.x,y-p.y,z-p.z))||null}catch{return null}}
 const low=read(d[0],d[1],d[2]),high=read(d[0],d[1]+1,d[2])
 const l=observedDoorBits(low),h=observedDoorBits(high)
 if(!DOOR.test(name(low))||name(low)!==name(high)||
    l.open!==true||l.upper!==false||h.upper!==true)
   return fail('threshold_open_two_high_door_unverified')
 if(!fullSupport(read(a[0],a[1]-1,a[2]))||
    !fullSupport(read(d[0],d[1]-1,d[2]))||
    !fullSupport(read(b[0],b[1],b[2]))||
    !knownAir(read(a[0],a[1],a[2]))||
    !knownAir(read(a[0],a[1]+1,a[2]))||
    !knownAir(read(a[0],a[1]+2,a[2]))||
    !knownAir(read(d[0],d[1]+2,d[2]))||
    ![1,2,3].every(i=>knownAir(read(b[0],b[1]+i,b[2]))))
   return fail('threshold_full_rise_or_clearance_unverified')
 const lane=planOpenDoorLane(bot,{door:d,from:a})
 if(!lane.ok)return fail(lane.reason)
 if(p[lane.axis]<lane.validMin+.003||p[lane.axis]>lane.validMax-.003)
   return fail('threshold_lane_alignment_required')
 if(Object.values(bot.entities||{}).some(e=>fin(e?.position)&&
    Math.hypot(e.position.x-d[0]-.5,e.position.y-d[1],
      e.position.z-d[2]-.5)<.95))
   return fail('threshold_cell_occupied')
 return {ok:true,action:'ENTER_THRESHOLD',from:a.slice(),door:d.slice(),
   beyond:b,raisedLanding:[b[0],b[1]+1,b[2]],
   lane,permitted:false,serverMovementVerified:false,roomExitVerified:false}
}
async function performRaisedDoorThreshold(bot,door,{
 signal,safe=()=>false,sleep=wait,pulses=4,pulseMs=100}={}){
 const reject=(reason,attempted=false)=>({ok:false,reason,attempted,
   serverMovementVerified:false,roomExitVerified:false})
 const plan=planRaisedDoorThreshold(bot,door)
 if(!plan.ok)return reject(plan.reason)
 if(typeof bot.lookAt!=='function'||typeof bot.setControlState!=='function')
   return reject('threshold_input_unavailable')
 const allowed=()=>{
   if(signal?.aborted)return false
   try{const r=safe();return r===true||r?.ok===true}catch{return false}
 }
 if(!allowed())return reject('threshold_safety_preempted')
 const [ax,ay,az]=plan.from,[dx,,dz]=plan.door
 const ux=dx-ax,uz=dz-az,base={x:ax+.5,z:az+.5}
 const laneAxis=plan.lane.axis
 let attempted=false
 const corridor=()=>{
   const p=bot.entity?.position
   if(!fin(p)||bot.entity.onGround!==true||Math.abs(p.y-ay)>.45)
     return {ok:false,reason:'threshold_ground_or_pose_lost'}
   const rx=p.x-base.x,rz=p.z-base.z
   const forward=rx*ux+rz*uz,lateral=Math.abs(-rx*uz+rz*ux)
   if(forward<-.2||forward>1.35||lateral>.32||
      p[laneAxis]<plan.lane.validMin-.01||
      p[laneAxis]>plan.lane.validMax+.01)
     return {ok:false,reason:'threshold_outside_one_cell_corridor'}
   return {ok:true,forward}
 }
 try{
   const eye=Number.isFinite(bot.entity.eyeHeight)?bot.entity.eyeHeight:1.62
   const target={x:dx+.5,y:ay+eye,z:dz+.5}
   target[laneAxis]=plan.lane.target
   await bot.lookAt(target)
   if(!allowed())return reject('threshold_safety_preempted')
   for(let i=0;i<Math.max(1,Math.min(4,Math.floor(pulses)));i++){
     if(!allowed())return reject('threshold_safety_preempted',attempted)
     const current=corridor()
     if(!current.ok)return reject(current.reason,attempted)
     // An actor entering the door cell is NOT allowed to attempt the stair
     // in this motion. A new BDS pair must settle the threshold first.
     if(current.forward>=.62)return reject('threshold_local_entry_only_bds_pending',attempted)
     // Re-observe the door and raised landing before EVERY bounded pulse.
     const probe=planRaisedDoorThreshold(bot,door,{requireNearSide:false})
     if(!probe.ok)return reject(probe.reason,attempted)
     attempted=true
     try{
       bot.setControlState('forward',true)
       await sleep(Math.max(65,Math.min(110,pulseMs)))
     }finally{bot.setControlState('forward',false)}
   }
   return reject('threshold_input_sent_requires_independent_bds',attempted)
 }catch{return reject('threshold_input_failed_or_interrupted',attempted)}
 finally{try{bot.setControlState('forward',false)}catch{}}
}
function verifyRaisedDoorThreshold(p,obs,local,now){
 const fail=reason=>({ok:false,reason,serverMovementVerified:false,
   roomExitVerified:false,thresholdVerified:false})
 if(!p||!point(p.from)||!point(p.door)||!point(p.beyond)||
    p.kind!=='raised_threshold'||!fin(p.initialBdsFeet)||
    !Number.isSafeInteger(p.epoch)||!Number.isSafeInteger(p.createdAt)||
    !Number.isSafeInteger(p.startedAt)||p.startedAt<p.createdAt||
    !Number.isSafeInteger(now)||now<p.startedAt||now-p.startedAt>240000||
    !Number.isInteger(p.independentSamples)||p.independentSamples<2)
   return fail('threshold_context_or_deadline_invalid')
 if(p.from[1]!==p.door[1]||p.beyond[1]!==p.door[1]||
    Math.abs(p.door[0]-p.from[0])+Math.abs(p.door[2]-p.from[2])!==1||
    p.beyond[0]!==2*p.door[0]-p.from[0]||
    p.beyond[2]!==2*p.door[2]-p.from[2])
   return fail('threshold_geometry_invalid')
 const start={x:p.from[0]+.5,y:p.from[1],z:p.from[2]+.5}
 if(Math.hypot(start.x-p.initialBdsFeet.x,start.y-p.initialBdsFeet.y,
   start.z-p.initialBdsFeet.z)>1.05)
   return fail('threshold_bds_start_mismatch')
 if(!obs||!sources.has(obs.independentSource)||
    (obs.loginAt??null)!==p.loginAt||
    (obs.lifeEpochAt??null)!==p.lifeEpochAt)
   return fail('threshold_identity_or_source_changed')
 if(!Number.isInteger(obs.independentSamples)||
    obs.independentSamples<p.independentSamples+2||
    !Number.isSafeInteger(obs.independentPreviousAt)||
    !Number.isSafeInteger(obs.independentAt)||
    obs.independentPreviousAt<=p.startedAt||
    obs.independentAt<=obs.independentPreviousAt||
    now-obs.independentPreviousAt>4000||now-obs.independentAt>4000||
    now<obs.independentAt)
   return fail('threshold_post_input_pair_missing')
 const end=obs.independentLatestFeet
 if(!fin(end)||!fin(local))return fail('threshold_endpoint_unavailable')
 const center={x:p.door[0]+.5,y:p.door[1],z:p.door[2]+.5}
 const travel=Math.hypot(end.x-p.initialBdsFeet.x,end.y-p.initialBdsFeet.y,
   end.z-p.initialBdsFeet.z)
 const error=Math.hypot(end.x-center.x,end.y-center.y,end.z-center.z)
 const drift=Math.hypot(end.x-local.x,end.y-local.y,end.z-local.z)
 const inDoorTile=Math.floor(end.x)===p.door[0]&&
   Math.floor(end.y)===p.door[1]&&Math.floor(end.z)===p.door[2]
 if(!inDoorTile||travel<.3||travel>1.65||error>.78||drift>.75)
   return {ok:false,reason:'threshold_bds_door_cell_unconfirmed',
     serverMovementVerified:false,roomExitVerified:false,thresholdVerified:false,
     travel,endpointError:error,localDrift:drift}
 return {ok:true,reason:'threshold_independent_bds_confirmed',
   serverMovementVerified:true,roomExitVerified:false,
   thresholdVerified:true,travel,endpointError:error,localDrift:drift}
}
module.exports={planRaisedDoorThreshold,performRaisedDoorThreshold,verifyRaisedDoorThreshold}
