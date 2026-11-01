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
