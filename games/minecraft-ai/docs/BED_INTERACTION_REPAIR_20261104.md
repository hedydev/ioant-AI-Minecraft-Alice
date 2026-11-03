# Bed approach, personal spawn and sleeping repair

AI-Session: k4n8v2cs. Scope: existing Alice / original BDS world only.

## Verified causes

1. The pinned Mineflayer Bedrock `lifecycle.js` stores `bot.entity` inside
   `bot.entities[entityId]`. `selectDirectionalBedStep` checked every entity
   within 1.1 blocks of the next cell. Alice herself is usually one block from
   that cell, so every cardinal flat candidate could be rejected. Jump fallback
   then reported a low-ceiling failure, masking the self-collision rejection.
   Exclude only self by object or runtime ID; other players/entities still block.
2. The maintenance timer and independent BDS proof have different schedules.
   Previously an eligible distant bed or stale proof could still start a sleep
   job, consume the 120-second retry window, then fail before interacting.
   A single shared synchronous sleep admission now checks proximity and fresh
   proof before starting a job and spending cooldown. The genuine accepted
   witness callback also calls it, before optional movement/scouting. No new
   polling, timer, BDS query, relaxed TTL or navigation permission is introduced.
3. A personal spawn packet received at login need not describe the selected bed.
   Bed setup is satisfied only by a current-session interaction-confirmed bed
   matching the selected location, never a generic prior personal spawn.

Pinned upstream evidence:
- [Lifecycle self registration](https://github.com/Pix3lPirat3/mineflayer/blob/b24015aeeec68a5c94f54444f104f0e563595a30/lib/bedrock_plugins/lifecycle.js)
- [Server-observed sleep/wake adapter](https://github.com/Pix3lPirat3/mineflayer/blob/b24015aeeec68a5c94f54444f104f0e563595a30/lib/bedrock_plugins/bed.js)

The fresh readonly collision receipt
`alice_bed_repair_collision_20261104_k4n8v2cs_02` found loaded flat centerline
candidates and a four-cell route to a closed spruce door. These are observed
geometry, not movement or a bed arrival. The fresh voxel receipt
`alice_bed_repair_voxels_20261104_k4n8v2cs_01` found two bed halves about 11.3
horizontal blocks away and one block higher. No world coordinates are recorded
here; neither audit sends game commands.

## Validation and rollout boundary

- Targeted self-entry, blocked-other-entity, bed/spawn, stale witness, cooldown,
  STOP/FOLLOW/threat and compressed heartbeat tests pass locally.
- Mac Python baseline: 321 tests, 3 skipped, 0 failures before final telemetry
  changes. Final Mac/Mint validation must be recorded below after it runs.
- Mac Node26 full suite: two test files cannot load the absent `vec3` dependency;
  this is not a passing full suite. Use the existing dependency-complete Mint
  Node24 regression through `.openclaw/tasks/alice_mint_nonrestart_sync.json`.
- `bedLogicVersion=2` in the owner-verified heartbeat identifies this new runtime
  path; it is not a source hash or gameplay acceptance. `isSleeping` reflects the
  adapter's server-observed sleeping flag, not a submitted sleep command.
- No Alice/BDS restart, world edit, movement or bed interaction has been done by
  this patch at the time of its initial commit. A non-restart source sync does
  not load CommonJS modules into the existing process.

After full regression, an explicitly authorized Alice-only lifecycle must use
the existing approved `.openclaw/tasks/alice_17879_client_restart.json` at the
exact current commit after checking `openclaw_project_actions`. Preserve owner,
world, health/no-job preflight and platform review. Never replay the refused
historical restart, clear a lock, alter BDS or start a second client.

## Actual acceptance still required

Observe independently, in this order: new owner and `bedLogicVersion=2`; fresh
independent BDS-confirmed bedward steps; bed within interaction range; a new
personal-spawn acknowledgement from that bed; and server-observed sleep entry
during a natural sleep window. Entry, waking and skipping the night are separate
facts. A wall/door/step must keep its existing collision/action requirements.
Do not report success from test counts, local pathfinding or a task exit code.

## Follow-up: bounded intent lifetime and typed real-game acceptance

The old request deadline included both waiting up to ~180s for admission and
waiting another ~180s for the next independent endpoint. It could expire at
240s before that endpoint arrived. Each actual one-cell input now arms its own
240s endpoint phase, within a strict 90-minute total request lifetime and 24-step
cap (previously 20 minutes / 8 steps, insufficient for a bed observed 16 cells
away). STOP/life/session/task fences, BDS 4s/.75, hourly budget, 180s service
spacing and one-cell-at-a-time execution are unchanged. This is not a continuous
movement permit or an infinite bed search. Live version 2 identifies this change.

New maintained Mac-only acceptance entrypoints:
- `.openclaw/tasks/alice_bed_set_spawnpoint_once.json`
- `.openclaw/tasks/alice_bed_sleep_once.json`
- `.openclaw/tasks/alice_bed_command_status_readonly.json`

They use `scripts/alice-bed-command-once.py`, the existing loopback dashboard
API and its original typed command reader. Only `设置重生点` / `睡觉` can be
submitted, after current world/17879, online healthy IDLE and version2 checks.
Submission intent is persisted before POST. On timeout, do not resend under a
new operation: use the readonly task and match `commandId`. Queued/started is
not gameplay completion. No arbitrary console command, OP/teleport/world edit,
new model, BDS query, reset or restart is exposed. The tests exercise one send,
HTTP ambiguity, repeat refusal, strict live guards and privacy-filtered reads.

First rollout (version1): source 81af5dd, Mac321(skip3), Mint979/979.
Approved lifecycle `alice_bed_repair_client_restart_20261104_k4n8v2cs_04`
completed: old1319142 -> new1367454, current owner/heartbeat/connection/session
all verified, BDS/world unchanged. Version1 readonly receipt05: day, canSleep
false, personalBedStatus not_verified. This is loading acceptance only.
Version2 follow-up full tests and runtime loading are still pending.

## Version3: connect the bed goal to the existing guarded door stages

Version2 actually loaded in PID1373327; Mac326(skip3) and Mint981/981 passed.
A single maintained typed spawnpoint request was queued with commandId
`4c1ecaf627f74174b78b2d3ea338efea` and then explicitly REJECTED by runtime as
`bed_route_requires_door`. No unknown operation was repeated. This identifies a
missing goal transition, not a successful bed arrival.

Version3 adds a bounded door phase to that same bed request. Only an observed,
flat-connected wooden door toward the loaded free bed may be selected. Shared
original door approach/open/cross/raised-landing functions own actions, collisions,
per-step BDS proof and endpoints. Bed intent updates its epoch only for its own
admitted job and blocks unrelated scouting while waiting. Unknown door bits
remain waiting, not activation. Existing short handle-range failure now falls
back to the already validated one-cell approach, instead of stalling permanently
because a non-colliding torch made the handle-only check stricter than WALK.
No door is treated as a verified complete path to the bed. Actual arrival and
server spawn/sleep acknowledgements remain separate required evidence.
