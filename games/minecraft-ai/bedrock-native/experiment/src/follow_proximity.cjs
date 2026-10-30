'use strict'
// Local FOLLOW arrival is NOT BDS movement proof or jump/path permission.
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
function followProximity(self,target,radius){
 if(!finite(self)||!finite(target)||!Number.isFinite(radius)||radius<2||radius>12)
   return {inside:false,reason:'unverified_position_or_range'}
 const dx=self.x-target.x,dy=self.y-target.y,dz=self.z-target.z
 const distance=Math.hypot(dx,dy,dz)
 // An owner one floor higher still needs safe ordinary stair traversal.
 const inside=Math.abs(dy)<=0.65&&distance<=radius
 return {inside,reason:inside?'inside_configured_radius':'needs_safe_follow_path',distance}
}
module.exports={followProximity}
