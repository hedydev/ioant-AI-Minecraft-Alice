'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fitCamera,projected}=require('../../../dashboard/world_camera.js');
for(const [width,height] of [[1070,800],[420,320],[280,350],[1500,480]]){
 for(const angle of [.66,1.8,3.14,4.7]){
  test('fit 31x31 voxel radius 15 inside '+width+'x'+height+' yaw '+angle,()=>{
   const args={width,height,angle,pitch:.65,origin:[-5,67,8],center:[-4.5,67,8.5],
     radius:15,below:6,above:5,zoom:1};
   const fit=fitCamera(args);
   assert(fit.scale>0);
   for(const x of [-20,11])for(const y of [61,73])for(const z of [-7,24]){
    const p=projected(x,y,z,args);
    const px=fit.offsetX+p.x*fit.scale,py=fit.offsetY+p.y*fit.scale;
    assert(px>=fit.padding.left-0.01&&px<=width-fit.padding.right+0.01,
      'x must fit canvas: '+px);
    assert(py>=fit.padding.top-0.01&&py<=height-fit.padding.bottom+0.01,
      'y must fit canvas: '+py);
   }
  });
 }
}
test('manual zoom scales scene deliberately without affecting camera bounds',()=>{
 const base={width:1000,height:600,angle:.66,pitch:.65,origin:[0,70,0],
   radius:15,below:6,above:5,center:[.5,70,.5]};
 const regular=fitCamera({...base,zoom:1}),zoomed=fitCamera({...base,zoom:1.25});
 assert(Math.abs(zoomed.scale/regular.scale-1.25)<.001);
 assert.throws(()=>fitCamera({...base,radius:NaN}),/invalid_camera_fit_inputs/);
});

test('mouse orbit fit never changes scale or framing with yaw or pitch',()=>{
  const {fitOrbitCamera,projected}=require('../../../dashboard/world_camera.js');
  for(const [width,height] of [[1070,800],[420,320],[280,350],[1500,480]]){
    const base=fitOrbitCamera({width,height,radius:15,below:6,above:5});
    for(const angle of [0,.66,1.3,2.8,4.1,6.2]){
      for(const pitch of [.24,.65,.99,1.3]){
        const current=fitOrbitCamera({width,height,radius:15,below:6,above:5});
        assert.equal(current.scale,base.scale);
        assert.equal(current.offsetX,base.offsetX);
        assert.equal(current.offsetY,base.offsetY);
        const center=[-4.5,67,8.5],origin=[-5,67,8];
        for(const x of [-20,11])for(const y of [61,73])for(const z of [-7,24]){
          const p=projected(x,y,z,{angle,pitch,center});
          const sx=base.offsetX+p.x*base.scale,sy=base.offsetY+p.y*base.scale;
          assert(sx>=base.padding.left-.01&&sx<=width-base.padding.right+.01);
          assert(sy>=base.padding.top-.01&&sy<=height-base.padding.bottom+.01);
        }
      }
    }
  }
});
test('mouse wheel zoom changes only scale, without spontaneous framing changes',()=>{
  const {fitOrbitCamera}=require('../../../dashboard/world_camera.js');
  const opts={width:930,height:580,radius:15,below:6,above:5};
  const atFit=fitOrbitCamera(opts);
  const zoomIn=fitOrbitCamera({...opts,zoom:1.12});
  const zoomOut=fitOrbitCamera({...opts,zoom:.88});
  assert(Math.abs(zoomIn.scale/atFit.scale-1.12)<1e-8);
  assert(Math.abs(zoomOut.scale/atFit.scale-.88)<1e-8);
  assert.equal(atFit.offsetX,zoomIn.offsetX);
  assert.equal(atFit.offsetY,zoomOut.offsetY);
  assert.throws(()=>fitOrbitCamera({...opts,width:0}),/invalid_orbit_fit_inputs/);
});

test('observed scene is centered once, with finite view limits and no fictitious blocks',()=>{
 const {fitOrbitCamera,panToObservedScene,projected}=require('../../../dashboard/world_camera.js');
 const width=1050,height=590,angle=.66,pitch=.65;
 const origin=[0,70,0],center=[.5,70,.5];
 const fit=fitOrbitCamera({width,height,radius:15,below:6,above:5,zoom:1});
 const voxels=[];
 for(let x=-4;x<=4;x++)for(let z=-3;z<=3;z++)voxels.push([x,-3,z,1]);
 const pan=panToObservedScene({voxels,origin,center,angle,pitch,width,height,fit});
 assert(Number.isFinite(pan.x)&&Number.isFinite(pan.y));
 let minY=Infinity,maxY=-Infinity;
 for(const v of voxels){
  const p=projected(origin[0]+v[0],origin[1]+v[1],origin[2]+v[2],
    {center,angle,pitch});
  const sy=fit.offsetY+(p.y+pan.y)*fit.scale;
  minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);
 }
 assert(Math.abs((minY+maxY)/2-height/2)<125,'occupied scenery should not hug only the upper edge');
 assert.deepEqual(panToObservedScene({voxels:[],origin,center,angle,pitch,width,height,fit}),{x:0,y:0});
});
