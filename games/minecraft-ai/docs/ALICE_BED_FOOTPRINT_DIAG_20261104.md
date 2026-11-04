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
