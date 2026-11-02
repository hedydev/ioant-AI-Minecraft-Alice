# AliceAI standalone repository — AI instructions

## Approved MCP client lifecycle (2026-11-03)

For an explicitly user-authorized Alice-only restart, use the original approved
`.openclaw/tasks/alice_17879_client_restart.json` via OpenClaw Mac repository_task,
workspace_mode=current and exact current HEAD. Read project_actions first for
approvedLifecycleTasks[name=alice_client_restart].enabled; then poll the same
operation and read alice_restart. No user terminal relay is needed. The bridge
pins separately approved task/script hashes; current owner/world/17879, healthy
IDLE/no-job and final pre-stop safety checks remain mandatory. This does not
override platform review or authorize replay of refused h01/uncertain work. Actual
single replacement and heartbeat/game session acceptance is recorded in
games/minecraft-ai/docs/CLIENT_RESTART_APPROVAL_20261103.md. No BDS/world/auth or
movement protection changes are granted by this lifecycle approval.

Canonical project: `games/minecraft-ai/`. First read:
1. [Project AGENTS](games/minecraft-ai/AGENTS.md)
2. [Current state](games/minecraft-ai/docs/CURRENT_STATE.md)
3. [Operating guide](games/minecraft-ai/docs/OPERATIONS.md)
4. [Capabilities](games/minecraft-ai/docs/CAPABILITIES.md)
5. [Architecture](games/minecraft-ai/docs/ARCHITECTURE.md)

Development rules:
- This standalone repository, **not** `hero-skills/games/minecraft-ai`, owns Alice features, scripts, tests, GUI and project docs. Hero Skills provides shared standards and a pointer only.
- Default branch `main`. Before every GitHub write, fetch exact remote HEAD and target blob SHA, reject concurrent changes, make atomic commits with `AI-Agent: ChatGPT` and `AI-Session`.
- No `git reset`, `clean`, `stash`, branch switch, forced overwrites, lock deletion, Xbox auth cleanup, BDS restart, or world changes without explicit scoped approval.
- Mint live source remains `/home/tedz/minecraft-ai`, BDS is independent under MCSManager, port 17879. Mac through existing `ALICE_SSH_TARGET` uses `games/minecraft-ai/scripts/alice-mac.sh`.
- Treat local physics predictions, packet sends, model suggestions, source commits, and copied files as *not* verified BDS movement, damage, respawn or autonomous success. Require fresh independent server position evidence.
- Keep `scripts/`, project docs, tests and capability catalog in sync for every functional change. No unreviewed background Alice restarts or activation of beta Script API behavior pack.
- Keep data/private files out of Git; never store world DB, player IDs in logs, Xbox tokens, private witness secrets, exported raw acceptance archives or auth files.
