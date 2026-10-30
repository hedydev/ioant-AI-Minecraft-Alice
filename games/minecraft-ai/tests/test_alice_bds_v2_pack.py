"""v2 pack tool must retain prior root-BDS process guard, not bypass it."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock,patch

SCRIPTS=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(SCRIPTS))
spec=importlib.util.spec_from_file_location('v2_pack_wrapper',SCRIPTS/'alice-bds-v2-pack.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)

class V2PackAdmissionTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        self.home=Path(temp.name)
        self.lab=self.home/M.V2
        self.lab.mkdir()
        (self.lab/'.alice-sandbox.json').write_text(json.dumps({
          'version':1,'kind':'alice-disposable-bedrock-lab',
          'labGeneration':'fresh-isolated-v2','port':17880,'world':'Bedrock level'}))
    def test_only_fresh_v2_marker_allowed(self):
        self.assertEqual(M.strict_v2_lab(self.home),self.lab)
        marker=self.lab/'.alice-sandbox.json'
        marker.write_text(json.dumps({'labGeneration':'legacy'}))
        with self.assertRaisesRegex(ValueError,'v2_generation_mismatch'):
            M.strict_v2_lab(self.home)
        marker.unlink()
        marker.symlink_to(self.home/'outside')
        with self.assertRaisesRegex(ValueError,'v2_lab_marker_unavailable'):
            M.strict_v2_lab(self.home)
    def test_never_weakens_pack_or_process_gate(self):
        base=Mock()
        base.inspect.return_value='ready_for_new_lab_only_pack'
        base.stage.return_value='lab_pack_staged_without_beta_or_network'
        self.assertEqual(M.action('check',home=self.home,loader=lambda:base),
                         'ready_for_new_lab_only_pack')
        self.assertEqual(base.LAB,self.lab)
        base.stage.side_effect=ValueError('bds_cwd_requires_privileged_read')
        with self.assertRaisesRegex(ValueError,'bds_cwd_requires_privileged_read'):
            M.action('stage',home=self.home,loader=lambda:base)
        base.stage.assert_called_once()
    def test_check_does_not_stage_and_requires_real_eligibility(self):
        base=Mock()
        base.inspect.side_effect=ValueError('lab_bds_is_running')
        with self.assertRaisesRegex(ValueError,'lab_bds_is_running'):
            M.action('check',home=self.home,loader=lambda:base)
        base.stage.assert_not_called()
        self.assertIn('module.inspect()', (SCRIPTS/'alice-bds-v2-pack.py').read_text())
    def test_no_sudo_or_live_server_entry(self):
        body=(SCRIPTS/'alice-bds-v2-pack.py').read_text()
        self.assertNotIn('subprocess.',body)
        self.assertNotIn('runCommand',body)
        self.assertNotIn('bedrock_server',body)
        self.assertNotIn('sudo -',body)
        self.assertIn('module.stage()',body)
        self.assertIn('fresh-isolated-v2',body)
if __name__=='__main__':unittest.main()
