> Operator commands in this dated report are historical. Use [OPERATIONS.md](OPERATIONS.md) and the maintained project scripts for current start/restart/deploy operations. The commits described here are now pushed.

# Native Bedrock initialization and stable input IDs — 2026-10-23

## Evidence and corrections

1. The production connection uses `legacy-native-injected`. Mineflayer's loader uses the supplied client and skips its Bedrock factory. Therefore its `addClientAuthenticity` listener never runs. Restored the pinned factory's initial loading start, aim-assist clear and loading end once, only on `player_spawn` for protocol 2193. bedrock-protocol retains ownership of player initialization; no second client or dependency patch.
2. The earlier `official_2193` experiment inferred wire IDs from a JSON enum's array order. That was incorrect: the beta JSON omits enum members and supplies no numeric IDs. BDS **1.26.51.1** extracted values confirm the installed 66-entry mapping. Removing three entries made `up` encode as 9 instead of 10, `start_jumping` as 30 instead of 31, and `vertical_collision` as 49 instead of 50. Removed all schema mutation. The existing environment value is accepted as a strict read-only validation alias so the operator's launch environment remains usable; unknown or already-overwritten schema is refused.
3. Outbound audit wrapped the analog compatibility wrapper, so it compared the original zero analog vector against corrected nonzero bytes. All 21 previous moving frames reported a false `analog_mismatch`. New pipeline: compatibility → audit → serializer. Tests preserve detection of genuine byte differences and caller immutability.

Pinned references:

