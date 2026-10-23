# Bedrock players, the separate Bedrock server, and the world backup gate

## Two distinct cases

**A. Bedrock players with Alice inside the existing Paper world.** The user's Paper server has Geyser/Floodgate, and prior Mint logs showed Bedrock player `MolarParsley191` issue `跟着我` (represented as `.MolarParsley191` in the Java-side entity). That is **historical evidence** of shared-world chat routing, not proof that all post-v0.3.1 commands are verified. Keep Alice's Java Mineflayer runtime on Paper and validate sender identity, Chinese chat/whisper feedback, command handling and combat preemption for Bedrock players. Do not add an owner whitelist.

**B. Alice as a player in the independent Bedrock Dedicated Server world.** This is **not supported yet** by the Paper/Mineflayer bot; Bedrock Dedicated Server is a separate protocol and world store. Do not automatically convert the world or direct Alice's Java protocol client to the Bedrock UDP port. Any BDS-native Alice adapter needs separately assessed Bedrock protocol, inventories/containers, chat and movement APIs and a compatibility test world.

## Mandatory backup before *any* server or world migration

Only after identifying which of the two worlds is actually active, stop that Minecraft server **cleanly** (not kill -9), then make an offline archive. The safety tool never stops a server, never overwrites a backup, never edits worlds, and fails if it detects a `java` or `bedrock_server` process with the same server directory as its cwd. This check does not replace the operator's confirmation that every relevant server has stopped.

On Linux Mint (after the Mac mirror has been synced with the new scripts):

```bash
# First inspect the actual server process and current world paths
ps -ef | grep -E '[b]edrock_server|[p]aper.*jar|[j]ava.*server'
# Example: require real absolute paths rather than blindly using guesses
python3 ~/minecraft-ai/scripts/backup-world.py \
  --server-dir /ACTUAL/PAPER/SERVER/DIRECTORY \
  --kind paper --output-dir ~/minecraft-world-backups --dry-run

# Only after the Paper service is completely stopped:
python3 ~/minecraft-ai/scripts/backup-world.py \
  --server-dir /ACTUAL/PAPER/SERVER/DIRECTORY \
  --kind paper --output-dir ~/minecraft-world-backups
```

For the separate Bedrock Dedicated Server, replace `paper` with `bedrock` and use its actual server directory. If `level-name` does not map to the actual `worlds/<name>` directory (this happened with non-ASCII world names in earlier runs), explicitly provide one or more `--world-dir /ACTUAL/SERVER/worlds/REAL-DIRECTORY` paths after checking `level.dat`. Do not guess from the visible world name.

The tool validates `server.properties`, `level.dat`, refuses symlinks, requires output outside the server directory, archives world data without modifying it, verifies every file's checksum against the compressed archive and writes a separate manifest and `.sha256` file. It does **not** archive all server plugins/configuration, and is not a complete OS backup. Restore acceptance must still be performed on a disposable server directory with the original live server remaining untouched.

**Gate:** No Bedrock Dedicated Server adapter deployment, plugin modification, world migration, or server upgrade until an actual Mint archive, SHA256, selected world path, and disposable restore check are recorded. Merely writing/testing the backup script is not an actual backup.

## Concrete MCManager bedrock-default rollout (2026-10-18)

Target only bedrock-default: prior Linux Mint root /home/tedz/minecraft-bedrock, UDP 17879, online-mode=true, real world directory worlds/Bedrock level. The older level-name property may differ, so **inspect actual level.dat directories**. These are historical values to reconfirm; fight-always and zombie-apocalypse are out of scope.

1. On Mac, update hero-skills/main and sync games/minecraft-ai/ (no --delete) to tedz@192.168.0.104:~/minecraft-ai/ without restarting Alice or Paper. Read-only inspection: ssh tedz@192.168.0.104 'bash ~/minecraft-ai/scripts/backup-bedrock-default.sh --inspect'.
2. In MCManager, gracefully stop ONLY bedrock-default. Run: ssh -t tedz@192.168.0.104 'bash ~/minecraft-ai/scripts/backup-bedrock-default.sh --backup --world-dir "Bedrock level"'. Substitute the actual inspected world-folder name if different. It writes a dated archive, manifest, SHA256 and performs independent temporary restore; wait for BACKUP GATE PASSED. Preserve the manifest path; restart only bedrock-default in MCManager. **A real backup has not yet happened.**
3. On Mint, cd ~/minecraft-ai/bedrock-native; npm install --omit=dev; npm test; npm run ping. Version 3.60.1 supports documented Bedrock protocols up to 1.26.51; do not blindly change server version. Then with a dedicated Xbox bot account and ALICE_BEDROCK_BACKUP_MANIFEST set to the real manifest, npm start. See bedrock-native/README.md.

This new **native transport is only chat/status stage one**, not Minecraft Java Mineflayer inside BDS and not full Alice movement/harvest/defense. Those features require their own packet adapters and safe acceptance in a separate test world. No other MCManager instance or Paper world is modified.

## Live backup verification and Node24 startup prerequisite

User completed bedrock-default world backup and independent temporary restore on 2026-10-18: worlds/Bedrock level, 15 files, SHA256 11309cd4f5b4458ff031298156280eb2ec3c5c8db6bafb2509ba9e22e70d6761, manifest /home/tedz/minecraft-world-backups/bedrock-default/minecraft-bedrock-20261018T000242906101Z.json. Server root was /home/tedz/minecraft-bedrock, server-port 17879, online-mode=true. Archive is already verified; do not repeat the world backup merely because Node dependencies need to change.

