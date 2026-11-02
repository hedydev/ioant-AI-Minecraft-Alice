# Coordinate evidence review

## 2026-11-02 — Coordinate acceptance review: navigation freshness is not the observer window

Actual revision56 receipts were independently read, not replayed. PID2472609 publishes activityGuardVersion1, so the earlier activity guard is loaded. `alice_accept_natural_witness_20261102_v08` has835 observations:828 bds_pair_unverified,7 sample_time_skew,zero close-time comparison windows. By classifier control flow, the seven skew readings passed fresh/current-life BDS-pair and client-timestamp checks, then failed the stricter1000ms cross-sample diagnostic filter. This does NOT prove no4-second navigation window existed. The separate same-session ACK in v13 has ackGateAtWrite=true, proving scoutStartProof passed at least once, not proving a route started or succeeded.

The original navigation gate remains two independent samples within4s and local distance<=0.75. The diagnostic additionally requires position/BDS timestamp skew<=1000ms. A pure current-source regression demonstrates zero distance and1500ms skew: navigation proof passes but the observer yields sample_time_skew/null distance. That is a documented conservative diagnostic distinction, not grounds to relax it or fabricate a coordinate result. `bds_position_witness.py` intentionally timestamps at command issue, not late result arrival, so output/ingestion delay consumes the original freshness budget. Do not renew timestamps.

The1.21-block navigation rejection is real historical evidence at a guarded call, not proof of persistent current error. Later v16 has a65.899-second-old sample and clientBdsDistance=null. The cumulative independent server travel2.46 is distinct from the latest stationary pair0; neither identifies a successful requested route. Prior stationary0.00 windows on PID1924898 never accepted all moving behavior or the newPID.

Extended only the maintained read-only model/navigation log inspector to export fixed current-process-tail witness handoff outcomes, idle-mirror deferrals and prepared-route admission counts. It reads existing logs only, emits no coordinates/raw lines, does not query BDS, move, alter physics/TTL/gates or restart/sync the Alice process. Uses the existing committed task and connection binding; no new remote script install is needed. New parser tests cover chronological reason selection, unknown/malformed values and quoted marker rejection. Runtime readback is recorded below after the exact committed task finishes.

Use the existing `.openclaw/tasks/alice_model_navigation_log_readonly_20261101.json` through OpenClaw `repository_task`, `workspace_mode=current`, pinned full current commit and one new diagnostic operation ID. Poll the same ID and fetch `model_nav`; do not repeat an uncertain task. Only current log-tail counters and last fixed enums are returned; absent/old messages are not precise event-time correlation and do not prove the entire navigation root cause.

Mac local self-check (no remote operation):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Minecraft-Alice"
PYTHONDONTWRITEBYTECODE=1 python3 games/minecraft-ai/scripts/alice-model-navigation-log-readonly.py --self-test
node --test games/minecraft-ai/bedrock-native/experiment/test/inspect_reconciliation_runtime.test.cjs
```

No Alice/BDS restart is needed for this read-only operator script. Do not deploy any client runtime or increase query frequency to make the diagnostic pass. Actual movement synchronization remains unaccepted until independent post-input BDS evidence matches the intended outcome.

## First real log check and time-scoped journal follow-up

Actual MCP `alice_coord_handoff_20261102_k4n8v2cs_a1` atf790374 passed both read-only steps, exported nonempty model_nav (1274bytes, SHA352cbec05387e291430f7e349f59140b1716d5e6f85160a2812354a2b381b087). Current owner is healthyIDLE, independent samples19, latest historical navigation rejection1.17 blocks, six rejections, zero endpoint outcomes. The250KB stdout tail had zero exact witness/mirror-deferral/prepared-admission markers; that is missing context, NOT proof callbacks never ran.

Existing read-only load audit `alice_coord_main_load_20261102_k4n8v2cs_a2` also passed: connected/current heartbeat, process under1hour and main-file source mtime precedes process start. This falsifies a simple “forgot to reload the current project main file” explanation, without claiming a cryptographic loaded-code hash.

The maintained inspector now also reads at most five already-existing private acceptance journal segments (each<=1MiB), filters timestamps to the current verified process/login/life and exact fixed event kinds, and exports only enum/count summaries. This can recover witness reasons lost from the250KB stdout tail. Previous-life/future/quoted/malformed records are excluded. No source deployment, client restart or game interaction is required. The new journal parser has6 focused Python tests; runtime readback follows the committed task.

Actual committed journal task `alice_coord_journal_20261102_k4n8v2cs_a3` passed (SHAf4b85c3c85ff6f20fc45be8103fbca72a6752a3716b116d188d3bb7af3cb4d26). Current-life journal shows24 witness handoffs,last=idle_started;25 mirror deferrals,last=already_aligned;6 prepared-route admissions. The shorter stdout tail showszero for the same categories, demonstrating its coverage limit. This disproves “no witness/navigation admission ever happened”, but does not establish a successful route endpoint. Historical guard rejection is now0.94; current expired-sample subtraction remains unqualified.

Source review also found the old scoutOutcomeCount searched for nonexistent `[Alice exploration] endpoint outcome:` while runtime writes `endpoint feedback:`. The maintained inspector now counts the real label and separately summarizes confirmed/unverified endpoint feedback and fixed waypoint-failure reasons/local progress from existing journals, without exporting waypoint coordinates. This fixes diagnostic false negatives only; no navigation/physics behavior changed. Focused parser tests now7/7.
