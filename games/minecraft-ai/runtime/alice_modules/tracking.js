import fs from 'node:fs';
import path from 'node:path';

// A trusted Paper-side coordinate feed can optionally write this local JSON.
// Never assume the client knows a distant entity's position.
const MAX_AGE_MS=30000;
const validCoord=v=>typeof v==='number' && Number.isFinite(v) && Math.abs(v)<=29999984;
const validLoc=(fix,dimension)=>{
  if (!fix || fix.dimension!==dimension || ![fix.x,fix.y,fix.z].every(validCoord)) return false;
  if (Math.abs(fix.y)>4096 || typeof fix.updatedAt!=='number' ||
      !Number.isFinite(fix.updatedAt) || Date.now()-fix.updatedAt>MAX_AGE_MS ||
      fix.updatedAt>Date.now()+5000) return false;
  return true;
};
export function normalizeFix(input,dimension) {
  return validLoc(input,dimension)?{
    x:input.x,y:input.y,z:input.z,dimension:input.dimension,
    updatedAt:input.updatedAt,source:input.source||'server'
  }:null;
}

export class AlicePlayerTracker {
  constructor(bot,agentName) {
    this.bot=bot;
    this.lastSeen=null;
    this.lastKnownAt=0;
    this.file=path.join(process.cwd(),'bots',agentName,'player_locations.json');
  }
  dimension() { return String(this.bot.game?.dimension||'minecraft:overworld'); }
  observe(player) {
    if (!player?.position) return;
    this.lastSeen={x:player.position.x,y:player.position.y,z:player.position.z,
      dimension:this.dimension(),updatedAt:Date.now(),source:'entity'};
  }
  locate(name) {
    const visible=this.bot.players[name]?.entity;
    if (visible?.position) {this.observe(visible);return {kind:'visible',entity:visible,fix:this.lastSeen};}
    try {
      // Only a trusted co-located service should write this file; it is not a public API.
      const content=JSON.parse(fs.readFileSync(this.file,'utf8'));
      const fix=normalizeFix(content.players?.[name],this.dimension());
      if (fix) return {kind:'server',fix};
    } catch(e) {
      if (e.code!=='ENOENT') console.warn('[Alice tracking] coordinate source unavailable: '+String(e));
    }
    const old=this.lastSeen;
    if (old && old.dimension===this.dimension() && Date.now()-old.updatedAt<=MAX_AGE_MS)
      return {kind:'last_seen',fix:old};
    return {kind:'unknown',fix:null};
  }
}
