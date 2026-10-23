## 2026-10-23 — Injected-client initialization and stable BDS input IDs (Mint movement and first endpoint verified)

The injected native client bypassed the pinned Mineflayer Bedrock factory and its initial loading-screen/aim-assist sequence. Restore the same sequence once on player_spawn, only for protocol 2193. Tests compare against the actual installed factory offline and verify exact codec bytes; no extra login or node_modules patch. Only initial join is in scope.

**Correction to the earlier input flag conclusion:** the Mojang beta.1 JSON enum lists names without numeric values and omits members. Its array positions are not stable BDS wire IDs. Endstone's dump of BDS **1.26.51.1** at `0db6185921974b5aba4a30af33a5eed842dd2cb9` explicitly gives Up=10, StartJumping=31, VerticalCollision=50, InternalUpdate=65; the installed 66-entry mapping matches. The former `official_2193` rewrite to 63 entries was incorrect and has been removed. The old opt-in is now a strict validation-only alias (`stable_bds_2193`, applied=false), so existing launch environments no longer silently renumber valid inputs. Unknown/previously overwritten layouts fail explicitly. Historical notes below describe superseded conclusions.

The outbound audit was also outside the analog wrapper, comparing pre-transformation input with post-transformation bytes. Pipeline order now places compatibility before audit/serializer, eliminating false analog_mismatch while retaining detection of real mismatches. Mint now confirms cumulative BDS travel 3.02 blocks and matching client/server feet (1.49,69,2.41); 20 moving inputs match encoded bytes, zero mismatches. The second autonomous night route returned `ok:true`, `serverMovementVerified:true`, `server_verified_scout_endpoint` for target (1,69,2). The first attempt stopped on unavailable position proof; the normal later attempt succeeded. No wood/build acceptance yet. Mint Node24 full suite 539/539; Python 72 tests with 3 existing skips. See `BEDROCK_INITIALIZATION_20261023.md` for sources, live result and operator commands.

## Update 2026-10-23 — startup decisions verified, movement P0 remains

Startup delay and navigation-dependency misclassification repaired; final live login selected its goal after 100ms and invoked EXPLORE after 13.265s. The existing BDS witness is now an enabled systemd user service. Latest execution still diverged: client (-0.54,68,0.6), independent BDS (0.5,69,0.5), 25 samples / 0 travel. Runtime now exposes the exact dependency hold and rechecks at its existing five-second cadence, without creating a wood/probe failure penalty. No evidence of true travel/harvest/build success. See [startup delivery and operator commands](AUTONOMY_STARTUP_20261023.md); private final process log is `~/.alice-bedrock-control/operator-autonomy-8456a7e9-final.log`. Preserve single-client logout guard; do not keep restarting or weaken proof to create apparent progress.

# Alice Bedrock — Stage 1 movement / noPath handoff (2026-10-19)

## 2026-10-19 latest 3D viewer Mint test fix and handoff

The user requested an 11×11×8 local 3D Bedrock world viewer near Alice with local movement, precise XYZ, entities and bottom behavior log. See canonical `docs/ALICE_WORLD_VIEW_3D.md` and the focused `docs/HANDOFF_2026-10-19_WORLD_VIEW.md`. Components: `src/world_view.cjs` 1Hz private state/position feed + <=4s terrain cache; read-only `dashboard/remote_world.py` fixed SSH reader + `server.py GET /api/world`; responsive `dashboard/#world` native Canvas 3D orbit/zoom/roof cutaway and events. Display client physics vs server packet evidence separately; no auth, chat or BDS writes. **Staged until real Mac/Mint/BDS validation**.

