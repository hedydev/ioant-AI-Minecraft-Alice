import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import json

SOURCE=Path(__file__).resolve().parents[1]/'scripts'/'alice-isolated-bds-readiness.py'
spec=importlib.util.spec_from_file_location('alice_isolated_bds_readiness',SOURCE)
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class IsolatedBdsReadinessTests(unittest.TestCase):
    def sample(self):
        return {'memMiB':{'MemTotal':15200,'MemAvailable':6000,'SwapFree':0},
         'load1':1.3,'cpuLogical':4,'diskFreeGiB':90.0,
         'candidateUdp':{'testIPv4_17882':'not_observed',
                         'testIPv6_27882':'unknown'},
         'existingLabNames':{k:False for k in lab.LABS}}
    def test_bounds_and_fail_closed(self):
        value=self.sample()
        self.assertEqual(lab.validate(value),value)
        self.assertIsNone(lab.validate({**value,'cpuLogical':True}))
        self.assertIsNone(lab.validate({**value,'candidateUdp':{'testIPv4_17882':'available',
                    'testIPv6_27882':'not_observed'}}))
        self.assertIsNone(lab.validate({**value,'existingLabNames':{}}))
    def test_no_network_evidence_cannot_fake_available_or_create_world(self):
        lab.selftest()
        self.assertNotIn('socket.bind',lab.REMOTE)
        self.assertNotIn('subprocess.run',lab.REMOTE)
        self.assertNotIn('mkdir',lab.REMOTE)
        self.assertNotIn('write_text',lab.REMOTE)
    def test_ssh_failure_returns_unverified_not_a_successful_capacity_claim(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.object(lab.subprocess,'run',side_effect=OSError('ssh unavailable')):
                lab.check(Path(root))
            report=json.loads((Path(root)/'isolated_bds_capacity.json').read_text())
            self.assertEqual(report['state'],'unverified')
            self.assertIsNone(report['observation'])
            self.assertFalse(report['portAvailabilityProven'])
            self.assertFalse(report['bdsStarted'])
if __name__=='__main__': unittest.main()
