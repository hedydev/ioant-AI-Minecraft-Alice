# Paper Alice → native Bedrock autonomous execution, 2026-10-18

## Root cause of stationary Alice

Paper runtime `AliceAutonomy.start()` starts safety, social and a 5s idle-action loop. `AliceSafety.start()` runs a 300ms preemption controller, and the Mindcraft ActionManager binds the core to Mineflayer's movement, inventory, crafting and combat APIs. The user has previously seen Paper chase and acquire logs, resume after stuck paths, attack/retreat (with known survival failures), and occasionally comment.

The initial Bedrock native runtime only starts `bedrock-protocol.createClient()` then chat and event listeners. Subsequent shared policy import (`shared_brain.cjs`) loads only **pure functions** and reports intended follow/gather without any scheduler or game action executor. Real logs `shared Paper decision rules loaded (safe observation/chat only)` and `spawned... no action/motion packets` accurately explain why Alice does not walk or gather. This is an implementation gap, **not** an account/authentication failure. Prior Xbox 401 is now resolved by real native spawn.

## Target architecture

```
           canonical runtime/alice_modules
 Core / autonomy_policy / safety_policy / wood_policy / social_policy
                            |
                 platform-neutral intents
                            |
         +------------------+-------------------+
         |                                      |
   Paper/Mindcraft                       Bedrock executor
   mineflayer Java                       Mineflayer Bedrock adapter
   action manager                        player_auth_input / authoritative items
         |                                      |
  Paper 1.21.11                         BDS 1.26.51
```

Native low-level `bedrock-protocol` is a transport, not a bot embodiment. In 2026-09 a public Mineflayer Bedrock edition adapter PoC reports live verification on BDS 1.26.51 and high-level `bot.*` plus pathfinder/collectblock/pvp ecosystem support, BUT is not a released official Mineflayer Bedrock feature. Its Bedrock physics and pathfinder prerequisites are still draft/open PRs. We pin three source commits for reproducible disposable-world evaluation rather than silently swap the known-good client.

Experimental work is under `bedrock-native/experiment/` with `scripts/prepare-bedrock-alice-lab.py`: a clone from verified backup into dedicated `minecraft-bedrock-alice-lab` on UDP 17880; it rejects production and no player/game action can target 17879. A separate scheduler uses the **same** Paper core, learning class and common autonomy/safety/wood/terrain/social policies. It implements experimental follow, one-log attempt with authoritative inventory confirmation, idle look/social and danger preemption; craft/combat/retreat is NOT complete. This work has fixture-level validation only until Mint is tested.

## Parity ledger

| Paper capability | New Bedrock PoC status | Required before production |
|---|---|---|
| Core IDLE/FOLLOW/GATHER/SURVIVE states | Same AliceCore imported by experimental runner | Confirm real order/interrupts on BDS |
| 20s grace / 120s autonomy cooldown | Canonical `autonomy_policy.js` now used by both | Test real scheduling, death/reconnect |
| Follow/player tracking | Sandbox pathfinder setGoal(GoalFollow) | Verify actual movement and stale target |
| Gather wood | Sandbox path to observed log, dig, inventory delta | Verify physics, chunk, drop pickup, protected build rules |
| Safety threat policy | Original selectThreat, preempts active task | **Must build actual safe retreat, food, guard/combat** |
| Basic weapon/recipes | Planning only | Verify crafting item transaction and equipment |
| Chest/storage/item drop | Absent | Implement/reconcile authoritative slots |
| Idle look & social | Sandbox implemented | Check no interrupt or chat spam |
| Learning | AliceCore learning isolated under lab state | Controlled migration of existing experiences with edition schema |
| Ollama plans / LLM actions | Not connected | Connect same supervised tool executor after action validation |

The original `bedrock-native/src/main.cjs` stays as the production-safe **chat-only client**. Nothing in this new PoC modifies Paper Mindcraft's Mineflayer adapters, world, player accounts, or online-mode setting.


## 2026-10-18 — Explicit user authorization for live 17879 autonomy (opt-in)