The native client is independent from Paper Alice. The user's Mint Node 20.11.0 emitted EBADENGINE on bedrock-protocol 3.60.1 and related dependencies requiring Node >=24. Use `bash ~/minecraft-ai/scripts/setup-node24-bedrock.sh --install` to download and SHA256-verify an official Node 24 release into ~/.local/share/alice-bedrock/node24; export its bin to PATH **in that SSH session only**. Run npm install and rebuild under Node24, not the original Node20. Then restart only bedrock-default via MCManager as needed and run npm run ping. Xbox authentication, chat and protocol support remain to be verified. Do not change Paper Node/MCManager worlds/online-mode.

## Shared AliceAI brain across Java and Bedrock (phase 1b)

The user has now actually Xbox-authenticated and spawned the native client into bedrock-default 1.26.51. `bedrock-native/src/shared_brain.cjs` imports the versioned, original Paper decision-policy modules under `runtime/alice_modules/` (inventory/wood/safety/social/recipe/terrain/task observation/intent epoch) without copying logic. The Bedrock client sends packet-derived information only when reliable, tracks follow/gather as **requested**, and does not advertise action success or turn on motion. Run `npm test` and test chat commands on Mint after syncing. See `bedrock-native/SHARED_BRAIN.md`. Native movement/harvest/craft/combat/inventory executor parity requires distinct Bedrock protocol adaptation and separate throwaway-world verification before activation; it is not delivered by simply loading Paper JS.

## Experiment: actual autonomy rather than pure chat policies

Paper Alice starts Safety/Social/Autonomy controllers, which native `src/main.cjs` never did. New **separate cloned-world runner** in `bedrock-native/experiment` uses fixed Git SHAs of unmerged Bedrock Mineflayer, physics and pathfinder; shared Paper core and autonomy/safety/wood/social policy drives experimental actual follow/one-log gather/idle, refusing all live world connections (port 17879). `scripts/prepare-bedrock-alice-lab.py` restores one verified backup into a newly created sibling directory for UDP 17880. This is *not* full Paper parity and cannot fight/flee/craft/store safely yet. Mint real gameplay validation pending. See docs/AUTONOMY_PORTING.md.


## 2026-10-18 — Explicit user authorization for live 17879 autonomy (opt-in)

The user explicitly requested **no separate experiment world; use the existing 17879 bedrock-default world directly**. The same experimental, not-yet-live-proven Mineflayer Bedrock executor can now be selected with `npm run production:check` / `npm run production` under `bedrock-native/experiment/`. These are distinct from `npm run check` / `npm start`, which still enforce disposable 17880. Production mode refuses without `ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES` and the original verified backup manifest. It calls the original 17879 native startup checker, including matching online-mode, real server directory, backup SHA256 and temporary restoration. The old native chat-only connector is unchanged, so it is the rollback binary (stop autonomy, restart old launcher). The only 17879 action commands currently available are follow/stop and a bounded nearest-log dig attempt plus autonomous idle lookout; genuine combat/retreat/equipment/crafting/chests/Ollama action tools **remain absent**. Safety now polls every 300ms (independently from the 5s idle tick) and interrupts motion on threat/health <14, but it **does not move Alice away** and cannot promise survival. The backed-up world snapshot may be older than current world changes; it is not a live pre-launch snapshot. Validation of gameplay still requires users' live Mint logs.


## 2026-10-18 — Shared-Paper-core autonomous Bedrock runtime (code merged; Mint acceptance pending)

User explicitly approved real 17879 integration without a new world. The live `bedrock-native/experiment/src/main.cjs` entrypoint now **instantiates `AliceBedrockRuntime`**, not the previous small `NativeAutonomyExperiment`. It imports original canonical Paper `AliceCore` + `autonomy_policy`, `safety_policy`, `terrain_policy`, `wood_policy`, `social_policy`, and `inventory_policy`, and uses `BedrockOperations` to execute against the pinned community Mineflayer Bedrock adapter. Safety observes every 300ms; follow every second; idle autonomy every 5s after 20s idle grace. Code adds finite player-directed wood counts, bounded move/dig with server inventory delta, tree-leaf/build heuristics, inventory-observed recipe/crafting, cautious food recovery, tentative retreat and attack calls, stop/preemption with message epoch, independent edition learning path, and an **optional** allowlisted Ollama chat planner. All are code paths, not yet verified Minecraft gameplay.

Production `npm run production:check` still requires validated world backup, exact 17879 port and `ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES`; `npm run production` actually connects and may move/dig/consume/attack in the **real** world. Low-level `bedrock-native/npm start` retains the known-good chat-only fallback. This new runtime requires **health event + initial Bedrock inventory_content window='inventory'** before acting; unknown server state fails closed, which may leave Alice idle until correct packet observations are validated on Mint. Pure `node --test test/runtime.test.cjs`: 14 local tests pass; fork dependency installation, full npm test on Mint, live motion, crafting, food, combat and world preservation **not yet observed**. Existing Paper Mindcraft installation and memories are unchanged. Tree recognition is heuristic, **not full world-claim protection**. Prior Oct 18 verified backup predates possible recent gameplay changes; no new offline snapshot implied.
