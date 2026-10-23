## 2026-10-21 — Night shelter evidence

New privacy-filtered [Alice shelter] assessment and no placement authorized events include anonymous observed site, material, remaining placements, BDS position proof, nearby hostile count and explicit worldModification false on rejection. Each 10s sample can report worldRoutine.shelterOpportunity separately from the Core IDLE and longTermGoal SECURE_SHELTER. Without supply or a trusted live BDS position, expect no placed block and reason shelter_materials_missing or shelter_position_unconfirmed. If a one-block job succeeds, require observed target block change AND server-backed inventory consumption, not just a Mineflayer success. Never equate a roof and unclosed/unverified door with a safe home. Full Mint Node24 and BDS test outstanding.

## 2026-10-21 — Persistent goal vs. Core action telemetry

New `[Alice goal] transition:` events carry anonymous, allowlisted `event`, `goal`, `step`, `phase`, `reason`, `revision` only. Ten-second acceptance samples add `continuousGoal` with permitted `goal/step/phase/reason/revision/verifiedWood/attempts/nextReviewAt/lastCompleted`; no player name, route, inventory contents, raw error string or token. Heartbeat exposes `longTermGoal` even when `state:'IDLE'`, so test: after autonomous GATHER failure, `state:'IDLE'` + `continuousGoal.goal:'LEARN_WEAPON'` + `phase:'BLOCKED'` is correct. A verified inventory gain should yield `[Alice goal] verified milestone review scheduled:` after 5s, then `[Alice goal] transition:` step to CRAFT_WEAPON once inventory really contains enough wood. A scout `localEstimateBlocks:1.41` with `no_two_server_positions` must remain `server_position_unconfirmed`, not report travel success. STOP must show PAUSED. Nothing from this telemetry is independent evidence of BDS movement or world progress.

## 2026-10-21 — 14:47 stale-process diagnosis and GATHER event queue regression

Archive `AliceAI-Acceptance-20261021-144729.zip`: 342 online status samples with identical clientFeet, 15 old-format `[Alice job] {}` entries, no `[Alice job] exception:`, no FOLLOW. Runtime disk modified at 14:46:54 (+0800) but no spawn observed in the one-hour window; it disconnected at 14:47:13. This is a code-deployment versus process-reload mismatch risk, not evidence of recent patch failing. After restart expect `[Alice movement] Bedrock login coordinate:` and new schema events on the next autonomous GATHER failure. The queue should preserve concrete `tool_blocked` over initial `new_goal`, but should not generate unbounded model calls. If log still shows just `[Alice job] {}`, inspect actual running Node PID/start time and capture a fresh post-spawn ZIP before changing more logic.

## 2026-10-21 — Capture async resource job exceptions without sensitive error strings

Previously `startJob.catch` emitted `[Alice job] <raw Error.message>` to console, which the private journal translated to `[Alice job] {}`, preventing any diagnosis for 14 exceptions in a single hour. Now `[Alice job] exception:` includes only fixed `taskType`, origin `source=autonomous/model/other`, category `reason` (`pathfinder_no_path`, `action_timeout`, `adapter_api_exception`, `inventory_adapter_exception`, `world_observation_exception`, `unclassified_job_exception`), `stage=task_rejected` and `verified:false`. For autonomous GATHER, expect `[Alice autonomy] work site cooldown:` and `[Alice exploration] blocked resource site; indoor survey scheduled:` after the exception, allowing a different safe plan rather than a blind repeat every 120s. Do NOT log raw exception messages/stacks, auth tokens or personal identifiers. With the previous capture there is no way to infer the exact original exception subtype. The static world position, repeated retreat failures and missing night bed remain independent follow-ups.

## 2026-10-21 — FOLLOW 4.15 block false-success and jump instrumentation