Mint's first `npm test` exposed a real source issue: `test/world_view.test.cjs` expected 'Unsafe viewer target' for a dangling symlink but the publisher reported null. Root cause was `existsSync` before `lstatSync`, which follows a missing link and returns false. Changed publisher to `lstatSync(path,{throwIfNoEntry:false})?.isSymbolicLink()` for target and root; added regression asserting dangling file is unchanged and dangling root symlink rejected. Isolated Node22 filesystem check passed, **Mint Node24 rerun pending**. No need to restart the Bedrock server or re-authenticate Xbox; first pull/rsync, run `node --test test/world_view.test.cjs && npm test && npm run production:check`, only then restart the existing Alice process if appropriate. Never clear private data to bypass the symlink guard. Maintain precise operator commands in the focused handoff.

## Stage 1 live world viewer — 2026-10-19 (staged)

The user requested a visual, read-only 3D view synchronized to the small area around Alice, with her moving position, nearby blocks/entities, and behavior output below. Implemented separate `dashboard/#world` local Canvas 3D page, using `experiment/src/world_view.cjs` to sample current native Bedrock Mineflayer's received chunk cache only. Private `~/.alice-bedrock-control/world-view.json`, mode 0600, <=128KiB. Alice position and events 1Hz; small 11x11x8 terrain volume cached up to4s unless coarse position changes. Proxy is existing fixed SSH command: `dashboard/remote_world.py` and `server.py` GET `/api/world`, local-only backend, home-LAN reader. Rotatable/zoomable voxel preview, roof cutaway, entity labels, XYZ, health, state, filtered event timeline. Missing chunk cells stay 'unknown'. Browser uses no Three.js/network assets and no new game/SSH write operation. **Moving figure is client-estimated** until fresh Bedrock server-origin self-position evidence arrives, shown separately. World edits/credentials/MCManager/BDS entirely untouched.

Docs and deployment: `docs/ALICE_WORLD_VIEW_3D.md` is canonical for commands, trust boundaries and UI acceptance; `docs/CURRENT_STATE.md`, `docs/CAPABILITIES.md`, `docs/TEST_PLAN.md`, `dashboard/README.md`, `dashboard/catalog.json` updated. Isolated JS snapshot + cache + server position + event filtration tests passed; `test/world_view.test.cjs` includes atomic filesystem verification, Python `tests/test_dashboard.py` covers world SSH bridge, GET-only and stale/symlink. **Full Mac/Python and Mint/Node tests and real MC world run still pending**, do not describe as observed until comparing against BDS `querytarget`. If no recent self-movement correction packets are sent, server view stays unknown (this is a Bedrock movement evidence limitation, not a renderer bug). P0 noPath, retreat, sleep and listener warning remain separate.

## 2026-10-19 latest: legacy scouting cooldown prevented new 3D route selection

**Confirmed on Mint:** Alice was running the updated 3D planner (files modified 16:02:04; process started 16:02:17), yet two day phases logged WAIT / scout_site_cooldown. The persisted private record was scout:-79,12,40, no_verified_safe_corridor, attempts=4. Existing idleTick checked this legacy sector-wide failure *before* candidateScout(). No live 3D route had been attempted in those logs. main.cjs intentionally changes the cwd to the private state directory; this is not a wrong binary path.

**Implemented:** FailureMemory still loads and persists all old scout, wood, sleep and bed records unchanged. It ignores legacy sector-wide scout cooldown for **movement gating** while showing legacyScoutIgnored to operators. New route records blacklist exact failed Pathfinder waypoint coordinates, and the 3D planner excludes those cells while allowing alternative fully loaded safe routes. New probe records capture unloaded or invalid ground, rechecked approximately every 30 seconds without blocking a newly loaded safe path. A separate motion cooldown is the only sector-wide safety hold, used if Bedrock server motion remains unverified or local movement fails (five to fifteen minutes). Genuine noPath on a known waypoint allows a different safe route attempt after a 15 second delay. Unknown chunks, hostiles, unsafe ground and player command preemption remain guarded.

