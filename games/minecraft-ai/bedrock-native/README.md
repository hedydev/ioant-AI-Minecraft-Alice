# AliceAI — native Bedrock transport with shared Paper decision rules (phase 1b)

The Bedrock connector now imports the **same pure policy source modules** used by Paper Alice, rather than rewriting another AI brain. See [SHARED_BRAIN.md](SHARED_BRAIN.md) for the implemented shared rules, exact observation semantics and the remaining gameplay-executor requirements.

This is **not** the Java Mindcraft/Paper Alice process and does **not** convert or modify Bedrock worlds. It is an isolated native client for the MCManager instance **bedrock-default**. It uses `bedrock-protocol` version `3.60.1`, as already used by the earlier proof of concept under `skills/operate-local-ai-on-macos/scripts/minecraft-bedrock-ai-bot`. This phase intentionally does **not** enable `bedrockflayer` physics or low-level movement packets.

## Runtime: separate Node.js 24 for Bedrock only

The actual Mint session confirmed system Node.js v20.11.0, while the pinned bedrock-protocol@3.60.1 and related dependencies require Node.js >=24. The original package engine >=20 was incorrect and has been fixed. Do **not** overwrite the existing node used by Paper/Mindcraft.

After updating the Alice project mirror on Mint, install official Node 24 privately without sudo, apt, or changes to shell startup files:

```bash
bash ~/minecraft-ai/scripts/setup-node24-bedrock.sh --dry-run
bash ~/minecraft-ai/scripts/setup-node24-bedrock.sh --install
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
node -v
cd ~/minecraft-ai/bedrock-native
npm install --omit=dev
npm rebuild
npm test
```

The installer fetches Node 24 official release files over HTTPS and verifies the downloaded .tar.xz against the official SHASUMS256.txt; the release location is under ~/.local/share/alice-bedrock/node24/, not /usr/bin/node. The PATH change applies to this terminal only. The download and Node24-native protocol installation have **not** been run on the user's Mint machine by this code change. A partial earlier npm install under Node20 is not proof of compatibility; install and rebuild again under Node24. Check the verified backup and restart bedrock-default through MCManager before running npm run ping.

## Exact target and required world backup

- Linux Mint server root: `/home/tedz/minecraft-bedrock` (re-confirm by inspect script).
- Previously configured BDS UDP server port: `17879`. The code refuses a different value unless explicitly configured.
- Previously identified actual world folder: `worlds/Bedrock level`. The `level-name` property was previously different, so never assume a world folder based only on `level-name`.
- `online-mode=true`; **the bot needs its own Microsoft/Xbox account and Gamertag**. Do not turn offline-mode on to bypass authentication. Use a different Xbox account from a concurrently logged-in human player.
- Other MCManager instances `fight-always` and `zombie-apocalypse` are excluded.

The first stage only **pings** the Bedrock server, then (after a real offline backup has passed) **connects, spawns, and responds to Chinese chat commands**. It will explicitly state that following, harvesting, inventory mutation and combat are *not available* in this native adapter. Do not claim parity with the Paper Alice runtime.

### 1. Read-only discovery while bedrock-default is still running

On Mac, from the current `hero-skills/main` checkout:

```bash
rsync -av games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
ssh tedz@192.168.0.104 'bash ~/minecraft-ai/scripts/backup-bedrock-default.sh --inspect'
```

Verify `serverDir`, `serverPort`, `onlineMode`, and the specific world folder reported. The script never touches the other MCManager instances. **Don't execute `--backup` until the correct instance is stopped from MCManager UI.**

### 2. Stop only bedrock-default in MCManager and back up

Gracefully stop **bedrock-default** in the MCManager web console. Leave `fight-always`, `zombie-apocalypse` and Paper alone. Then on Mac:

```bash
ssh -t tedz@192.168.0.104 'bash ~/minecraft-ai/scripts/backup-bedrock-default.sh --backup --world-dir "Bedrock level"'
```

Replace `Bedrock level` with the actual directory shown by `--inspect` if it changed. This utility refuses to back up while `bedrock_server` is running from that server root, writes a timestamped `.tar.gz`, `.json` manifest and `.sha256` into `~/minecraft-world-backups/bedrock-default/`, and independently restores *all archive files* into a temporary directory to validate checksums and `level.dat`. It does not delete/rewrite source files or stop/start services. Preserve the manifest path printed by the script. If the verification fails, **stop here**.

After a verified backup, restart only **bedrock-default** in MCManager.

### 3. Protocol check without Xbox login

SSH into Mint:

```bash
cd ~/minecraft-ai/bedrock-native
npm install --omit=dev
npm rebuild
npm run ping
```