`[Alice follow] movement observation:` has `localDistanceToTarget`, `withinFollowRadius`, `pathStatus`, `pathMoving`, `falseGoalSuccess`, `stalledWindows`, `targetDeltaY`, `horizontalDistance`, `selfOnGround` plus `physicsSamples`, `jumpPressedTicks`, `jumpEdges`, `forwardPressedTicks`, `groundedTicks` and `inputTrust=client_pathfinder_control_only`. A separate `[Alice follow] outside follow radius without valid progress:` event records compact target offset, intent counters and reason. A 4.15-block gap with follow radius 3, `success`, `pathMoving:false` should create >0 stalledWindows and initiate the existing bounded re-path after 2 stable intervals; >2 recoveries should hold safely 20s. True target distance <= configured radius should produce no repaths. The input counters are *local control intents only* (post physics callback) and cannot prove Bedrock outgoing `player_auth_input` contained those flags or BDS accepted a jump. If `jumpEdges=0` while a climb is actually needed, inspect A* node elevations; if >0 and BDS height unchanged, compare physics and BDS gameplay before touching the protocol.

## 2026-10-21 — Bedtime diagnosis rather than blind 12-minute retries

`[Alice sleep] night bed survey:` reports `status`, `phase`, `found`, `eligible`, `occupied`, `hostile`, `excluded` and `unknown`. `[Alice sleep] bed task outcome:` reports `ok`, `reason`, `bedPosition`, and `bedDiagnosis` (time window, distance, mob/occupancy/observed sleeping flags). `[Alice sleep] rejected bed cooldown:` tracks only the attempted bed; `[Alice sleep] alternative bed review scheduled:` should say 30s if a specific bed failed, 90s if no bed was selected. No newly generated `[Alice sleep] sleeping strategy deferred:` site-wide 12-minute cooldown should follow a bed-specific `bot did not sleep` timeout. Expected if no sleep event: `bed_sleep_unconfirmed_no_state_ack`, no `ok:true`. Confirm in-game sleeper animation, Bedrock daytime transition if all players sleep, and packet-driven `isSleeping` (not just job ended) before marking feature observed.

## 2026-10-21 — Distinguish missing movement proof from actual physical fault

`[Alice exploration] server position evidence missing:` is logged when the pathfinder locally reached its destination but no authoritative post-login BDS position was observed. It includes `reason`, `serverMovementVerified:false`, `localEstimateBlocks`, `nextReviewMs:90000` and `endpointExcluded:true`. This does **not** count as a successful scout and should not produce `[Alice exploration] scoped failure:` with a `motion` cooldown. Other failures (e.g. `scout_waypoint_not_reached` and `direct_flat_no_local_motion`) still must produce genuine motion cooldowns. The private allowlist now preserves `kind` (safe sanitized hostile name) and `tactic` for threat context events, previously omitted; never store mob runtime IDs, names of human players, Xbox credentials or raw packets. Compare independent BDS `querytarget @a` **before** and after reconnect to determine whether server movement accepted/persisted, not just whether corrections occurred.

## 2026-10-21 — Reconnect initial-position diagnostic

Private journal event `[Alice movement] Bedrock login coordinate:` captures `loginFeet`, `clientFeet`, `loginSource=start_game_player_position`, `serverCorrections`, `authority` (no XUID, tokens or account data). Every subsequent ten-second `sample` captures `loginFeet` separately from `clientFeet` and any correction-sourced `serverFeet`. The world 3D viewer still shows client prediction unless an independently trusted server position exists. Server 0 corrections is normal under Mojang's ServerAuthoritative movement when predictions match; never use this metric alone as accepted/travel failure. The P0 diagnostic is a BDS console `querytarget @a` while Alice appears moved, followed by a reconnect and a comparison to the next `loginFeet`. This test does not edit world, clients, identity or protocol.

## 2026-10-21 — Terrain adaptation acceptance evidence

Look for `[Alice voxel] terrain adaptation observed:` with `vertical`, `earthwork` and `positionProof`; then `[Alice voxel] terrain work outcome:` with action/attempted/worldModificationVerified. The 10s sample includes `terrainAdaptation`. No packet position evidence => the world mutation tool MUST NOT run, even if a place/dig candidate is visible. For jump/descend tests compare real player feet in BDS `querytarget @a` before and after; the client physics is just a prediction. For successful soil and bridge jobs verify the corresponding real server block and inventory before calling it observed. Negative tests: chest/building proximity, missing chunks, liquids, >1-block drops, missing material, player STOP/FOLLOW and motion cooldown must prevent world edits.

