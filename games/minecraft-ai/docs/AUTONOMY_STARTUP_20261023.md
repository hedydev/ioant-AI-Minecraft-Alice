> Operator commands in this dated report are historical. Use [OPERATIONS.md](OPERATIONS.md) and the maintained project scripts for current start/restart/deploy operations. The commits described here are now pushed.

# Alice startup autonomy repair — 2026-10-23

## Outcome and evidence

Final Mint process: 2906332, started with the preceding process's production environment retained in memory; no credentials were printed or saved to a new environment file. Only Alice restarted. BDS, worlds, authentication cache and learning history were preserved.

| Final live event (UTC+8) | Elapsed from spawn | Evidence |
| --- | ---: | --- |
| 02:24:03.042 spawn confirmed | 0ms | private acceptance journal |
| 02:24:03.142 durable resource objective revalidated | 100ms | LEARN_WEAPON / ACQUIRE_WOOD |
| 02:24:03.143 position prerequisite wait | 101ms | scout_bds_position_unavailable |
| 02:24:13.177 SCOUT selected after readiness | 10.135s | DISCOVER_RESOURCES |
| 02:24:16.307 exploration started | 13.265s | action_started |
| 02:24:17.344 explicit dependency hold | 14.302s | scout_client_server_position_diverged |

At the later read: independent samples 25, BDS travel **0**, client feet approximately (-0.54,68,0.6), BDS feet (0.5,69,0.5). This delivery verifies prompt decisions and correct waiting/recovery classification. It **does not** verify physical movement, harvest or building. Actual movement remains a separate P0; restarting repeatedly is not a repair for it.

Confirmed causes corrected:

1. Startup assigned a fictitious recent human-command time, imposing 20s grace.
2. Startup could spend the 120s action cooldown on incomplete landing/terrain observations.
3. GATHER navigation evidence failures became unclassified wood-site failures; returned EXPLORE evidence rejections likewise became probe-site failures.
4. The manually run witness had stopped (~39-minute-old sample). It now runs as a systemd user service with restart on failure, independent of its original terminal.

The readiness check chooses an objective immediately; after that, the existing five-second loop checks dependencies. Recovered evidence makes work eligible without waiting the ordinary action cooldown. This is an observation cadence, not permission to send repeated blind movements. Existing safety, real human grace, STOP/FOLLOW and model budgets remain intact. Historical memories are retained.

Validation: 4 selected regressions fail against original HEAD; updated runtime 130/130, Mint Node24 full suite 531/531, Python suite 72 tests passing with 3 existing skips. Dashboard JavaScript syntax and dedicated Python tests checked separately. No new logging stack: fixed reason codes use the existing bounded acceptance journal and live status.

## Current operation — Mint bash

Already installed and running; these commands inspect it without another restart:

```bash
systemctl --user is-active alice-bds-position-witness.service
journalctl --user -u alice-bds-position-witness.service -n 8 --no-pager
python3 - <<'PY'
import json,pathlib
r=pathlib.Path.home()/'.alice-bedrock-control'
s=json.loads((r/'status.json').read_text())
m=s.get('movementEvidence') or {}
print(json.dumps({'connected':s.get('connected'),'state':s.get('state'),
 'goal':s.get('longTermGoal'),'hold':(s.get('worldRoutine') or {}).get('idleHold'),
 'serverTravel':m.get('travelBlocks'),'samples':m.get('independentSamples'),
 'clientFeet':s.get('position'),'serverFeet':m.get('latestFeet')},ensure_ascii=False,indent=2))
PY
```

The original foreground Alice terminal has exited. The new process uses the original environment and writes its private console output to `~/.alice-bedrock-control/operator-autonomy-8456a7e9-final.log`. The bounded canonical timeline remains `~/.alice-bedrock-control/acceptance/events.jsonl`. Do not publish console output containing authentication prompts.

## Re-deploy this change — Mac zsh

The delivery is already deployed; use this only when deploying again. Inspect local changes before any Git synchronization. The task's implementation is committed locally; a pull cannot substitute for transferring an unpushed local commit.