The user explicitly requested **no separate experiment world; use the existing 17879 bedrock-default world directly**. The same experimental, not-yet-live-proven Mineflayer Bedrock executor can now be selected with `npm run production:check` / `npm run production` under `bedrock-native/experiment/`. These are distinct from `npm run check` / `npm start`, which still enforce disposable 17880. Production mode refuses without `ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES` and the original verified backup manifest. It calls the original 17879 native startup checker, including matching online-mode, real server directory, backup SHA256 and temporary restoration. The old native chat-only connector is unchanged, so it is the rollback binary (stop autonomy, restart old launcher). The only 17879 action commands currently available are follow/stop and a bounded nearest-log dig attempt plus autonomous idle lookout; genuine combat/retreat/equipment/crafting/chests/Ollama action tools **remain absent**. Safety now polls every 300ms (independently from the 5s idle tick) and interrupts motion on threat/health <14, but it **does not move Alice away** and cannot promise survival. The backed-up world snapshot may be older than current world changes; it is not a live pre-launch snapshot. Validation of gameplay still requires users' live Mint logs.


## 2026-10-18 — Shared-Paper-core autonomous Bedrock runtime (code merged; Mint acceptance pending)

User explicitly approved real 17879 integration without a new world. The live `bedrock-native/experiment/src/main.cjs` entrypoint now **instantiates `AliceBedrockRuntime`**, not the previous small `NativeAutonomyExperiment`. It imports original canonical Paper `AliceCore` + `autonomy_policy`, `safety_policy`, `terrain_policy`, `wood_policy`, `social_policy`, and `inventory_policy`, and uses `BedrockOperations` to execute against the pinned community Mineflayer Bedrock adapter. Safety observes every 300ms; follow every second; idle autonomy every 5s after 20s idle grace. Code adds finite player-directed wood counts, bounded move/dig with server inventory delta, tree-leaf/build heuristics, inventory-observed recipe/crafting, cautious food recovery, tentative retreat and attack calls, stop/preemption with message epoch, independent edition learning path, and an **optional** allowlisted Ollama chat planner. All are code paths, not yet verified Minecraft gameplay.

Production `npm run production:check` still requires validated world backup, exact 17879 port and `ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES`; `npm run production` actually connects and may move/dig/consume/attack in the **real** world. Low-level `bedrock-native/npm start` retains the known-good chat-only fallback. This new runtime requires **health event + initial Bedrock inventory_content window='inventory'** before acting; unknown server state fails closed, which may leave Alice idle until correct packet observations are validated on Mint. Pure `node --test test/runtime.test.cjs`: 14 local tests pass; fork dependency installation, full npm test on Mint, live motion, crafting, food, combat and world preservation **not yet observed**. Existing Paper Mindcraft installation and memories are unchanged. Tree recognition is heuristic, **not full world-claim protection**. Prior Oct 18 verified backup predates possible recent gameplay changes; no new offline snapshot implied.


## 2026-10-18 — Live 17879 autonomy and combat state instability: source-tested fix (not Mint-verified)

**Actual user Mint observation after fixed prismarine-chunk 1.26:** backup gate passed, Bedrock 1.26 registry + block roundtrip passed, native 1.26.51 spawn and controllers started. Native Alice chose `LEARN_WEAPON`, switched `IDLE -> CRAFT`, then `0/1 wood; no_verified_natural_tree`. Another real log shows follow intent for player `MolarParsley191` and repeated `FOLLOW -> GUARD/COMBAT -> FOLLOW` transitions; attempted attacks include `out_of_reach` and `ok:true,attempted:true,verifiedDamage:false`. **Following setGoal is NOT yet proof of actual server movement; sending attack is NOT damage/kill verification.** Source root causes: tree checker previously rejected a potential tree as soon as *any one* of roughly 200 peripheral `blockAt` reads returned unknown; safety immediately resumed following on a single clear 300ms sample and never applied a quiet-time hysteresis, leading to thrash near 3.5–4m threat boundaries.

New `bedrock-native/experiment/src/operations.cjs` gathers up to 36 visible log candidates and groups by x/z trunk columns, examines lower known logs first, requires observed vertical trunk (>=2), actual leaves (>=3), and >=26 locally loaded near-base samples, and refuses close build markers or unsupported world block data. Peripheral missing/unloaded voxels no longer automatically disqualify all trees. Rejections are **diagnostic**, with `[Alice wood] tree search:` reporting observed logs, inspected columns, rejected reasons, sampled leaf/trunk/unknown counts and Bedrock block-read support; not a blanket authorization to destroy player structures. Attack response now uses `ok:false,attempted:true,verifiedDamage:false,reason:'damage_not_yet_verified'` until real hit observations exist.