## 2026-10-21 03:21 — Model-origin scout no longer bypasses anti-loop memory

When reviewing the 03:21 ZIP, the model-origin `scout_safe` job omitted the
`endpoint attempt/feedback` and motion-cooldown events which deterministic
`自主探索` jobs already emitted. `startJob` now labels either origin's
bounded `EXPLORE` with the same safety feedback and excludes any attempted
endpoint for the existing 20-minute TTL. For any unverified model scout,
watch for an `endpoint feedback` event with `outcome: unverified`, an
associated `scoped failure` event for movement, and `motion` cooldown
in later samples. Client-predicted distance is still NOT server proof;
compare independent BDS `querytarget @a` positions. Source and tests are
staged; Mint Node24 and live BDS check required.

## 2026-10-21 — Two-cell escape/exploration and shorter observation holds

The 02:49 acceptance ZIP recorded 303 idle snapshots / 330, 14 Ollama `observe`
tools, repeated `flat_routes_not_executable`, and no self position corrections.
This changes route *eligibility*, not Minecraft server proof. A strictly checked
2–8-cell flat WALK corridor may now generate a bounded scout; 1-cell stubs,
nearby hostiles, recent endpoints and unverified collision remain denied.
Equipped autonomous Alice can explore during safe daylight without an active
resource task; when the model is healthy but between calls, this local-safe
skill remains usable. Other model failures remain fail closed.

`worldRoutine.idleHold` is published in the live control heartbeat;
filtered acceptance samples contain `idleHold.reason` and `nextReviewAt`.
The dashboard prints the reason and seconds to the next *read-only* review
(~30 s when the model selected observe with no safe executor).
Original movement/hostile/night/bed/resource cooldowns still override this
review timer. Compare two independent BDS `querytarget @a` coordinates
rather than interpreting client coordinates or `serverPackets:0` as success
or failure of actual movement. Node24 + Mac + real BDS verification pending.

# AliceAI Acceptance Logs — Mac Desktop ZIP

**Status: source committed; real Mint Node24 and Bedrock acceptance pending (2026-10-20).**

## What is collected

Production Alice writes allowlisted behavior events and a status sample approximately every 10 seconds.
Mint private directory: `~/.alice-bedrock-control/acceptance/events.jsonl`, with up to four rotated 1MiB files.
Records describe autonomy/LLM proposals, noPath, voxel candidates, safety, sleep, job outcomes,
local position (explicitly labeled NOT verified BDS movement), server correction count, health,
mode and model budget. It excludes raw chat, prompts, Xbox tokens, login and network packets.

The exporter creates a ZIP with `manifest.json`, `events.jsonl`, and safe latest
`status.json` / `world-view.json` when present. Manifest includes actual first/last event,
number of status samples and event records. Old events roll off after file limits;
asking for 24 hours does not guarantee 24 hours are retained.

## Deployment from Mac (one-time per source update)

```bash
cd ~/Documents/workspace/hero-skills
git status --short
git pull --ff-only origin main
python3 -m unittest discover -s games/minecraft-ai/tests -p 'test_acceptance_export.py' -v
rsync -av --exclude node_modules --exclude __pycache__ \
  games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
```

## Mint tests and single-Alice restart

Stop only the currently running Alice with Ctrl+C in its existing terminal.
Do not stop BDS, delete Xbox credentials, remove learning files or start two Alice clients.
Preserve the already valid production environment / verified backup manifest.

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
cd ~/minecraft-ai/bedrock-native/experiment
node --test test/acceptance_log.test.cjs test/voxel_actions.test.cjs test/live_control.test.cjs
npm test
: "${ALICE_BEDROCK_BACKUP_MANIFEST:?Existing verified backup manifest required}"
npm run production:check
npm run production
```

If a test or production preflight fails, do NOT bypass the check. Mac dashboard and BDS
do not need restarting; the Alice process MUST restart to attach the event journal.

## One Mac command after Alice runs for a while

```bash
cd ~/Documents/workspace/hero-skills
ALICE_MINT_SSH=tedz@192.168.0.104 \
  bash games/minecraft-ai/scripts/collect-alice-acceptance-mac.sh 3