**Verification boundary:** JavaScript syntax and fourteen isolated decision/terrain tests passed; an in-memory simulation verified legacy four-attempt + wood records remain intact across reload and exact route records retain private file mode 0600. New Node regression tests are committed but full Mint npm test and real Bedrock querytarget position verification have not yet run. Stage 1 actual motion P0 remains open. Do not delete auth, world or failure memory to validate migration.

**Safe rollout:** Mac repo ~/Documents/workspace/hero-skills: inspect git status, git pull --ff-only origin main, run dashboard Python tests, non-destructive rsync games/minecraft-ai/ to Mint ~/minecraft-ai/. Mint: retain ALICE_BEDROCK_BACKUP_MANIFEST in current shell, use isolated Node24; run npm test and npm run production:check. Only after checks, stop existing Alice foreground process and start exactly one production Alice using existing legacy-native-injected Xbox mode. No Minecraft server, MCManager or Ollama restart. Mac dashboard can be restarted separately. Check world-aware decision, terrain probe evidence, scoped failure, and BDS querytarget; never call planned route server-confirmed without fresh server self-position evidence.

## Latest stage-1 update — adaptive 3D route progression (2026-10-19, unverified on Mint)

User questioned fixed 6-block scouting and absent multi-segment progression/elevation awareness. Replaced fixed straight scout with `experiment/src/scout_routes.cjs`: bounded 512-node 3D BFS on known loaded natural full blocks, finite segment depth from daylight/health/food (3–12 steps), up/down at most one full block per adjacent step, safe turns, known hostile rejection, no partial-shape stair/slab assumption. `world_routine.cjs` delegates `candidateScout` to new planner, `runtime.cjs` executes short verified waypoints in Pathfinder no-dig/no-door/no-parkour configuration. Only if fresh BDS own server feet match final 3D destination **and** local position converges does it record a successful endpoint and schedule further planning after 15 seconds. Limit remembered endpoints to 32; unknown motion leads to cooldown, not extrapolated wandering. Publisher/control UI shows confirmed segments, planned length and elevations. Tests added in `test/world_routine.test.cjs` and `test/runtime.test.cjs`; isolated source parse and pure terrain checks passed, **NOT** Mint npm/full world acceptance. Stairs/slabs with half-height collision shape remain intentionally unsupported until actual shape/version evidence; do not claim total navigation stage completion. Run the exact Mac/Mint commands already below and inspect `querytarget`.

## Update: solo Alice idle loop (2026-10-19, later user log; staged, Mint acceptance pending)

User provided production log while **not logged in**: Alice spawn successful and autonomous controllers active; 9 repeated `LEARN_WEAPON` selections all deferred due prior `no_verified_natural_tree` site memory; 3 attempts to sleep at site `-79,12,40` failed with combined `bed_navigation_or_sleep_failed`. There is no confirmed travel or harvest and no FOLLOW from a player. Root in source: Paper `autonomy_policy.decideIdleWork` chooses weapon repeatedly based only on inventory, while Bedrock runtime's resource cooldown suppressed action but not plan/log; old sleep returned one catchall error and site backoff only 4m.

Follow-on commits: `world_routine.cjs` exposes `decideAutonomousResponse` (WORK/SCOUT/WAIT/OBSERVE) with real `FIND_NEW_RESOURCE_AREA` goal, safe ground/time/weather route refusal and 3m initially capped 15m scout site cooldown. Runtime logs only changed decision or once/10m, publishes `lastIdleDecision`; no new random autonomous wandering. `life_actions.cjs` classifies bed navigation vs sleep rejection, returns attempted bed XYZ and accepts safe excluded-bed predicate; `world_routine.FailureMemory` holds private exact bed failures for 20m, region sleep backoff 12m, and `runtime.lastBedFailure` sent on existing read-only heartbeat; Mac `#control` shows last autonomous goal/bed failure. Added deterministic tests in runtime/world_routine/life_actions; only source parse and pure policy isolated checks performed in authoring environment, Mint npm test **not run**. No protocol/identity/world changes, P0 true BDS movement still pending. Bed ownership/spawn point unresolved; provide Alice a dedicated bed.



