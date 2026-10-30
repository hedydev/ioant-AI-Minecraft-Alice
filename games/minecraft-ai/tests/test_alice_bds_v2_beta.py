"""v2 Beta NBT wrapper preserves strict existing process and pack checks."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock

HERE=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(HERE))
sp=importlib.util.spec_from_file_location('alice_v2_beta','/'.join([str(HERE),'alice-bds-v2-beta.py']))
M=importlib.util.module_from_spec(sp);sp.loader.exec_module(M)

class V2BetaOperatorTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.home=Path(self.temp.name)
        self.lab=self.home/'minecraft-bedrock-alice-lab-v2'
        self.lab.mkdir()
        (self.lab/'.alice-sandbox.json').write_text(
            '{"labGeneration":"fresh-isolated-v2"}')
    def test_reviewed_beta_gate_receives_only_exact_v2_path(self):
        b=Mock()
        b.action.side_effect=lambda mode:(b.pack_guard(), 'ready_for_lab_only_beta_enable')[1]
        result=M.action('check',home=self.home,beta=b)
        self.assertEqual(result,'ready_for_lab_only_beta_enable')
        b.pack_guard.assert_called_once_with(lab=self.lab)
        self.assertIsNotNone(b.pack_guard)
    def test_failed_process_gate_propagates_without_nbt_write(self):
        b=Mock()
        def refuse(*,lab):
            raise ValueError('bds_cwd_requires_privileged_read')
        b.pack_guard.side_effect=refuse
        b.action.side_effect=lambda mode:b.pack_guard()
        with self.assertRaisesRegex(ValueError,'bds_cwd_requires_privileged_read'):
            M.action('enable',home=self.home,beta=b)
    def test_malformed_or_not_v2_marker_refuses_before_beta_action(self):
        b=Mock()
        (self.lab/'.alice-sandbox.json').write_text('{"labGeneration":"legacy"}')
        with self.assertRaisesRegex(ValueError,'v2_generation_mismatch'):
            M.action('enable',home=self.home,beta=b)
        b.action.assert_not_called()
    def test_original_v1_beta_default_gate_is_preserved(self):
        s=(HERE/'alice-bds-lab-beta.py').read_text()
        self.assertIn('def pack_guard(*, lab=None):',s)
        self.assertIn('module.require_eligible()',s)
        self.assertIn('candidate.name != "minecraft-bedrock-alice-lab-v2"',s)
        self.assertIn('module.LAB = candidate',s)

if __name__=='__main__':unittest.main()