```

The `3` means last 3 hours (supported: 1–24). The exported file is named
`~/Desktop/AliceAI-Acceptance-YYYYMMDD-HHMMSS.zip`; upload it to ChatGPT as-is.
The Mac script validates ZIP integrity and samples, and never treats an empty export as success.
SSH prompts for a password if no key is installed.

The exporter is read-only, does not touch the world or run BDS commands, and does not
alter Alice behavior. Coordinates/world blocks in these logs are personal world data;
share ZIP privately. To independently verify actual movement, compare BDS
`querytarget @a` before and after; client local coordinates alone cannot prove movement.

### Acceptance checklist

Run Alice 20–60 minutes with autonomous mode and, if convenient, test one FOLLOW
then owner leave/rejoin; download the ZIP and check event continuity, observe repeats,
failure codes, serverPackets, flat walking route options, safety transitions,
and whether follow is cancelled when the player really leaves the server.

JUMP_UP, STEP_DOWN, CLIMB, MINE, PLACE, BRIDGE and PILLAR are NOT claimed executable
in live production by this logging/flat-route update; further physical/permission tests required.

### 2026-10-20 additional diagnostic fields

The latest controller adds `voxel.flatCandidate` to the rotating journal and a one-per-stable-scene
`[Alice autonomy] model observe without local action:` event when no physical skill is authorized.
An approved all-WALK route at daytime may be tried *before* a failed wood harvest, but only through
the existing bounded scout and after post-LLM human/safety revalidation. A failed route still gets a
cooldown; no dig/place/jump authorized. Legacy retreat errors with exact text
`No path to the goal!` become `pathfinder_no_path` (never raw arbitrary console text).
If the output has `serverPackets:0`, changing client coordinates are NOT server-verified travel.
See CURRENT_STATE.md for analysis of acceptance package 18:00–18:45 SGT.


### 2026-10-20 20:46 additional route and hostile diagnostics

The journal now keeps a separately observed `flatCandidate` and
`walkSelection` with `reason`, `checkedRoutes`, `threatRoutes`,
`blockedRoutes` and `knownHostiles`; route selection events are emitted
only when the reason/counts change. Current codes include
`verified_flat_corridor_clear_of_known_hostiles`,
`all_eligible_flat_routes_near_hostiles`,
`flat_routes_recently_failed_or_visited`,
`flat_routes_not_executable`, and `no_verified_flat_walk_candidate`.
A safe route requires collision verification and fresh threat checks after
Ollama; none of these codes prove server-accepted movement.
`CURRENT_STATE.md` includes a grounded analysis of the 19:46–20:46 ZIP.


### 2026-10-20 21:03 root-cause acceptance: Bedrock physical input probe

The log conclusively shows 4 EXPLORE jobs started, and each A* pathfinder `goto`
failed with `No path to the goal!` despite locally observed WALK-only corridors.
The new transport probe is **not automatic unrestricted travel**: after A* rejects
the *first* verified flat tile, it temporarily sends Bedrock `forward` inputs
for at most 5 short pulses with repeated geometry and safety checks.
It reports exactly one of:
- `direct_flat_unsupported_footprint`, `direct_flat_collision_observed`,
  `direct_flat_unknown_or_hazard_collision`: no unsafe inputs sent.
- `direct_flat_no_local_motion`: inputs attempted but local physics did not advance.
- `scout_local_movement_not_server_verified`: local physics moved but BDS position
  remains unconfirmed; the bot must **not** claim the entire route succeeded.
- `direct_flat_step_server_confirmed_partial_route`: only the first step is
  server-confirmed and a new observed survey is needed.

Private `[Alice movement] A* noPath physical input probe:` includes
`attempted`, `pulses`, `physicsTicks`, `localEstimateBlocks` and
`serverMovementVerified`. Valid client-side movement often does not produce
Bedrock correction packets, so `serverPackets:0` is not proof of no server movement.
Use MCManager BDS console read-only command `querytarget @a` before and after
to compare the **Alice** player actual server XYZ. This is not a bot teleport
or any world mutation. Full arbitrary navigation/dig/place remains pending.

On Mint, tests now include:
```bash
cd ~/minecraft-ai/bedrock-native/experiment
node --test test/direct_flat_step.test.cjs test/runtime.test.cjs test/world_routine.test.cjs
npm test
```


### 2026-10-20 21:19 — important distinction in native fallback

The first deployed probe returned `direct_flat_no_local_motion` with
`attempted:false`, `pulses:0`, `physicsTicks:0`. This was a **false diagnostic label**,
not evidence that the Bedrock client rejected a keypress. On that client Alice was
already within ~0.05 blocks of the target first cell's center at the end of
the attempt, based only on the local estimate.

The patched journal adds `[Alice movement] A* first waypoint observation:`
with `before`, `lastAfter`, `localMovedBlocks`, `distanceToWaypoint`,
`withinWaypoint`, and `serverPositionSamples`. When local first cell is
already reached, the attempt records
`scout_first_waypoint_local_only_server_unverified` rather than
claiming a failed physical key input. No unverified second step is chained.
When actual key inputs are issued, `attempted:true`, `pulses>0` distinguishes them.

The only independent validation of server-accepted movement right now is
read-only BDS `querytarget @a` (before/after) on the Minecraft server's
own console, with Alice's name and coordinates. Use that alongside the
private ZIP, because correction packet count zero **does not prove immobility**.


### 21:43 open-wooden-door failed-waypoint acceptance

The 21:43 ZIP finally distinguished `firstWaypoint` from `failedWaypoint`.
The latter is a `wooden_door` at [-1261,98,655], with a second half at
[-1261,99,655]. The previous probe repeatedly checked the *already locally
reached first tile*, so all three logged probes had **zero actual input pulses**.

New acceptance fields:
- `[Alice movement] A* failed waypoint probe selection:` —
  `selectedIndex` and `probeWaypoint` refer to the **actual** immediate tile
  on which A* failed (never skip unverified intervening geometry).
- `[Alice exploration] scout door passage:` —
  `doorOpenObserved` from Bedrock `open_bit`, the exact geometry/door
  refusal `reason`, `attempted`, `pulses`, `serverMovementVerified`.
  `crossing_open_door_state_unverified` means **no** door passage was tried;
  `crossing_opposite_side_blocked_or_unknown` means the other side is
  unsafe or unreadable; `door_passage_local_only_server_unverified` means
  local client physics appears to traverse the door but BDS has **not**
  independently confirmed it.

The existing `escape_crossing.cjs` door executor is reused only for a
**verified OPEN wooden door**, no door activation/toggle, and only with
safe floor/beyond and the existing STOP/COMBAT safeguards. A wooden door
that has closed, lost block data or has a blocked far side will NOT be
forced or dug through. This is a staged code change, not a promise of
live movement success.


### 2026-10-20 22:17 — automatic deployment comparison in each Mac ZIP

The Mac Desktop collector now makes an extra **read-only** SSH call before exporting the
same historical Alice JSONL. It runs `sha256sum` on the four core Alice source files
(`runtime.cjs`, `direct_flat_step.cjs`, `escape_crossing.cjs`,
`acceptance_log.cjs`) on Mint, and compares hashes against the checked-out Mac
files. A new `deployment.json` ZIP member includes:
- `diskFilesMatchMac`: whether Mint's current source bytes equal Mac's files.
- `files`: per-file `macSha256`, `mintSha256`, and `matches`.
- `latestSpawnAt` and `runtimeFileMtime`: timestamp evidence for whether
  Mint's runtime file was changed **after** the latest observed Alice spawn.
- `runtimeProcessFreshness`: one of
  `source_changed_after_last_spawn`, `source_not_newer_than_last_spawn`,
  or `unknown_no_spawn_event`.

**This is not an attestation of loaded Node modules**: matching files on disk
does not prove the running process has restarted. In particular, the 22:17 ZIP
includes a new spawn at 22:09 but no daylight EXPLORE after that time, so its
absence of the new door-log labels cannot decide whether the 22:09 process is
running old or new modules. The new provenance metadata helps avoid repeating
that ambiguity in subsequent reviews. It does not read private credentials,
BDS world files, raw network packets, or user messages.

To export after `git pull`, keep using:
```bash
cd ~/Documents/workspace/hero-skills
ALICE_MINT_SSH=tedz@192.168.0.104 \
  bash games/minecraft-ai/scripts/collect-alice-acceptance-mac.sh 1
