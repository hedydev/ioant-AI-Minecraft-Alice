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
- `bedLogicVersion=1` in the owner-verified heartbeat identifies this new runtime
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

Observe independently, in this order: new owner and `bedLogicVersion=1`; fresh
independent BDS-confirmed bedward steps; bed within interaction range; a new
personal-spawn acknowledgement from that bed; and server-observed sleep entry
during a natural sleep window. Entry, waking and skipping the night are separate
facts. A wall/door/step must keep its existing collision/action requirements.
Do not report success from test counts, local pathfinding or a task exit code.
