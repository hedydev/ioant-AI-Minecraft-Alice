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
