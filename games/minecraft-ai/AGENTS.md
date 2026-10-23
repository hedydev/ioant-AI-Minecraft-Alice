## Bedrock post-Ready respawn and cornered safety (2026-10-23)

- Actual PID 3125378 proves a late BDS ReadyToSpawn can arrive ~82ms after our two back-to-back retry packets with no subsequent spawn. Pinned `Pix3lPirat3/mineflayer@b24015a` `health.js` suppresses a second final action after its 5s fallback, so outgoing full retries MUST be ordered: after 12s no-ready → queue `respawn state=2` ONLY; on real `respawn state=1`, queue final `player_action respawn` once if still dead. If ready already received, one action retry. No loops/no new Xbox/BDS login. Never claim success until positive server health+spawn.
- When observed retreat graph returns no safe-away routes, do not ever guess passable blocks, dig, disable verified BDS position gate or target creepers in melee. Allow at most cooldown-limited attack on still-present nearby hostile *only if no retreat movement was attempted* and Alice remains alive/ready; attacker/damage attribution remains unverified. Both protocol and last-stand path need full Mint Node24 regression after merge.

## Strict PID provenance for Bedrock runtime status (2026-10-23)

The canonical Mint/SSH operator status MUST NOT associate shared `status.json` across restarts with the new exclusive lock owner based on file mtime. Production emits both `producerPid` and Linux `producerStartToken` (field 22 from `/proc/self/stat`). Compare to the *currently verified owner* PID and stat birth token before returning `health`, `sessionEstablished`, `deathRecovery`, BDS travel, or heartbeatFresh. Until matching, return an explicit `awaiting_current_process_heartbeat` rather than copying an old `respawn_stalled` into a new PID. Keep the owner-only permissions and fail-closed process checks. Never remove the guard to make an unreadied bot appear online. New status fields require one future controlled Alice restart after Node tests pass.

# Alice Minecraft AI project instructions

- The canonical Alice capability code is under `games/minecraft-ai/runtime/`; do not append new Alice behaviors into `skills.js` or `agent.js`.
- Keep core state, movement, learning, task skills, autonomy and Mint adapter integration in separate modules.
- The Mineflayer/Paper/Geyser running world and user bot data are external; the repository must never store `bots/`, credentials, Minecraft worlds, XUID/UDID or operational IPs beyond sanitized examples in documentation.
- Read `docs/CURRENT_STATE.md` and `docs/ARCHITECTURE.md` before editing. Correct evidence-backed root causes; add tests.
- First inspect exact Mint Mindcraft integration source before changing adapter markers or treating this as a clean upstream installation. Maintain safety in the installer; preserve backups/learning memory.
- Node runtime is ESM and tested with Node 20+. Validate with `python3 -m unittest discover -s games/minecraft-ai/tests -v` and `python3 games/minecraft-ai/scripts/install.py --target ~/mindcraft-alice --check` on the target host before installing.
- User commands supersede LLM thinking; FOLLOW intent should survive temporary jobs and respawn, but those entry bridges remain to be migrated and verified from the actual Mindcraft checkout.
- Update `docs/CAPABILITIES.md`, `docs/CURRENT_STATE.md` and tests on every functional change; don't claim in-game success without running the game.
- No unapproved shell execution, arbitrary JS generation, secret access, direct down-dig into unknown terrain, or unbounded destructive/pathfinder retries.

## Mandatory maintained operator scripts (2026-10-23)

- Before giving any Mac/Mint deploy, test, start, restart, log or acceptance command, read [docs/OPERATIONS.md](docs/OPERATIONS.md). It is the canonical native Bedrock runbook.
- Persist every new or changed operator workflow under this project's `scripts/`, with tests and documentation **in the same commit**. Give users calls to those maintained entrypoints; do not leave the only working version in chat, Downloads/Desktop, or a Codex session output directory.
- Native Bedrock entrypoints are `scripts/alice-mac.sh` and `scripts/alice-mint.py`. Preserve Paper's separate `deploy-and-run.sh` / `install-and-run.sh`. Reuse existing backup, witness, dashboard and acceptance exporters.
- Update the runbook whenever arguments, dependencies, configuration, launch checks or lifecycle behavior change. Update CURRENT_STATE/CAPABILITIES/dashboard evidence honestly; new AI sessions must inspect current scripts rather than blindly replay old pasted exports.
- Real operator settings live only in Mint's private `~/.alice-bedrock-control/operator-env.json` through the allowlisted configuration reader. Never commit credentials, full process environments or machine-private values. Never start another client while the old one is active; use the identity-checked restart and BDS logout gate.

## Alice Control Center is the default control plane (2026-10-19)