```bash
cd ~/Documents/workspace/hero-skills
git status --short
git log -1 --oneline
python3 -m unittest discover -s games/minecraft-ai/tests -v
: "${ALICE_MINT_SSH_TARGET:?Set to your configured Mint SSH destination}"
rsync -av --backup --suffix=.before-startup-redeploy \
  games/minecraft-ai/bedrock-native/experiment/src/{runtime,autonomy_readiness}.cjs \
  "${ALICE_MINT_SSH_TARGET}:~/minecraft-ai/bedrock-native/experiment/src/"
rsync -av --backup --suffix=.before-startup-redeploy \
  games/minecraft-ai/bedrock-native/experiment/test/runtime.test.cjs \
  "${ALICE_MINT_SSH_TARGET}:~/minecraft-ai/bedrock-native/experiment/test/"
rsync -av games/minecraft-ai/scripts/install-bds-witness-service.sh \
  "${ALICE_MINT_SSH_TARGET}:~/minecraft-ai/scripts/"
```

The Mac dashboard serves its source directly; refresh the page after updating `dashboard/app.js` and `catalog.json`. It needs no BDS or Nginx restart.

## Validate, then restart only Alice — Mint bash

Run in the original production-configured shell. The guards below intentionally refuse to invent the existing manifest or login/connection settings. Do not copy authentication material into commands or logs.

```bash
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
cd ~/minecraft-ai/bedrock-native/experiment
node --version
npm test &&
sh ~/minecraft-ai/scripts/install-bds-witness-service.sh --check &&
sh ~/minecraft-ai/scripts/install-bds-witness-service.sh
```

After tests pass, verify the original shell retains the production configuration **before** stopping its current Alice:

```bash
: "${ALICE_BEDROCK_BACKUP_MANIFEST:?Use the original production-configured shell}"
test -f "$ALICE_BEDROCK_BACKUP_MANIFEST" || exit 1
test "${ALICE_BEDROCK_PRODUCTION_CONFIRM:-}" = I_ACCEPT_WORLD_CHANGES || exit 1
: "${ALICE_BEDROCK_CLIENT_MODE:?Preserve the original connection mode}"
python3 - <<'PY'
import json,pathlib,os,signal,time
r=pathlib.Path.home()/'.alice-bedrock-control'
f=r/'active-alice-client.lock/owner.json'
o=json.loads(f.read_text());p=pathlib.Path('/proc')/str(o['pid'])
a=p.joinpath('cmdline').read_bytes().split(b'\0')
assert pathlib.Path(os.fsdecode(a[0])).name=='node'
assert a[1:3]==[b'src/main.cjs',b'--production-start']
assert json.loads(f.read_text())==o
os.kill(o['pid'],signal.SIGINT)
for _ in range(100):
    if not p.exists():break
    time.sleep(.2)
else:raise SystemExit('Alice has not exited; do not start another client')
assert not f.exists(), 'Login lock remains; do not start another client'
PY
# The production check verifies BDS logout too; only start when it passes.
npm run production:check && npm run production
```

Do not restart BDS, delete login locks, clear authentication, teleport Alice or erase learning to make a failed check pass. Later invocations must retain the original Xbox/Ollama/input compatibility environment, not just the three checked variables above.

## Recovery

The deployment saved the original runtime as `src/runtime.cjs.pre-autonomy-8456a7e9` and its original test as `test/runtime.test.cjs.pre-autonomy-8456a7e9`. For code rollback, stop only Alice using the ownership checks above, copy those two backups over their corresponding files, then run tests and the guarded production start. The new helper may remain unused. Keep the working read-only witness running. Do not overwrite current code while another development task is modifying it.

`sh ~/minecraft-ai/scripts/install-bds-witness-service.sh --check` is read-only. Default installation writes only the named user unit, reloads user units and enables/starts that witness. A different existing unit is preserved and installation fails. If deliberately removing this service, `systemctl --user disable --now alice-bds-position-witness.service` stops witness updates and therefore blocks protected navigation; it does not modify BDS or worlds.