## Objective and live facts

First deliver true Bedrock movement, robust FOLLOW, noPath safety and grounded foot-Y evidence. User approved this first; explicitly requests **all runnable Mac/Mint commands after every commit** and advance warning near chat context limit. Do not ask to redo old login A/B.

- Git repo: `hedydev/hero-skills`, main; Mac `~/Documents/workspace/hero-skills`, Mint `tedz@192.168.0.104:~/minecraft-ai`, Node24 `~/.local/share/alice-bedrock/node24/current/bin`.
- Production: MCManager BDS at `/home/tedz/minecraft-bedrock`, UDP 17879, world `Bedrock level`; always preserve verified backup manifest. Existing Xbox success is `ALICE_BEDROCK_CLIENT_MODE=legacy-native-injected`. User has recently confirmed visible Alice and successful login; intermittent Microsoft HTTPS fetch and historical `server_id_conflict` remain distinct incidents.
- Historical real-world defect: accepts human FOLLOW (MolarParsley191); A* gives `partial/noPath/timeout`, stays 6–7.5 blocks away, prior “floating” report. `localMovedBlocks` is **client simulated**. No verified true BDS movement yet after latest changes.
- Read pinned upstream forks before changes: `Pix3lPirat3/mineflayer@b24015aee...` `lib/loader.js` chooses `bedrock_plugins/client_input.js` (NOT Java physics plugin), which queues `player_auth_input` from `setControlState` every 50 ms, anchors to server ticks and reads `correct_player_move_prediction`. Self spawn `lifecycle.js` subtracts eye height; remote `add_player` spawn adapter converts eye->feet. `Pix3lPirat3/mineflayer-pathfinder@789d9146...` consumes `physicsTick`, sets `GoalFollow`/A*. Be sure not to replace this with a Java `position` packet, fake `bot.entity.position` or teleport.

## Source changes (committed; Mint rollout NOT yet demonstrated)

- `bedrock-native/experiment/src/movement_evidence.cjs`: passive read-only `start_game`, `correct_player_move_prediction`, self `move_player` listeners. Own runtime id filter; age-bounded server feet coordinates and count; independent `checkpoint/progress`. **Never** infer success from local physics or fake corrections. A correction may be absent on healthy movement; lack of packets is `unknown`, not proof of immobility. No packet or auth mutation. `test/movement_evidence.test.cjs` checks ownership, progress, uncertainty and cleanup.
- `bedrock-native/experiment/src/safe_follow_step.cjs`: pure short direct-follow corridor check, requiring valid known grounded feet, level player, 8-block maximum range, known solid safe floor, empty 2-block headroom at each sampled full-width (0.6 m) footprint, no fluid, lava, gap, unsafe or unknown. No parkour/jump/block edit. `test/safe_follow_step.test.cjs` covers loaded floor, gaps/unsafe/headroom, player distance and ungrounded refusal.
- `bedrock-native/experiment/src/runtime.cjs`: only when live FOLLOW A* returns `noPath`, can send one `setControlState('forward',true)` on a **400ms** timer after turning and releasing failed Pathfinder goal. Blocks if threat, low health, concurrent human job or unsupported ground. Cooldown 16s/30s if server progress unobserved; STOP/SURVIVE cancels instantly. Local observation is separate from server evidence. No other A* error triggers this fallback. Enriches existing 15-block noPath diagnostic with *recent* server feet / Y divergence or unknown. New regression cases in `test/runtime.test.cjs`.
- `bedrock-native/experiment/src/main.cjs`: instantiate movement evidence before spawn; pass to runtime; publish read-only server sample in existing private heartbeat (2 sec).
- `dashboard/index.html`, `dashboard/app.js`: Control Center `#control` displays read-only server movement count/position. `dashboard/catalog.json` registers two features as **staged** (30 total); not observed until Mint.
- Existing `bedrock-native/experiment/src/follow_diagnostics.cjs`, `follow_progress.cjs`, `bedrock_player_coordinates.cjs`, `connection_strategy.cjs`, authentication and world backups are retained, not reset.

