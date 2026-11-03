'use strict'
// A loaded distant bed may propose exactly ONE horizontal step toward it.
// Verify the entire avatar footprint against observed Bedrock collision
// shapes: a non-solid torch is not a two-block wall, and low ceilings may
// permit WALK while independently preventing JUMP. Never infer a door is open.
// This proposes no permission and no server-confirmed movement.
const {verifyFlatFirstStep}=require('./direct_flat_step.cjs')
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
function selectDirectionalBedStep(bot,bed,{radius=16}={}){
 const fail=reason=>({ok:false,reason,permitted:false,serverVerified:false})
 const pos=bot?.entity?.position
 if(!finite(pos)||!finite(bed)||typeof pos.offset!=='function'||
    bot.entity?.onGround!==true||typeof bot.blockAt!=='function')
   return fail('directional_bed_ground_or_chunk_unverified')
 if(bot.game?.dimension!=='overworld'||dist(pos,bed)>radius||
    dist(pos,bed)<=1.95)return fail('directional_bed_not_far_observed_target')
 const original={x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)}
 const fromDist=Math.hypot(pos.x-bed.x,pos.z-bed.z)
 const options=[]
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const cell={x:original.x+dx,y:original.y,z:original.z+dz}
  const nextDist=Math.hypot(cell.x+.5-(bed.x+.5),cell.z+.5-(bed.z+.5))
  if(nextDist>fromDist-.25)continue
  // No nearby entity may occupy the intended target, regardless of
  // whether it is presently hostile or attacking.
  // The pinned Bedrock lifecycle stores bot.entity in bot.entities too.
  // At a one-block destination Alice is herself <1.1 blocks away; she
  // must not be interpreted as another player blocking every flat step.
  const occupied=Object.values(bot.entities||{}).some(e=>e!==bot.entity&&
    !(e?.id!=null&&bot.entity.id!=null&&String(e.id)===String(bot.entity.id))&&
    finite(e?.position)&&
    Math.hypot(e.position.x-(cell.x+.5),e.position.y-cell.y,
      e.position.z-(cell.z+.5))<1.1)
  if(occupied)continue
  const check=verifyFlatFirstStep(bot,{
    kind:'observed_voxel_walking_only',waypoints:[cell]})
  if(!check.ok)continue
  options.push({cell,remaining:nextDist})
 }
 options.sort((a,b)=>a.remaining-b.remaining)
 if(!options.length)return fail('directional_bed_no_collision_verified_flat_cell')
 const chosen=options[0].cell
 return {ok:true,reason:'observed_single_flat_bedward_cell_collision_checked',
   target:{x:bed.x,y:bed.y,z:bed.z},
   first:[chosen.x,chosen.y,chosen.z],permitted:false,
   serverVerified:false,destinationBedReached:false}
}
module.exports={selectDirectionalBedStep}