```

If `diskFilesMatchMac:false`, sync first; if
`runtimeProcessFreshness:source_changed_after_last_spawn`, stop/restart only
Alice after passing the full tests and keeping production env intact.


### 2026-10-20 — New rapid vertical displacement safety evidence

The production Alice runtime now observes **local-only** Y changes at the safety
controller's existing 300ms cadence. A drop of at least four blocks within
12 seconds starts a **90-second autonomous-only safety hold**, records
`[Alice safety] vertical displacement observation:`, and exposes
`worldRoutine.verticalSafety` and the bounded `sample.verticalSafety`.
The journal includes `dropBlocks`, `fromY`, `toY`, `elapsedMs`,
`onGround`, `nearbyClimbable`, `serverPositionPackets`, and explicit
`positionTrust:local_prediction_not_server_proof`. Observing a ladder
nearby **does not** assert it was climbed or make the route safe.

This module does not stop survival/combat/manual follow or modify BDS.
It cancels autonomous EXPLORE when locally observed geometry changes
sharply and prevents a new autonomous job during the hold. It is
conservative: a valid descent near ladders may also trigger a hold,
pending independent server evidence. The hold expires automatically;
the next exploration requires a new observed collision route.

Run on Mint after syncing:
```bash
cd ~/minecraft-ai/bedrock-native/experiment
node --test test/vertical_motion_watch.test.cjs test/runtime.test.cjs
npm test
```
Before claiming actual movement or safe descent compare two read-only
BDS `querytarget @a` results for Alice; a client estimate is not proof.


### 2026-10-21 — Three new behavior acceptance tracks

1. `[Alice exploration] endpoint attempt:` and `endpoint feedback:` show
`key`, `outcome` = attempted/unverified/blocked/confirmed and explicit
`serverMovementVerified`. `worldRoutine.explorationProgress` contains counts
and `trust:attempted_is_not_server_verified`. An attempted destination is not
a visit: only server motion data can promote it to confirmed. Re-attempts
to previously used endpoints are deferred for 20 minutes.
2. `[Alice safety] retreat observed result:` now reports
`retreat_flat_geometry_not_verified`, `retreat_no_verified_away_corridor`,
`retreat_pathfinder_no_path` or
`retreat_local_only_server_unverified`. Selection inspects entire known flat
corridors; it never authorizes digging, placing, jumping or unknown blocks.
3. `[Alice mission] resource opportunity:` and
`inventory milestone:` distinguish a *verified natural tree* or known
inventory recipe from **actual server inventory item deltas**. A job that
does not increase an item count is failed, not completed. Failed crafting
cools down independently from failed harvest sites.

All status fields are bounded and passed through the existing private
credential-free acceptance JSONL whitelist. No raw player chats/credentials
are included. Live BDS `querytarget @a` remains a separate necessary
read-only check for confirmed movements.

### 2026-10-21 — Server provenance must be explicit

`explorationProgress.confirmed` and `scoutConfirmedSegments` require a successful matching endpoint, an explicit `serverMovementVerified:true` from the recent server-position comparator, and `serverMovedBlocks >= 0.25`. A numeric-only or local-only estimate stays *unverified*. This static contract does not replace independent BDS `querytarget @a` before/after checks.
