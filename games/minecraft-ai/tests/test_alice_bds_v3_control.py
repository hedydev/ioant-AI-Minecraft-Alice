"""No-world-mutation source regression for new v3 control wrapper."""
import importlib.util,json
from pathlib import Path
import tempfile,unittest

S=Path(__file__).resolve().parents[1]/'scripts'
spec=importlib.util.spec_from_file_location('v3_control',S/'alice-bds-v3-control.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)

class V3ControlTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup)
        self.home=Path(t.name)
    def test_check_is_readonly_and_uses_only_named_v3(self):
        class Archive:
            LAB=None
            def operate(self,mode):
                self.mode=mode
                return {'audit':'ALICE_BDS_ARCHIVED_LAB','mode':mode,
                        'labState':'absent','backupRestore':'archive_sha256_isolated_restore_verified',
                        'reason':'ready_for_explicit_lab_prepare',
                        'productionWorldModified':False,'productionBdsRestarted':False,
                        'safeToChangeProductionWorld':False}
        a=Archive()
        r=M.operate('check',home=self.home,archive_module=a)
        self.assertEqual(a.LAB,self.home/M.V3_NAME)
        self.assertFalse(a.LAB.exists())
        self.assertTrue(r['v3Only'])
        self.assertFalse(r['scriptApiInstalled'])
        self.assertFalse(r['betaNbtModified'])
        self.assertFalse(r['bdsStarted'])
    def test_v3_prepared_marker_verified(self):
        class Archive:
            LAB=None
            def operate(self,mode):
                self.LAB.mkdir()
                (self.LAB/'.alice-sandbox.json').write_text(
                    '{"labGeneration":"fresh-isolated-v3"}')
                return {'audit':'ALICE_BDS_ARCHIVED_LAB','mode':mode,
                        'labState':'new_disposable_copy_created_not_started',
                        'backupRestore':'archive_sha256_isolated_restore_verified',
                        'reason':'lab_ready_for_future_beta_test',
                        'productionWorldModified':False,'productionBdsRestarted':False,
                        'safeToChangeProductionWorld':False}
        r=M.operate('prepare',home=self.home,archive_module=Archive())
        self.assertEqual(r['state'],'new_disposable_copy_created_not_started')
        self.assertFalse(r['v2Modified'])
    def test_different_generation_or_symlink_fails_closed(self):
        class Archive:
            LAB=None
            def operate(self,mode):
                self.LAB.mkdir()
                (self.LAB/'.alice-sandbox.json').write_text(
                    '{"labGeneration":"fresh-isolated-v2"}')
                return {'audit':'ALICE_BDS_ARCHIVED_LAB','mode':mode,
                        'labState':'new_disposable_copy_created_not_started',
                        'backupRestore':'archive_sha256_isolated_restore_verified',
                        'reason':'lab_ready_for_future_beta_test',
                        'productionWorldModified':False,'productionBdsRestarted':False,
                        'safeToChangeProductionWorld':False}
        with self.assertRaisesRegex(ValueError,'v3_marker_invalid'):
            M.operate('prepare',home=self.home,archive_module=Archive())
    def test_untrusted_archive_claim_cannot_be_accepted(self):
        class Fake:
            LAB=None
            def operate(self,mode):
                return {'audit':'ALICE_BDS_ARCHIVED_LAB','mode':mode,
                        'labState':'custom','backupRestore':'not_verified',
                        'productionWorldModified':False,
                        'productionBdsRestarted':False,
                        'safeToChangeProductionWorld':False}
        with self.assertRaisesRegex(ValueError,'unverified_archive_contract'):
            M.operate('check',home=self.home,archive_module=Fake())
if __name__=='__main__':unittest.main()
