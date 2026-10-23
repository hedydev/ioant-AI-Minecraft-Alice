// Observed candidates must remain inside both the starting work area and a near-bot radius.
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function nearbyWoodCandidates(blocks,origin,current,{maxFromOrigin=18,maxFromCurrent=18,excluded=[]}={}){
 if(!origin||!current)return [];
 return (Array.isArray(blocks)?blocks:[])
 .filter(b=>b?.position&&[b.position.x,b.position.y,b.position.z].every(Number.isFinite))
 .filter(b=>dist(b.position,origin)<=maxFromOrigin&&dist(b.position,current)<=maxFromCurrent)
 .filter(b=>!excluded.some(p=>p.x===b.position.x&&p.y===b.position.y&&p.z===b.position.z))
 .sort((a,b)=>dist(a.position,current)-dist(b.position,current));
}
export function woodDistance(block,current){
 return block?.position&&current?dist(block.position,current):NaN;
}
export function parseWoodCountRequest(message){
 const q=String(message||'').trim().replace(/^[\s@]*(?:alice|艾丽丝|爱丽丝)[，,:：\s]*/i,'').replace(/[。？！?!\s]+$/g,'');
 return /^(?:请|帮我|去|帮忙)?(?:收集|采集|砍|砍点|弄点|找点)(?:(?:一些|点|些|一下|个|些许))?(?:木头|原木|木材|树木|树)$/.test(q)?{needsCount:true}:null;
}
export function parseCountReply(message){
 const q=String(message||'').trim().replace(/^[\s@]*(?:alice|艾丽丝|爱丽丝)[，,:：\s]*/i,'').replace(/[。？！?!\s]+$/g,'');
 const match=q.match(/^(?:收集|采集|要|就|先|给我)?\s*(\d{1,3})\s*(?:个|块|根|组|木头|原木|木材|个木头|块木头)?$/);
 if(!match)return null;
 const n=Number(match[1]);
 return Number.isSafeInteger(n)&&n>=1&&n<=128?n:null;
}
