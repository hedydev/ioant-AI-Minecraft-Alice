# Alice Bedrock — observed hostile engagement (2026-11-02)

## Intent

Hostile presence does **not** equal combat. In particular, a zombie or creeper standing 1–3 blocks away is not an attack target just because of that distance. The near-field radius of **3 blocks** is a physical melee engagement boundary **only after evidence of targeting / actual aggression**. Noncombat route planning may still avoid visible hostile mobs conservatively; avoidance is separate from declaring COMBAT.

The Alice Bedrock runtime now uses `bedrock-native/experiment/src/hostile_engagement.cjs` from `runtime.threat()`. The legacy cross-runtime policy module `games/minecraft-ai/runtime/alice_modules/safety_policy.js` still has older distance heuristics; it is no longer the live Bedrock `runtime.threat()` selector. This source-only change has not been deployed to the running original-world Alice process.

## Evidence rules

- Observe a stable server entity ID over repeated movement observations (300ms safety cadence), and require **two consecutive positive, directed movement samples toward Alice or a nearby real player**. A simple stationary neighbor or one accidental pass-by is not sufficient.
- For melee, require a fresh clear observed obstacle/visibility corridor using the existing Bedrock chunk-cache `observedHostileBarrier`; a verified wall or **unknown** line of sight cannot justify inferred melee aggression. Only engage within **3 blocks** after positive evidence.
- For skeletons/strays/pillagers/etc., an actual arrow/trident/potion projectile must have an observed velocity projected toward Alice or the protected player. Attribute to a ranged mob only if the shooter geometry is plausible and **there is exactly one candidate shooter**. The 3-block melee threshold does **not** apply to a demonstrated ranged attack.
- An actually observed `isIgnited` / `ignited` creeper flag is a positive imminent-attack cue if close and unobstructed; being merely within 8 blocks is **not** combat evidence. Do not invent ignition state if the Bedrock adapter lacks that field.
- A loss of health does **not** name an attacker (other causes include falling and environmental damage). Without an attributable projectile/pursuit, only point-blank contact (<=1.2 blocks, not behind a verified barrier) can trigger defensive `SURVIVE` / retreat, with evidence `unattributed_close_damage`. Such evidence must **never** authorize retaliatory stationary melee even if retreat fails.
- STOP/FOLLOW and existing critical health, direct retreat, projectile transport, and safe-navigation priorities remain. Engagement history is reset on start, death, respawn and stop. No game commands, BDS position changes, world modifications or widened query budgets were introduced.

## Known limits

This is an **observational inference**, not a query into Minecraft's internal mob AI target/aggro state. Chunk-cache ray probing can be `unknown`; the strategy deliberately refuses aggression attribution on unknown visibility. Projectile entities might not always expose velocity or an unambiguous shooter, so some real ranged attacks cannot yet be confidently attributed. The runtime only protects one nearest visible nearby player (or the named FOLLOW/GUARD owner) at a time. The remaining task is instrumented live validation of target-identifying signals, genuine attack animations/projectile metadata and whether un-attributed incoming fire needs a separate *non-retaliatory* dodge state.

## Testing & deployment

The new `bedrock-native/experiment/test/hostile_engagement.test.cjs` tests stationary/nearby enemies, verified wall, unknown LOS, two directional chase samples, approaching a nearby player, wrong-direction fire, uniquely identified shooter, ambiguous ranged threats, unrelated damage, defensive escape without retaliation, real creeper ignition and reset. The actual source was executed in a JS V8 unit-test harness **15/15**, and the extracted runtime `threat()` method was executed with real `HostileEngagement` and `observedHostileBarrier` **5/5**. Four source files passed JavaScript syntax compilation. These results are **not** a full Mint Node24 regression or real Minecraft combat acceptance.

For full acceptance, run the original complete tests only after an **authorized** normal source update; preserve original BDS **17879**, the current Alice world, independent BDS position proofs, all safety gates and existing operator permissions. The current Mac checkout is behind GitHub main and an earlier sync was blocked by execution safety checks; do not retry indirectly through another action or tool. The existing live Alice process has **not** been proven to load this policy.
