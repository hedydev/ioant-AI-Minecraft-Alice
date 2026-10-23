# Alice Bedrock P0 — authoritative position witness and staged wood gathering (2026-10-21)

## Scope and result classification

This source change is **staged**, not a demonstrated Mint/real-BDS fix. The 2026-10-21 16:40–19:40 acceptance log has 984/984 samples with `serverPackets=0`, 50 unverified exploration segments, 27 autonomous GATHER exceptions (24 `action_timeout`, 3 `unclassified_job_exception`) and zero confirmed logs collected. Packet silence alone is NOT proof that BDS rejected movement.

A credible BDS `querytarget` witness can close the position evidence gap *without forging movement packets*. A separate Python operator process sends only a fixed `querytarget @a[name="..."]` console query through an explicitly selected loopback MCSManager instance and accepts precisely one new server result. No start/stop/restart/gameplay/world edit API is used. Alice reads only a private, bounded 0600 observation file with exact gamertag, owner-only directory, monotonic sample serial, pinned Bedrock uniqueId and <=4s freshness after login. Invalid, missing, repeated or stale evidence fails closed. The writer needs local operator configuration; nothing is enabled automatically or by the LLM.

`movement_evidence.cjs` now exposes both `received` (unchanged Bedrock self-position **packet** count) and `independentSamples`, plus `authoritativeSamples` for the original server-position proof. The original `serverPositionProof` safety bound of >=2 server-origin observations, recent <=5s and <=0.75 client/server feet divergence is preserved. Navigation endpoints also require progress from a position checkpoint. BDS coordinates are eye-space in observed `querytarget` logs and the witness subtracts 1.62 to represent feet; this approximation must be checked against real BDS observation before asserting valid motion or allowing real placements.

**Important trust boundary:** operator-owned same-host private file is trusted operational evidence only when the MCSManager source and gamertag are verified. This is not a cryptographic defense against an adversary controlling the local Unix account. Do not feed LLM-supplied positions into this file; do not grant public dashboard command access. If the panel output cannot be uniquely correlated with the just-issued query, the probe refuses the result. Avoid concurrent manual querytarget commands during attestation.

## Mint read-only sidecar setup (operator-only)

1. Verify an existing MCSManager panel is reachable on Mint's loopback address and determine the **actual** `daemonId`, `instanceId`, Alice's Bedrock **gamertag**, and an operator-controlled API key. If MCSManager is not locally reachable, do not bypass the loopback restriction. No credentials are committed or sent to an AI chat.
2. Existing `~/.alice-bedrock-control` must be a private, owned, nonsymlink directory (0700). Create `bds-witness-apikey.txt` with 0600 permissions and the API key, and `bds-witness-config.json` with 0600 permissions, **locally only**:

```json
{
  "baseUrl": "http://127.0.0.1:23333",
  "daemonId": "REPLACE_WITH_REAL_DAEMON_ID",
  "instanceId": "REPLACE_WITH_REAL_INSTANCE_ID",
  "gamertag": "REPLACE_WITH_REAL_ALICE_GAMERTAG",
  "apikeyFile": "/home/tedz/.alice-bedrock-control/bds-witness-apikey.txt"
}
```

The port above is only an example; never assume the actual panel is on 23333. The key must remain private and is not displayed in console output. Choose a separate least-privilege MCSManager account with rights only to the correct running Bedrock instance if feasible. The MCSManager API sends the key to loopback in a URL because that is the documented API contract.

3. Confirm the configuration with no BDS command:

```bash
python3 ~/minecraft-ai/scripts/bds_position_witness.py --check
```

4. After confirming the expected BDS and sole Alice login, run a **single** opt-in read-only probe:

```bash
python3 ~/minecraft-ai/scripts/bds_position_witness.py --once
```

After operator validation, a dedicated terminal can run `--loop` (2s polling plus command completion time). The process stops with Ctrl+C and never starts/stops the game server. Run this helper separately from Alice (different process, no model-initiated command). If the resulting private record is absent or stale, Alice remains unverified.

Do **not** copy the private key, private config, output or Bedrock world into Git, or restart BDS. The MCSManager commands are a fixed diagnostic query only, not general console control.

## P0 gather execution evidence

`operations.cjs` now reports bounded `[Alice gather] stage:` records, with `stage`, `status`, `reason` and `elapsedMs` only. Stages: `tree_scan`, `pathfinder`, `dig`, `pickup`. Any thrown exception becomes a safe `GatherStageError`, retaining the failing stage and anonymous category; no exception text, stack, coordinates, player identifiers or tokens enter the acceptance journal. `runtime.cjs` reports that stage instead of generic `task_rejected`. Existing 18s navigation, 12s mining, eight 250ms pickup checks, waypoint safety, natural-tree detection and verified inventory delta remain unchanged. No retry frequency or unsafe movement/world edit permission was increased.

The next real Mint acceptance must show whether the 24 historical timeouts are primarily `pathfinder`, `dig`, or `pickup`; do not infer that before an instrumented post-deployment capture.

## Verification (source vs live)

**Isolated:** `node --test test/bds_witness.test.cjs test/gather_stages.test.cjs test/movement_evidence.test.cjs` from `bedrock-native/experiment`; `python3 -m unittest discover -s tests -p 'test_bds_position_witness.py' -v` from `games/minecraft-ai`. Then full Mint Node24 `npm test` and `npm run production:check` with the existing verified backup manifest. Do not alter any established backup manifest or world.

**Real BDS:** verify `witnessStatus=accepted`, `independentSamples>=2`, exact operator console results for the **same Alice gamertag and BDS instance**, no game-world rollback, and 2 distinct BDS XYZ readings corresponding to observed Alice movement. Check server/client <=0.75 feet distance and the target checkpoint, not just `serverPackets`. Exercise a cautious daylight GATHER once; require clear `tree_scan → pathfinder → dig → pickup` milestones, **BDS-confirmed** block change (where practical), and at least +1 actual server-synchronized original log inventory. Failure states must preserve learning data and avoid speculative success. Any absent/mismatched source remains `unknown` and disables world-edit authorization.

This change does not prove or fix underlying Bedrock movement packet acceptance, and does not guarantee that every supported BDS/MCSManager log format produces unambiguous querytarget output. If the isolated tests fail, do NOT deploy/restart Alice; preserve the traceback. If real BDS confirms she is still immobile, diagnose the pinned `player_auth_input` authority/tick path separately.
