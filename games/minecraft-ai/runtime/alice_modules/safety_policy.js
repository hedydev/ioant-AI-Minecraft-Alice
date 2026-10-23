export const Priority = Object.freeze({
  SURVIVE: 100, SELF_DEFENSE: 90, GUARD: 80, PLAYER_TASK: 50, AUTONOMY: 10
});

export function selectThreat({ now, health, selfPosition, ownerPosition, lastSelfDamageAt=0,
  lastOwnerDamageAt=0, hostiles=[] }) {
  if (!selfPosition) return null;
  const nearSelf=hostiles.map(entity=>({entity, distance:entity.position.distanceTo(selfPosition)}))
    .filter(x=>Number.isFinite(x.distance)).sort((a,b)=>a.distance-b.distance);
  const closest=nearSelf[0];
  const recentlyHitSelf=lastSelfDamageAt>0 && now-lastSelfDamageAt<6500;
  const ownerThreats=ownerPosition ?
    hostiles.map(entity=>({entity,distance:entity.position.distanceTo(ownerPosition)}))
      .filter(x=>Number.isFinite(x.distance)).sort((a,b)=>a.distance-b.distance) : [];
  const closeOwner=ownerThreats[0];
  const recentlyHitOwner=lastOwnerDamageAt>0 && now-lastOwnerDamageAt<6500;

  if (closest && ((health<=13 && closest.distance<7) ||
      (recentlyHitSelf && closest.distance<=10) ||
      (closest.entity.name==='creeper' && closest.distance<8) || closest.distance<3.5)) {
    return { type: health<=13 ? 'SURVIVE' : 'SELF_DEFENSE', target:closest.entity,
      priority: health<=13 ? Priority.SURVIVE : Priority.SELF_DEFENSE };
  }
  if (closeOwner && ((recentlyHitOwner && closeOwner.distance<12) || closeOwner.distance<4)) {
    return { type:'GUARD', target:closeOwner.entity, priority:Priority.GUARD };
  }
  return null;
}

export function decideCombatTactic({health, enemyType, distance, lastDamageMs=Infinity}) {
  if (health<=8) return 'RETREAT';
  if (health<=13) return 'KITE_RECOVER';
  if (enemyType==='creeper' && distance<8) return 'RETREAT';
  if (lastDamageMs>=0 && lastDamageMs<=4500 && distance<8) return 'EVADE_COUNTER';
  return 'ATTACK';
}

export function shouldInterveneAfterRetreat({ now, cooldownUntil, distance, newSelfHit=false, newOwnerHit=false }) {
  return now >= cooldownUntil || distance <= 4 || newSelfHit || newOwnerHit;
}