New `src/runtime.cjs` retains a **4.5 second continuous quiet window** following safety danger before resuming a FOLLOW intent; while waiting, follow task cannot reacquire the pathfinder. It reports local-follow-position progress every ~6.5s with `source:mineflayer_local_estimate_not_server_confirmed`, so real movement must still be verified in-game. Idle weapon preparation with insufficient wood starts an explicit `GATHER` task, no misleading `CRAFT` label. Local Node22 tests: **23/23 pass** including 5 added regression tests for missing peripheral block data, protected build, near-base coverage, 4.5s safety hysteresis and no-material GATHER, plus attack truthfulness. Static syntax passes. **Not yet deployed/tested on user's Mint; do not claim fix is validated in the real world.** Keep the original verified backup gate on port 17879, online-mode=true and known-good chat-only fallback; avoid 17880 unless user requests it. Next step: run `npm test`, `npm run production:check`, `npm run production`; capture `[Alice wood] tree search`, `[Alice follow] movement observation` and any `[Alice safety]` warnings; only then infer precise remaining chunk/physics/actor issues.


## 2026-10-18 — Paper FOLLOW intent parity / user gameplay logs: live Bedrock corrections (awaiting Mint acceptance)

**Observed on live 17879, user logs:** Xbox+Mineflayer 1.26.51 spawn and autonomous/safety loops succeeded. The spontaneous weapon preparation saw 36 visible logs in 13 columns, **all rejected as near_player_structure**; zero observed leaves, no unknown voxels, block data reported supported. These logs do not show a chunk decoding failure: the current area may be player-built and/or genuine trees may be farther away. Maintain tree/build protection and inspect real leaf names before claiming any tree can be harvested. Follow status displayed `localDistanceToTarget:1.89` and `localMovedBlocks:0`: with a configured three-block follow distance, no motion is expected while already that close. Confirm pathfinding by moving the human player 8-12 blocks away on unobstructed ground. Guard/combat generated numerous unverified attack packets; no observed server-side target damage/kill is in those logs.

**Paper code review:** `AliceMovementController.follow()` uses persistent `core.setFollowIntent`, the recent 30s last-seen tracker, and a recovery loop; Paper tasks may run temporarily and then resume a retained FOLLOW intention, while reactive Safety has highest priority. Bedrock previously called `core.stop('gather ordered')` / `core.stop('craft ordered')`, permanently erasing FOLLOW. It also put explicit `保护我` immediately into permanent GUARD even during peace. Fix Bedrock `src/runtime.cjs`: explicit WOOD / CRAFT now **suspend, not clear** FOLLOW; when bounded job finishes, `core.resumeIntent()` re-enters FOLLOW; explicit STOP alone clears it. Protect command retains FOLLOW while marking guard intent; self-defence/nearby player guard still preempts it when a threat is observed. Owner guard selection restricted to when Alice is within 12 blocks of a *visible* owner; Alice can work independently farther away while retaining intent. Follow can navigate only to a trusted recently seen (up to 30s), same-dimension waypoint; on stale/unseen target she waits rather than guessing. The 1.89 block observation now explicitly prints `withinFollowRadius:true`.

Fix attack-spam symptom: native Bedrock attacks remain **attempts, not verified hits**; target-specific exponential backoff (1.75s–12s) for unverified attacks, seven seconds after out-of-range, bounded 32-target memory; `entityHurt` resets backoff but is labeled an observed event **without proof Alice caused it**. No claim that this alone makes combat effective. Preserve 4.5s safety quiet-window and 300ms safety preemption.

Wood search: manual and autonomous gathering scans within 18 blocks (Paper-style work-area radius), up to 128 nearby observed log candidates, rather than 12/36 overly favoring the closest construction. The entire bounded request must remain within 18 blocks of its starting location. Still requires loaded trunk+canopy evidence and refuses construction markers; diagnostic log now includes `searchRadius`, `originalWorkBound`, and sampled `buildTypes`. No guarantee of finding natural trees in an urban area. Do not loosen the build guard without user evidence.

