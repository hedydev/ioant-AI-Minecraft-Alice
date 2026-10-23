# Update & deploy (Mac -> Linux Mint)

The authoritative code lives at `hedydev/hero-skills/main/games/minecraft-ai`. Keep `~/mindcraft-alice` as the underlying Mindcraft runtime, and keep `bots/AliceAI` as private, durable local data.

## Recommended: one command on Mac

```bash
cd ~/Documents/workspace/hero-skills
bash games/minecraft-ai/scripts/deploy-and-run.sh
```

The script checks out no branches, performs `git pull --ff-only origin main`, syncs Alice files to `~/minecraft-ai` on Mint (without `--delete`), checks that the Mindcraft bot is **not already running**, runs integration validation, Python installer regression tests, Node safety-policy tests, backed-up installation, and finally starts `node main.js` interactively with live logs. Press Ctrl+C to stop Alice. You must stop the previous Alice process before deploying. It never touches the Paper server process or Minecraft worlds.

```bash
bash games/minecraft-ai/scripts/deploy-and-run.sh --dry-run
bash games/minecraft-ai/scripts/deploy-and-run.sh --no-start
```

Remote host defaults to `tedz@192.168.0.104`; override with `ALICE_SSH_TARGET=user@host`. SSH credentials or keys must already work. If Git main has tracked local changes, is not on main or cannot fast-forward, script stops. If the Mint integration preflight fails, it also stops before installing or launching: send that exact error for a tracked integration fix.

## From Mac

```bash
cd ~/Documents/workspace/hero-skills
git status --short --branch
git pull --ff-only
rsync -av --delete games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
```

`rsync --delete` is scoped **only** to the disposable `~/minecraft-ai` deployment mirror, never to Mindcraft, the Minecraft world or Alice memory. If the mirror contains work you need to keep, omit `--delete` and inspect first.

## On Linux (SSH)

Stop the currently running `node main.js` by Ctrl+C in its terminal. Then:

```bash
ssh tedz@192.168.0.104
python3 ~/minecraft-ai/scripts/install.py --target ~/mindcraft-alice --check
python3 -m unittest discover -s ~/minecraft-ai/tests -v
node --experimental-default-type=module --test ~/minecraft-ai/tests/*.test.mjs
python3 ~/minecraft-ai/scripts/install.py --target ~/mindcraft-alice --install
cd ~/mindcraft-alice
node main.js
```

The installer stops before writing if required Mindcraft adapter markers are absent, Node syntax is invalid or previously installed source was locally changed. First installation makes a dated backup under `~/mindcraft-alice/.alice-project/backups/`. The manifest is `~/mindcraft-alice/.alice-project/install.json`.

Rollback **after stopping Alice**:

```bash
python3 ~/minecraft-ai/scripts/install.py --target ~/mindcraft-alice --rollback latest
```

The installer never writes `bots/`, `settings.js`, `alice.json`, `keys.json`, Minecraft server files or any world. Backups are kept in Mindcraft rather than in the deployment mirror.

## Important first-run prerequisite

The previously hand-edited Mint Mindcraft checkout must expose all these integration points:

- `new AliceCore` and `new AliceAutonomy` in `agent.js` **after name initialization**;
- `AliceMovementController` in `library/skills.js`;
- `aliceTasks`, `!aliceCollectWood`, `!aliceLearnWeapon` in `commands/actions.js`;
- core begin/end hooks in `action_manager.js`;
- mode arbitration through `allowsMode(` in `modes.js`.

If preflight fails, **do not bypass the check**. Get exact local code and port the missing integration as a tracked adapter in this repository first.

## Troubleshooting

`python3 ~/minecraft-ai/scripts/install.py --target ~/mindcraft-alice --check` is safe to run while Alice is online; `--install` and `--rollback` require a stopped bot.

## Optional far-distance tracking

For tracking a player beyond entity visibility, see [Paper position feed setup](PLAYER_TRACKING.md). This is **not** part of the Mac one-command installer because installing or restarting a Minecraft server plugin is a separate server-administration action. Without it, the bot will use a fresh last-seen waypoint and then stop guessing when it becomes stale.

## Missing optional `_aliceMessageEpoch` warning

Some older Mint Mindcraft integrations do not have a message-generation marker. It is **not** required for startup, FOLLOW, combat or basic gathering. Preflight will log a `WARNING` and continue if the other required adapter signatures match. Auto-resume of an interrupted wood-collection task is disabled until the command epoch can be verified, so a stale task cannot run over a newer player's instruction. Nothing is silently patched into `agent.js`.

When the script stops, the `rsync` step may already have saved this project into the Mint `~/minecraft-ai/` mirror. A preflight exit does **not** modify active Alice modules or bot memory in `~/mindcraft-alice`. Do not bypass the other required markers if they fail.

