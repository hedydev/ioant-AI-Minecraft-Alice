'use strict'
// A model proposal or read-only autonomous survey is NOT movement authority.
// Keep only a short, current-life, flat WALK candidate. A new independent
// BDS pair and the original startJob/terrain/safety gates must re-admit it.
const TTL_MS=240000 // Covers one existing 180s witness interval; never extends a witness TTL.
const finite=p=>p&&['x','y','z'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&Math.abs(p[k])<30000000)
const point=p=>({x:p.x,y:p.y,z:p.z})
const routeKey=k=>typeof k==='string'&&/^-?\d+,-?\d+,-?\d+$/.test(k)
function flatCandidate(candidate){
 return candidate?.ok===true&&candidate.kind==='observed_voxel_walking_only'&&
  routeKey(candidate.key)&&finite(candidate.target)&&
  Number.isFinite(candidate.distance)&&candidate.distance>0&&candidate.distance<=8&&
  Array.isArray(candidate.waypoints)&&candidate.waypoints.length>=1&&
  candidate.waypoints.length<=8&&candidate.waypoints.every(finite)
}
const equalPath=(a,b)=>flatCandidate(a)&&flatCandidate(b)&&
 a.key===b.key&&['x','y','z'].every(k=>a.target[k]===b.target[k])&&
 a.waypoints.length===b.waypoints.length&&
 a.waypoints.every((p,i)=>['x','y','z'].every(k=>p[k]===b.waypoints[i][k]))
class PreparedScout{
 constructor({clock=Date.now}={}){this.clock=clock;this.pending=null}
 clear(){this.pending=null}
 prepare(candidate,{position,epoch,loginAt,lifeEpochAt=null,dimension,phase,weather,source}={}){
  const now=this.clock()
  if(!flatCandidate(candidate)||!finite(position)||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(loginAt)||loginAt<=0||
    !Number.isSafeInteger(epoch)||!['自主模型','自主探索'].includes(source)||
    typeof dimension!=='string'||!dimension||phase!=='day'||weather!=='clear'){
   this.clear();return false
  }
  this.pending={at:now,epoch,loginAt,lifeEpochAt,dimension,phase,weather,source,
    origin:point(position),candidate:{...candidate,target:point(candidate.target),
      waypoints:candidate.waypoints.map(point)}}
  return true
 }
 take({position,epoch,loginAt,lifeEpochAt=null,dimension,phase,weather}={}){
  const p=this.pending
  if(!p)return {ok:false,reason:'no_prepared_scout'}
  const now=this.clock()
  const valid=Number.isSafeInteger(now)&&now>=p.at&&now-p.at<=TTL_MS&&
   Number.isSafeInteger(epoch)&&epoch===p.epoch&&
   loginAt===p.loginAt&&lifeEpochAt===p.lifeEpochAt&&
   dimension===p.dimension&&phase===p.phase&&weather===p.weather&&
   finite(position)&&Math.hypot(position.x-p.origin.x,
     position.y-p.origin.y,position.z-p.origin.z)<=.30
  this.clear() // One-shot; an unsafe or stale candidate never re-arms itself.
  return valid?{ok:true,source:p.source,candidate:p.candidate}:
   {ok:false,reason:'prepared_scout_context_changed'}
 }
 has(){return this.pending!==null}
}
module.exports={PreparedScout,flatCandidate,equalPath,TTL_MS}
