'use strict'
// A loaded but >7-block bed can guide exactly ONE known flat cell closer to
// it. Not a route to the bed; never authorizes any additional step, door,
// vertical movement, digging, teleporting, or a claimed server endpoint.
const {knownAir}=require('./scout_routes.cjs')
const {fullSupport}=require('./escape_survey.cjs')
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
function selectDirectionalBedStep(bot,bed,{radius=16}={}){
 const fail=reason=>({ok:false,reason,permitted:false,serverVerified:false})
 const pos=bot?.entity?.position
 if(!finite(pos)||!finite(bed)||!pos.offset||
    bot.entity?.onGround!==true||typeof bot.blockAt!=='function')
   return fail('directional_bed_ground_or_chunk_unverified')
 if(bot.game?.dimension!=='overworld'||dist(pos,bed)>radius||
    dist(pos,bed)<=1.95)return fail('directional_bed_not_far_observed_target')
 const block=(x,y,z)=>{
  try{return bot.blockAt(pos.offset(x-pos.x,y-pos.y,z-pos.z))}
  catch{return null}
 }
 const original={x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)}
 const safe=(x,y,z)=>fullSupport(block(x,y-1,z))&&
   knownAir(block(x,y,z))&&knownAir(block(x,y+1,z))
 if(!safe(original.x,original.y,original.z))
   return fail('directional_bed_origin_terrain_unverified')
 const fromDist=Math.hypot(pos.x-bed.x,pos.z-bed.z)
 const options=[]
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const cell={x:original.x+dx,y:original.y,z:original.z+dz}
  if(!safe(cell.x,cell.y,cell.z))continue
  const nextDist=Math.hypot(cell.x+.5-(bed.x+.5),cell.z+.5-(bed.z+.5))
  if(nextDist>fromDist-.25)continue
  const occupied=Object.values(bot.entities||{}).some(e=>finite(e?.position)&&
    Math.hypot(e.position.x-(cell.x+.5),e.position.y-cell.y,
      e.position.z-(cell.z+.5))<1.1)
  if(occupied)continue
  options.push({cell,remaining:nextDist})
 }
 options.sort((a,b)=>a.remaining-b.remaining)
 if(!options.length)return fail('directional_bed_no_safe_closer_flat_cell')
 const chosen=options[0].cell
 return {ok:true,reason:'observed_single_flat_bedward_cell',
   target:{x:bed.x,y:bed.y,z:bed.z},
   first:[chosen.x,chosen.y,chosen.z],permitted:false,
   serverVerified:false,destinationBedReached:false}
}
module.exports={selectDirectionalBedStep}