**Validation:** local Node22 `npm test`: 29/29 passing (including former suites); JavaScript syntax checks passed. New regression cases cover (1) FOLLOW→GATHER→FOLLOW, (2) FOLLOW→CRAFT→FOLLOW/STOP, (3) fresh/stale last-seen, (4) repeated unverified attack throttle and nonattributable hurt event, (5) wide search maintaining refusal of built logs, and (6) GUARD command following the owner in peacetime. **Not yet run on real Mint / actual player motion or combat verified.** Prior backup, original Paper files and Alice data, non-bedrock-default worlds, auth cache, and stable chat-only launcher remain untouched. Next need actual motion at distance >6, server change in observed inventory after collection, and `entityHurt` or server-side damage observation. NOTE: safety-interrupted GATHER currently cancels, it does NOT automatically restart unfinished gather when danger passes; that further parity feature needs a safe message-epoch + remaining-count implementation.

## 2026-10-18 — General Minecraft item intent + durable learning, stage 1

User clarified wood is just an example. Ultimate goal: understand arbitrary Minecraft item acquisition, retain factual game knowledge, learn from observed attempts, and persist across restarts. This is a staged agent goal, NOT a current universal collection claim.

**Now implemented:**
- Canonical Paper AliceLearningSystem now persists schema-v1 JSON on its first startup, not only on first successful episode. It loads old schema-v1 JSON without wiping it. Bedrock main passes a stable explicit memoryRoot. Production file: ~/.alice-bedrock-autonomy-state/bots/AliceAI-Bedrock/alice_learning.json. Lab and Paper data remain separate. Previous '[Alice learning] new memory' could repeat only because the file was not created before a verified task was saved; it did NOT alone prove previous memory loss. On next launch expect 'loaded persisted memory'.
- Structured itemAlias + itemOutcomes records persist on verified item/count evidence; explicit 'AliceAI 记住：闪亮矿=diamond' teaches aliases only if the ID exists in the Bedrock registry; cannot override known built-in synonyms. 'AliceAI 记忆' shows summary counts. This is episodic/statistical learning, NOT training LLM weights or self-modifying code.
- New item_knowledge.cjs normalizes '收集5个钻石', '挖钻石', '采集3个铁锭', '砍木头', '跟紧我', '吃东西/回血' into typed intents. Item IDs must resolve to the live bot.registry.itemsByName or verified alias. Aliases are a limited Chinese bootstrap, not full translations of all registry entries.
- The production Bedrock executor only safely handles: (A) known natural log variants with tree-canopy/build-guard observations and target-specific inventory delta, and (B) server-supplied recipes with ingredients already in hand, via craftVerified and inventory delta. Other item goals may be understood/validated but require future purpose-built ore mining, smelting, farming, fighting, trade, chest/loot, and risk-aware navigation. Do not pretend 'collect diamond' succeeds by rerouting it to wood or inventing a recipe.
- Optional Ollama (only when ALICE_OLLAMA_URL is provided) can emit validated collect_item/eat_food/reply/follow structured requests; runtime revalidates item and safety, and passes a small persisted memory summary to future prompts. Model output cannot directly dig, execute a shell command or assert a completed pickup. Without Ollama, deterministic parsing/known item aliases work, not open-ended Chinese understanding.
- AliceCore long-lived FOLLOW survives an item task. Priority remains survival > safety > command > idle. No changes to 17879 BDS configuration/world, login cache, Paper bot, online-mode or 17880.

**Validation:** GitHub source and CommonJS syntax verified. Isolate-mocked memory initialization/restart/alias persistence PASS; V8 parser and optional planner allowlist PASS; simulated Bedrock two-log acquisition with observed count PASS. Added regression tests learning_persistence.test.cjs, item_knowledge.test.cjs, generic_gather.test.cjs, planner_generic.test.cjs, runtime.test.cjs. Full user Mint Node24 npm test, in-world item collection, model connectivity and Minecraft gameplay are still UNVERIFIED.

**Next stage:** chat → intent → server registry/recipe/drops/source graph → safe specialized skill selection (mining, smelting, farming, mobs, trade, containers) → executed inventory/world proof → durable indexed memory → model reuses trusted learned strategies. Learning does not authorize arbitrary or destructive moves.
