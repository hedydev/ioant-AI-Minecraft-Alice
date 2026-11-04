# Anonymous Bedrock footprint read-only diagnostic — 2026-11-04

## Purpose

The live v10 bed command `4e68d700e949453d8e19161d84bfbdb9` ended `failed/jump_origin_support_or_headroom_unverified`. This is the **fallback JUMP_UP** rejection in `adjacent_motion_decision.cjs`, *not* a separate statement that flat directional walking was denied for the same reason. The unchanged one-cell WALK admission must be diagnosed independently before altering motion policy.

The latest client collision cache shows the centered origin has no full `dy=-1` support and has a full cobblestone ceiling at `dy=+2`; neighboring cells have full-stone floor. However a nominal square at the exact center does not represent Alice's actual fractional feet and 0.6m AABB. Neither the anonymous cache grid nor the stationary client/BDS alignment window proves that a particular movement is safe.

## Scope of the new diagnostic

`scripts/alice-collision-shape-readonly.py` now computes `observation.footprint` from the **existing**, owner-checked private world-view snapshot, without Mint code deployment. The snapshot already includes 0.01-rounded local client position and relative collision shapes. The script returns only 0..1 fractional offsets inside the current voxel, 9 bounded foot-support probes over the avatar's 0.6m width, counts of matched/uncertain support, limited relative support-column offsets, and the nominal floor and +2 roof full-cube flags. **Absolute XYZ, raw positions, players, identities and BDS secrets never leave the remote worker.**

This is still `source=rounded_client_cache_not_bds`, not a server BDS position, onGround evidence or gameplay permission. Reports explicitly set `movementPermitted=false`, `serverMovementVerified=false`, `validMovementStart=false` and `onGround=not_published`. Full nine-point support is an observation, not a new mobility permit. Null/unsafe shapes, doors and hazards cannot be counted as safe support. Existing `--self-test` adds a fully supported control, a centered-hole/edge-support case, and malformed-offset rejection. No querytarget, forced chunk load, movement input, restart, world write, identity change or new timer.

## Remaining follow-up

Read the original fixed task `.openclaw/tasks/alice_collision_shape_readonly.json` only after Git clean/sync and selftest, then compare `footprint` and swept survey against the actual earlier command outcome. With no fresh authoritative BDS movement proof, **do not** infer walking or jumping success. If still ambiguous, add a separately reviewed status provenance diagnostic for `onGround` and current-life BDS feet before any behavior change. Keep 40/h, 180s, 4s/0.75m, 240s and STOP/FOLLOW/hostile/collision requirements, no new request or Alice/BDS restart. This commit is strictly read-only script/test/documentation, no game-runtime change.

## Real fixed-MCP evidence and acceptance scope

- `alice_r90_docs_sync_after_github_recovery_20261104_105`: previously blocked GitHub auth recovered; exact remote `7298e186` fast-forward synced to Mac, clean.
- Source/docs self-contained diagnostic commit `4d9dfe696920bf675507f1be585f416ba31230e6`, synced by `alice_r90_footprint_diag_docs_sync_20261104_106` with clean Mac checkout, no Mint/BDS/gameplay operation.
- `alice_r90_footprint_diag_live_20261104_107`: fixed existing read-only task passed selftest and original Mint snapshot read. Observation `state=client_fraction_observed`; anonymous local X/Z fractional feet `[0.11, 0.60]`, fractional Y `0`, 9 sampled footprint probes, **3 matching support probes, 0 uncertain probes**, supported only by neighboring relative column `[-1,0,-1]`. Nominal origin full floor=false, +2 cobblestone roof full cube=true, nominal swept `reachableCenters=1`, `firstCellCandidates=[]`. No output world XYZ. This does **not** establish `onGround`, exact avatar physics/AABB, current independent BDS endpoint, a safe WALK, or a valid JUMP.
- `alice_r90_footprint_diag_mac_regression_20261104_108`: fixed `alice_mac_regression` **passed**, targeted Python9/9, full Python337 with 3 skipped/0 failures; commit pinned to `4d9dfe69`, worktree clean. No Mint deployment, Alice/BDS restart, game action, or revised source-runtime behavior.

**Implication:** Source `adjacent_motion_decision.cjs` reports a fallback JUMP_UP reason after directional WALK fails. The observed 3/9 edge support and full +2 roof justify maintaining the conservative hold. This is not a demonstrated programming defect or a green light to bypass `verifyFlatFirstStep`; validate actual `onGround`, full physics AABB and same-life independent BDS feet before any safe edge-recovery design. The bed request from operation98 remains terminal `failed/jump_origin_support_or_headroom_unverified`, must not be resent. No bed arrival, spawnpoint or sleep has been verified.

## Client physics contact telemetry (staged, not loaded)

The original 17879 running Alice PID1971786 does **not** publish `onGround` in its world-view, as verified by `main.cjs` and `world_view.cjs` code audit. Existing world-view gives rounded **client-predicted** local feet; a 0.00 client/BDS gap in an earlier two-sample stationary window does **not** establish live, same-life ground contact after that window. The latest `alice_r91_edge_live_runtime_20261104_110` is IDLE/HP20/autonomous, `idleHoldReason=no_verified_flat_walk_candidate`, with expired independent BDS proof. `111` reported a stale comparison (~388s); `112` confirms PID1971786/version10 and no job; `113` confirms owner-private witness after the current login but **not fresh within four seconds**. No movement was attempted.

