"""Offline-only tests for guarded continuation of a never-started v2 BDS probe."""
import importlib.util
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

S=Path(__file__).resolve().parents[1]/'scripts'
spec=importlib.util.spec_from_file_location('alice_v2_resume',S/'alice-v2-resume-first-probe.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)

class V2ResumeTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        self.lab=Path(temporary.name)/'minecraft-bedrock-alice-lab-v2'
        self.lab.mkdir()
        (self.lab/'.alice-v2-activation-once.lock').write_text(
          'one-shot v2 activation intent\n')
        payload={'audit':'ALICE_V2_INTERACTIVE_ACTIVATION','schemaVersion':1,
          'observedAtUnix':1793383833,'v2Only':True,
          'productionModified':False,'oldV1Modified':False,
          'productionBdsRestarted':False,'aliceRestarted':False,
          'credentialStored':False,'state':'not_verified','stages':M.EXPECTED_STAGES,
          'doNotRepeat':True}
        path=self.lab/'.alice-v2-activation-result.json'
        path.write_text(json.dumps(payload))
        path.chmod(0o600)
        (self.lab/'.alice-v2-activation-once.lock').chmod(0o600)
        self.payload=payload
    def test_only_exact_incomplete_prior_receipt_admitted(self):
        self.assertTrue(M.verify_prior(self.lab))
        self.assertTrue(M.verify_unconsumed(self.lab))
        self.payload['stages'][-1]['step']='netns-probe'
        (self.lab/'.alice-v2-activation-result.json').write_text(json.dumps(self.payload))
        with self.assertRaisesRegex(ValueError,'prior_stages_not_exact'):
            M.verify_prior(self.lab)
    def test_existing_probe_markers_are_preserved_and_block(self):
        for name in M.PROBE_MARKERS:
            file=self.lab/name
            file.parent.mkdir(exist_ok=True,parents=True)
            file.write_text('old attempt')
            with self.assertRaisesRegex(ValueError,'probe_already_attempted_or_ambiguous'):
                M.verify_unconsumed(self.lab)
            file.unlink()
    def test_audit_never_runs_bds_or_sudo(self):
        with patch.object(M,'lab_identity',return_value=self.lab), patch.object(
                M,'external_probe',side_effect=AssertionError('BDS used')), patch.object(
                M.subprocess,'run',side_effect=AssertionError('sudo used')):
            self.assertEqual(M.main(['audit']),0)
        self.assertFalse((self.lab/M.INTENT).exists())
    def test_blocked_precheck_does_not_consume_one_shot(self):
        fake={'state':'blocked','reason':'lab_netns_loopback_unavailable',
              'flags':{'networkNamespacePreflightPassed':False}}
        with patch.object(M,'lab_identity',return_value=self.lab), patch.object(
                M.os,'geteuid',return_value=1000), patch.object(
                M.sys,'stdin',SimpleNamespace(isatty=lambda:True)), patch.object(
                M.subprocess,'run',return_value=SimpleNamespace(returncode=0)), patch.object(
                M,'external_probe',return_value=fake) as called:
            self.assertEqual(M.main(['resume-probe']),0)
        called.assert_called_once_with('netns-check')
        self.assertFalse((self.lab/M.INTENT).exists())
        self.assertFalse((self.lab/M.RESULT).exists())
    def test_success_starts_only_first_probe_after_check(self):
        stages=[]
        def fake(mode):
            stages.append(mode)
            return ({'state':'ready_for_isolated_lab_probe','reason':'none',
                     'flags':{'networkNamespacePreflightPassed':True}}
                    if mode=='netns-check' else
                    {'state':'lab_module_imports_observed','reason':'none',
                     'flags':{'isolatedBdsExited':True,'verifiedScriptModuleLoaded':True}})
        with patch.object(M,'lab_identity',return_value=self.lab), patch.object(
                M.os,'geteuid',return_value=1000), patch.object(
                M.sys,'stdin',SimpleNamespace(isatty=lambda:True)), patch.object(
                M.subprocess,'run',return_value=SimpleNamespace(returncode=0)), patch.object(
                M,'external_probe',side_effect=fake):
            self.assertEqual(M.main(['resume-probe']),0)
        self.assertEqual(stages,['netns-check','netns-probe'])
        self.assertTrue((self.lab/M.INTENT).is_file())
        data=json.loads((self.lab/M.RESULT).read_text())
        self.assertEqual(data['state'],'lab_module_imports_observed')
        self.assertTrue(data['doNotRepeat'])
        self.assertFalse(data['productionModified'])
        with self.assertRaisesRegex(ValueError,'probe_already_attempted_or_ambiguous'):
            M.verify_unconsumed(self.lab)
    def test_untrusted_previous_report_permissions_block(self):
        report=self.lab/'.alice-v2-activation-result.json'
        report.chmod(0o644)
        with self.assertRaisesRegex(ValueError,'prior_receipt_missing_or_unsafe'):
            M.verify_prior(self.lab)
        report.chmod(0o600)
    def test_exec_only_known_v2_command_and_no_shell(self):
        source=(S/'alice-v2-resume-first-probe.py').read_text()
        self.assertIn("'netns-check','netns-probe'",source)
        self.assertNotIn('shell=True',source)
        self.assertNotIn('sudo -S',source)
        self.assertIn("['sudo','-v']",source)
        self.assertIn("['sudo','-k']",source)
        self.assertIn('os.O_EXCL',source)

if __name__=='__main__':unittest.main()