- The existing `dashboard/` Mac Nginx UI on port 8788 is the canonical **visibility and safe live-configuration** interface for native Bedrock Alice. Future AI development must update `dashboard/catalog.json` and the capability/test evidence at the same time as a feature, so the console accurately shows **observed**, **staged**, **prototype**, or **pending** — never convert a code change or local movement estimate into claimed in-game success.
- Add behavior controls ONLY through a typed, bounded, documented configuration schema in `dashboard/remote_control.py` (Mint SSH endpoint) and `bedrock-native/experiment/src/live_control.cjs` (runtime reader/status). Every new editable field must have validation, default, range, a Node/Python test and an applied-revision acknowledgement; keep old fields backward compatible. World/auth/backup files and safety invariants cannot be edited through this interface.
- The dashboard's existing no-login LAN readers remain reachable, but behavior writes MUST be restricted to **Mac 127.0.0.1** by Nginx and the backend's Origin/JSON checks. Never expose arbitrary shell, Minecraft OP commands, restarts, tokens, account clearing, world modification or unsafe protection bypasses. Do not expose port 8788 publicly.
- Status is written by the actual **production Bedrock** process as a short-lived private heartbeat; stale/missing heartbeat or Mint SSH failure must show *offline/unknown*, not fabricated online state. "saved" versus "applied" revisions are distinct, and changes to live process behavior require Mint end-to-end acceptance before being marked observed.
- Do not modify the existing Paper/Mindcraft service for native Bedrock feature requests unless explicitly in scope. Preserve Mint's `~/minecraft-ai`, `~/.alice-bedrock-control`, existing world backups, Microsoft authentication cache and learning state. Use Mac `git pull --ff-only` plus non-destructive rsync and only one Alice Xbox client at a time.

- Intermittent Bedrock `server_id_conflict` is P0 **unresolved**, despite successful native-injected joins. Do not ask the user to repeat native/chat-vs-Mineflayer A/B or delete/rebuild Xbox cache. Both Bedrock native entrypoints must retain exclusive `instance_lock.cjs`, anonymous `connection_audit.cjs` and privacy tests; the control center shows *safe structure*, not raw credentials. A lock only prevents same-host duplicate clients; it is not evidence of the BDS rejection cause. Keep login history private, mode-0600 and bounded. New credential-related behavior needs pinned upstream review and real server evidence.

## Bedrock native movement evidence (2026-10-19)

- The pinned Bedrock Mineflayer transport has its own `bedrock_plugins/client_input.js`; it sends `player_auth_input` rather than Java `position` packets. Do not change native packet shape, movement authority or Xbox identity on guesses.
- Real Bedrock movement must be evidenced by BDS `querytarget` or a recent **server-origin** self-position packet, not Mineflayer's local physics position or pathfinder `success` result alone. `movement_evidence.cjs` is passive, never wraps or modifies network events. No server corrections means *unknown*.
- `safe_follow_step.cjs` is an explicitly staged, 400ms short recovery for `noPath` only. Guard its whole known, loaded 0.6m footprint, flat support/headroom and enemy checks. STOP, SURVIVE and new player jobs cancel before proceeding; don't increase retry cadence, allow digging/jumping or route through unknown chunks to hide noPath. Never label this a proven pathfinding fix until Mint confirms BDS XYZ and visible footsteps.
- Keep a latest readable handoff in `docs/HANDOFF_2026-10-19_MOVEMENT.md` if further work or context limits prevent finishing the actual real-game acceptance. Every code delivery must include machine-specific copy/paste deployment/test commands (root `AGENTS.md`).


## Bedrock survival priorities and lifecycle truth (2026-10-23)

- Survival-first: 300ms safety / threats and health-food-equipment outrank nonurgent exploration; make a feasible defensive weapon before optional overnight shelter building. Do not turn night into an unconditional WAIT or a compulsory bed-hunt. Bed locations are passive, persisted, bounded **observations** in private `observed-beds.json`, not verified player respawn points. A sleep is eligible only when an already remembered bed is still loaded nearby, is free/monster-safe, has an actual sleep window, and no higher-priority survival job is pending. Do not automatically modify player buildings to make room.
- Unexpected offlining is an **evidence task**: before recommending a restart, compare `alice-mac.sh status`/`diagnose`'s owner/heartbeat, deathRecovery phase, sessionEstablished, fixed sessionExit classification and sanitized recentLifecycle events. `reportedConnected=false` also happens during death, and `session_closed` may be a normal operator SIGINT; these alone do not prove BDS kicked Alice. Never log Xbox codes or packet contents, never bypass BDS logout/owner lock, and never auto-open a second client based only on an offline badge.


## 2026-10-23 death-recovery regression contract

- Mint observed PID 3045722 with a heartbeat-fresh single Node instance, `sessionEstablished=true`, health=0 and `respawn_stalled` for 2122 seconds. Do not conflate death with a missing transport. The established flag is not proof of fresh network traffic; require native BDS evidence.
- Respect exactly the pinned Bedrock health plugin's two-step outgoing `respawn state=2` then `player_action respawn` flow. An eligible 12-second retry may send the full pair only when server ReadyToSpawn is absent; it remains a SINGLE attempt within the existing Xbox connection, **never a recursive re-login**. No endless retries, no force respawn, no player teleport, no BDS world edits.
- Keep the `ObservedBeds` unsafe-symlink regression and logger fixture accurate; every log test logger must support `log` and `warn`. Maintained Mac/Mint scripts are the only update/restart operators. In `diagnose.recentLifecycle`, newest real process events must come last and old timestamps must remain null rather than be guessed.
