'use strict'
// A NEW independent BDS pair is required after a one-cell jump from a
// previously BDS-verified wooden door threshold. Never trust local physics.
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
const cell=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isSafeInteger)
const sources=new Set(['bds_querytarget','bds_script_api','bds_stable_actionbar'])
function verifyRaisedDoorLanding(p,o,local,now){
 const reject=reason=>({ok:false,reason,serverMovementVerified:false,
   roomExitVerified:false,raisedLandingVerified:false})
 if(!p||p.kind!=='raised_landing'||!cell(p.door)||!cell(p.beyond)||
    !finite(p.initialBdsFeet)||!Number.isSafeInteger(p.epoch)||
    !Number.isSafeInteger(p.startedAt)||!Number.isSafeInteger(p.createdAt)||
    p.startedAt<p.createdAt||!Number.isSafeInteger(now)||
    now<p.startedAt||now-p.startedAt>240000||
    !Number.isInteger(p.independentSamples)||p.independentSamples<2)
   return reject('raised_landing_context_or_deadline_invalid')
 const [x,y,z]=p.door,[bx,by,bz]=p.beyond
 if(by!==y||Math.abs(bx-x)+Math.abs(bz-z)!==1)
   return reject('raised_landing_geometry_invalid')
 if(Math.hypot(p.initialBdsFeet.x-x-.5,
     p.initialBdsFeet.y-y,p.initialBdsFeet.z-z-.5)>.78)
   return reject('raised_landing_start_mismatch')
 if(!o||!sources.has(o.independentSource)||
    (o.loginAt??null)!==p.loginAt||
    (o.lifeEpochAt??null)!==p.lifeEpochAt)
   return reject('raised_landing_identity_or_source_changed')
 if(!Number.isInteger(o.independentSamples)||
    o.independentSamples<p.independentSamples+2||
    !Number.isSafeInteger(o.independentPreviousAt)||
    !Number.isSafeInteger(o.independentAt)||
    o.independentPreviousAt<=p.startedAt||
    o.independentAt<=o.independentPreviousAt||
    now<o.independentAt||now-o.independentPreviousAt>4000||
    now-o.independentAt>4000)
   return reject('raised_landing_post_input_pair_missing')
 const end=o.independentLatestFeet
 if(!finite(end)||!finite(local))
   return reject('raised_landing_endpoint_unavailable')
 const travelled=Math.hypot(end.x-p.initialBdsFeet.x,
   end.y-p.initialBdsFeet.y,end.z-p.initialBdsFeet.z)
 const error=Math.hypot(end.x-bx-.5,end.y-by-1,end.z-bz-.5)
 const drift=Math.hypot(end.x-local.x,end.y-local.y,end.z-local.z)
 if(Math.floor(end.x)!==bx||Math.floor(end.y)!==by+1||
    Math.floor(end.z)!==bz||travelled<.8||travelled>2.3||
    error>.78||drift>.75)
   return {...reject('raised_landing_bds_endpoint_unconfirmed'),
     travelled,endpointError:error,localDrift:drift}
 return {ok:true,reason:'raised_landing_new_independent_bds_confirmed',
   serverMovementVerified:true,roomExitVerified:false,
   raisedLandingVerified:true,travelled,endpointError:error,localDrift:drift}
}
module.exports={verifyRaisedDoorLanding}
