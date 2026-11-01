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