## Verification scope and risk

Only GitHub source static parse, mock read-only evidence, and pure safe-corridor checks executed in authoring environment so far. Cannot run actual Node24 npm suite or BDS from remote editor. Status must remain **staged** until field evidence. A 400ms input correction may never be sent even if BDS accepted movement; human should check actual MCManager `querytarget`. The fallback is not full pathfinding or true obstacle navigation: when A* truly cannot see safe terrain, Alice correctly holds position. No pathfinder jump/dig bypass, no auto-teleport. Multiple self positions via `correct_player_move_prediction` or `move_player` are evidence of server-origin motion, but cumulative sampled displacement is NOT total traveled path.

## Copy-paste rollout commands

Mac terminal, after confirming no overlapping local modifications:

```bash
cd ~/Documents/workspace/hero-skills
git status --short --branch
git pull --ff-only origin main
python3 -m unittest discover -s games/minecraft-ai/tests -p 'test_dashboard.py' -v
bash -n games/minecraft-ai/scripts/run-dashboard.sh
rsync -av --exclude='node_modules/' --exclude='__pycache__/' games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
```

On Mint stop **only** the old Alice process by Ctrl+C in its foreground terminal. Keep BDS/MCManager up. In a Mint terminal retaining the *previously verified* private backup-manifest environment:

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
export ALICE_BEDROCK_PROFILE=AliceAI-HedydevGame
export ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES
: "${ALICE_BEDROCK_BACKUP_MANIFEST:?Previous verified backup manifest must already be set}"
cd ~/minecraft-ai/bedrock-native/experiment
npm test && npm run production:check
ALICE_BEDROCK_CLIENT_MODE=legacy-native-injected npm run production
```

Mac Control Center (restart only the dashboard's foreground process if already running):

```bash
cd ~/Documents/workspace/hero-skills
bash games/minecraft-ai/scripts/run-dashboard.sh
```

Open `http://127.0.0.1:8788/#control`. Expect `Bedrock 服务端移动验证`, `跟随与地形诊断`, and `[Alice movement] short follow recovery ...` log lines. For final authoritative validation, in a *safe flat loaded world* have the player move 5–7 blocks away and say `AliceAI 跟着我`; in MCManager BDS console run `list` to resolve the actual Alice gamertag and run `querytarget @a[name="ACTUAL_ALICE_GAMERTAG"]` before and after. Confirm server XYZ changes consistent with visible physical movement. This one acceptance test is NOT a repetition of past native auth A/B. No game server, MCManager or Ollama restart needed.

## Remaining stage-1 blockers and next owner

1. Run full Mint Node24 suite; inspect any failing test (especially fake runtime flow and safe-corridor guard) without altering server or wiping data.
2. Verify raw BDS current server eye/feet Y vs local `centerSupported`; measure *real* movement via `querytarget`. If short step works but A* noPath persists, use existing read-only footprint diagnostic to isolate pathfinder `Movements.getBlock`, block collision palette and collision entity indexing. Do not increase retry counts blindly.
3. If BDS rejects input, compare fresh `correct_player_move_prediction` tick/correction data and known-good movement packet schema from the pinned Bedrock fork. Never send arbitrary raw packets or implement server spoofing.
4. Long-term first-stage completion requires flat, corner/door, one-block step, threat interruption and FOLLOW resumption tested in-game. Current stage is **implementation + diagnostic groundwork awaiting Mint acceptance**, not a closed P0.
5. `MaxListenersExceededWarning` from 11 `start_game` listeners is open and separate; do not silence without checking actual registrations. Microsoft HTTPS `fetch failed` intermittent, unrelated to a confirmed noPath root.
