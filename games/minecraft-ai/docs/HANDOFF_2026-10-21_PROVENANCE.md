# AliceAI — 2026-10-21 server-proof hardening and handoff

## Starting point

Existing `hero-skills/main` already committed the three staged features and most unit tests before this follow-up; reviewed starting HEAD: `b22d52fe42dc93750b6a059de943a53177ce38f4`. Do not replay or overwrite that work.

- Exploration: limited-size, private attempted route memory reduces A/B backtracking. Recent attempts are excluded, not automatically visited. The new contract marks a route confirmed only for successful matching `confirmedEndpoint` **plus** `serverMovementVerified:true` **plus** measured `serverMovedBlocks >= 0.25`.
- Retreat: read-only fully observed collision-shape-aware WALK corridor; only the first adjacent candidate is passed to the bounded Pathfinder. It never permits unknown blocks, digging, jumping, hazards or unchecked support. Local movement is not BDS proof; the command can legitimately refuse to flee.
- Wood/sword: autonomous goals depend on observed natural trunk/canopy, nearby construction veto, observed recipe materials, and an actual inventory item-count increase. Claimed task return or model intent alone is not completion. Never relax build protections to cause an action.

## Validation status

Isolated V8 CommonJS syntax and in-memory `ExplorationProgress` provenance checks passed. Regression tests added for numeric-only and local-only forged success and positive mocked server evidence; full Mint Node24 `npm test`, the Mac Python suite, Bedrock world movement and actual inventory-delta gameplay are **not proven here**. This change did not access the world, BDS, live processes, authentication cache or backup files.

## Mac: inspect, pull, test and source sync

```bash
cd ~/Documents/workspace/hero-skills
git status --short
git pull --ff-only origin main
python3 -m unittest discover -s games/minecraft-ai/tests -v
: "${ALICE_MINT_SSH:?Set user@Mint-LAN-host before source sync}"
rsync -av --exclude node_modules --exclude __pycache__ \
  games/minecraft-ai/ "${ALICE_MINT_SSH}:~/minecraft-ai/"
```

No `--delete`, no world/credential/auth/cache copy. If the Mac repository has conflicting local work, stop before pulling and inspect; never reset/clean/stash.

## Mint: validate, restart only Alice, observe

Stop the **current Alice client** via Ctrl+C in its current terminal first. Do not restart BDS, the Mac dashboard, Paper Alice, or another server. Never launch a second Xbox Alice process. In the same authorized Alice shell, preserving the prior backup manifest, production confirmation and applicable Ollama environment:

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
cd ~/minecraft-ai/bedrock-native/experiment
node --version
node --test test/exploration_progress.test.cjs test/retreat_routes.test.cjs test/resource_opportunity.test.cjs test/runtime.test.cjs test/acceptance_log.test.cjs test/live_control.test.cjs
npm test
: "${ALICE_BEDROCK_BACKUP_MANIFEST:?Use existing verified backup manifest}"
: "${ALICE_BEDROCK_PRODUCTION_CONFIRM:?Explicit live-world approval required}"
npm run production:check
npm run production
```

Preflight/test failures are blockers, not reasons to bypass safety. Console log entries `[Alice exploration] endpoint attempt/feedback`, `[Alice safety] retreat observed result`, `[Alice mission] inventory milestone` are only telemetry. To independently validate movement, compare the Alice entry in **two read-only** BDS console `querytarget @a` results before/after. Observe actual server inventory deltas for wood/sword; no delta means still pending.

## Mac: one-command ZIP

```bash
cd ~/Documents/workspace/hero-skills
: "${ALICE_MINT_SSH:?Set user@Mint-LAN-host}"
bash games/minecraft-ai/scripts/collect-alice-acceptance-mac.sh 1
```

Exports `~/Desktop/AliceAI-Acceptance-YYYYMMDD-HHMMSS.zip` with acceptance samples and disk-source fingerprint comparison. A matching disk hash is not a certificate that a running process loaded those modules. Real supervised BDS acceptance remains open.