All-player command access stays as configured by Mindcraft (no Alice owner whitelist added). If upstream `settings.only_chat_with` restricts players, that setting is separate and was not changed by this update.

## Chat / status feature configuration

Alice status questions (`你在干嘛？`, `谁在指挥你`) work without configuring any new AI model once the Alice modules are installed. Chat defaults to existing Mindcraft LLM unless a dedicated Ollama model is explicitly configured. For a fast small model, edit `~/mindcraft-alice/bots/AliceAI/alice_social.json` **on Mint**, not in this Git repository. See [SOCIAL.md](SOCIAL.md). The one-command Mac deployment continues to work as before and does not touch any local `bots/` file or change who is allowed to give Alice commands.

## Troubleshooting: LLM ECONNREFUSED on port 11435

The uploaded run contained `connect ECONNREFUSED 127.0.0.1:11435`. This is **not** a model inference failure. The Mindcraft process cannot reach its configured Ollama endpoint; realtime Minecraft movement can still work, but language-model requests will not.

On **Mac**, first check:

```bash
curl --max-time 3 -fsS http://127.0.0.1:11434/api/tags
```

On **Mint**, check:

```bash
curl --max-time 3 -fsS http://127.0.0.1:11435/api/tags
```

The Mac `deploy-and-run.sh` script, when running interactively, probes both endpoints. If Mac Ollama is healthy and Mint port is unreachable, the SSH session attempts a localhost-only `-R 127.0.0.1:11435:127.0.0.1:11434` forward for the duration of Alice. Set `ALICE_OLLAMA_TUNNEL=off` on Mac to disable forwarding. If Mac Ollama is unavailable or SSH forbids port forwarding, the script logs a warning; fix the Mac Ollama process, connection, or SSH server settings. The tunnel only exists while the foreground SSH session is alive. It does not restart Ollama or install missing models.

Do not expose Ollama on `0.0.0.0` or open a public firewall rule to repair this localhost-only connection.

## Read-only Mint adapter snapshot for engineering diagnosis

Before modifying the still-unversioned Mint `agent.js`, `action_manager.js`, `modes.js`, `commands/actions.js`, or `library/skills.js`, capture their **actual current bytes** on Mac:

```bash
cd ~/Documents/workspace/hero-skills
bash games/minecraft-ai/scripts/capture-mint-adapters.sh
```

Use `ALICE_SSH_TARGET=user@host` if the Mint address changed. The script does not pull, sync, install, stop or restart Alice. It creates a private temporary `source.tar.gz` and SHA256 file on the Mac, prints the exact path, and records each included file's hash in `adapter-manifest.json`. The output contains five required Mindcraft source files and optional known collectblock plugin entrypoints; no bot memory, Minecraft world, settings or logs. Do **not** commit this archive to Git or share it before inspecting for hardcoded secrets. Missing required files or paths escaping the Mindcraft checkout cause an explicit failure. This is a code-provenance step, **not** a deployment or a 0.3.1 gameplay verification.

## Private Alice run logs (no copy/paste)

New `install-and-run.sh` foreground launches keep stdout/stderr under `~/mindcraft-alice/.alice-project/logs/run-YYYYMMDDTHHMMSSZ.log`, with directory permissions `0700` and private file creation. Do not upload these to GitHub or public endpoints, and be aware that Mindcraft/Paper may print player chats, IPs and other sensitive details. There is **no automatic ChatGPT ingestion**.

From the Mac after running Alice, fetch the most recent log without retyping it:

```bash
cd ~/Documents/workspace/hero-skills
bash games/minecraft-ai/scripts/fetch-latest-log.sh
```

The script prints the private local `alice-run.log` path and SHA256 file. Inspect/redact before attaching it to this conversation. It does not restart Paper, read world files, or alter bot memory.

## Multiple Alice instances: choose the actual Mint runtime

A user screenshot shows a Mint shell titled `~/minecraft-alice-v2`, while earlier tools default to `~/mindcraft-alice`. Do not assume that the current Alice process's working directory is the same as its shell's title: inspect `/proc/PID/cwd` first. On the Mac, set exactly one validated basename under Mint's home and reuse it for **all** operations:

```bash
export ALICE_MINDCRAFT_NAME=minecraft-alice-v2
bash games/minecraft-ai/scripts/deploy-and-run.sh --dry-run
bash games/minecraft-ai/scripts/capture-mint-adapters.sh
bash games/minecraft-ai/scripts/deploy-and-run.sh
```

The directory name permits only ASCII letters, digits, underscores, and hyphens (starting with a letter or digit), not an arbitrary path. Defaults to `mindcraft-alice` for compatibility. The launcher forwards the selection through SSH to the Mint installer; the dashboard and read-only log fetch use that same instance. The selector never copies/migrates learning data or Minecraft worlds. Never run the installation until the running Alice instance is stopped and the selected target is confirmed.
