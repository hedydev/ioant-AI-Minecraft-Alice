"""v2 Script API probe never starts host-bound BDS and preserves strict gates."""
import importlib.util
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import Mock

S=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(S))
sp=importlib.util.spec_from_file_location('v2_netns_probe',S/'alice-bds-v2-probe.py')
M=importlib.util.module_from_spec(sp);sp.loader.exec_module(M)
class V2ProbeTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup)
        self.home=Path(t.name);self.lab=self.home/'minecraft-bedrock-alice-lab-v2'
        self.lab.mkdir()
        (self.lab/'.alice-sandbox.json').write_text('{"labGeneration":"fresh-isolated-v2"}')
    def test_restricts_to_named_netns_modes_and_exact_v2(self):
        p=Mock();p.run_action.return_value=('ready_for_isolated_lab_probe',{})
        for mode in ('netns-check','netns-probe','netns-postmortem'):
            M.run(mode,home=self.home,probe_module=p)
            p.run_action.assert_called_with(mode,lab=self.lab)
        with self.assertRaisesRegex(ValueError,'invalid_action'):
            M.run('probe',home=self.home,probe_module=p)
        with self.assertRaisesRegex(ValueError,'invalid_action'):
            M.run('check',home=self.home,probe_module=p)
    def test_guard_failure_propagates_not_reclassified_success(self):
        p=Mock();p.run_action.side_effect=ValueError('bds_cwd_requires_privileged_read')
        with self.assertRaisesRegex(ValueError,'bds_cwd_requires_privileged_read'):
            M.run('netns-probe',home=self.home,probe_module=p)
    def test_original_host_mode_untouched_and_v2_beta_gate_verified(self):
        src=(S/'alice-bds-lab-probe.py').read_text()
        self.assertIn('def run_action(mode, *, lab=None):',src)
        self.assertIn('gate, lab = beta_gate(lab=lab)',src)
        self.assertIn("candidate.parent != Path.home()",src)
        self.assertIn('network_namespace=True',src)
        self.assertIn('def postmortem_gate(*, lab=None):',src)
        self.assertIn('module.require_eligible()',src)
    def test_no_bypass_of_one_shot_or_sudo(self):
        src=(S/'alice-bds-v2-probe.py').read_text()
        self.assertNotIn('subprocess.',src)
        self.assertNotIn('sudo -',src)
        self.assertNotIn('runCommand',src)
        self.assertIn('netns-probe',src)
        self.assertIn('strict_v2_lab',src)
if __name__=='__main__':unittest.main()
