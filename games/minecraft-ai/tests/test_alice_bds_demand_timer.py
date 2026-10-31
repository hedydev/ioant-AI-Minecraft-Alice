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
    def test_no_continuous_legacy_loop_or_live_binding_in_selftest(self):
        source=SOURCE.read_text()
        self.assertNotIn('["--loop"]',source)
        self.assertIn('MAX_HOURLY = 40',source)
        self.assertIn('OnUnitActiveSec=60s',source)
if __name__=="__main__":unittest.main()