- [Installed Mineflayer factory](https://github.com/Pix3lPirat3/mineflayer/blob/b24015aeeec68a5c94f54444f104f0e563595a30/lib/client/bedrock.js).
- [Stable 1.26.51.1 explicit input IDs](https://github.com/EndstoneMC/protocol-docs/blob/0db6185921974b5aba4a30af33a5eed842dd2cb9/enums/PlayerAuthInputPacketPayload__InputData.json).
- [Stable loading-screen layout](https://github.com/EndstoneMC/protocol-docs/blob/0db6185921974b5aba4a30af33a5eed842dd2cb9/packets/ServerboundLoadingScreenPacket.json).
- [Mojang beta JSON without numeric input IDs](https://github.com/Mojang/bedrock-protocol-docs/blob/v1.26.51/json/PlayerAuthInputData.json).

The rendered Mojang loading packet page also omits Unknown and presents different array positions. Its own separate enum includes Unknown. Do not renumber installed stable protocol fields from presentation indices. Stable BDS dump and pinned implementation agree on Start=1, End=2, absent initial screen ID. Actual installed serializer bytes are `b8 02 02 00` and `b8 02 04 00`.

## Live validation

Mint full Node24 suite: **539/539**, including actual installed factory and codec tests (no skips). Mac Python: 72 tests, 3 existing skips. Dashboard tests are included in that suite and separately rerun.

Only Alice restarted, with the running process's environment retained privately in memory. BDS, world, Xbox authentication, learning memory and witness service were preserved. Final observed process at this stage: 2922015. Log records `stable_bds_2193`, `applied:false`, then `initial_loading_complete_queued`.

At 02:51:53 UTC+8, independent BDS querytarget showed feet **(1.32,69,0.5)**, from login **(0.5,69,0.5)**: **0.82 blocks authoritative travel**, matching the client. Six moving frames matched encoded data, zero mismatches/errors. Weather cleared and the existing night reposition policy initiated this movement itself. This proves accepted movement for this run, not just a local prediction.

The second waypoint was rejected for `navigation_scout_bds_position_unavailable`; the whole route was correctly not marked successful. No verified wood acquisition or construction yet. Fixing initialization and input IDs together establishes combined operational success, not an isolated proof of which change alone was sufficient. The normal later night attempt **completed an independently verified endpoint**: `ok:true`, `serverMovementVerified:true`, `reason:server_verified_scout_endpoint`, target (1,69,2), observed server movement 1.21 blocks during that task. At 02:55:15, cumulative BDS travel was 3.02 blocks, feet (1.49,69,2.41), 80 independent samples, 20 matching moving frames and zero mismatches. No guard loosening or forced action was used. Wood/build acceptance remains open.

## Operators — Mac zsh

Already deployed and tested by Codex. These commands are for repeat deployment, not required again for the current running instance. Inspect the local commit before syncing; do not reset/stash unrelated files. Fetch/fast-forward only when the intended changes exist on the remote; local committed work has not automatically been pushed.

```sh
cd ~/Documents/workspace/hero-skills
git status --short
git log -2 --oneline
python3 -m unittest discover -s games/minecraft-ai/tests -v
: "${ALICE_MINT_SSH_TARGET:?Set this to the existing Mint SSH target}"
rsync -avc --backup --suffix=.before-initialization-20261023 \
  games/minecraft-ai/bedrock-native/experiment/src/{main,connection_strategy,connection_diagnostics,input_flag_compat,injected_client_initialization,outbound_input_pipeline}.cjs \
  "$ALICE_MINT_SSH_TARGET:~/minecraft-ai/bedrock-native/experiment/src/"
rsync -avc --backup --suffix=.before-initialization-20261023 \
  games/minecraft-ai/bedrock-native/experiment/test/{connection_strategy,input_flag_compat,injected_client_initialization,outbound_input_pipeline}.test.cjs \
  "$ALICE_MINT_SSH_TARGET:~/minecraft-ai/bedrock-native/experiment/test/"
```

For the earlier startup fix, use `AUTONOMY_STARTUP_20261023.md` if it is not already deployed. The dashboard catalog reads from this Mac checkout and refreshes without restarting BDS.

## Operators — Mint bash

```sh
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
cd ~/minecraft-ai/bedrock-native/experiment
node --version
npm test
systemctl --user is-active alice-bds-position-witness.service
```

After tests, stop **only the existing Alice process**, wait for logout and lock release. The current Codex-started process is detached, so do not assume pressing Ctrl+C in an older terminal stops it. Use the supplied operator restart helper, which validates the lock owner, executable, original environment and post-logout production gate. Alternatively use the exact validated PID and launch environment from the running operator session; never launch a second client.

In the original launch shell, if its production environment is still present:

```sh
: "${ALICE_BEDROCK_BACKUP_MANIFEST:?Keep the existing verified backup manifest}"
test -f "$ALICE_BEDROCK_BACKUP_MANIFEST" || exit 1
test "${ALICE_BEDROCK_PRODUCTION_CONFIRM:-}" = I_ACCEPT_WORLD_CHANGES || exit 1
npm run production:check && npm run production
```

Leave the witness running. **Do not restart BDS**, change worlds or clear authentication. Existing `official_2193` environment value now validates without changing numeric IDs; `applied:false` with `stable_bds_2193` is expected.

Read only selected diagnostics:

```sh
python3 - <<'PY'
import pathlib,json
r=pathlib.Path.home()/'.alice-bedrock-control'
s=json.loads((r/'status.json').read_text());a=json.loads((r/'outbound-input-audit.json').read_text())
m=s.get('movementEvidence') or {}
print(json.dumps({'connected':s.get('connected'),'clientFeet':s.get('position'),
 'serverFeet':m.get('latestFeet'),'travel':m.get('travelBlocks'),'samples':m.get('independentSamples'),
 'movingInputs':a.get('movingQueued'),'wireMatched':a.get('wireProbeMatched'),
 'wireMismatches':a.get('wireProbeMismatches'),'hold':(s.get('worldRoutine') or {}).get('idleHold')},indent=2))
PY
```

Rollback: retain `.pre-loading-8456a7e9` and `.pre-loading-flags-8456a7e9` backups. Do not blindly restore the old input mapping while its old opt-in remains enabled: that reintroduces known wrong numeric IDs. A rollback must disable both legacy flag/analog experiments and retain correct 66-entry dependency data; stop only Alice, restore the selected source files, rerun tests and production checks before one replacement client.
