'use strict';
// Pure update guard for the live 3D history list. DOM nodes must remain
// stable while a user is highlighting or copying log text.
(function(root){
  function timelineSignature(rows,emptyText=''){
    const clean=(Array.isArray(rows)?rows:[]).slice(-24).map(row=>[
      Number.isFinite(row?.at)?row.at:null,
      typeof row?.level==='string'?row.level:'',
      typeof row?.message==='string'?row.message:''
    ]);
    return JSON.stringify([emptyText,clean]);
  }
  function shouldReplaceTimeline({previous,next,pointerActive=false,selectionActive=false}){
    return previous!==next&&!pointerActive&&!selectionActive;
  }
  const api={timelineSignature,shouldReplaceTimeline};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.AliceWorldTimeline=api;
})(typeof window!=='undefined'?window:null);
