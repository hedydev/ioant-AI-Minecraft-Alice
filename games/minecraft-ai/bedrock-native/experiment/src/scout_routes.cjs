'use strict'
// Natural-surface Bedrock scouting: adaptive, bounded segments; never assume
// local physics equals server movement. Elevation up/down one full block only.
// Stairs/slabs require shape-aware acceptance in a later, server-tested stage.
const MIN_STEPS=3,MAX_STEPS=12,DEFAULT_STEPS=8
const SAFE_SURFACE=/^(grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|stone|deepslate|tuff|gravel|sand|red_sand|mud|clay|moss_block|snow_block|andesite|diorite|granite)$/
const BAD=/lava|fire|magma|cactus|campfire|powder_snow|water|bubble_column|sweet_berry_bush/
const HOSTILE=/^(zombie|husk|drowned|skeleton|stray|bogged|spider|cave_spider|creeper|witch|pillager|ravager|phantom|slime|silverfish|endermite)$/
const integer=(x)=>Number.isFinite(x)?Math.floor(x):null
function blockName(b){return String(b?.name||'').replace(/^minecraft:/,'')}
function knownAir(b){return !!b&&b.boundingBox==='empty'&&!BAD.test(blockName(b))&&
  /^(air|cave_air|void_air|grass|short_grass|tall_grass|fern|large_fern|dead_bush|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley)$/.test(blockName(b))}
