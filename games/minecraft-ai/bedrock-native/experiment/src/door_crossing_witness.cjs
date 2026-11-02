'use strict'
// A packet correction or local door traversal is never independent BDS proof.
// Accept ONE attempted full doorway crossing only after a later NEW BDS pair.
const good=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isSafeInteger)
const sources=new Set(['bds_querytarget','bds_script_api','bds_stable_actionbar'])
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
function verifyDoorCrossing(p,obs,local,now){
 const reject=reason=>({ok:false,reason,serverMovementVerified:false,roomExitVerified:false})
 if(!p||!point(p.door)||!point(p.from)||!point(p.beyond)||
    !good(p.initialBdsFeet)||!Number.isSafeInteger(p.startedAt)||
    !Number.isSafeInteger(p.createdAt)||!Number.isSafeInteger(p.epoch)||
    !Number.isInteger(p.independentSamples)||p.independentSamples<2||
    !Number.isSafeInteger(now)||now<p.startedAt||
    now-p.startedAt>240000||p.startedAt<p.createdAt)
   return reject('door_crossing_context_or_deadline_invalid')
 const [x,y,z]=p.door,from=p.from,beyond=p.beyond
 if(y!==from[1]||y!==beyond[1]||
    Math.abs(from[0]-x)+Math.abs(from[2]-z)!==1||
    beyond[0]!==2*x-from[0]||beyond[2]!==2*z-from[2])
   return reject('door_crossing_geometry_invalid')
 const start={x:from[0]+.5,y:from[1],z:from[2]+.5}
 if(distance(start,p.initialBdsFeet)>1.05)
   return reject('door_crossing_start_bds_mismatch')
 if(!obs||!sources.has(obs.independentSource)||
    (obs.loginAt??null)!==p.loginAt||
    (obs.lifeEpochAt??null)!==p.lifeEpochAt)
   return reject('door_crossing_identity_or_source_changed')
 if(!Number.isInteger(obs.independentSamples)||
    obs.independentSamples<p.independentSamples+2||
    !Number.isSafeInteger(obs.independentPreviousAt)||
    !Number.isSafeInteger(obs.independentAt)||
    obs.independentPreviousAt<=p.startedAt||
    obs.independentAt<=obs.independentPreviousAt||
    now-obs.independentPreviousAt>4000||
    now-obs.independentAt>4000||now<obs.independentAt)
   return reject('door_crossing_post_input_pair_missing')
 if(!good(local)||!good(obs.independentLatestFeet))
   return reject('door_crossing_endpoint_unavailable')
 const target={x:beyond[0]+.5,y:beyond[1],z:beyond[2]+.5}
 const end=obs.independentLatestFeet
 const targetError=distance(end,target),travel=distance(end,p.initialBdsFeet),
       drift=distance(end,local)
 if(targetError>1.0||travel<1.25||travel>3.5||drift>.75)
   return {ok:false,reason:'door_crossing_bds_destination_unconfirmed',
     serverMovementVerified:false,roomExitVerified:false,
     targetError,travel,localDrift:drift}
 return {ok:true,reason:'door_crossing_new_independent_bds_confirmed',
   serverMovementVerified:true,roomExitVerified:false,
   targetError,travel,localDrift:drift}
}
module.exports={verifyDoorCrossing}
