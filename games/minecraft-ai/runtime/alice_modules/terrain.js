import Vec3 from 'vec3';
import { classifyAdvance } from './terrain_policy.js';
export { classifyAdvance, cautiousPathOptions } from './terrain_policy.js';

export function inspectAdvance(bot, position, toward) {
  const p=position.floored();
  const dx=toward.x-position.x, dz=toward.z-position.z;
  const len=Math.hypot(dx,dz);
  if (len<.2) return {status:'NO_FORWARD',canStep:false,narrow:false};
  const sx=Math.abs(dx)>=Math.abs(dz)?Math.sign(dx):0;
  const sz=sx===0?Math.sign(dz):0;
  const block=(x,y,z)=>bot.blockAt(new Vec3(x,y,z));
  const ahead={x:p.x+sx,z:p.z+sz};
  const side=[-sz,sx];
  return classifyAdvance({
    currentFloor:block(p.x,p.y-1,p.z),
    aheadFloor:block(ahead.x,p.y-1,ahead.z),
    aheadFeet:block(ahead.x,p.y,ahead.z),
    aheadHead:block(ahead.x,p.y+1,ahead.z),
    stepHead:block(ahead.x,p.y+2,ahead.z),
    leftFloor:block(ahead.x+side[0],p.y-1,ahead.z+side[1]),
    rightFloor:block(ahead.x-side[0],p.y-1,ahead.z-side[1])
  });
}
