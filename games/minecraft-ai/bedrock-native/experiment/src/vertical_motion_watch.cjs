'use strict'
// Read-only local vertical movement anomaly witness. This is NOT authoritative
// Bedrock proof, and does not implement ladders, jumps, teleports, or excavation.
// A rapid unplanned drop must not authorize more autonomous exploration.
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
const round=n=>Math.round(n*100)/100
const CLIMB=/^(?:ladder|vine|weeping_vines(?:_plant)?|twisting_vines(?:_plant)?|scaffolding)$/
const HOLD_MS=90000,WINDOW_MS=12000,DROP_BLOCKS=4
function nearbyClimbable(bot,position){
  if(!finite(position)||!position.offset||typeof bot?.blockAt!=='function')return null
  try{
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if(Math.abs(dx)+Math.abs(dz)>1)continue
      for(let dy=-2;dy<=2;dy++){
        const b=bot.blockAt(position.offset(
          Math.floor(position.x)+dx-position.x,
          Math.floor(position.y)+dy-position.y,
          Math.floor(position.z)+dz-position.z))
        if(b&&CLIMB.test(String(b.name||'').replace(/^minecraft:/,'')))return true
      }
    }
    return false
  }catch{return null}
}
class VerticalMotionWatch{
  constructor({clock=Date.now,windowMs=WINDOW_MS,holdMs=HOLD_MS,dropBlocks=DROP_BLOCKS}={}){
    this.clock=clock;this.windowMs=Math.max(1000,Math.min(15000,windowMs))
    this.holdMs=Math.max(1000,Math.min(120000,holdMs))
    this.dropBlocks=Math.max(2,Math.min(8,dropBlocks))
    this.reset()
  }
  reset(){this.samples=[];this.until=0;this.lastIncident=null;this.dimension=null}
  active(){return this.clock()<this.until}
  observe(bot,{dimension=null,serverPacketCount=0}={}){
    const p=bot?.entity?.position,now=this.clock()
    if(!finite(p))return null
    const dim=String(dimension??'unknown')
    if(this.dimension!==null&&this.dimension!==dim){
      this.reset() // teleports between dimensions are not a fall diagnosis
    }
    this.dimension=dim
    // Keep at most the latest 48 physics frames; no entire trails/world data.
    this.samples.push({at:now,y:p.y})
    this.samples=this.samples.filter(v=>now-v.at<=this.windowMs).slice(-48)
    if(this.active())return null
    const peak=this.samples.reduce((best,v)=>v.y>best.y?v:best,this.samples[0])
    const drop=peak.y-p.y,elapsed=now-peak.at
    if(drop<this.dropBlocks||elapsed<0||elapsed>this.windowMs)return null
    const incident={reason:'rapid_unverified_vertical_displacement',
      dropBlocks:round(drop),elapsedMs:elapsed,fromY:round(peak.y),toY:round(p.y),
      onGround:bot.entity.onGround===true,
      nearbyClimbable:nearbyClimbable(bot,p),
      serverPositionPackets:Number.isSafeInteger(serverPacketCount)?serverPacketCount:0,
      positionTrust:'local_prediction_not_server_proof',
      holdSeconds:Math.ceil(this.holdMs/1000)}
    this.until=now+this.holdMs
    this.lastIncident={...incident,at:now}
    // Start a new baseline at the most recently observed position.
    this.samples=[{at:now,y:p.y}]
    return incident
  }
  summary(){
    return {active:this.active(),remainingSeconds:this.active()?
        Math.ceil((this.until-this.clock())/1000):0,
      lastIncident:this.lastIncident&&{...this.lastIncident}}
  }
}
module.exports={VerticalMotionWatch,nearbyClimbable,DROP_BLOCKS}
