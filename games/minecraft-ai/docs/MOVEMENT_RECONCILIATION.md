# Bedrock movement prediction reconciliation

## Contract and implementation (2026-11-02)

Alice's existing injected `bedrock_client_input_sync.cjs` owns the input loop;
the installed Mineflayer plugin is not patched on disk. The previous correction
handler overwrote the current Y, ignored horizontal error <=0.5, read a
nonexistent `velocity` field and re-anchored the present clock to a delayed
correction tick. These are source-level defects, not proof of the unique cause
of every observed BDS/client offset.

The installed Mint `minecraft-data` schema for `bedrock_1.26.51` was inspected
read-only. Its player correction contains `prediction_type`, `position`,
`delta`, `rotation`, optional `angular_velocity`, `on_ground` and `tick`.
`delta` supplies movement velocity; `on_ground` supplies grounding. Vehicle
corrections do not belong to the standing-player path. Camera look remains
under current controls; this change does not reinterpret vehicle rotation.

`movement_prediction_history.cjs` keeps a bounded post-physics state per emitted
input tick, plus that frame's input, look, jump impulse, physics attributes,
velocity, collision flags and eye height. Capacity follows the advertised
rewind size when valid, defaults to 40 and is capped at 80 (four seconds at
20Hz). The buffer stays in memory and contains no account identity.

For a valid past correction in the same history/context:

1. Restore the post-physics state for the corrected input tick.
2. Apply all position axes, `delta` and `on_ground`, using that frame's eye
   height to convert the packet position to feet.
3. Re-simulate only subsequent recorded physics inputs to the latest sent tick.
4. Apply the recomputed kinematics without overwriting the current look/control
   intent or a jump newly queued for the next frame.

Replay never queues packets, consumes block actions, emits physicsTick,
re-runs Pathfinder/AI, or increments independent BDS evidence. Original live
frames alone generate those events. Correction ticks cannot re-anchor the
input clock. Production scheduling uses monotonic elapsed time while keeping
the existing initial `world_anchor` / explicit `client_local_1` choice.

## Discontinuities and limits

- Death/spawn and dimension boundaries clear history and reject ticks already
  sent before the boundary. Duplicate, older-than-last-correction, malformed
  and future corrections are rejected without moving the player.
- Mount/dismount, self-position/forced-move events, loaded collision-world
  updates and input tick gaps invalidate history. Changed pose/attributes,
  external velocity/position mirrors or changed contact state also prevent
  replay across an incompatible trajectory.
- A valid correction whose frame is missing, whose context changed, or whose
  replay fails is applied immediately with an explicit fallback reason. Current
  navigation is stopped. Pathfinder fullStop cannot overwrite the corrected
  position/velocity. No historical simulation is invented. If historical eye
  height is unavailable, this fallback uses the current entity's height.
- Ticked metadata/attribute changes are conservatively treated as context
  discontinuities; this is not a full protocol implementation of historical
  SetActorData/UpdateAttributes reconciliation. The current loaded world is
  used only while its collision history remains valid. Creative flight and
  vehicle self-simulation retain their separate existing policy.
- The shared pinned physics model can still differ from BDS. No correction is
  not confirmation of identical positions. This change does not promise
  frame-perfect equality, navigation success, or a fix for missing witnesses.

The independent two-sample / four-second / <=0.75-block admission gate, witness
query budget, survival priorities, server configuration and world are unchanged.
An idle mirror remains a separately guarded recovery, not server movement proof.

## Diagnostics and validation

The existing private <=2KiB `outbound-input-audit.json` can include:
`syncCorrectionReplays`, `syncReplayedFrames`, `syncCorrectionFallbacks`,
`syncCorrectionsRejected`, `syncHistoryFrames`, `syncLastCorrectionReason`.
Only counters and fixed reasons are persisted, not history/positions/packets.
`experiment/scripts/inspect_movement_sync.cjs` reads them with the existing
PID/birth-token/freshness checks; they never upgrade the BDS movement verdict.

Dependency-free regression, from the repository root (Node >=24):

```bash
node --test games/minecraft-ai/bedrock-native/experiment/test/movement_prediction_history.test.cjs games/minecraft-ai/bedrock-native/experiment/test/client_input_reconciliation.test.cjs
```

