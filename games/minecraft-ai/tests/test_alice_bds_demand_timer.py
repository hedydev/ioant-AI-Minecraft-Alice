"""Pure, offline tests for bounded on-demand Alice BDS witness timer."""
import importlib.util, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
SOURCE=Path(__file__).resolve().parents[1]/"scripts"/"alice-bds-demand-timer.py"
spec=importlib.util.spec_from_file_location("alice_bds_demand_timer",SOURCE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class DemandTimerTests(unittest.TestCase):
    def test_budget_same_hour_and_reset_next_hour(self):
        m.selftest()
        old={"version":1,"hour":20,"used":40,"lastBatch":72000}
        self.assertEqual(m.budget_value(72100,old)["used"],40)
        self.assertEqual(m.budget_value(75601,old)["used"],0)
    def test_spread_existing_40_hourly_budget_across_hour(self):
        # A 60-second systemd timer must not burn 40 calls in 20 minutes.
        start=7201
        b=m.budget_value(start)
        self.assertTrue(m.budget_allows_batch(start,b))
        b["used"]=2
        b["lastBatch"]=start
        self.assertFalse(m.budget_allows_batch(start+60,b))
        self.assertFalse(m.budget_allows_batch(start+179,b))
        self.assertTrue(m.budget_allows_batch(start+180,b))
        self.assertFalse(m.budget_allows_batch(start+360,{**b,"used":40}))
        self.assertEqual(m.MAX_HOURLY,40)
        self.assertEqual(m.SUSTAINED_BATCH_SECONDS,180)

    def test_hour_rollover_preserves_pacing_and_stalled_cooldown(self):
        b={"version":1,"hour":1,"used":38,"lastBatch":7150,
           "trackedLoginAt":6500,"trackedTravel":66.04,
           "stalledPairs":3,"pauseUntil":7550}
        after=m.budget_value(7201,b)
        self.assertEqual(after["hour"],2)
        self.assertEqual(after["used"],0)
        self.assertEqual(after["lastBatch"],7150)
        self.assertEqual(after["stalledPairs"],3)
        self.assertFalse(m.budget_allows_batch(7201,after))
        self.assertTrue(m.refresh_stall_state(after,{"movementEvidence":{
            "loginAt":6500,"independentTravelBlocks":66.04}},7201))
        self.assertFalse(m.refresh_stall_state(after,{"movementEvidence":{
            "loginAt":6500,"independentTravelBlocks":66.04}},7551))
        self.assertEqual(after["pauseUntil"],7550)
        self.assertTrue(m.budget_allows_batch(7551,after))

    def test_legacy_hour_rollover_budget_retains_last_batch(self):
        previous={"version":1,"hour":3,"used":40,"lastBatch":14390}
        after=m.budget_value(14401,previous)
        self.assertEqual(after["used"],0)
        self.assertEqual(after["lastBatch"],14390)
        self.assertFalse(m.budget_allows_batch(14401,after))
        self.assertTrue(m.budget_allows_batch(14570,after))
    def test_budget_bounded_and_invalid(self):
        self.assertFalse(m.consume_budget(72000,{"version":1,"hour":20,"used":40,"lastBatch":0}))
        with self.assertRaises(ValueError):
            m.budget_value(72000,{"version":1,"hour":20,"used":True,"lastBatch":0})
    def test_only_real_autonomy_witness_demand_triggers(self):
        x={"state":"IDLE","connected":True,"sessionEstablished":True,"health":20,
           "settings":{"autonomyEnabled":True,"agentMode":"autonomous"},
           "worldRoutine":{"idleGate":"position_witness_unverified"},
           "movementEvidence":{"loginAt":100,"awaitingVerifiedRespawn":False,
             "witnessDemand":{"state":"needs_two_fresh_samples","positionGateSatisfied":False}}}
        self.assertTrue(m.demand_now(x))
        self.assertFalse(m.demand_now({**x,"state":"COMBAT"}))
        self.assertFalse(m.demand_now({**x,"health":12}))
        self.assertFalse(m.demand_now({**x,"settings":{"autonomyEnabled":False,"agentMode":"autonomous"}}))
        self.assertFalse(m.demand_now({**x,"worldRoutine":{"idleGate":"human_grace_period"}}))
        # The live 17879 original-world audit observed IDLE/eligible_for_work
        # while independent proof had expired. This is not "no demand".
        self.assertTrue(m.demand_now({**x,"worldRoutine":{"idleGate":"eligible_for_work"}}))
        for reason in ("follow_intent","human_stop","job_active","threat_nearby",
                       "post_threat_window","work_cooldown","companion_mode",
                       "startup_observation_pending"):
            self.assertFalse(m.demand_now({**x,"worldRoutine":{"idleGate":reason}}))
        self.assertFalse(m.demand_now({**x,"movementEvidence":{
          "loginAt":100,"witnessDemand":{"state":"client_server_diverged",
          "positionGateSatisfied":False}}}))
    def test_repeated_verified_pairs_without_bds_travel_back_off(self):
        d={"movementEvidence":{"loginAt":1234,"independentTravelBlocks":0.0}}
        b=m.budget_value(3601)
        self.assertFalse(m.refresh_stall_state(b,d,3601))
        with patch.object(m,"private_write"):
            for i in range(3):
                m.record_verified_stationary_pair(b,d,3601+i*60)
        self.assertEqual(b["stalledPairs"],3)
        self.assertTrue(m.refresh_stall_state(b,d,4000))
        self.assertEqual(b["pauseUntil"],3601+2*60+600)
        self.assertFalse(m.refresh_stall_state(b,d,4400))
        self.assertEqual(b["used"],0)
    def test_trusted_server_travel_or_new_login_clears_stall(self):
        d={"movementEvidence":{"loginAt":1234,"independentTravelBlocks":10.0}}
        b=m.budget_value(3601)
        m.refresh_stall_state(b,d,3601)
        with patch.object(m,"private_write"):
            for i in range(3):m.record_verified_stationary_pair(b,d,3601+i*60)
        self.assertTrue(m.refresh_stall_state(b,d,3800))
        d["movementEvidence"]["independentTravelBlocks"]=10.4
        self.assertFalse(m.refresh_stall_state(b,d,3800))
        self.assertEqual(b["stalledPairs"],0)
        d["movementEvidence"]["loginAt"]=2222
        self.assertFalse(m.refresh_stall_state(b,d,3801))
        self.assertEqual(b["trackedLoginAt"],2222)
    def test_unverified_position_cannot_create_or_clear_stall(self):
        d={"movementEvidence":{"loginAt":1234}}
        b=m.budget_value(3601)
        self.assertFalse(m.refresh_stall_state(b,d,3601))
        with patch.object(m,"private_write") as wrote:
            m.record_verified_stationary_pair(b,d,3601)
            wrote.assert_not_called()
        self.assertNotIn("stalledPairs",b)
    def test_no_continuous_legacy_loop_or_live_binding_in_selftest(self):
        source=SOURCE.read_text()
        self.assertNotIn('["--loop"]',source)
        self.assertIn('MAX_HOURLY = 40',source)
        self.assertIn('OnUnitActiveSec=60s',source)
    def test_live_owner_must_have_fresh_heartbeat_and_publisher_timestamp(self):
        text=SOURCE.read_text()
        self.assertIn('s.get("heartbeatFresh") is not True',text)
        self.assertIn('nowms-updated>10000',text)
        self.assertIn('time.time()-mtime>10',text)

if __name__=='__main__':
    unittest.main()