function fullFloor(b){
  if(!b||b.boundingBox!=='block'||!SAFE_SURFACE.test(blockName(b)))return false
  // If collision shapes are present they MUST describe a full 1x1x1 cube.
  // Partial/ambiguous shapes are not silently treated as standable full blocks.
  if(b.shapes!==undefined){
    if(!Array.isArray(b.shapes)||b.shapes.length!==1)return false
    const s=b.shapes[0]
    if(!Array.isArray(s)||s.length!==6||s.some((x,i)=>Math.abs(x-[0,0,0,1,1,1][i])>0.001))return false
  }
  return true
}
function vecAt(base,x,y,z){return base.offset(x-base.x,y-base.y,z-base.z)}
function terrainCell(bot,base,x,y,z,diagnostic=null){
  const p=vecAt(base,x,y,z)
  let floor,feet,head
  try{
    floor=bot.blockAt(p.offset(0,-1,0))
    feet=bot.blockAt(p)
    head=bot.blockAt(p.offset(0,1,0))
  }catch{if(diagnostic)diagnostic.unloaded++;return false}
  if(!floor||!feet||!head){if(diagnostic)diagnostic.unloaded++;return false}
  const safe=fullFloor(floor)&&knownAir(feet)&&knownAir(head)
  if(!safe&&diagnostic)diagnostic.blocked++
  return safe
}
function environmentBudget(bot,{maxSteps=MAX_STEPS}={}){
  const tick=bot?.time?.timeOfDay
  const health=bot?.health,food=bot?.food
  // Derive the *next segment*, not a fixed exploration radius.
  // Preserve enough daylight to re-evaluate the next segment.
  const remaining=Number.isFinite(tick)?11000-tick:0
  const daylight=remaining>4500?1:remaining>1800?0.75:remaining>500?0.5:0
  if(!daylight||!Number.isFinite(health)||health<16)return 0
  const energy=Number.isFinite(food)&&food<10?0.5:1
  const desired=Math.floor(DEFAULT_STEPS*(health>=19?1.5:health>=17?1.2:1)*daylight*energy)
  return Math.max(MIN_STEPS,Math.min(MAX_STEPS,Math.floor(maxSteps),desired))
}
function planScoutSegment(bot,{maxSteps=MAX_STEPS,avoid=new Set(),blockedCells=new Set(),previousDirection=null}={}){
  const pos=bot?.entity?.position
  if(!pos||![pos.x,pos.y,pos.z].every(Number.isFinite)||typeof pos.offset!=='function'||
    typeof bot?.blockAt!=='function'||bot.entity.onGround!==true)
    return {ok:false,reason:'ground_contact_or_terrain_unknown'}
  const limit=environmentBudget(bot,{maxSteps})
  if(limit<MIN_STEPS)return {ok:false,reason:'daylight_or_energy_budget_exhausted'}
  const base={x:integer(pos.x),y:integer(pos.y),z:integer(pos.z),offset:pos.offset.bind(pos)}
  const diagnostic={unloaded:0,blocked:0}
  if(!terrainCell(bot,base,base.x,base.y,base.z,diagnostic))
    return {ok:false,reason:diagnostic.unloaded>0?
      'current_ground_unloaded':'current_ground_unverified'}
  const mobs=Object.values(bot.entities||{}).filter(e=>HOSTILE.test(e?.name||'')||e?.kind==='Hostile mobs')
  const dirs=[[1,0],[0,1],[-1,0],[0,-1]],start={x:base.x,y:base.y,z:base.z}
  const nodeKey=p=>[p.x,p.y,p.z].join(',')
  const explored=new Set([nodeKey(start)])
  const queue=[{point:start,route:[],heightChanges:0,turns:0,direction:null}]
  const cellCache=new Map()
  const canOccupy=(x,y,z)=>{
    const key=[x,y,z].join(',')
    if(!cellCache.has(key))cellCache.set(key,terrainCell(bot,base,x,y,z,diagnostic))
    return cellCache.get(key)
  }
  const clearAbove=p=>{
    try{return knownAir(bot.blockAt(vecAt(base,p.x,p.y+2,p.z)))}
    catch{return false}
  }
  let best=null,candidateCount=0
  // Bounded BFS handles corners + one-full-block ascents/descents;
  // cap visited nodes, search depth and vertical range; no unknown terrain.
  for(let index=0;index<queue.length&&index<512;index++){
    const cur=queue[index]
    if(cur.route.length>=limit)continue
    for(const dir of dirs){
      const [dx,dz]=dir,x=cur.point.x+dx,z=cur.point.z+dz
      let next=null
      for(const y of [cur.point.y,cur.point.y+1,cur.point.y-1]){
        if(Math.abs(y-base.y)>3||!canOccupy(x,y,z))continue
        if(y>cur.point.y&&!clearAbove(cur.point))continue
        next={x,y,z};break
      }
      if(!next||explored.has(nodeKey(next))||blockedCells.has(nodeKey(next)))continue
      if(mobs.some(e=>e?.position&&[e.position.x,e.position.y,e.position.z].every(Number.isFinite)&&
        Math.hypot(e.position.x-next.x,e.position.y-next.y,e.position.z-next.z)<9))continue
      explored.add(nodeKey(next))
      const route=cur.route.concat([next])
      const heightChanges=cur.heightChanges+Math.abs(next.y-cur.point.y)
      const turns=cur.turns+(cur.direction&&
        (cur.direction[0]!==dx||cur.direction[1]!==dz)?1:0)
      const incoming=[dx,dz]
      const destKey=nodeKey(next)
      const straightDistance=Math.hypot(next.x-base.x,next.z-base.z)
      // Prioritize actual new ground, not circling twelve steps near home.
      const preference=previousDirection?.[0]===dx&&previousDirection?.[1]===dz?1.5:0
      const score=straightDistance*10+route.length*0.3-heightChanges*0.5-turns*0.6+preference
      if(route.length>=MIN_STEPS&&straightDistance>=MIN_STEPS&&!avoid.has(destKey)){
        candidateCount++
        if(!best||score>best.score)best={ok:true,target:next,waypoints:route,
          distance:route.length,elevationChanges:heightChanges,direction:incoming,
          key:destKey,kind:'validated_3d_natural_surface_route',turns,score}
      }
      if(route.length<limit&&queue.length<512)queue.push({
        point:next,route,heightChanges,turns,direction:incoming})
    }
  }
  if(!best)return {ok:false,reason:diagnostic.unloaded>0?
    'terrain_unloaded_or_incomplete':'no_verified_3d_surface_route',
    maxSteps:limit,examined:explored.size,terrainUnloaded:diagnostic.unloaded,
    terrainBlocked:diagnostic.blocked}
  return {...best,maxSteps:limit,alternatives:candidateCount,examined:explored.size}
}
module.exports={planScoutSegment,environmentBudget,terrainCell,fullFloor,knownAir,MIN_STEPS,MAX_STEPS}
