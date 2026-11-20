"""Safety regression: backup ordering and no lifecycle replay on failure."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock,patch

SCRIPTS=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(SCRIPTS))
spec=importlib.util.spec_from_file_location('stable_activation',SCRIPTS/'alice_stable_witness_activation.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ActivationTests(unittest.TestCase):
    def test_two_live_samples_require_paused_real_status_settings(self):
        raw={'settings':{'autonomyEnabled':False},'job':None,'movementEvidence':{
            'independentSource':'bds_stable_actionbar','independentSamples':2,'independentAt':10000,'independentPreviousAt':8000}}
        self.assertTrue(m.has_stable_pair(raw,11000))
        self.assertFalse(m.has_stable_pair(raw,15000))
        self.assertFalse(m.has_stable_pair({**raw,'settings':{'autonomyEnabled':True}},11000))
        self.assertFalse(m.has_stable_pair({**raw,'movementEvidence':{
            **raw['movementEvidence'],'independentSource':'bds_querytarget'}},11000))

    def test_refuses_lifecycle_replay_before_api_call(self):
        a=object.__new__(m.Activation)
        a.receipt={'bdsStopSent':True};a.save=Mock()
        with patch('bds_position_witness.api') as api:
            with self.assertRaisesRegex(ValueError,'lifecycle_already_sent'):a.request('stop')
            api.assert_not_called();a.save.assert_not_called()

    def test_claim_is_saved_before_uncertain_request_and_not_retried(self):
        a=object.__new__(m.Activation);a.receipt={'bdsOpenSent':False}
        a.cfg={'instanceId':'abcdefgh'};a.key='private';phases=[]
        a.save=lambda phase:phases.append(phase)
        with patch('bds_position_witness.api',side_effect=TimeoutError) as api:
            with self.assertRaises(TimeoutError):a.request('open')
            self.assertTrue(a.receipt['bdsOpenSent']);self.assertEqual(phases,['open_intent'])
            with self.assertRaises(ValueError):a.request('open')
            self.assertEqual(api.call_count,1)

    def test_failed_backup_cannot_install_pack_or_open_inside_perform(self):
        with tempfile.TemporaryDirectory() as tmp:
            a=object.__new__(m.Activation);a.home=Path(tmp);a.root=a.home/'server';a.world=a.root/'worlds/world'
            a.installed=a.root/'behavior_packs/witness';a.claim=a.home/'claim.json'
            a.receipt={};a.save=Mock();a.old_bds=12;a.old_birth='34'
            owner={'pid':56};env={};raw={'job':None}
            a.inspect=Mock(return_value=({'bdsPid':12,'bdsBirth':'34','version':'1.26.52'},(owner,'birth',env,[],'')))
            a.app=Mock();a.app.root=a.home
            a.mint=Mock();a.gated=Mock();a.gated.read_live.return_value=(owner,'birth',env,{},raw)
            a.control=Mock();a.detail=Mock(return_value={'status':3,'processInfo':{'pid':11}});a.binding=Mock()
            a.request=Mock();a.wait=Mock();a.start_original=Mock()
            a.backup=Mock();a.backup.write_backup.side_effect=OSError('backup failed')
            with patch.object(m,'descendants_of',return_value=[12]):
                with self.assertRaises(OSError):a.perform()
            self.assertFalse(a.installed.exists());a.request.assert_called_once_with('stop')
            a.start_original.assert_not_called();a.app.launch.assert_not_called()

    def test_uncertain_open_is_not_replayed_by_recovery(self):
        a=object.__new__(m.Activation)
        a.receipt={'aliceStopped':True,'bdsStopSent':True,'bdsOpenSent':True,'clientStartSent':True}
        a.detail=Mock(return_value={'status':0});a.binding=Mock();a.save=Mock();a.request=Mock()
        a.recover_service();a.request.assert_not_called()
        self.assertEqual(a.receipt['recovery'],'unverified_no_lifecycle_retry')

    def test_redaction_drops_settings_and_backup_paths(self):
        result=m.safe_report({'state':'blocked','backupManifest':'PRIVATE','originalSettings':{'private':1},'key':'SECRET'})
        self.assertEqual(result,{'state':'blocked'})