This telemetry-only source change adds `alice.onGround` as strict tri-state `true/false/null` to the **passive** world-view snapshot (not the control API or movement code). It outputs `null` whenever the client has no valid boolean or is offline; it is **not** server-ground truth and never authorizes movement. The original bounded read-only `alice-collision-shape-readonly.py` maps that field into `footprint.onGround=client_true/client_false/not_published`; legacy snapshots remain `not_published`. Contact updates even if cached voxel geometry is reused, and tests cover all three states plus invalid forged strings. No new BDS query, game packet, block interaction, auth data, world read, or daemon operation.

**Activation boundary:** On the live PID this field will remain `not_published` until the **original Alice client** is normally updated. There is no restart or deployment authorization in this diagnostic phase, so do not reload just to get this boolean. It is not a replacement for precise independently witnessed BDS feet or an actual swept AABB collision test; onGround alone cannot justify edge recovery. Keep STOP/FOLLOW/combat, 4s/0.75m, single-cell, 240s endpoint, 40/h witness-budget protection.

## Reproducing the exact WALK-versus-JUMP disagreement

Bounded synthetic fixture using the **existing** production decision functions, not a reconstructed planner: local feet `(.11,65,.60)` within an anonymous cell, only the adjacent left `(-1,64,0)` full stone support, a full cobblestone roof `y+2`, all other cells known air, and a hypothetical distant bed direction `(-6,-5)`. The fixture forces `onGround=true` **only for offline testing** because the live runtime has not published this bit; it is not evidence that live Alice is grounded.

- `verifyFlatFirstStep` explicitly rejects: `direct_flat_unsupported_footprint` before a movement input.
- `selectDirectionalBedStep` aggregates candidates: `directional_bed_no_collision_verified_flat_cell`.
- `chooseAdjacentMovement` then tries `candidateOneBlockJump` as fallback and finally reports `jump_origin_support_or_headroom_unverified`, masking the earlier flat-step reason.
- The pure WALK control fixture on continuous known full floor under the same low roof admits a WALK *candidate*, never a movement permit.
- Tests forbid any input invocation and assert `permitted=false`/`serverMovementVerified=false`. This proves the exact code path **under the stated hypothetical geometry**; it does not prove live BDS physics, live onGround, actual foot AABB, or a safe edge recovery.

No production movement policy was changed. If a future correction records both candidate rejection reasons, do it as passive diagnostics; never treat a fallback reason as an authorization to remove support/ceiling checks.

## 2026-11-04 follow-up: actual receipts and safety boundary

Read-only operation receipts (all original 17879 world, no new querytarget):
- **110** `alice_r91_edge_live_runtime_20261104_110` PASSED: Alice still connected/IDLE/autonomous, HP20, no job; hold `no_verified_flat_walk_candidate`, independent samples24 but no fresh pair, last pair travel0.
- **111** `alice_r91_edge_bds_evidence_20261104_111` PASSED: current owner evidence yes; independent BDS age ~388 seconds and position comparison unverified. **112** `alice_r91_edge_bed_runtime_20261104_112` PASSED: PID1971786, bedLogicVersion10, still no personal respawn confirmation. **113** `alice_r91_edge_witness_age_20261104_113` PASSED: owner-private original `mcsm_querytarget` witness after current login but **fresh4Seconds=false**.
- Staged passive telemetry commit `6e619b23f5d62bce56d6e0a901890abc9bde78ef`, Git/ Mac synced **114** PASSED. **115** local Node `world_view.test.cjs` PASS (strict tri-state, no fake grounded). **116** Mac targeted Python9/9 and full Python337 with 3 skips/0 failures PASS. **117** original world read-only collision PASS, `footprint.onGround=not_published` as expected: the unchanged live PID never loaded the source update; nine support probes still only three and full roof +2.
- Synthetic regression commit `bd67bf1ba685b0a88f6b82c2608f75a6b7e963fc`, Mac sync **118** PASS, fixed Node test task **119** both direct_flat_step and adjacent_motion_decision PASS. Fixed Mac full regression **120** PASS (targeted9/9, Python337 with 3 skips/0 failures, clean). This proves only the fail-closed classification of the **synthetic edge** geometry and continuous-floor positive control, not live player movement, independent BDS alignment or a verified `onGround`.

Exact classifier chain from the live observed *geometry modeled offline*: `direct_flat_unsupported_footprint` (WALK first-step denies) → `directional_bed_no_collision_verified_flat_cell` (directional chooser aggregates no candidate) → `jump_origin_support_or_headroom_unverified` (JUMP fallback fails). There is no fresh witnessed starting position to authorize either action. **No movement algorithm changed**. Current runtime is still the original v10, and no Mint sync, Alice/BDS restart, bed command, world change or second client was performed this round. Historical door 63, independent crossing 72, step endpoint86 remain valid but do not prove reaching the bed, setting spawnpoint or sleeping.

**Next legitimate phase:** Review staged passive `onGround` telemetry, run full Mint regression and non-restart sync only if within subsequently granted scope, then use the original approved Alice-only lifecycle when needed and safe. Require newly aligned same-life independent BDS proof and actual foot AABB before any test input. If true edge-contact is observed, design a one-cell guarded edge-recovery candidate that proves supported full sweep and respects STOP/FOLLOW/combat, low roof, unknown/occupied blocks and the 40/h/180s/4s/0.75m/240s independent-BDS gates. Do not bypass a 3/9 support denial merely because the avatar visually stands there; never replay the failed bed command.
