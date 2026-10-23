# Alice 3D Local World Observer — staged 2026-10-19

## 2026-10-19 Mint Node24 failing test — dangling symlink regression fix

**Observed failure on Mint**: `npm test` failed at `test/world_view.test.cjs` in `world-view publisher is private, atomic and refuses symlink targets`. The test created `world-view.json` as a **dangling symlink** (link exists but destination absent); `writer.lastError` was `null` although the test expected `Unsafe viewer target`. This is a real writer bug, not a faulty expectation.

**Causal fix committed**: `src/world_view.cjs` previously checked `fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()`. Because `existsSync` dereferences links, a broken link reports `false` and escapes the check. The writer now calls `fs.lstatSync(file, {throwIfNoEntry:false})?.isSymbolicLink()` directly, both for the **target file** and the private **root directory**. Nonexistent ordinary paths remain permitted; both valid and dangling symlinks are rejected before the atomic rename. No change to world, credentials, Bedrock connection, or private file permissions. The Node test now also asserts the invalid link remains untouched and adds a dangling-root-symlink regression.

**Verification honestly scoped**: isolated Node.js 22 test in the authoring environment confirmed the original `existsSync` false-negative, the new `lstatSync` detection for dangling file and directory links, and normal missing-path handling. JavaScript syntax check was performed before committing. The **full Mint Node24 `npm test` and `production:check` have NOT been rerun after this fix**; the user must verify with the exact commands below. The remaining 3D viewer is still **staged** until full Mint/Mac tests and a live world visual comparison succeed.

**Quick verification on Mint after Mac pull/rsync:**

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
cd /home/tedz/minecraft-ai/bedrock-native/experiment
node --test test/world_view.test.cjs
npm test && npm run production:check
```

If the tests pass, **only then** stop/restart the single Alice bot if it is running, using the already verified production backup manifest and `ALICE_BEDROCK_CLIENT_MODE=legacy-native-injected`. Do not restart the Minecraft Bedrock server, delete auth caches, erase the private state directory or reset failure history. The existing Mac dashboard remains at `http://127.0.0.1:8788/#world` once the Mac dashboard process is restarted if necessary.

## Purpose

The user wants to watch Alice playing Minecraft even when the user is not in-game: a locally synchronized small 3D neighborhood, Alice's movement, nearby blocks/entities, coordinates and recent behavior output. Implemented as a read-only page in the existing Alice Dashboard at `http://127.0.0.1:8788/#world`, also viewable from a trusted home LAN address. It is **not** a Minecraft client, native in-game camera, chunk streamer, renderer with official textures, or remote-control tool.

## Architecture and data flow

```text
Bedrock Dedicated Server (world Bedrock level, port 17879)
   |
   v
Existing single, authenticated native Mineflayer Alice client on Mint
   | bot.blockAt(position): already received/chunk-cached Bedrock blocks
   | bot.entities: already received nearby entities
   | bot.entity.position/yaw: client-simulated position
   | movement_evidence: self server correction positions when available
   | runtime.log: filtered structured AI decisions (no Xbox or player chat)
   v
src/world_view.cjs -> ~/.alice-bedrock-control/world-view.json
    read-only capture 11 x 11 x 8, scan <=968 cached block positions
    terrain once per 4s / center changes; position/events 1Hz
    atomic mode 0600, no world DB or network packets
   |
   | Mac dashboard Python API, existing fixed SSH command
   v
dashboard/remote_world.py (strict fixed path, no args, <=128KiB, 12s freshness)
   |
   v
dashboard/server.py GET /api/world (no POST)
   |
   v
dashboard/index.html #world + world.js + world.css
   - 3D Canvas perspective-projected visible voxel faces
   - drag orbit, scroll zoom, keyboard rotate; roof cutaway, camera follow
   - Alice marker and nearby entities; live XYZ/status/vitals
   - last 24 filtered Alice behavior entries below the scene
```

## Trust boundary and what the picture really means

