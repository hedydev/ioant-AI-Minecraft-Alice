import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('alice_mcsm_readonly',ROOT/'scripts'/'alice-mcsm-readiness-readonly.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class McsmReadinessTests(unittest.TestCase):
    def test_only_readonly_config_outputlog_and_service_probe(self):
        m.selftest()
        self.assertIn("command('--diagnose')",m.REMOTE)
        self.assertNotIn("command('--once')",m.REMOTE)
        self.assertNotIn("command('--loop')",m.REMOTE)
    def test_invalid_remote_result_is_rejected(self):
        sample={'config':'valid','outputlog':'readable','legacyLoopService':'not_active'}
        self.assertEqual(m.validate(sample),sample)
        self.assertIsNone(m.validate({**sample,'legacyLoopService':'enabled'}))
        self.assertIsNone(m.validate({**sample,'config':'invalid_or_unavailable'}))
    def test_ssh_unavailable_cannot_claim_instance_or_source(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(m.subprocess,'run',side_effect=OSError('unavailable')):
                m.check(Path(d))
            data=json.loads((Path(d)/'mcsm_readiness.json').read_text())
            self.assertEqual(data['state'],'unavailable')
            self.assertFalse(data['instanceIdentityProven'])
            self.assertFalse(data['sourceActiveProven'])
            self.assertFalse(data['bdsCommandSent'])
if __name__=='__main__':unittest.main()