This should report the BDS version/protocol. If ping reports a protocol not supported by the pinned version, do not fake a success or edit the Bedrock server version; verify protocol compatibility first.

### 4. Connect a separate Xbox-authenticated Alice player (stage 1 only)

Keep a dedicated Microsoft/Xbox account ready. The first login will request an interactive device-code sign-in in the private terminal, and cache tokens on Mint under `~/.alice-bedrock-auth` (not Git, world files or the existing Java Alice memory).

```bash
cd ~/minecraft-ai/bedrock-native
export ALICE_BEDROCK_BACKUP_MANIFEST="$HOME/minecraft-world-backups/bedrock-default/minecraft-bedrock-REPLACE_WITH_ACTUAL_TIMESTAMP.json"
npm start
```

The launcher **rechecks** the offline backup SHA256, performs an isolated temporary restore, confirms the manifest actually includes the target Bedrock world, and checks the live server properties. The bot then authenticates with Xbox. Do not share auth codes or cache with this chat. On connection, test via an ordinary Bedrock player's game chat: `AliceAI 状态`, `AliceAI 帮助`, `AliceAI 跟着我`. The last command must clearly report that following is not yet available instead of pretending to move.

Press `Ctrl+C` to stop this **client only**. The independent Paper Alice and all MCManager servers are unchanged. No auto-reconnect/repeated auth loops are implemented in stage 1.

## Current limitations and next development

- Not yet verified on the user's actual BDS build, Xbox profile, device-code sign-in, or in-game chat packet format.
- `bedrock-protocol@3.60.1` documents versions through 1.26.51; if the actual BDS uses a different protocol, it may reject the client. The server version must be observed through `npm run ping` before making compatibility changes. [Upstream](https://github.com/PrismarineJS/bedrock-protocol).
- Follow/track, safe pathfinder, safety retreat, inventory, storage, crafting, LLM action tools and Mindcraft learning-parity are still not implemented for this transport. Reuse `games/minecraft-ai/runtime/alice_modules` policies through **testable protocol-independent adapters** only after packet semantics, client entity state, and action interruptions are verified in a disposable world copy.
- BDS-world backups do **not** back up a full MCManager instance configuration or the machine's authentication caches.

## Autonomy is not implemented by the native chat-only launcher

This executable does not run Paper's AliceAutonomy/AliceSafety/ActionManager. A separate, opt-in experiment with Bedrock Mineflayer, strict disposable-world gate and incomplete gameplay executor is documented at [experiment/README.md](experiment/README.md) and [../docs/AUTONOMY_PORTING.md](../docs/AUTONOMY_PORTING.md). It must NOT run against 17879 until sandbox life-preservation/action tests pass.

The user has explicitly authorized a direct, opt-in 17879 autonomy entrypoint. See [experiment/README.md](experiment/README.md) for `npm run production:check` / `npm run production`. The original `npm start` here remains the stable chat-only fallback.


## 2026-10-18 — Shared-Paper-core autonomous Bedrock runtime (code merged; Mint acceptance pending)

User explicitly approved real 17879 integration without a new world. The live `bedrock-native/experiment/src/main.cjs` entrypoint now **instantiates `AliceBedrockRuntime`**, not the previous small `NativeAutonomyExperiment`. It imports original canonical Paper `AliceCore` + `autonomy_policy`, `safety_policy`, `terrain_policy`, `wood_policy`, `social_policy`, and `inventory_policy`, and uses `BedrockOperations` to execute against the pinned community Mineflayer Bedrock adapter. Safety observes every 300ms; follow every second; idle autonomy every 5s after 20s idle grace. Code adds finite player-directed wood counts, bounded move/dig with server inventory delta, tree-leaf/build heuristics, inventory-observed recipe/crafting, cautious food recovery, tentative retreat and attack calls, stop/preemption with message epoch, independent edition learning path, and an **optional** allowlisted Ollama chat planner. All are code paths, not yet verified Minecraft gameplay.

Production `npm run production:check` still requires validated world backup, exact 17879 port and `ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES`; `npm run production` actually connects and may move/dig/consume/attack in the **real** world. Low-level `bedrock-native/npm start` retains the known-good chat-only fallback. This new runtime requires **health event + initial Bedrock inventory_content window='inventory'** before acting; unknown server state fails closed, which may leave Alice idle until correct packet observations are validated on Mint. Pure `node --test test/runtime.test.cjs`: 14 local tests pass; fork dependency installation, full npm test on Mint, live motion, crafting, food, combat and world preservation **not yet observed**. Existing Paper Mindcraft installation and memories are unchanged. Tree recognition is heuristic, **not full world-claim protection**. Prior Oct 18 verified backup predates possible recent gameplay changes; no new offline snapshot implied.
