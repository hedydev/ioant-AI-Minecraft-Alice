> **独立仓库（2026-10-23）**：当前 AliceAI 产品正式代码在 [hedydev/ioant-AI-Minecraft-Alice](https://github.com/hedydev/ioant-AI-Minecraft-Alice)，保留内部 `games/minecraft-ai/` 相对路径以兼容现有 Mac/Mint 运维脚本。历史文档中 `cd ~/Documents/workspace/hero-skills` 必须替换为 `cd ~/Documents/workspace/ioant-AI-Minecraft-Alice`。新工作不要再向 Hero Skills 提交 Alice 代码。

> **Native Bedrock operators and all AIs:** use the maintained [Mac/Mint operating guide](docs/OPERATIONS.md). Daily entrypoints are `scripts/alice-mac.sh` and `scripts/alice-mint.py`; older Paper instructions below are a separate integration.

# Alice MC AI — Mindcraft teammate experiment

## Latest AI handoff

Read **[2026-10-18 handoff](docs/HANDOFF_2026-10-18.md)** before making new Alice changes. It separates live Mint evidence from GitHub-only changes and lists unverified blockers.


This folder is the **versioned source of truth** for the user's AliceAI teammate prototype. It is intentionally separate from the historical native Bedrock bot in `skills/operate-local-ai-on-macos/scripts/minecraft-bedrock-ai-bot`.

Alice runs as a Java/Mineflayer bot on a Paper + Geyser + Floodgate test server; Bedrock clients join through Geyser. The Linux checkout of [mindcraft-bots/mindcraft](https://github.com/mindcraft-bots/mindcraft) is an **upstream runtime**, not the repository where Alice capabilities should be developed.

## Modules

```text
games/minecraft-ai/
├── runtime/
│   ├── alice_*.js              compatibility exports for existing Mindcraft integration
│   └── alice_modules/
│       ├── core.js             eight states; long-lived FOLLOW intent; mode arbitration
│       ├── movement.js         follow, non-destructive paths, bounded recovery
│       ├── learning.js         allowlisted strategies + durable experience scoring
│       ├── tasks.js            wood gathering, basic workbench/weapon workflow
│       ├── autonomy.js         throttled idle equipment/resource work
│       ├── safety_policy.js    priority rules independent of Mindcraft
│       ├── safety.js           realtime self-defense / owner guard
│       ├── equipment.js        tool and weapon selection
│       └── crafting.js         recipe discovery and learning
├── scripts/
│   ├── deploy-and-run.sh       Mac: Git pull -> SSH sync -> install -> launch
│   ├── install-and-run.sh      Mint: preflight -> tests -> install -> launch
│   └── install.py              preview/install/checksum/backup/rollback
├── server-bridge/             optional opt-in Paper location writer
├── tests/
└── docs/
```

## One-command deployment (from Mac)

```bash
cd ~/Documents/workspace/hero-skills
bash games/minecraft-ai/scripts/deploy-and-run.sh
```

This runs a fast-forward Git update, rsyncs only this Alice project, verifies Mint adapters, runs installer and behavior unit tests, creates backups, installs modules and starts `node main.js` over interactive SSH. Use `--dry-run` for a local preview, or `--no-start` to update without launching. It refuses to overwrite a running Alice.

## Safe first deployment

Stop Alice/MindServer before changing installed files. From the Linux machine, with the `games/minecraft-ai` directory transferred from the checked-out Hero Skills repository:

```bash
python3 ~/minecraft-ai/scripts/install.py --target ~/mindcraft-alice --check
python3 ~/minecraft-ai/scripts/install.py --target ~/mindcraft-alice --install
cd ~/mindcraft-alice
node main.js
```

**Important:** The existing Mint runtime contains integration edits to `agent.js`, `action_manager.js`, `actions.js`, `skills.js`, and `modes.js` authored in prior interactive sessions. The installer explicitly validates these integration markers; **it does not replace those files or infer their unseen contents**. If a marker is missing, installation stops and asks for an integration review. This is deliberately not a clean upstream Mindcraft installer yet.

The first install backs up any existing `src/agent/alice_*.js` files. Later installs detect local drift and refuse to overwrite it. Never upload `bots/`, logs, keys, tokens or world data to Hero Skills.

Run read-only integrity check again with `--check`. Roll back current deployment using:

```bash
python3 ~/minecraft-ai/scripts/install.py --target ~/mindcraft-alice --rollback latest
```

See [installation and update instructions](docs/INSTALL.md), [architecture](docs/ARCHITECTURE.md) and [current state](docs/CURRENT_STATE.md).

**Validation status:** Repository sources and the installer have been authored; live Minecraft/Paper/Mint gameplay and exact local integration contents have **not** been verified in this GitHub-only delivery. Treat runtime behavior as a test target, not a proven release.

## Local navigation vs long distance

A visible player exposes their position to Mineflayer; a distant unloaded entity does not. The new tracking module can use the last visible position for up to 30 seconds, then waits. For ongoing distant tracking, the optional Paper position feed must be built and explicitly enabled. See [server bridge guide](docs/PLAYER_TRACKING.md). It never grants OP or teleports Alice. 

## Talk to Alice (social module)

Ask **`你在干嘛？`**, **`你正在做什么？`**, **`当前任务`** or **`谁在指挥你`** in game chat. A read-only status query returns the current ActionManager action/state and the issuing player's name **only if the input can be matched to that actual action**. Otherwise it says the source cannot be confirmed. It never stops movement or starts an LLM request. Other players may ask the same questions; there is no new owner whitelist.

Casual chat, Minecraft discussions and joke requests go through the existing Mindcraft model by default. To optionally use a **separate fast Ollama chat model** without interfering with the main planning model, create the private local config `~/mindcraft-alice/bots/AliceAI/alice_social.json` as documented in [Social chat design](docs/SOCIAL.md). Occasional short MC comments/jokes are generated locally **only while genuinely idle, safe and next to players**, throttled to prevent spam. Commands always keep the original Mindcraft execution route.

## Mint crash/interruption regression (runtime 0.3.1)

A real Alice session exposed a collision between `AliceSafety` and Mindcraft's legacy `self_preservation`: the latter called a missing `skills.moveAway` method while the bot was under attack. This build **disables that broken legacy mode via AliceCore's mode gate** and keeps `AliceSafety` responsible for immediate survival. Combat remains experimental; exact Mint integration / preemption should be tested before using a valued survival world.

The Mac one-command start script now auto-checks Mac Ollama on `127.0.0.1:11434` and Mint's `127.0.0.1:11435`. If the Mac endpoint is healthy and Mint is unreachable, it attempts a **local-only SSH reverse tunnel** while Alice runs. Set `ALICE_OLLAMA_TUNNEL=off` to skip this step. No Ollama port is exposed publicly; if forwarding is disallowed or Mint's port is occupied, the SSH command fails explicitly. This feature is still pending real Mac→Mint confirmation.

## Separate native Bedrock (MCManager bedrock-default)

Stage-one separate Xbox-authenticated Bedrock client (ping and Chinese chat/status only) is under bedrock-native/; read-only instance inspection and verified offline world backup scripts are under scripts/. See docs/BEDROCK_INTEGRATION.md for the mandatory world backup before native connection. Existing Paper Alice and other Bedrock instances stay independent. Native following, gathering and combat are not yet enabled.