- **Real map content, bounded view:** block names/relative XYZ come from the Bedrock chunks actually loaded by Alice; missing/unloaded blocks remain unknown. This is not a complete synchronized server chunk database. Materials use simplified colors, and complex stairs, slabs, fluids, decorations or transparent faces are shown as voxel approximations. No rendering assets, network CDN, game texture downloads or additional clients are needed.
- **Real-time approximation:** snapshot positions and behaviors publish approximately every second; local terrain is sampled at most every 4 seconds unless Alice enters a new block-centered neighborhood. The browser only interpolates *between* observed positions; it never predicts beyond its last sample.
- **Client vs server:** Alice's animated marker uses Mineflayer's local motion state, which may disagree with real BDS position. When a fresh server-origin own movement correction or move_player packet exists, its separate XYZ is shown; otherwise the UI prominently labels the marker as **client estimate / server unverified**. A missing correction is unknown, not evidence Alice did not move; final independent proof still comes from BDS `querytarget`.
- **Stale/offline:** the SSH reader returns no 3D scene when Alice is disconnected or the private snapshot is >12 seconds old. No replay of previous frames presented as a live world.
- **Safety/privacy:** only fixed local snapshot file; no Minecraft commands, no remote shell options, no arbitrary path, no world mutation, no account tokens, no raw handshakes or free-form player chat. Mac Python backend stays on 127.0.0.1; Nginx's existing public LAN read-only route forwards GET only; no new behavioral writes. The map does reveal nearby coordinates and entities to anyone on the same LAN who can access port 8788, so use only in a trusted LAN and **never port-forward the dashboard to the internet**.

## Completed source (GitHub staged, not yet Mint validated)

- `bedrock-native/experiment/src/world_view.cjs` generates bounded, read-only 3D snapshots and private world-view feed, record-only behavior logger.
- `bedrock-native/experiment/src/main.cjs` plugs that feed into **the existing Alice** (not a second Xbox login), keeps terrain sampling cached, publishes about 1 Hz, handles spawn/end/offline.
- `dashboard/remote_world.py`, `dashboard/server.py` add a bounded read-only SSH transport to GET `/api/world`.
- `dashboard/index.html`, `world.js`, `world.css`, `app.js` expose the new `#world` navigation page, 3D orbit/cutaway view, position confidence, entities and filtered timeline. Existing dashboard settings and log pages remain unchanged.
- Tests: `bedrock-native/experiment/test/world_view.test.cjs` validates finite neighborhood, cached resampling, server-vs-client status, filtered log events and private atomic output; `tests/test_dashboard.py` validates fixed SSH-only world transport and stale/symlink failures. Source parse checks and isolated snapshot/policy checks passed in authoring environment; full Mint Node24 + Mac Python suite and real server visual sync remain to be executed.

## Safe deployment and acceptance

### Mac repo — no reset/clean/stash or branch changes

```bash
cd ~/Documents/workspace/hero-skills
git status --short --branch
git pull --ff-only origin main
python3 -m unittest discover -s games/minecraft-ai/tests -p 'test_dashboard.py' -v
rsync -av --exclude='node_modules/' --exclude='__pycache__/' games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
```

If status shows conflicts or local changes, do not blindly overwrite anything. Only sync after tests pass.

### Mint — test before stopping the currently running Alice

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
cd /home/tedz/minecraft-ai/bedrock-native/experiment
node -v
npm test && npm run production:check
```

When tests pass, stop **only Alice** with Ctrl+C in her actual foreground terminal. Keep BDS, MCManager and Ollama running. In a Mint shell with the previously verified production backup-manifest environment:

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
export ALICE_BEDROCK_PROFILE=AliceAI-HedydevGame
export ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES
: "${ALICE_BEDROCK_BACKUP_MANIFEST:?Verified backup manifest must already be set}"
cd /home/tedz/minecraft-ai/bedrock-native/experiment
ALICE_BEDROCK_CLIENT_MODE=legacy-native-injected npm run production
```

### Mac dashboard — restart only its own foreground process

```bash
cd ~/Documents/workspace/hero-skills
bash games/minecraft-ai/scripts/run-dashboard.sh
```

Open `http://127.0.0.1:8788/#world`. Expected: Alice coordinates update near 1Hz; terrain position follows her; camera rotates/zooms; roof cutaway toggles; visible entities and filtered AI log timeline; server-own location explicitly unknown if no correction packet; turning Alice off makes page offline within 12 seconds. Cross-check an actual physical movement with BDS `querytarget` before marking real movement observed.

## Known limitations / next iteration

This is not a pixel-identical Bedrock graphical client or server-authoritative movement playback. Client-side local physics prediction may show motion absent in the server. No full block shape/texture assets, animals/players skin textures, lighting, cave occlusion model, arbitrary spectator free-cam, world editing, recording, or saving history yet. An 11x11x8 cache is intentionally small; performance can be measured before expanding it. Do not expand sampling range blindly, fetch world LevelDB, expose BDS remote console or request another Xbox login. The unrelated `MaxListenersExceededWarning`, Bedrock noPath and retreat safety issues remain separate open items.

## Handoff

Existing movement context and BDS acceptance: `docs/HANDOFF_2026-10-19_MOVEMENT.md`. Update both docs with real Mint results if problems arise. If there is no real in-game evidence, keep this viewer marked `staged` in `dashboard/catalog.json`.
