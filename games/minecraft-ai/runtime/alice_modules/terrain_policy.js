const DANGER = new Set(['lava','fire','soul_fire','magma_block','cactus',
  'campfire','soul_campfire','powder_snow']);
const PASSABLE = new Set(['air','cave_air','void_air','grass','tall_grass']);
const solid = b => Boolean(b && b.boundingBox !== 'empty' && !PASSABLE.has(b.name));
const safeSupport = b => solid(b) && !DANGER.has(b.name);

// Pure risk classification suitable for fixture tests; never classify unloaded chunks safe.
export function classifyAdvance({currentFloor, aheadFloor, aheadFeet, aheadHead,
  stepHead, leftFloor, rightFloor}) {
  if ([currentFloor,aheadFloor,aheadFeet,aheadHead,stepHead,leftFloor,rightFloor]
      .some(b=>b==null)) return {status:'UNKNOWN',canStep:false,narrow:false};
  if (!safeSupport(currentFloor)) return {status:'UNSAFE_START',canStep:false,narrow:false};
  if (DANGER.has(aheadFloor.name) || DANGER.has(aheadFeet.name) ||
      DANGER.has(aheadHead.name)) return {status:'HAZARD',canStep:false,narrow:false};
  const narrow=!safeSupport(leftFloor)||!safeSupport(rightFloor);
  if (safeSupport(aheadFloor) && !solid(aheadFeet) && !solid(aheadHead)) {
    return {status:narrow?'NARROW':'CLEAR',canStep:true,narrow};
  }
  // One-block step: feet-level collision is the step, two blocks of headroom are required.
  if (solid(aheadFeet) && !DANGER.has(aheadFeet.name) &&
      !solid(aheadHead) && !solid(stepHead)) {
    return {status:narrow?'NARROW_STEP':'STEP_UP',canStep:true,narrow};
  }
  if (!safeSupport(aheadFloor) && !solid(aheadFeet))
    return {status:'DROP_OR_VOID',canStep:false,narrow};
  return {status:'BLOCKED',canStep:false,narrow};
}

export function cautiousPathOptions(moves) {
  moves.canDig=false;
  moves.allow1by1towers=false;
  moves.allowParkour=false;
  moves.allowSprinting=false;
  moves.maxDropDown=1;
  return moves;
}
