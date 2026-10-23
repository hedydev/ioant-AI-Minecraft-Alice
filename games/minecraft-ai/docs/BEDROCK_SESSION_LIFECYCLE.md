# Alice Bedrock — session lifecycle and server log preflight (2026-10-20)

## Evidence and scope

Live Mint BDS: `/home/tedz/minecraft-bedrock`, UDP 17879, `online-mode=true`,
`Bedrock level`; Oct 11-running BDS PID 2875730 at the time of diagnosis.
MCSManager pty was PID 2875725, stdout `/dev/pts/6`. The operator identified
the **instance** history under `/opt/mcsmanager/daemon/data/InstanceLog/`:
`a5a0753061f5456e95ef63fad1d5a0fb.log`. These are **observed instance
details, not universal hard-coded application configuration**.

On Oct 19, anonymous Alice audit records:
- 22:11:01 `server_id_conflict`; server reports `Player disconnected`
  at 22:11:06 and new `Player connected` at 22:11:38.
- 22:58:06 and 23:06:13: spawn; BDS prints old disconnection near each
  new connection.
- 23:18:39 spawn; prior server disconnection 23:18:23, connected 23:18:42,
  spawned 23:18:46.
- 23:36:54 `server_id_conflict`, BDS reports player disconnected 23:36:58.

BDS player in logs: `hedygame7231`. **Operator must verify it is Alice's
actual Xbox Gamertag before configuring the guard.** Time correlation alone
does not prove a specific BDS/Microsoft internal rejection condition.

Pinned `Pix3lPirat3/mineflayer@b24015ae` loader `bot.end()` falls back to
`client.close()` for Bedrock, while pinned `bedrock-protocol@3.60.1`
has `client.disconnect(reason)` which writes a disconnect request and
then closes the transport. Previously the autonomous launcher called
`bot.end()` immediately followed by `process.exit(0)`; the chat-only
launcher called `client.disconnect()` followed by `process.exit(0)`.
The local instance lock was released at local `close`, which is not a
server-side logout acknowledgment.

## Implemented (code staged, Mint acceptance pending)

- Both launchers use `bedrock-native/session_lifecycle.cjs`: stop
  controllers once; request `client.disconnect()`; log failures and use
  a bounded local-close fallback only if needed; **never call
  `process.exit(0)` in the normal signal path**.
- Both launchers use an optional, **strict when configured**, read-only
  `server_session_guard.cjs` *before creating any authenticated client*.
  The operator must provide both:
  - `ALICE_BEDROCK_BDS_SESSION_LOG`: exact, readable, non-symlinked file
    inside `/opt/mcsmanager/daemon/data/InstanceLog/`.
  - `ALICE_BEDROCK_BDS_GAMERTAG`: actual verified Bedrock display name.
  It examines the bounded final 1 MiB of fresh (<=30 minutes) BDS output.
  If the most recent matching server `Player connected` or `Spawned`
  remains unpaired by a later `Player disconnected`, it **refuses** login;
  unknown, missing, unreadable, symlinked or stale evidence also refuses
  login. It prints only aggregate status, never XUID, PFID or tokens.
- When both settings are **absent**, historical behavior is preserved and
  the autonomous/old client emits a conspicuous **not configured** warning.
  It does NOT claim that the instance lock proves BDS logout. A partial
  configuration fails closed. The experimental lab 17880 is not guarded
  by this production BDS log.
- The guard does not query BDS authoritative player list, identify the
  MCSManager instance UUID cryptographically, or guarantee Xbox/Microsoft
  session cleanup; an operator must map the log to the correct live server,
  ensure continuity/read permissions, and must not rely on its last-event
  snapshot to prevent a second Xbox login from an unrelated machine.
  Its absence of logged `Player connected` is not necessarily evidence
  of logout. No blind retries or fixed time-based claim of logout.

## Mac source validation and non-destructive deployment

```bash
cd ~/Documents/workspace/hero-skills
git status --short --branch
git pull --ff-only origin main
cd games/minecraft-ai/bedrock-native/experiment
npm test
cd ~/Documents/workspace/hero-skills
rsync -av --exclude='node_modules/' --exclude='__pycache__/' games/minecraft-ai/ tedz@192.168.0.104:~/minecraft-ai/
```

## Mint operator acceptance, without touching BDS/world/auth cache

Verify this is **Alice's** Gamertag; do not configure another player's
name. Confirm the identified file belongs to **bedrock-default** and is
readable as the ordinary `tedz` user (no `sudo` in runtime):

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
export ALICE_BEDROCK_BDS_SESSION_LOG=/opt/mcsmanager/daemon/data/InstanceLog/a5a0753061f5456e95ef63fad1d5a0fb.log
export ALICE_BEDROCK_BDS_GAMERTAG=hedygame7231
test -r "$ALICE_BEDROCK_BDS_SESSION_LOG" || { echo 'BDS log unreadable by tedz; stop'; false; }
cd ~/minecraft-ai/bedrock-native/experiment
npm test
export ALICE_BEDROCK_PROFILE=AliceAI-HedydevGame
export ALICE_BEDROCK_CLIENT_MODE=legacy-native-injected
export ALICE_BEDROCK_PRODUCTION_CONFIRM=I_ACCEPT_WORLD_CHANGES
export ALICE_BEDROCK_BACKUP_MANIFEST="$HOME/minecraft-world-backups/bedrock-default/minecraft-bedrock-20261018T000242906101Z.json"
test -f "$ALICE_BEDROCK_BACKUP_MANIFEST" || exit 1
npm run production:check
```

If log access fails, first inspect `namei -l` and permissions: grant only
the needed single-log read/traversal to the bot's local OS user, never
`chmod -R` the daemon directory and never run Alice under sudo.
A replaced log or MCSManager rotation needs reinspection. The strict guard
is opt-in until exact Mint path, permissions and session correlation pass.

Only after `npm test`, `production:check`, verified absence of an
existing Alice client, and log guard pass, start **one** Alice with
`npm run production`. Use Ctrl+C once; observe client log's
`[Alice shutdown]` and MCSManager's real `Player disconnected`.
Use a single subsequent restart while observing whether guard rejects
a still-online record or permits a genuinely disconnected record.
**Do not restart BDS, delete Xbox cache, alter online-mode, or run another
Alice launcher concurrently.**

## Validation criteria / status

- [x] Static source syntax check of both entrypoints and new modules.
- [ ] Mint Node 24 `npm test` and `production:check`.
- [ ] Confirm `tedz` can read exact live MCSManager BDS log.
- [ ] In real game, verify graceful stop emits observed server disconnection.
- [ ] On an immediately restarted client, guard rejects if server still
      shows connected, and succeeds only after a logged disconnect.
- [ ] Repeated real BDS `server_id_conflict` absence is not yet established.

`MaxListenersExceededWarning` remains a separate open issue.
