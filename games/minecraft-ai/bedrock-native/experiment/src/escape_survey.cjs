'use strict'
// Read-only escape opportunity survey. No movement, digging, block activation or
// world edits. Every observed option must pass a separate execution gate.
const {knownAir}=require('./scout_routes.cjs')
const MAX_RADIUS=7,MAX_NODES=160,MAX_READS=1600
const DANGER=/lava|fire|magma|cactus|campfire|powder_snow|water|bubble_column|sweet_berry_bush/
const FULL_MATERIAL=/^(?:grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|stone|deepslate|tuff|gravel|sand|red_sand|mud|clay|moss_block|snow_block|andesite|diorite|granite|cobblestone|mossy_cobblestone|cobbled_deepslate|glass|obsidian|bedrock|netherrack|end_stone|bricks|stone_bricks|mossy_stone_bricks|cracked_stone_bricks|smooth_stone|polished_[a-z_]+|[a-z_]+_planks|[a-z_]+_log|[a-z_]+_wood|[a-z_]+_concrete|[a-z_]+_terracotta)$/
const DOOR=/^(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|wooden)_door$/
const PARTIAL=/(?:_stairs|_slab|_trapdoor|_fence_gate|_fence|_wall|ladder|vine|scaffolding)$/
const BUILT=/(_planks|_wood|_log|_door|_brick|_glass|_fence|_slab|_stairs|_wall|_trapdoor|_button|_pressure_plate|_sign|_chest|_barrel|_bed|_concrete|_terracotta|redstone|furnace|crafting_table)/
const name=b=>String(b?.name||'').replace(/^minecraft:/,'')
const finite=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)
const key=(x,y,z)=>[x,y,z].join(',')
const vec=p=>[p.x,p.y,p.z]
function fullSupport(block){
  if(!block||block.boundingBox!=='block'||DANGER.test(name(block))||!FULL_MATERIAL.test(name(block)))return false
  if(block.shapes!==undefined){
    if(!Array.isArray(block.shapes)||block.shapes.length!==1)return false
    const s=block.shapes[0]
    if(!Array.isArray(s)||s.length!==6||s.some((n,i)=>!Number.isFinite(n)||Math.abs(n-[0,0,0,1,1,1][i])>0.001))return false
  }
  return true
}
function surveyEscape(bot,{radius=6,maxNodes=MAX_NODES}={}){
  const self=bot?.entity?.position
  const baseResult={version:1,mode:'read_only',status:'unknown',center:null,
    observedCells:0,reachableCells:0,unknownCells:0,blockedCells:0,
    doorCandidates:[],verticalObstacles:[],breakCandidates:[],
    openFrontier:null,canModifyWorld:false,reason:null}
  if(!finite(self)||typeof self.offset!=='function'||typeof bot?.blockAt!=='function'||
      bot.entity?.onGround!==true)return {...baseResult,reason:'position_ground_or_cache_unverified'}
  const r=Math.max(2,Math.min(MAX_RADIUS,Number.isSafeInteger(radius)?radius:6))
  const cap=Math.max(4,Math.min(MAX_NODES,Number.isSafeInteger(maxNodes)?maxNodes:MAX_NODES))
  const root={x:Math.floor(self.x),y:Math.floor(self.y),z:Math.floor(self.z)}
  const data={...baseResult,center:vec(root)}
  const blockCache=new Map(),cellCache=new Map(),doors=new Map(),vertical=new Map(),breakers=new Map()
  let readLimit=false
  const block=(x,y,z)=>{
    if(Math.abs(x-root.x)>r+1||Math.abs(z-root.z)>r+1||Math.abs(y-root.y)>4)return null
    const k=key(x,y,z)
    if(blockCache.has(k))return blockCache.get(k)
    if(data.observedCells>=MAX_READS){readLimit=true;return null}
    let found=null
    try{found=bot.blockAt(self.offset(x-self.x,y-self.y,z-self.z))||null}catch{}
    data.observedCells++;blockCache.set(k,found)
    if(!found)data.unknownCells++
    return found
  }
  const cell=(x,y,z)=>{
    const k=key(x,y,z)
    if(cellCache.has(k))return cellCache.get(k)
    const f=block(x,y-1,z),feet=block(x,y,z),head=block(x,y+1,z)
    const known=!!(f&&feet&&head)
    const safe=known&&fullSupport(f)&&knownAir(feet)&&knownAir(head)
    if(known&&!safe)data.blockedCells++
    const result={safe:!!safe,known,floor:f,feet,head}
    cellCache.set(k,result)
    return result
  }
  if(!cell(root.x,root.y,root.z).safe){
    data.status='current_tile_unverified';data.reason='known_full_support_and_two_block_headroom_required'
    return data
  }
  const queue=[{p:root,route:[],heightChanges:0}],visited=new Set([key(...vec(root))]);let open=null
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]]
  for(let i=0;i<queue.length&&i<cap;i++){
    const cur=queue[i],p=cur.p
    // An observed frontier is not proof of a physical exit to another room.
    if((Math.abs(p.x-root.x)===r||Math.abs(p.z-root.z)===r)&&!open){
      open={target:vec(p),steps:cur.route.length,elevationChanges:cur.heightChanges,
        kind:'observed_open_frontier_not_confirmed_exit'}
    }
    for(const [dx,dz] of dirs){
      const x=p.x+dx,z=p.z+dz
      if(Math.abs(x-root.x)>r||Math.abs(z-root.z)>r)continue
      let next=null
      for(const y of [p.y,p.y+1,p.y-1]){
        if(Math.abs(y-root.y)>3)continue
        const candidate=cell(x,y,z)
        if(!candidate.safe)continue
        if(y>p.y&&!knownAir(block(p.x,p.y+2,p.z)))continue
        next={x,y,z};break
      }
      if(next){
        const k=key(...vec(next));if(visited.has(k))continue
        visited.add(k);queue.push({p:next,route:cur.route.concat([vec(next)]),
          heightChanges:cur.heightChanges+Math.abs(next.y-p.y)})
        continue
      }
      const head=block(x,p.y,z),above=block(x,p.y+1,z),floor=block(x,p.y-1,z)
      if(!head||!above||!floor)continue
      const type=name(head),floorType=name(floor)
      if(DOOR.test(type)){
        // An observed door is not automatically reachable. Preserve the BFS
        // path to its adjacent standing cell for a later, separately guarded
        // movement executor; this survey NEVER drives the player or opens it.
        // BFS discovers shortest paths first. The same door can border several
        // reachable cells; do not overwrite a nearer approach with a longer one.
        const doorKey=key(x,p.y,z),previous=doors.get(doorKey)
        if(!previous||previous.approach.steps>cur.route.length){
          doors.set(doorKey,{position:[x,p.y,z],kind:'wooden_door',
            action:'interact_then_reprobe',permitted:false,
            approach:{position:vec(p),steps:cur.route.length,
              elevationChanges:cur.heightChanges,
              waypoints:cur.route.length<=12?cur.route:[],
              routeComplete:cur.route.length<=12,
              serverVerified:false}})
        }
      }else if(PARTIAL.test(type)||PARTIAL.test(floorType)){
        vertical.set(key(x,p.y,z),{position:[x,p.y,z],kind:PARTIAL.test(type)?type:floorType,
          reason:'collision_shape_or_climb_capability_unverified'})
      }else if(head.boundingBox==='block'&&!DANGER.test(type)&&breakers.size<8){
        breakers.set(key(x,p.y,z),{position:[x,p.y,z],block:type,
          builtStructureLikely:BUILT.test(type),
          breakable:'unverified',permitted:false,
          reason:'needs_ownership_tool_hardness_exit_and_server_verification'})
      }
    }
  }
  data.reachableCells=visited.size
  data.openFrontier=open
  data.doorCandidates=[...doors.values()].slice(0,6)
  data.verticalObstacles=[...vertical.values()].slice(0,6)
  data.breakCandidates=[...breakers.values()].slice(0,6)
  data.status=open?'open_frontier_observed':doors.size?'door_interaction_candidate':
    vertical.size?'shape_or_climb_unverified':readLimit||data.unknownCells?'unknown_terrain':
    'no_non_destructive_exit_observed'
  data.reason=open?'frontier_not_server_verified':doors.size?'try_non_destructive_door_interaction_after_guard':
    vertical.size?'requires_shape_aware_navigation':readLimit?'read_budget_exhausted':
    data.unknownCells?'cache_incomplete':'do_not_dig_without_explicit_policy_and_verified_capabilities'
  return data
}
module.exports={surveyEscape,fullSupport,MAX_RADIUS,MAX_NODES,MAX_READS}
