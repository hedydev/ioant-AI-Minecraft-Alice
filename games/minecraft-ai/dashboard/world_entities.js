'use strict';
// Pure grouping helper shared by read-only 3D dashboard and Node regressions.
// Counts represent entities PRESENT IN THIS BOUNDED FEED, never whole-world totals.
(function(root){
  const KIND=/^[a-z0-9_]{1,32}$/;
  const ITEM=/^[a-z0-9_:.-]{1,64}$/;
  const DROPS=new Set(['item','item_entity','dropped_item']);
  const positionValid=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  function groupNearbyEntities(rows,observer){
    const groups=new Map(),origin=positionValid(observer)?observer:null;
    for(const e of Array.isArray(rows)?rows:[]){
      const kind=typeof e?.kind==='string'?e.kind:'';
      if(!KIND.test(kind)||!positionValid(e.position))continue;
      const itemName=DROPS.has(kind)&&typeof e.itemName==='string'&&ITEM.test(e.itemName)?
        e.itemName:null;
      // Separate different item IDs, never merge unknown drops with known ones.
      const key=kind+'|'+(itemName||'');
      const distance=origin?e.position.reduce((total,v,i)=>total+(v-origin[i])**2,0):null;
      const group=groups.get(key);
      if(group){
        group.count++;
        if(origin&&distance<group.distance){
          group.distance=distance;
          group.position=e.position.slice();
        }
      }else{
        groups.set(key,{kind,itemName,count:1,position:e.position.slice(),distance});
      }
    }
    return [...groups.values()].map(({distance,...display})=>display);
  }
  const api={groupNearbyEntities};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.AliceNearbyEntities=api;
})(typeof window!=='undefined'?window:null);
