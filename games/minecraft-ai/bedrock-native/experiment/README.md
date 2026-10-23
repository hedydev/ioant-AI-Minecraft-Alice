> **2026-10-20 — 17879 login-session protection (staged):** The autonomous runner and native chat-only runner now share a Bedrock protocol `disconnect()` shutdown instead of local-only `bot.end()+process.exit(0)`. Production startup supports a **strict, opt-in, read-only** MCSManager instance-log session guard. Set both `ALICE_BEDROCK_BDS_SESSION_LOG` (correct readable file under `/opt/mcsmanager/daemon/data/InstanceLog/`) and `ALICE_BEDROCK_BDS_GAMERTAG` (Alice's *real* Xbox Gamertag, not cache-profile name), or the preflight prints an unconfigured warning. With settings enabled, evidence of a still-connected old Alice session or any unknown/stale evidence rejects a new login rather than retrying. The user-supplied Oct 19 BDS history strongly suggests overlapping login/disconnect timing but does **not** prove the exact `server_id_conflict` cause. See `../../docs/BEDROCK_SESSION_LIFECYCLE.md` for exact Mac/Mint rollout, privacy boundaries and acceptance. BDS/world/auth cache untouched; Mint Node24 and live BDS acceptance pending.

# Alice Bedrock autonomous behavior — isolated Mineflayer experiment

**Reason:** native `bedrock-native/src/main.cjs` only starts a transport and read-only policy response handler. Paper starts AliceAutonomy, AliceSafety and AliceSocial plus a Mineflayer action executor. Importing `safety_policy.js` alone cannot create walking, gathering or independent work. User's 1.26.51 logs prove **native Xbox spawn**, not action parity.

## What runs here

This is a **separate runnable experiment**, not a replacement for the known-good Bedrock chat connector, and not a full Paper AI migration. It uses the Mineflayer Bedrock edition adapter proof-of-concept plus its physics and pathfinder prereqs, fixed to their investigated SHAs:

- `Pix3lPirat3/mineflayer` b24015aeeec68a5c94f54444f104f0e563595a30 (fork; 1.26.51 Bedrock high-level facade)
- `Pix3lPirat3/prismarine-physics` e6181bf79c19db3eafc8a589e984f7ba623556f6 (unmerged Bedrock physics RFC)
- `Pix3lPirat3/mineflayer-pathfinder` 789d9146f7dabd7f7cae675308997ebbdba14c35 (unmerged block-state fallback)

**Executable behaviors in disposable world (not yet verified on Mint):** health-gated `Autonomy` scheduler, conservative Pathfinder follow, one nearby original-log acquisition attempt via `bot.findBlocks -> goto -> dig -> observed inventory delta`, idle head looking, occasional nearby-player quip, human command stop/supersession. It imports original `runtime/alice_modules/{core,autonomy_policy,safety_policy,terrain_policy,wood_policy,social_policy,learning}.js` rather than creating conflicting AI policies. It uses Bedrock Mineflayer's `bot.*` compatibility surface instead of hand-rolling `player_auth_input`.

**Incomplete:** weapon crafting, retreat destination selection, real combat/guard attack, stacking/crafting/containers, long-running multi-resource work, LLM action planning, recovery parity. On danger or missing health readings it STOPS the task; this is **not** a proven escape/survival controller. No unsupported action claims success. Paper learning data is not copied; new experiment memory lives in `~/.alice-bedrock-experiment-state/bots/`.

## Safe test: separate actual BDS world and port

The **only allowed** target is `~/minecraft-bedrock-alice-lab` on UDP 17880, created from the prior verified offline **Bedrock level** backup. Production `~/minecraft-bedrock` UDP 17879 is rejected by code and is never stopped/modified. The cloned server is a NEW BDS copy. Its world is deliberately disposable: experiment may break logs, move and die. This script refuses an existing copy, cannot overwrite it, validates the archive SHA256 and checks every restored file. Existing production `worlds/u65b0u4e16u7eaa`, other MCManager instances, Paper Alice, and Xbox auth caches are untouched.

On Mac from `~/Documents/workspace/hero-skills` main, after `git pull --ff-only origin main`:

```bash
rsync -av --exclude node_modules --exclude __pycache__ games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
```

On Mint, **stop the currently connected native Bedrock Alice client first** (`Ctrl+C`) to avoid simultaneous use of the same Xbox account. Create clone once:

```bash
python3 ~/minecraft-ai/scripts/prepare-bedrock-alice-lab.py --manifest "$HOME/minecraft-world-backups/bedrock-default/minecraft-bedrock-20261018T000242906101Z.json"
```

In Mint terminal A, **start only the disposable copy**:

```bash
cd ~/minecraft-bedrock-alice-lab
LD_LIBRARY_PATH=. ./bedrock_server
```

In separate Mint terminal B, using isolated Node24 (requires Git/network for pinned dependencies):

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
export ALICE_BEDROCK_LAB_CONFIRM=I_UNDERSTAND_THIS_IS_A_COPY
export ALICE_BEDROCK_PROFILE=AliceAI-HedydevGame
cd ~/minecraft-ai/bedrock-native/experiment
npm install --omit=dev
npm test
npm run check
npm start
```

The `npm run check` verifies the sandbox marker/port and imports real Paper policies without touching the network. `npm start` connects to **127.0.0.1:17880 only**. Use another Xbox account to join this test server on Mint's LAN IP + port 17880, and send `AliceAI 跟着我`, `AliceAI 状态`, `AliceAI 收集木头`, `AliceAI 停止`. Compare actual position and inventory with logs. Wait 20 seconds with no orders for an autonomous work attempt. Do not infer success from the log alone. If the underlying fork or physics engine fails to load/connect, save diagnostics and do not point this experiment at the live server.

Do not delete the original verified backup, world, or existing `~/.alice-bedrock-auth` cache. Do not launch BDS sandbox while its UDP 17880 port is in use. Avoid port-forwarding UDP 17880 to the internet. Stop the test client before stopping the test server.

## Acceptance gates to integrate into the real client

1. On disposable BDS 1.26.51, actual player coordinates advance under follow without constant prediction correction, and safely stop when the player moves away/chunks unload.
2. When tested on a tree, dig and the server's inventory update must agree on material gained, no infinite retries, no protected builds in scope.
3. Damage/death, hunger and creepers preempt navigation, verify safe retreat, recovery only after danger clears; **currently not met**.
4. Crafting/equip, chest transactions and food must be built around authoritative slot/recipe confirmations. Validate real items, no fake tool/weapon successes.
5. Once stable, move the engine's enabled actions behind the existing native client/profile, preserving the private Alice skills and learning memory with explicit cross-edition schema. Do not silently overwrite Paper's learned experiences.


## Explicitly approved: run autonomous Alice directly on the existing 17879 world

**Do not run the lab copy.** The user authorized running the experimental movement/gather executor on the existing production world. This carries real-world risk. The existing validated backup from 2026-10-18 can verify historical integrity but cannot restore changes made since that timestamp. The new production gate requires the exact original backup manifest and checks its source/SHA256/temporary restore. This is NOT a guarantee that Alice won't die or alter player-built structures.

After Mac `git pull --ff-only origin main` and rsync of `games/minecraft-ai/` (exclude `node_modules`) to `~/minecraft-ai/` on Mint, **stop the old native client** with Ctrl+C to avoid using the same Xbox account twice. Leave MCManager's `bedrock-default` server running on UDP 17879.

On Mint:
```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
export ALICE_BEDROCK_PROFILE=AliceAI-HedydevGame
export ALICE_BEDROCK_BACKUP_MANIFEST="$HOME/minecraft-world-backups/bedrock-default/minecraft-bedrock-20261018T000242906101Z.json"
export ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES
cd ~/minecraft-ai/bedrock-native/experiment
npm install --omit=dev
npm test
npm run production:check
npm run production
```

The `production:check` invocation performs backup verification but no network connection; `production` then loads the pinned Bedrock Mineflayer/physics/pathfinder forks and directly joins `127.0.0.1:17879`. It does NOT need `ALICE_BEDROCK_LAB_CONFIRM`, nor any world clone. See the explicit `[Alice Bedrock live]` startup tag. A new private learning directory under `~/.alice-bedrock-autonomy-state/bots/AliceAI-Bedrock` keeps Paper memories untouched.

With a second account, issue `AliceAI 状态`, `AliceAI 跟着我`, `AliceAI 停止`, and optionally `AliceAI 收集木头`; wait 20s without instructions for limited autonomous wood observation/one-log attempt. Report exact coordinates and inventory **before/after**, not just the spawned line. If movement is unstable or Alice repeatedly takes damage, Ctrl+C immediately. This version can stop but not intelligently flee or fight, so do not leave unattended near hostiles.

**Rollback:** Ctrl+C in autonomous client terminal. Then run prior known-good `cd ~/minecraft-ai/bedrock-native && npm start` with the same auth profile and manifest already set in that shell. No Git reset or world files changed by rollback; Alice's actions before stopping are actual world changes. Avoid running both clients concurrently.


## 2026-10-18 — Shared-Paper-core autonomous Bedrock runtime (code merged; Mint acceptance pending)

User explicitly approved real 17879 integration without a new world. The live `bedrock-native/experiment/src/main.cjs` entrypoint now **instantiates `AliceBedrockRuntime`**, not the previous small `NativeAutonomyExperiment`. It imports original canonical Paper `AliceCore` + `autonomy_policy`, `safety_policy`, `terrain_policy`, `wood_policy`, `social_policy`, and `inventory_policy`, and uses `BedrockOperations` to execute against the pinned community Mineflayer Bedrock adapter. Safety observes every 300ms; follow every second; idle autonomy every 5s after 20s idle grace. Code adds finite player-directed wood counts, bounded move/dig with server inventory delta, tree-leaf/build heuristics, inventory-observed recipe/crafting, cautious food recovery, tentative retreat and attack calls, stop/preemption with message epoch, independent edition learning path, and an **optional** allowlisted Ollama chat planner. All are code paths, not yet verified Minecraft gameplay.

Production `npm run production:check` still requires validated world backup, exact 17879 port and `ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES`; `npm run production` actually connects and may move/dig/consume/attack in the **real** world. Low-level `bedrock-native/npm start` retains the known-good chat-only fallback. This new runtime requires **health event + initial Bedrock inventory_content window='inventory'** before acting; unknown server state fails closed, which may leave Alice idle until correct packet observations are validated on Mint. Pure `node --test test/runtime.test.cjs`: 14 local tests pass; fork dependency installation, full npm test on Mint, live motion, crafting, food, combat and world preservation **not yet observed**. Existing Paper Mindcraft installation and memories are unchanged. Tree recognition is heuristic, **not full world-claim protection**. Prior Oct 18 verified backup predates possible recent gameplay changes; no new offline snapshot implied.


### Current opt-in 17879 Alice Core runner

This starts the **new** controller (`src/runtime.cjs`) instead of the old minimal experimental engine. It uses canonical Paper Core and decision files; commands are actually sent through the pinned Bedrock Mineflayer adapter, with strict result verification. The old `bedrock-native/src/main.cjs` low-level client remains intact as a chat-only fallback. **No lab server needed**, per user instruction.

On Mac sync the project directory to Mint without replacing other game worlds:
```bash
cd ~/Documents/workspace/hero-skills
git pull --ff-only origin main
rsync -av --exclude node_modules --exclude __pycache__ games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
```

On Mint stop the old Alice client (`Ctrl+C`) first so the Xbox identity isn't online twice. Leave MCManager `bedrock-default` at UDP 17879 running:
```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
export ALICE_BEDROCK_PROFILE=AliceAI-HedydevGame
export ALICE_BEDROCK_BACKUP_MANIFEST="$HOME/minecraft-world-backups/bedrock-default/minecraft-bedrock-20261018T000242906101Z.json"
export ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES
cd ~/minecraft-ai/bedrock-native/experiment
npm install --omit=dev
npm test
npm run production:check
npm run production
```

Optional Ollama planner (only for unrecognized Chinese natural-language tasks; deterministic actions need no Ollama): set `ALICE_OLLAMA_URL=http://127.0.0.1:11435` and `ALICE_OLLAMA_MODEL=gpt-oss:20b` **before** startup, only if that endpoint is reachable from Mint. This is compatible with the existing SSH reverse-tunnel pattern from Mac port 11434. If unset, no network model calls are made.

Supported command candidates for observational testing: `AliceAI 状态`, `AliceAI 跟着我`, `AliceAI 停止`, `AliceAI 收集3个木头`, `AliceAI 制作木剑`, `AliceAI 保护我`, `AliceAI 背包`. Observe actual position and inventory changes; `spawn` or `已开始` is not proof. If Alice rubber-bands, hunts a building's wood, loses too much health or reports an error, stop with `Ctrl+C`. **Do not leave this unproven autonomous combat/retreat code unsupervised.** Work on 17879 is user-authorized but can modify the world and may be fatal to the bot.

**Feature boundary:** Full Paper `AliceSafety`, `AliceAutonomy`, Mindcraft ActionManager, advanced terrain recovery, entire automatic crafting/storing/item delivery, and Paper's LLM router are not binary drop-in compatible with the unmerged Bedrock Mineflayer fork. This release shares Core/policies and introduces real executor equivalents; it does **not** assert complete behavior parity. Continue implementation on concrete Mint logs after first supervised 17879 acceptance.


## 2026-10-18 — Bedrock 1.26 prismarine-chunk startup failure (live Mint evidence)

Real user Mint Node 24.22.0 log: `production:check` passed the verified world backup and Paper policy loading, but `production` crashed before spawning with `[Prismarine-chunk] No chunk implementation for bedrock 1.26 found` at `mineflayer/lib/bedrock_plugins/blocks.js:6`. **Confirmed cause:** Mineflayer's standard transitive `prismarine-chunk@^1.41.0` does not dispatch `bedrock 1.26` (only up to 1.21). Upstream PR [PrismarineJS/prismarine-chunk#338](https://github.com/PrismarineJS/prismarine-chunk/pull/338) adds 1.26 → shared Bedrock 1.18+ chunk implementation; pinned the contributor's exact #338 commit `02b4a4cc660d0ce6f8f08cbdb78926d7f7590ed3` as a direct dependency and root npm `overrides`, so nested Mineflayer copies use the same revision. `src/chunk_preflight.cjs` resolves chunk/registry through **Mineflayer's own Bedrock blocks.js module path** and checks real `bedrock_1.26.51` registry + chunk constructor + stone state read/write **before any server connection**, including in `npm run production:check`.

Local Node fixture tests for pin/dispatch error/state round-trip: **4/4 pass**, alongside existing runtime tests **18/18 total**; JavaScript syntax passes. **No actual npm Git dependency install or server runtime verified on Mint yet**, so do not claim that world decoding, block hash translation or safe autonomous play now works. Related upstream open PRs **#337** (hashed state persistence) and **#335** (zero-bit palette) remain independent issues and are NOT merged into the pinned #338 code. If the check passes but live world block data is unavailable, diagnose runtime registry/chunk packet behavior rather than disabling the world check or spoofing actions. Preserve live 17879 server, backup, Xbox cache and the old chat-only client. No world changes in this code update.


## 2026-10-18 — Paper FOLLOW intent parity / user gameplay logs: live Bedrock corrections (awaiting Mint acceptance)

**Observed on live 17879, user logs:** Xbox+Mineflayer 1.26.51 spawn and autonomous/safety loops succeeded. The spontaneous weapon preparation saw 36 visible logs in 13 columns, **all rejected as near_player_structure**; zero observed leaves, no unknown voxels, block data reported supported. These logs do not show a chunk decoding failure: the current area may be player-built and/or genuine trees may be farther away. Maintain tree/build protection and inspect real leaf names before claiming any tree can be harvested. Follow status displayed `localDistanceToTarget:1.89` and `localMovedBlocks:0`: with a configured three-block follow distance, no motion is expected while already that close. Confirm pathfinding by moving the human player 8-12 blocks away on unobstructed ground. Guard/combat generated numerous unverified attack packets; no observed server-side target damage/kill is in those logs.

**Paper code review:** `AliceMovementController.follow()` uses persistent `core.setFollowIntent`, the recent 30s last-seen tracker, and a recovery loop; Paper tasks may run temporarily and then resume a retained FOLLOW intention, while reactive Safety has highest priority. Bedrock previously called `core.stop('gather ordered')` / `core.stop('craft ordered')`, permanently erasing FOLLOW. It also put explicit `保护我` immediately into permanent GUARD even during peace. Fix Bedrock `src/runtime.cjs`: explicit WOOD / CRAFT now **suspend, not clear** FOLLOW; when bounded job finishes, `core.resumeIntent()` re-enters FOLLOW; explicit STOP alone clears it. Protect command retains FOLLOW while marking guard intent; self-defence/nearby player guard still preempts it when a threat is observed. Owner guard selection restricted to when Alice is within 12 blocks of a *visible* owner; Alice can work independently farther away while retaining intent. Follow can navigate only to a trusted recently seen (up to 30s), same-dimension waypoint; on stale/unseen target she waits rather than guessing. The 1.89 block observation now explicitly prints `withinFollowRadius:true`.

Fix attack-spam symptom: native Bedrock attacks remain **attempts, not verified hits**; target-specific exponential backoff (1.75s–12s) for unverified attacks, seven seconds after out-of-range, bounded 32-target memory; `entityHurt` resets backoff but is labeled an observed event **without proof Alice caused it**. No claim that this alone makes combat effective. Preserve 4.5s safety quiet-window and 300ms safety preemption.

Wood search: manual and autonomous gathering scans within 18 blocks (Paper-style work-area radius), up to 128 nearby observed log candidates, rather than 12/36 overly favoring the closest construction. The entire bounded request must remain within 18 blocks of its starting location. Still requires loaded trunk+canopy evidence and refuses construction markers; diagnostic log now includes `searchRadius`, `originalWorkBound`, and sampled `buildTypes`. No guarantee of finding natural trees in an urban area. Do not loosen the build guard without user evidence.

**Validation:** local Node22 `npm test`: 29/29 passing (including former suites); JavaScript syntax checks passed. New regression cases cover (1) FOLLOW→GATHER→FOLLOW, (2) FOLLOW→CRAFT→FOLLOW/STOP, (3) fresh/stale last-seen, (4) repeated unverified attack throttle and nonattributable hurt event, (5) wide search maintaining refusal of built logs, and (6) GUARD command following the owner in peacetime. **Not yet run on real Mint / actual player motion or combat verified.** Prior backup, original Paper files and Alice data, non-bedrock-default worlds, auth cache, and stable chat-only launcher remain untouched. Next need actual motion at distance >6, server change in observed inventory after collection, and `entityHurt` or server-side damage observation. NOTE: safety-interrupted GATHER currently cancels, it does NOT automatically restart unfinished gather when danger passes; that further parity feature needs a safe message-epoch + remaining-count implementation.


## 2026-10-18 — 17879 Alice autonomy: survival, sight-follow, beds, chests, equipment

User requested: health-first self-preservation, always face mobs before attacks, stop close 2-block following in favor of staying in view, independently use nearby beds at night, automatically consume carried food, withdraw/deposit specifically requested items from nearby chests, and equip better available armor/weapons.

Implemented in `bedrock-native/experiment/` on the **existing authenticated 17879 production gate**:
- Visible FOLLOW target distance 8 blocks; if optional Mineflayer `canSeeEntity` positively returns false (blocked line of sight), temporarily approach to 4 blocks. GoalFollow, long-lived intent and FollowProgress safe radius are aligned. This is a *pathfinding target*, not a proven server-side vision guarantee.
- `BedrockOperations.attackOnce` now requires bounded `bot.lookAt(enemy upper body)` before `bot.attack(enemy)`. A queued hit is **not** confirmed server damage. Prior combat cooldown and low-health retreat remain; if a safe path is unavailable she can still be hurt or die.
- New 5s safe maintenance independent from idle autonomy. Hunger <18 triggers safe food use even while FOLLOW and even at full HP (provided she carries a supported food; 30s retry cap). Low HP <14 interrupts regular jobs but an active safe RECOVER meal is not cancelled by health alone; nearby danger still preempts. Eating is confirmed only by server-observed hunger value increase. If food is unavailable and health does not regenerate, Alice may remain in SURVIVE.
- Bedrock overworld night (clock 12542..23459) and *known unoccupied bed* within 12 blocks: bounded non-destructive goto + Bedrock `bot.sleep` (await actual sleep event); stays put while sleeping, resumes after wake. No bed means no sleep job or chat spam; retry >=120s. `AliceAI 起床` works and STOP cancels intent even if wake fails.
- `AliceAI 从箱子里拿5个钻石` and `AliceAI 箱子存入3个铁锭` parse Chinese allowlist/common canonical `minecraft:item_id`, count 1..64. Search 12 blocks around job start, max 24 known chests/trapped chests/barrels, bounded path without digging or placing. Wait for **real Bedrock inventory_content Window**, ignore provisional container_open window, operate requested item ONLY, handle multiple stacks, check both player and chest quantity delta and close window. Partial moves must report partial, not full success; explicit player command temporarily suspends FOLLOW then resumes. Containers may be owned by another player: this code does not implement owner/claim permissions; it only uses in-game permissions.
- `life_actions.cjs` uses Bedrock armor slots 5..8, chooses a strictly better tier and requires equipped slot confirmation. Weapon auto-selection imports the original Paper `equipment.chooseWeapon` function and requires observed held item change. Equipment checks every >=20s only while safe. Added a neutral `STORAGE` state to shared AliceCore; Paper Java execution remains otherwise unchanged.
- Safety, inventory-sync, world backup + SHA256/restore, online-mode=true and dedicated Xbox auth gate remain. No new 17880 world created, no server/world files modified by this update.

Static syntax checked in tool isolate for CommonJS changes; standalone pure command-parser smoke checks passed for Chinese transfer commands and night check. New Node tests were added/updated in `test/runtime.test.cjs`, `test/life_storage.test.cjs`, but **full Node 24 `npm test` has NOT run on Mint**, and actual sleep, transfer, facing, equipment and visible distance are **not yet verified in live Minecraft**. Do NOT report behavioral parity or service-side success until user gives real console + game observation. Pinned community Bedrock Mineflayer fork is experimental. Preserve old chat-only connector for recovery.

### Deploy survival & chest operations on user's existing 17879 world

On Mac:
```bash
cd ~/Documents/workspace/hero-skills
git pull --ff-only origin main
rsync -av --exclude node_modules --exclude __pycache__ games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
```

On Mint: stop the previous autonomous Alice client with Ctrl+C (never run two sessions with Alice's Xbox identity), leave MCManager `bedrock-default` running normally. Retain the existing offline verified backup manifest and explicit production consent:
```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
export ALICE_BEDROCK_PROFILE=AliceAI-HedydevGame
export ALICE_BEDROCK_BACKUP_MANIFEST="$HOME/minecraft-world-backups/bedrock-default/minecraft-bedrock-20261018T000242906101Z.json"
export ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES
cd ~/minecraft-ai/bedrock-native/experiment
npm test
npm run production:check
npm run production
```

**Stop on npm test failure**; do not treat syntax checks as full Node24 tests. Test separately: (1) on safe open ground `AliceAI 跟着我`, move ~15 blocks and observe actual 8-block spacing; occluded LOS may switch to 4. (2) with 1 hostile mob, check Alice physically turns toward it before attacking (damage still unverified). (3) with food in her inventory at hunger <18, verify hunger rises. (4) put clearly better helmet in her inventory, observe armor change. (5) at night with a known unoccupied bed within 12 blocks, check actual sleep; `AliceAI 起床` or STOP. (6) in a chest **containing expendable items** within 12 blocks, try `AliceAI 从箱子里拿1个苹果` and `AliceAI 箱子存入1个苹果`; verify both sides after each. Do not trial valuable chests first, do not leave the experimental autonomous bot unattended amid mobs.


## 2026-10-18 — Real FOLLOW not traversing wooden house: verified pathfinder coding gaps and targeted patch

User's live 17879 Mint log proves Alice has joined the world, owns durable FOLLOW for `MolarParsley191`, and reports `localDistanceToTarget=5.07`, `withinFollowRadius=true`, `localMovedBlocks=0`, `pathMoving=false`, `pathStatus=unknown`. With the current 8-block radius this alone is **expected stillness**, but combined with prior `partial/noPath` while player went outside the wooden house confirms the need to review actual follower goal retargeting and door passability. There is no evidence of broken Xbox authentication in this instance.

Pinned community pathfinder `Pix3lPirat3/mineflayer-pathfinder@789d914` implements `GoalFollow.hasChanged()` by comparing player displacement against **the same radius squared** used for follow proximity, so an 8-block proximity allows the stored target coordinate to go stale by eight blocks. Bedrock Alice additionally hard-coded `moves.canOpenDoors=false`, and the fork only populates openable IDs for fence gates, not wooden doors: when `canDig=false` the closed door becomes an impassable wall even though a hand-openable door exists.

`src/follow_navigation.cjs` adds an instance-local GoalFollow target refresh at **2.5 blocks**, independent of desired 8-block distance, and non-invasive loaded-block eye-line detection; a known wall reduces goal range to **4 blocks**, unloaded chunks return unknown (no invented vision). `configureDoors` registers **only** normal wooden door IDs from verified Bedrock registry before `moves.canOpenDoors=true`, allowing the fork's `bot.activateBlock` to click doors while leaving `moves.canDig=false`, parkour and towers disabled. Iron/copper/trapdoors and solid wood blocks remain non-traversable/non-destructible. The warning `movement stalled` now only fires when OUTSIDE the current configured radius by >2 blocks, not at 5.07 within 8. End goal is autonomous wooden-door exit without breaking any house structure.

Targeted local Node22 pure helper tests **4/4 passed**; runtime integration tests added for door registry, retarget at three blocks, wall LOS reducing follow range. Those runtime integration tests and full Mint Node24 `npm test` have **not** yet run. Neither actual server-side movement nor wooden-door activation is verified on live 17879; claim only source-level fix until player observes Alice crossing doorway. No world/server/backup/auth change. Follow-up: have the player walk from inside the wooden house through an ordinary WOODEN door, >=12 blocks away, while Alice follows; examine `[Alice follow] doorway navigation`, `target visual contact`, `path planner`, `movement observation`, and watch the bot actually exit. If doors are iron or entrance blocked by unsupported blocks, capture world block information before changing movement restrictions.


## 2026-10-18 — Intermittent Bedrock server_id_conflict: align live client options / verify identity on server

User Mint 17879 trace: sometimes authenticates / start_game / spawn successfully, but other runs disconnect after network_settings before join with `reason="server_id_conflict"` and empty reason text. User supplied complete env including `ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES`, and `production:check` passed. **The confirm variable is not the cause**; it is a local safety gate and has no effect on Xbox identity. Official Bedrock DisconnectFailReason=44 ServerIdConflict differs from 43 LoggedInOtherLocation: neither source proves root cause without checking the server session.

Source diff found: known-good native `bedrock-native/src/main.cjs` sets `followPort:false` and uses config-chosen `raknetBackend`, pinned `bedrock-protocol@3.60.1`; prior experimental Mineflayer had `followPort` unset and hard-coded raknet-native, while the adapter's transitive bedrock-protocol was floating `^3.59.0`. Align autonomous options: explicit `followPort:false`, validated backend propagated by verified gate, and direct + override pin of bedrock-protocol@3.60.1. Keep Mineflayer version `bedrock_1.26.51` required for registry. Safe options log excludes username, auth cache location and Xbox tokens. `server_id_conflict` now directs a **sequential** comparison and MCManager player-list check, without assuming duplicate Xbox login or attempting unbounded reconnects. All auth caches/world/server untouched.

Production troubleshooting: after Mac sync, Mint `npm install --omit=dev` to ensure nested pinned package, then `npm ls bedrock-protocol`, `npm test`, `npm run production:check`, `npm run production`. Check no other Alice process/client is signed into Alice's own Xbox identity, inspect MCManager `bedrock-default` player list and log for an existing session, not the human's distinct Xbox account. If still conflicting, Ctrl+C and run `cd ~/minecraft-ai/bedrock-native && npm start` using the same environment, **only after stopping autonomous**. Whether the native connector joins or fails determines whether to investigate Mineflayer settings or BDS/player-account session. Package install, 17879 acceptance and root cause **not yet verified**; no assertion that new flags solve intermittent server identity conflict. Do not disable online-mode, delete token cache, alter BDS or touch other MCM instances.

## 2026-10-18 — General Minecraft item intent + durable learning, stage 1

User clarified wood is just an example. Ultimate goal: understand arbitrary Minecraft item acquisition, retain factual game knowledge, learn from observed attempts, and persist across restarts. This is a staged agent goal, NOT a current universal collection claim.

**Now implemented:**
- Canonical Paper AliceLearningSystem now persists schema-v1 JSON on its first startup, not only on first successful episode. It loads old schema-v1 JSON without wiping it. Bedrock main passes a stable explicit memoryRoot. Production file: ~/.alice-bedrock-autonomy-state/bots/AliceAI-Bedrock/alice_learning.json. Lab and Paper data remain separate. Previous '[Alice learning] new memory' could repeat only because the file was not created before a verified task was saved; it did NOT alone prove previous memory loss. On next launch expect 'loaded persisted memory'.
- Structured itemAlias + itemOutcomes records persist on verified item/count evidence; explicit 'AliceAI 记住：闪亮矿=diamond' teaches aliases only if the ID exists in the Bedrock registry; cannot override known built-in synonyms. 'AliceAI 记忆' shows summary counts. This is episodic/statistical learning, NOT training LLM weights or self-modifying code.
- New item_knowledge.cjs normalizes '收集5个钻石', '挖钻石', '采集3个铁锭', '砍木头', '跟紧我', '吃东西/回血' into typed intents. Item IDs must resolve to the live bot.registry.itemsByName or verified alias. Aliases are a limited Chinese bootstrap, not full translations of all registry entries.
- The production Bedrock executor only safely handles: (A) known natural log variants with tree-canopy/build-guard observations and target-specific inventory delta, and (B) server-supplied recipes with ingredients already in hand, via craftVerified and inventory delta. Other item goals may be understood/validated but require future purpose-built ore mining, smelting, farming, fighting, trade, chest/loot, and risk-aware navigation. Do not pretend 'collect diamond' succeeds by rerouting it to wood or inventing a recipe.
- Optional Ollama (only when ALICE_OLLAMA_URL is provided) can emit validated collect_item/eat_food/reply/follow structured requests; runtime revalidates item and safety, and passes a small persisted memory summary to future prompts. Model output cannot directly dig, execute a shell command or assert a completed pickup. Without Ollama, deterministic parsing/known item aliases work, not open-ended Chinese understanding.
- AliceCore long-lived FOLLOW survives an item task. Priority remains survival > safety > command > idle. No changes to 17879 BDS configuration/world, login cache, Paper bot, online-mode or 17880.

**Validation:** GitHub source and CommonJS syntax verified. Isolate-mocked memory initialization/restart/alias persistence PASS; V8 parser and optional planner allowlist PASS; simulated Bedrock two-log acquisition with observed count PASS. Added regression tests learning_persistence.test.cjs, item_knowledge.test.cjs, generic_gather.test.cjs, planner_generic.test.cjs, runtime.test.cjs. Full user Mint Node24 npm test, in-world item collection, model connectivity and Minecraft gameplay are still UNVERIFIED.

**Next stage:** chat → intent → server registry/recipe/drops/source graph → safe specialized skill selection (mining, smelting, farming, mobs, trade, containers) → executed inventory/world proof → durable indexed memory → model reuses trusted learned strategies. Learning does not authorize arbitrary or destructive moves.
