# AliceAI standalone repository — AI instructions

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
