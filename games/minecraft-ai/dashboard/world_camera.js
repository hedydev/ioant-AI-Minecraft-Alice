'use strict';
// Deterministic isometric fit for a bounded, known voxel observation region.
// The camera changes only pixels, never client movement or server position.
(function(root){
  function projected(x,y,z,{angle,pitch,center}){
    const dx=x-center[0],dy=y-center[1],dz=z-center[2];
    const side=dx*Math.cos(angle)-dz*Math.sin(angle);
    const forward=dx*Math.sin(angle)+dz*Math.cos(angle);
    return {x:side,y:forward*Math.sin(pitch)-dy*Math.cos(pitch)};
  }
  function fitCamera({width,height,angle,pitch,origin,radius,below,above,center,zoom=1}){
    if(![width,height,angle,pitch,radius,below,above,zoom].every(Number.isFinite)||
       !Array.isArray(origin)||!Array.isArray(center)||origin.length!==3||
       center.length!==3||![...origin,...center].every(Number.isFinite)||
       width<=0||height<=0||radius<0||below<0||above<0)
      throw Error('invalid_camera_fit_inputs');
    const xs=[origin[0]-radius,origin[0]+radius+1];
    const ys=[origin[1]-below,origin[1]+above+1];
    const zs=[origin[2]-radius,origin[2]+radius+1];
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const x of xs)for(const y of ys)for(const z of zs){
      const p=projected(x,y,z,{angle,pitch,center});
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
      minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)
    }
    // Keep the canvas legend (top left) and rendered labels unobstructed.
    const left=Math.min(24,width*.07),right=left;
    const top=Math.min(55,height*.15),bottom=Math.min(28,height*.08);
    const innerW=Math.max(1,width-left-right);
    const innerH=Math.max(1,height-top-bottom);
    const scale=Math.min(innerW/Math.max(.001,maxX-minX),
      innerH/Math.max(.001,maxY-minY))*Math.max(.45,Math.min(2.5,zoom));
    return {
      scale,
      offsetX:left+innerW/2-(minX+maxX)*scale/2,
      offsetY:top+innerH/2-(minY+maxY)*scale/2,
      bounds:{minX,maxX,minY,maxY},padding:{left,right,top,bottom}
    };
  }
  // Mouse-orbit camera: stable across any yaw and accepted pitch.
  // Alice stays at a fixed canvas pivot; rotation must NEVER implicitly
  // change zoom or pan. Conservative analytic bounds cover all 31x31x12
  // voxel corners. Wheel zoom may deliberately magnify beyond the viewport.
  function fitOrbitCamera({width,height,radius,below,above,zoom=1}){
    if(![width,height,radius,below,above,zoom].every(Number.isFinite)||
       width<=0||height<=0||radius<0||below<0||above<0||zoom<=0)
      throw Error('invalid_orbit_fit_inputs');
    const left=Math.min(24,width*.07),right=left;
    const top=Math.min(55,height*.15),bottom=Math.min(28,height*.08);
    // Alice's fraction within the center block can vary from 0 to <1.
    const horizontal=Math.SQRT2*(radius+1);
    const vertical=Math.hypot(horizontal,Math.max(below+1,above+1));
    const innerW=Math.max(1,width-left-right);
    const innerH=Math.max(1,height-top-bottom);
    const fitScale=Math.min(innerW/(horizontal*2),innerH/(vertical*2));
    return {
      scale:fitScale*Math.max(.45,Math.min(2.5,zoom)),
      fitScale,
      offsetX:left+innerW/2,
      offsetY:top+innerH/2,
      padding:{left,right,top,bottom}
    };
  }
  // Frame OCCUPIED sampled voxels once, not on each drag frame. Keeping
  // this pan stable makes the world occupy the Canvas more naturally while
  // preserving the prior Alice-centered orbit and zoom response.
  function panToObservedScene({voxels,origin,center,angle,pitch,width,height,fit}){
    if(!Array.isArray(voxels)||!Array.isArray(origin)||!Array.isArray(center)||
       !fit||!Number.isFinite(fit.scale)||fit.scale<=0||
       ![width,height,angle,pitch,...origin,...center].every(Number.isFinite))
      return {x:0,y:0};
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const v of voxels){
      if(!Array.isArray(v)||v.length<3||!v.slice(0,3).every(Number.isFinite))continue;
      minX=Math.min(minX,origin[0]+v[0]);maxX=Math.max(maxX,origin[0]+v[0]+1);
      minY=Math.min(minY,origin[1]+v[1]);maxY=Math.max(maxY,origin[1]+v[1]+1);
      minZ=Math.min(minZ,origin[2]+v[2]);maxZ=Math.max(maxZ,origin[2]+v[2]+1);
    }
    if(!Number.isFinite(minX))return {x:0,y:0};
    // Alice's model and label should remain in the frame.
    minX=Math.min(minX,center[0]-.4);maxX=Math.max(maxX,center[0]+.4);
    minY=Math.min(minY,center[1]);maxY=Math.max(maxY,center[1]+2.5);
    minZ=Math.min(minZ,center[2]-.4);maxZ=Math.max(maxZ,center[2]+.4);
    let px0=Infinity,px1=-Infinity,py0=Infinity,py1=-Infinity;
    for(const x of [minX,maxX])for(const y of [minY,maxY])for(const z of [minZ,maxZ]){
      const p=projected(x,y,z,{angle,pitch,center});
      px0=Math.min(px0,p.x);px1=Math.max(px1,p.x);
      py0=Math.min(py0,p.y);py1=Math.max(py1,p.y);
    }
    const range=(min,max,targetLow,targetHigh,offset)=>{
      const proposed=-(min+max)/2;
      const low=(targetLow-offset)/fit.scale-min;
      const high=(targetHigh-offset)/fit.scale-max;
      return low<=high?Math.max(low,Math.min(high,proposed)):(low+high)/2;
    };
    const pad=fit.padding||{left:0,right:0,top:0,bottom:0};
    return {
      x:range(px0,px1,pad.left,width-pad.right,fit.offsetX),
      y:range(py0,py1,pad.top,height-pad.bottom,fit.offsetY)
    };
  }
  const api={fitCamera,fitOrbitCamera,panToObservedScene,projected};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.AliceWorldCamera=api;
})(typeof window!=='undefined'?window:null);