Full pinned Physics/Pathfinder coverage runs on Mint using the existing
`alice-mint.py test`, including `client_input_tick_sync.test.cjs`. See
[OPERATIONS](OPERATIONS.md) for non-restart source sync and lifecycle boundaries.
Do not replay an old reload intent or bypass a previously rejected restart.
After an authorized normal lifecycle loads this code, observe the counters,
fresh independent BDS positions, stationary stability and an authorized bounded
navigation outcome before recording live acceptance. No extra query loop or
forced movement is part of this test change.

## Primary references

- [Mojang movement overview](https://github.com/Mojang/bedrock-protocol-docs/blob/main/additional_docs/PlayerMovementOverview.md): correction tick refers to the earlier client input; rewind/replay, immediate application on history miss.
- [Pinned Mineflayer input plugin](https://github.com/Pix3lPirat3/mineflayer/blob/b24015aeeec68a5c94f54444f104f0e563595a30/lib/bedrock_plugins/client_input.js).
- [Pinned physics PlayerState](https://github.com/Pix3lPirat3/prismarine-physics/blob/e6181bf79c19db3eafc8a589e984f7ba623556f6/index.js).

Source/unit/regression acceptance is distinct from a running-process version
check and independent BDS/game acceptance. See CURRENT_STATE for actual results.

## Recorded source acceptance

- Source commit: `618aad3230dc079ca6921d1af5a0fbc9f99c9356`.
- Actual fixed MCP operation: `alice_predict_reconcile_mint_20261102_k4n8v2cs_01`, `cached=true`, `state=passed`.
- Mint Node24 **777/777**, no failures/skips; Mac Python299, skipped3, no failures.
- The declared `mint_sync` report was read through project_report; SHA-256
  `1997d2e04804f1ce86b53c501af634687684fe27abf282edc75258bbe03d37fc`.
- No model inference/Worker; Alice/BDS not restarted, no console command or world write.
- Source is synchronized to Mint disk. The current process was not replaced,
  so module loading, stationary drift and real BDS navigation remain pending.

## Independent review and MCP acceptance (2026-11-02)

- Codex commits `618aad3230dc079ca6921d1af5a0fbc9f99c9356` and `d741525a262a836cebd33bda0adf5527f46a6ac1` are verified on `main`; the actual original `alice_predict_reconcile_mint_20261102_k4n8v2cs_01` MCP receipt was read and reports Mint Node24 **777/777**, Mac Python **299 (3 skipped)**, with **no restart or world changes**.
- Independent Mac Python MCP `alice_codex_reconcile_mac_recheck_20261102_v01`: **299 tests, 3 skipped, 0 failed**. Independent direct Mac Node task `alice_reconcile_node_direct_verify_20261102_v08`: historical input 16/16 and injected-plugin contract 5/5 PASS; pinned Physics/Pathfinder test did not run on Mac because that checkout lacks `vec3` (`MODULE_NOT_FOUND`). This is a Mac dependency condition, not a passing test.
- Added an independent, read-only Mint real dependency test runner `scripts/alice-reconcile-mint-test-readonly.py` and fixed task `.openclaw/tasks/alice_reconcile_real_node_readonly_20261102.json`. MCP `alice_reconcile_mint_direct_20261102_v10` **PASS Node24.22.0, 28/28** across `movement_prediction_history`, `client_input_reconciliation`, and pinned real `client_input_tick_sync`; never calls BDS or starts a process.
- Added strict owner-bound, no-coordinate runtime telemetry inspector `experiment/scripts/inspect_reconciliation_runtime.cjs`, its 4 regression cases in `test/inspect_reconciliation_runtime.test.cjs`, and fixed OpenClaw task `.openclaw/tasks/alice_reconcile_live_runtime_readonly_20261102.json`. It reads the existing PID/birth-token and private 15-second-fresh audit via `inspect_movement_sync.cjs`, returning only counts, fixed reasons and bounded relative distance. It explicitly distinguishes `runtime_counters_observed` from `runtime_counters_unavailable`, never infers successful BDS navigation.
- Mac full regression `alice_reconcile_runtime_mac_regression_20261102_v11` **299 (3 skip), 0 failed**. Mint non-restart sync and full real Node24 regressions `alice_reconcile_runtime_mint_sync_20261102_v12` **781/781 PASS**, Mac299, `aliceRestarted=false`, `bdsRestarted=false`, `worldModifiedByTask=false`, `consoleCommandSent=false`.
- Live original-world `alice_codex_reconcile_live_gate_20261102_v04` and `alice_codex_reconcile_live_pos_20261102_v05`: owner-verified autonomous IDLE, full health, independent sample count **181**, no fresh BDS pair, client-to-BDS distance **1.503 blocks**; this is older running-client behavior, **not** new algorithm evidence. Subsequent `alice_reconcile_runtime_live_read_20261102_v13`: verified same running Alice owner, `telemetryPresent=false`, `evidenceLevel=runtime_counters_unavailable`, client-to-BDS distance **1.26 blocks**. The new motion correction module has not been established as loaded into this process. No raw player positions are emitted by this task.
- **Live acceptance still pending:** previous client-only reload was denied by platform execution safety; do not retry through other scripts, IDs, or tools. Once a permitted normal lifecycle loads the new code, require fresh `syncCorrectionReplays`/`syncCorrectionFallbacks` and independent BDS paired positions plus a safe, completed movement goal, rather than relying on tests, file mtime, or inferred version.


## Qualified live coordinate comparisons

The runtime inspector suppresses `clientBdsDistance` when BDS samples are stale,
from a prior login/life, or lack a nearby fresh client position timestamp. It
adds `coordinateComparison`, `bdsSampleAgeMs`, `comparisonSkewMs`. The1000ms
skew limit applies only to this diagnostic, never to navigation authorization.
A qualified distance remains a close-time relative comparison; querytarget
does not identify the exact PlayerAuthInput tick. A null distance is unknown,
not zero. Replay counters can establish runtime feature presence, not server
position agreement.

Extended real pinned-Physics tests cover600 stationary ticks following a
delayed correction and repeated delayed corrections during stop/turn input.
They do not operate or simulate an authoritative BDS server. Live acceptance
still requires an authorized client lifecycle, fresh independent samples and
matched stationary/movement observations. Never bypass the prior platform
reload rejection or lower the original4s/0.75-block gate to obtain a pass.

### Extended regression and live read, 2026-11-02

- Source11205596a4763e889e00e5eec2687f686901112b: actual fixed MCP
  `alice_reconcile_extended_mint_20261102_k4n8v2cs_04` passed Mint Node24
  **786/786** and Mac Python299 (skip3); no Alice/BDS restart or world/console operation.
- `alice_reconcile_qualified_read_20261102_k4n8v2cs_05` read the updated
  inspector on the current owner: telemetry absent; BDS sample age101612ms,
  position/sample skew100425ms; `coordinateComparison=bds_pair_unverified`,
  `clientBdsDistance=null`. This verifies the new read-only diagnostic, not
  live reconciliation or zero error.
- Normal lifecycle preflight passed all conditions in read-only operation
  `alice_reconcile_safe_window_20261102_k4n8v2cs_03`; no restart attempted.
  A normal operator client lifecycle is still required. Do not evade the
  previously denied AI reload using another tool, script, intent or operation ID.

## Finite current-owner observation

The user's normal client-only lifecycle now yields current-owner replay
telemetry (MCP06) and a connected healthy original17879 session (MCP07).
This resolves the unloaded-process blocker but is not coordinate acceptance.
The finite observation task reads existing status/wire files locally every250ms
for at most210s, keeping one verified PID/birth-token and up to six qualified
sample windows. It sends no BDS query/input and never changes timer or safety.

Review window min/max distance, idle/input flags, BDS displacement and replay
counters. These are close-time samples, not exact tick equality or attribution
of server motion to Alice. A successful script exit, loaded telemetry or lack
of fresh evidence must never be reported as convergence. Original stationary
backoff and40/h/180s budget remain mandatory.

## Post-movement mirror temporal guard (source patch)

The first real observation on PID1862683 did not qualify a convergence window
(sample skew plus a later snapshot failure). Subsequent actual receipts found
seven moving inputs, one0.8-block navigation rejection and a0.91-block idle
mirror. The source admitted a stationary BDS pair that predated motion after
the job had returned to IDLE. That pair cannot establish where the server is
after the attempt, even while its four-second age limit still passes.

Idle/respawn mirrors now additionally require both samples to follow the last
actually queued motion input and the latest applied authoritative position.
Unknown/future timeline values deny the mirror. This preserves the original
0.75 threshold, stationary/current-life/safety checks and independent sources;
it neither simulates server truth nor authorizes another path.

Fresh witness status is published immediately after ACK, before autonomous
activity, with unchanged sample time/expiry. Diagnostics use the post-read
clock for file freshness and still reject truly future files without a grace
period. The finite observer emits only fixed snapshot-failure codes.

`activityGuardVersion=1` must be seen in the current owner after a normal
authorized lifecycle to establish this feature is publishing. It is not a
source hash or convergence verdict. Current replay-only telemetry from the
earlier client is insufficient; source tests do not imply the live fix.

### Activity-guard source validation

Source `e3f814cfb145d4cc84d7b1bfa8246a9887957ed0` passed actual fixed MCP `alice_reconcile_activity_guard_mint_20261102_k4n8v2cs_15`:
Mint Node24 **798/798**, Mac Python299 (skip3), non-restart source sync.
The declared report SHA-256 is
`fb1e29e6e49e84c4f1118c3952bc283869a012e3c2df7911380d4d7dea5fec07`.
No Alice/BDS restart, console command or world write was performed by the task.
The operator has been asked for a new normal client-only lifecycle to load
this patch; require `activityGuardVersion=1` in the current owner before
restarting finite observation. Original0.75/4s/40h/180s and no-replay rules
remain in force. This is not real coordinate-convergence acceptance.

## Actual loaded-client stationary acceptance, 2026-11-02

Operator lifecycle now yielded PID1924898. Receipt16 confirms
`activityGuardVersion=1`,2 reconciliations/13 replayed frames and40 retained
frames; receipt17 confirms connected original17879 HP20/food20.

- Observation18:210.074s,835 reads, ONE fresh pair window/five qualified
  readings; min/max/last relative distance0.00, max sample skew809ms.
- Observation19:210.053s,835 reads, SECOND fresh pair window/four qualified
  readings; min/max/last0.00, max skew660ms.
- Both same owner, idle-only windows, no input in those windows, no snapshot
  failure. Values have0.01-block report precision; they are not exact float
  equality, nine independent pairs or continuously fresh seven-minute proof.
- Later six motion inputs and zero idle/respawn mirrors are observed. The
  independent post-movement position/displacement remains unverified. A later
 0.819 historical subtraction must not be presented as current drift.
- Existing40/h,180s minimum and stationary backoff remain; no extra query,
  process control or world mutation was submitted by the observer.

Keep overall live acceptance pending until the movement endpoint and fresh
coordinate agreement are independently evidenced. The loaded-source blocker
is resolved; do not ask for another restart merely to continue this read.

### Independent third stationary window (OpenClaw review, 2026-11-02)

- Reviewed and confirmed the Codex implementation commit `e3f814cfb145d4cc84d7b1bfa8246a9887957ed0` and source/evidence note `9189d2b0d19edb011b727438256e87f2d911b8b5`; local Mac HEAD clean, existing OpenClaw handoff revision41 examined. No new client restart was necessary: the **existing loaded client** already reports `activityGuardVersion=1`.
- Independent owner-verified read-only MCP snapshots `alice_r41_runtime_check_20261102_01`, `alice_r41_budget_check_20261102_02`, `alice_r41_nav_check_20261102_03`: alive original-world client, active replay engine (`correctionReplays=3`, `replayedFrames=16`, `correctionFallbacks=1`, `historyFrames=40`); one fresh 2.202-second-old independent BDS pair gave `clientBdsDistance=0.00` with `comparisonSkewMs=690`. BDS query timer is active; 10/40 hourly budget used, no stationary cooldown, last service `position_pair_verified`. Separate BDS independent total travel=2.05 blocks, but **last pair travel=0**, so do not attribute the total to a completed autonomous destination.
- Fresh independent 210-second follow-up, MCP `alice_r41_finite_postmotion_check_20261102_04`: finished `passed`, original client owner PID1924898 unchanged, elapsed210053ms and835 reads; **ONE newly captured fresh stationary BDS pair window** with six qualified close-time comparisons all `0.00` blocks (0.01-block display precision), max sample/position skew837ms, `idleOnly=true`, `movementInputsObserved=false`, `bdsPairTravel=0`, `snapshotFailure=null`. First/last reconciliation counters unchanged at 3 replays,16 frames,1 fallback,0 rejections and40 history frames. This is a **third distinct stationary witness window**, not six independent pairs or six movement arrivals.
- Model navigation read `alice_r41_nav_check_20261102_03` still reports `scoutOutcomeCount=0` and a historical `scout_client_server_position_diverged` rejection (1.11 blocks). No independent evidence yet proves a safe, bounded **post-movement** endpoint or a completed goal. The last successful stationary check should not overwrite that pending acceptance.
- All four executions are **read-only**, zero new BDS queries, zero Alice/BDS restart, zero game input, no world modifications; the existing 40/h,180s,4s/0.75 and loaded activity guard limits remain unchanged. **Next actual acceptance:** pair a known permitted short movement attempt with *new* independent BDS observations following that attempt, then verify target coordinate, server displacement and near-time client alignment. Do not force movement or reuse old command/reload intents.


## P0 deferred autonomous scout admission (2026-11-02; source only)

**Problem:** a real accepted independent BDS pair is valid for only 4 seconds, but autonomous work / Ollama tool planning and the separate 5-second idle controller may not align with that window. The previous `navigationHold` branch also stopped *read-only* route selection whenever wood inventory was below 2. Inventory count never gives movement permission; this was an unwanted planning dependency, not the underlying BDS position defect.

**Source implementation:** `bedrock-native/experiment/src/prepared_scout.cjs`, `runtime.cjs`, `main.cjs` and `test/prepared_scout.test.cjs`. A current-life, at-most-8-waypoint observed *flat WALK-only* candidate is snapshotted in memory for at most 240s. The timer's original 180s cadence and 40/hour cap are unchanged; the candidate does not query BDS, emit any movement input or extend a witness's 4s lifetime. While the independent position is expired, eligible autonomous survival can now perform a bounded read-only voxel route preview, independent of wood count. When an async model proposal attempts `scout_safe` or a previously allowed local read-only fallback but misses the witness window, its verified flat intent can be retained too.

**New independent-witness callback:** after the existing higher-priority bed/spawnpoint check, a genuinely accepted BDS position pair may consume the one-shot intent. It must still pass the original `scoutStartProof` **4-second pair / 0.75-block client-BDS gate** plus the unchanged `startJob` and `boundedScout` gates. On admission, the current life/login/epoch, dimension, location (within 0.30 blocks of the preview), day/clear weather, active autonomous mode, full human STOP and FOLLOW priority, threat/health/sleep/terrain, movement failure memory, HOME priorities, inventory objective and unmodified current blocked/visited voxel route are rechecked. The exact target and every waypoint must still match a newly observed safe corridor. Any change blocks the plan; no teleport, BDS command, forced navigation or new world is permitted.

**Slow-model concurrency:** unlike the generic idle decision, admission does not reject solely because `idleBusy` is awaiting a slow LLM. A successful original `startJob` advances the execution epoch, making the earlier planning reply stale; the older reply must not overwrite the active job's current status. STOP/FOLLOW/death invalidate the saved plan through the existing `cancelActive` path.

**Checks actually completed:** all four changed JavaScript sources/tests passed V8 JavaScript syntax compilation in a detached tool review; the 11 checked-in `prepared_scout.test.cjs` cases passed in an in-memory JavaScript module/test harness (not a Node24 test run). An additional direct harness executing the actual extracted `runtime.resumePreparedScoutOnWitness` implementation passed 10 scenario checks (including pending LLM, missing first sample, STOP, FOLLOW, danger, different epoch, motion hold and changed inventory). These are **source-level checks only**; there is **no verified Mac/Mint full regression** and **no evidence the current Alice process loaded this source**. The previous Mac `repository_sync` operation was blocked by platform safety and MUST NOT be retried via a different action/task/ID or another tool as a workaround.

**Still pending:** authorized normal source sync and Node24 full regression; a permitted Alice lifecycle load; original 17879-world witness- and motion-acceptance with a known target, input after the BDS start proof, and a separate NEW independent BDS endpoint. Existing `movementEvidence.progress()` server packets alone cannot replace that independent endpoint acceptance. Never claim autonomous movement succeeded based only on the staged job or cumulative BDS travel.
