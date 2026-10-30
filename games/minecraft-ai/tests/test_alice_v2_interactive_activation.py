"""Deterministic v2 activation workflow: no privileged Python, no retry."""
import importlib.util,json
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace

S=Path(__file__).resolve().parents[1]/'scripts'
sp=importlib.util.spec_from_file_location('v2_activation',S/'alice-v2-interactive-activation.py')
M=importlib.util.module_from_spec(sp);sp.loader.exec_module(M)
FLAGS={
 'pack-stage':{'productionModified':False,'oldV1Modified':False,'labBdsStarted':False,
   'betaNbtModified':False,'secretsInstalled':False,'receiverEnabled':False},
 'beta-check':{'productionWorldModified':False,'oldV1LabModified':False,
   'productionBdsRestarted':False,'labBdsStarted':False,
   'receiverNetworkEnabled':False,'serverModuleVerified':False},
 'beta-enable':{'productionWorldModified':False,'oldV1LabModified':False,
   'productionBdsRestarted':False,'labBdsStarted':False,
   'receiverNetworkEnabled':False,'serverModuleVerified':False},
 'netns-check':{'productionWorldModified':False,'oldV1LabModified':False,
   'productionBdsRestarted':False,'productionWitnessUsed':False,
   'networkNamespaceRequested':True},
 'netns-probe':{'productionWorldModified':False,'oldV1LabModified':False,
   'productionBdsRestarted':False,'productionWitnessUsed':False,
   'networkNamespaceRequested':True}
}
class ActivationTests(unittest.TestCase):
    def report(self,step,state):
        return json.dumps({'audit':M.REPORTS[step],'v2Only':True,
            'state':state,**FLAGS[step]})
    def test_exact_safe_chain_accepts_only_marker_import(self):
        cases=[
          self.report('pack-stage','lab_pack_staged_without_beta_or_network'),
          self.report('beta-check','ready_for_lab_only_beta_enable'),
          self.report('beta-enable','lab_beta_nbt_enabled_backup_preserved_not_started'),
          self.report('netns-check','ready_for_isolated_lab_probe'),
          self.report('netns-probe','lab_module_imports_observed')]
        calls=[]
        def fake(argv,**kwargs):
            calls.append(argv[-1])
            return SimpleNamespace(returncode=0,stdout=cases[len(calls)-1])
        stages,accepted=M.workflow(executor=fake)
        self.assertTrue(accepted)
        self.assertEqual(calls,['stage','check','enable','netns-check','netns-probe'])
        self.assertEqual(len(stages),5)
    def test_blocked_stage_never_executes_beta_or_probe(self):
        calls=[]
        def fake(argv,**kwargs):
            calls.append(argv[-1])
            return SimpleNamespace(returncode=0,
                stdout=self.report('pack-stage','preconditions_failed'))
        stages,accepted=M.workflow(executor=fake)
        self.assertFalse(accepted)
        self.assertEqual(calls,['stage'])
        self.assertEqual(stages[0]['state'],'preconditions_failed')
    def test_report_rejects_host_probing_and_claimed_production_changes(self):
        bad=json.loads(self.report('netns-probe','lab_module_imports_observed'))
        bad['networkNamespaceRequested']=False
        with self.assertRaises(ValueError):
            M.validate_output('netns-probe',json.dumps(bad))
        bad['networkNamespaceRequested']=True
        bad['productionWorldModified']=True
        with self.assertRaises(ValueError):
            M.validate_output('netns-probe',json.dumps(bad))
    def test_privilege_only_used_for_authentication_not_script_execution(self):
        text=(S/'alice-v2-interactive-activation.py').read_text()
        self.assertIn("['sudo','-v']",text)
        self.assertIn("['sudo','-k']",text)
        self.assertIn('os.O_EXCL',text)
        self.assertNotIn('sudo python',text)
        self.assertNotIn('shell=True',text)
        self.assertIn("'netns-probe'",text)
if __name__=='__main__':unittest.main()
