'use strict'
// Read-only collision-shape navigation survey for Bedrock; does not issue actions.
// Missing block data / shape evidence is UNKNOWN, never a free passage.
const MAX_READS=640
const HAZARD=/(?:^|_)(?:lava|fire|magma|cactus|campfire|powder_snow|water|bubble_column|sweet_berry_bush)(?:$|_)/
const numeric=n=>typeof n==='number'&&Number.isFinite(n)
const key=(x,y,z)=>[x,y,z].join(',')
function boxes(block){
  if(!block||block.boundingBox==='empty')return block?[]:null
  if(!Array.isArray(block.shapes)||!block.shapes.length||block.shapes.length>12)return null
  const out=[]
  for(const s of block.shapes){
    if(!Array.isArray(s)||s.length!==6||s.some(n=>!numeric(n))||
       s.some((n,i)=>n<0||n>1||(i<3&&n>=s[i+3])))return null
    out.push(s)
  }
  return out
}
function surveyVoxelActions(bot,{radius=4,maxNodes=96,maxReads=MAX_READS,includeSingleStep=false}={}){
  const pos=bot?.entity?.position
  const fail=(reason,stats={})=>({status:'unverified',reason,route:null,
    reachableCells:0,observedBlocks:stats.read||0,unknownBlocks:stats.unknown||0,
    blockedReasons:stats.reasons||{}})
  if(!pos||![pos.x,pos.y,pos.z].every(numeric)||typeof pos.offset!=='function'||
     typeof bot?.blockAt!=='function'||bot.entity.onGround!==true)
    return fail('position_or_ground_unverified')
  radius=Math.max(1,Math.min(6,Number.isSafeInteger(radius)?radius:4))
  maxNodes=Math.max(4,Math.min(160,Number.isSafeInteger(maxNodes)?maxNodes:96))
  maxReads=Math.max(64,Math.min(MAX_READS,Number.isSafeInteger(maxReads)?maxReads:MAX_READS))
  const center={x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)}
  const cache=new Map(),stats={read:0,unknown:0,reasons:{}}
  const blocked=reason=>{stats.reasons[reason]=(stats.reasons[reason]||0)+1}
  const block=(x,y,z)=>{
    if(Math.abs(x-center.x)>radius+1||Math.abs(z-center.z)>radius+1||
       Math.abs(y-center.y)>4)return null
    const k=key(x,y,z)
    if(cache.has(k))return cache.get(k)
    if(stats.read>=maxReads)return null
    let found=null
    try{found=bot.blockAt(pos.offset(x-pos.x,y-pos.y,z-pos.z))||null}catch{}
    stats.read++;if(!found)stats.unknown++
    cache.set(k,found)
    return found
  }
  const hazard=b=>HAZARD.test(String(b?.name||'').replace(/^minecraft:/,''))
  // 9 support probes cover the player's 0.6-block body, including half slabs.
  const support=(x,h,z)=>{
    const y=Math.floor(h-0.0001),b=block(x,y,z)
    if(!b)return 'unknown_floor'
    if(hazard(b))return 'hazard_floor'
    const sh=boxes(b)
    if(!sh)return 'floor_shape_unverified'
    for(const dx of [.21,.5,.79])for(const dz of [.21,.5,.79])
      if(!sh.some(s=>Math.abs(y+s[4]-h)<.015&&s[0]<=dx&&s[3]>=dx&&s[2]<=dz&&s[5]>=dz))
        return 'unsupported_footprint'
    return null
  }
  const overlaps=(s,x,y,z,cx,h,cz)=>{
    const left=cx-.3,right=cx+.3,front=cz-.3,back=cz+.3
    return x+s[0]<right-.0001&&x+s[3]>left+.0001&&
      z+s[2]<back-.0001&&z+s[5]>front+.0001&&
      y+s[1]<h+1.8-.001&&y+s[4]>h+.001
  }
  const clearance=(cx,h,cz)=>{
    for(let x=Math.floor(cx-.3);x<=Math.floor(cx+.3);x++)
      for(let z=Math.floor(cz-.3);z<=Math.floor(cz+.3);z++)
        for(let y=Math.floor(h);y<=Math.ceil(h+1.8)-1;y++){
          const b=block(x,y,z)
          if(!b)return 'unknown_clearance'
          if(hazard(b))return 'hazard_clearance'
          const sh=boxes(b)
          if(!sh)return 'collision_shape_unverified'
          if(sh.some(s=>overlaps(s,x,y,z,cx,h,cz)))return 'blocked_clearance'
        }
    return null
  }
  const valid=(x,h,z)=>support(x,h,z)||clearance(x+.5,h,z+.5)
  // Candidate surface heights are derived from the Bedrock collision shapes;
  // do not substitute a list of permitted Minecraft block names.
  const surfaces=(x,z,near)=>{
    const heights=new Set()
    for(let y=Math.floor(near)-2;y<=Math.floor(near)+1;y++){
      const b=block(x,y,z)
      if(hazard(b)){blocked('hazard_floor');continue}
      const sh=boxes(b)
      if(!sh)continue
      for(const s of sh){
        const h=y+s[4]
        if(h>=center.y-2&&h<=center.y+3&&Math.abs(h-near)<=1.001)
          heights.add(Math.round(h*1000)/1000)
      }
    }
    return [...heights].sort((a,b)=>Math.abs(a-near)-Math.abs(b-near)||a-b)
  }
  const roots=surfaces(center.x,center.z,pos.y)
  const h0=roots.find(h=>Math.abs(h-pos.y)<=.3&&!valid(center.x,h,center.z))
  if(h0===undefined)return fail('current_collision_or_support_unverified',stats)
  const start={x:center.x,y:h0,z:center.z}
  const queue=[{at:start,steps:[],cost:0}],seen=new Set([key(start.x,start.y,start.z)])
  let best=null,walkBest=null
  const verticalOptions=[]
  for(let i=0;i<queue.length&&i<maxNodes;i++){
    const q=queue[i]
    if(q.steps.length>=8)continue
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=q.at.x+dx,z=q.at.z+dz
      if(Math.abs(x-center.x)>radius||Math.abs(z-center.z)>radius)continue
      let next=null
      for(const h of surfaces(x,z,q.at.y)){
        const delta=h-q.at.y
        if(delta>1.001||delta< -1.001)continue
        const reason=valid(x,h,z)
        if(reason){blocked(reason);continue}
        if(Math.abs(delta)<.01){
          const middle=clearance(q.at.x+.5+dx*.5,h,q.at.z+.5+dz*.5)
          if(middle){blocked(middle);continue}
        }else if(delta>0){
          const up=clearance(q.at.x+.5,q.at.y+1,q.at.z+.5)
          if(up){blocked('jump_headroom_unverified');continue}
        }
        next={x,y:h,z,action:delta>.01?'JUMP_UP':delta<-.01?'STEP_DOWN':'WALK'}
        break
      }
      if(!next){blocked('no_verified_transition');continue}
      const k=key(next.x,next.y,next.z)
      if(seen.has(k))continue
      seen.add(k)
      const steps=q.steps.concat([next])
      if(q.steps.length===0&&next.action!=='WALK')verticalOptions.push({
        action:next.action,target:[next.x,next.y,next.z],elevationChanges:Math.abs(next.y-start.y)})
      const cost=q.cost+1+(next.action==='WALK'?0:2)
      const distance=Math.hypot(next.x-start.x,next.z-start.z)
      const score=distance*10+steps.length*.1-cost
      if(!best||score>best.score)best={steps,cost,score}
      if(steps.every(s=>s.action==='WALK')&&(!walkBest||score>walkBest.score))walkBest={steps,cost,score}
      if(queue.length<maxNodes)queue.push({at:next,steps,cost})
    }
  }
  const makeRoute=b=>b?{
    target:[b.steps.at(-1).x,b.steps.at(-1).y,b.steps.at(-1).z],
    steps:b.steps.length,actions:b.steps.map(s=>s.action),
    waypoints:b.steps.map(s=>[s.x,s.y,s.z]),
    executable:false,reason:'candidate_requires_Bedrock_action_validation'
  }:null
  // Search the *flat-only* subgraph independently: a voxel reached first
  // via a jump in the general BFS must not hide a viable walking detour.
  const flatQueue=[{at:start,steps:[]}],flatSeen=new Set([key(start.x,start.y,start.z)])
  const flatOptions=[]
  for(let i=0;i<flatQueue.length&&i<maxNodes;i++){
    const q=flatQueue[i]
    if(q.steps.length>=8)continue
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=q.at.x+dx,z=q.at.z+dz,h=q.at.y,k=key(x,h,z)
      if(Math.abs(x-center.x)>radius||Math.abs(z-center.z)>radius||flatSeen.has(k))continue
      if(!surfaces(x,z,h).some(v=>Math.abs(v-h)<.01))continue
      if(valid(x,h,z)||clearance(q.at.x+.5+dx*.5,h,q.at.z+.5+dz*.5))continue
      flatSeen.add(k)
      const steps=q.steps.concat([{x,y:h,z,action:'WALK'}])
      // Emergency retreat may use an independently validated one-cell WALK.
      // Ordinary exploration and night survival still need >=2 cells.
      if(steps.length>=2||(includeSingleStep===true&&steps.length===1)){
        const distance=Math.hypot(x-start.x,z-start.z)
        flatOptions.push({steps,score:distance*10+steps.length*.1-steps.length})
      }
      if(flatQueue.length<maxNodes)flatQueue.push({at:{x,y:h,z},steps})
    }
  }
  const walkRoutes=flatOptions.sort((a,b)=>b.score-a.score).map(makeRoute)
  const route=makeRoute(best),walkRoute=walkRoutes[0]||makeRoute(walkBest)
  return {status:route?'route_candidate':'blocked',
    reason:route?'observed_collision_route':'no_verified_route',
    center:[start.x,start.y,start.z],reachableCells:seen.size,
    observedBlocks:stats.read,unknownBlocks:stats.unknown,
    blockedReasons:stats.reasons,route,walkRoute,walkRoutes,verticalOptions}
}
function walkingCandidate(survey){
  const r=survey?.walkRoute||survey?.route
  if(survey?.status!=='route_candidate'||!r||r.steps<2||r.steps>8||
     !Array.isArray(r.actions)||!r.actions.every(a=>a==='WALK')||
     !Array.isArray(r.waypoints)||r.waypoints.length!==r.steps)return null
  const [x,y,z]=r.target
  if(![x,y,z].every(numeric)||!r.waypoints.every(p=>Array.isArray(p)&&p.length===3&&p.every(numeric)))return null
  return {ok:true,kind:'observed_voxel_walking_only',target:{x,y,z},
    waypoints:r.waypoints.map(([px,py,pz])=>({x:px,y:py,z:pz})),
    key:key(x,y,z),distance:r.steps,elevationChanges:0,direction:null}
}
// Select from independently verified flat paths, rather than rejecting all
// exploration merely because the *top-ranked* path approaches a monster.
// This is only a planning proposal; Bedrock safety is rechecked at execution.
function selectSafeWalkingCandidate(survey,{hostiles=[],blocked=new Set(),
  visited=new Set(),origin=null,minHostileDistance=9}={}){
  const routes=Array.isArray(survey?.walkRoutes)&&survey.walkRoutes.length?
    survey.walkRoutes:(survey?.walkRoute?[survey.walkRoute]:[])
  const mobs=hostiles.filter(p=>p&&[p.x,p.y,p.z].every(numeric))
  const center=survey?.center
  const from=origin&&[origin.x,origin.y,origin.z].every(numeric)?origin:
    Array.isArray(center)&&center.length===3?
      {x:center[0]+.5,y:center[1],z:center[2]+.5}:null
  let threatRoutes=0,blockedRoutes=0,invalidRoutes=0
  for(const route of routes){
    const candidate=walkingCandidate({status:survey.status,walkRoute:route})
    if(!candidate){invalidRoutes++;continue}
    if(blocked.has(candidate.key)||visited.has(candidate.key)){blockedRoutes++;continue}
    const unsafe=mobs.some(mob=>{
      let previous=from?Math.hypot(from.x-mob.x,from.y-mob.y,from.z-mob.z):0
      for(const wp of candidate.waypoints){
        const d=Math.hypot(wp.x+.5-mob.x,wp.y-mob.y,wp.z+.5-mob.z)
        // Never approach a nearby hostile. A route beginning outside the
        // stand-off region may not cross into it, even briefly.
        if(previous<minHostileDistance?d<previous-.05:d<minHostileDistance)return true
        previous=d
      }
      return previous<minHostileDistance
    })
    if(unsafe){threatRoutes++;continue}
    return {candidate,reason:'verified_flat_corridor_clear_of_known_hostiles',
      checkedRoutes:blockedRoutes+threatRoutes+invalidRoutes+1,
      totalRoutes:routes.length,threatRoutes,blockedRoutes,knownHostiles:mobs.length}
  }
  const reason=!routes.length?'no_verified_flat_walk_candidate':
    threatRoutes?'all_eligible_flat_routes_near_hostiles':
    blockedRoutes?'flat_routes_recently_failed_or_visited':
    'flat_routes_not_executable'
  return {candidate:null,reason,checkedRoutes:routes.length,
    totalRoutes:routes.length,threatRoutes,blockedRoutes,knownHostiles:mobs.length}
}
module.exports={surveyVoxelActions,walkingCandidate,selectSafeWalkingCandidate,boxes}
