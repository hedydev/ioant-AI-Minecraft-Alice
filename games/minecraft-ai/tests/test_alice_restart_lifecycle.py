import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import os
import json
import time
import types

path = Path(__file__).parents[1]/'scripts/alice-17879-client-restart-gated.py'
spec = importlib.util.spec_from_file_location('alice_restart', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def safe_data():
    return {'state': 'IDLE', 'health': 20, 'job': None,
            'worldRoutine': {'idleGate': 'position_witness_unverified'}}


class RestartTests(unittest.TestCase):
    def app(self):
        app = Mock()
        owner = {'pid': 100, 'nonce': 'owner'}
        live = {'processAlive': True, 'heartbeatFresh': True,
                'reportedConnected': True, 'sessionEstablished': True}
        before = (owner, 'birth', {'ORIGINAL': 'private'}, live, safe_data())
        after = ({'pid': 200}, 'newbirth', {}, live, safe_data())
        def launch(env, current):
            self.assertEqual(env, before[2])
            self.assertEqual(current, owner)
            app.stop(current, 'birth')
            return {'oldPid': 100, 'newPid': 200}
        app.launch.side_effect = launch
        return app, before, after

    def test_original_config_one_stop_one_replacement_verified_login(self):
        app, before, after = self.app()
        with patch.object(module, 'read_live', side_effect=[before, before, after]):
            result = module.perform_restart(app, Mock(), 'approved_restart_01', pause=Mock())
        self.assertEqual(result['state'], 'completed')
        self.assertEqual((result['oldPid'], result['newPid']), (100, 200))
        app.stop.assert_called_once_with(before[0], 'birth')
        app.launch.assert_called_once()
        self.assertFalse(result['bdsRestarted'])
        self.assertFalse(result['worldChanged'])

    def test_busy_or_unsafe_state_never_launches(self):
        for change in ({'job': {'kind': 'FOLLOW'}}, {'state': 'COMBAT'},
                       {'health': 8}, {'worldRoutine': {'idleGate': 'human_stop'}}):
            app, before, _ = self.app()
            bad = (*before[:4], {**safe_data(), **change})
            with patch.object(module, 'read_live', return_value=bad):
                result = module.perform_restart(app, Mock(), 'approved_restart_02')
            self.assertEqual(result['state'], 'blocked')
            app.stop.assert_not_called()
            app.launch.assert_not_called()

    def test_owner_or_job_change_before_stop_is_blocked(self):
        for index in (0, 4):
            app, before, _ = self.app()
            changed = list(before)
            changed[index] = {'pid': 999} if index == 0 else {**safe_data(), 'job': 'new_task'}
            original = app.stop
            with patch.object(module, 'read_live', side_effect=[before, tuple(changed)]):
                result = module.perform_restart(app, Mock(), 'approved_restart_03')
            self.assertEqual(result['state'], 'blocked')
            self.assertFalse(result['restartAttempted'])
            original.assert_not_called()

    def test_stop_or_launch_failure_remains_uncertain_without_retry(self):
        app, before, _ = self.app()
        app.stop.side_effect = OSError('not exposed')
        with patch.object(module, 'read_live', side_effect=[before, before]):
            result = module.perform_restart(app, Mock(), 'approved_restart_04')
        self.assertEqual(result['state'], 'inconclusive')
        self.assertTrue(result['restartAttempted'])
        app.launch.assert_called_once()
        self.assertNotIn('not exposed', json.dumps(result))

    def test_unverified_login_is_not_success_or_repeated_launch(self):
        app, before, _ = self.app()
        with patch.object(module, 'read_live', side_effect=[before, before]):
            result = module.perform_restart(app, Mock(), 'approved_restart_05',
                                            pause=Mock(), clock=Mock(side_effect=[0, 56]))
        self.assertEqual(result['state'], 'inconclusive')
        self.assertFalse(result['sessionEstablished'])
        app.launch.assert_called_once()

    def test_raw_status_requires_private_current_owner_exact_world_port(self):
        with tempfile.TemporaryDirectory() as root:
            app = Mock(root=Path(root))
            app.owner.return_value = {'pid': 100}
            app.inspect.return_value = ('node', 'birth', {})
            status = Mock(return_value={'statusSource': 'current_process', 'pid': 100,
                          'heartbeatFresh': True, 'reportedConnected': True, 'sessionEstablished': True})
            data = {**safe_data(), 'producerPid': 100, 'producerStartToken': 'birth',
                    'world': 'Bedrock level', 'serverPort': 17879}
            file = Path(root)/'status.json'
            for change in ({'world': 'other'}, {'serverPort': 17880},
                           {'producerStartToken': 'old'}, {'producerPid': 999}):
                file.write_text(json.dumps({**data, **change})); file.chmod(0o600)
                with self.assertRaises(ValueError):
                    module.read_live(app, status)
            file.write_text(json.dumps(data)); file.chmod(0o600)
            self.assertEqual(module.read_live(app, status)[0]['pid'], 100)
            os.utime(file, (time.time()-20, time.time()-20))
            with self.assertRaisesRegex(ValueError, 'stale_heartbeat'):
                module.read_live(app, status)

    def test_prior_denied_id_is_not_a_restart_target(self):
        with patch.object(module.subprocess, 'run') as remote:
            with self.assertRaisesRegex(ValueError, 'previously_denied'):
                module.run(Path('/tmp'), module.PRIOR_DENIED)
            remote.assert_not_called()

    def test_remote_payload_is_bounded_and_has_no_force_or_bds_lifecycle(self):
        source = module.remote_source('approved_restart_08')
        compile(source, '<remote>', 'exec')
        self.assertNotIn('SIGKILL', source)
        self.assertNotIn('systemctl', source)
        self.assertNotIn('unlink(', source)
        self.assertIn('O_EXCL', source)
        self.assertIn('LOCK_NB', source)
        self.assertIn('app.launch(env, owner)', source)

    def test_remote_existing_uncertain_claim_never_replays(self):
        with tempfile.TemporaryDirectory() as home:
            root = Path(home)/'.alice-bedrock-control'
            claims = root/'mcp-client-lifecycle'
            claims.mkdir(parents=True, mode=0o700)
            operation = 'approved_restart_once09'
            initial = module.empty_receipt(operation)
            initial.update(state='inconclusive', failureReason='claimed_outcome_requires_review')
            file = claims/(operation+'.json')
            file.write_text(json.dumps(initial));file.chmod(0o600)
            app = Mock(root=root)
            process_module = types.ModuleType('alice_operator.process')
            process_module.AliceProcess = Mock(return_value=app)
            config_module = types.ModuleType('alice_operator.config')
            config_module.private_path = Mock()
            loader = Mock()
            fake_spec = types.SimpleNamespace(loader=loader)
            with patch.object(module.Path, 'home', return_value=Path(home)), \
                 patch.dict(module.sys.modules, {'alice_operator.process': process_module,
                                                 'alice_operator.config': config_module}), \
                 patch.object(module.importlib.util, 'spec_from_file_location', return_value=fake_spec), \
                 patch.object(module.importlib.util, 'module_from_spec', return_value=types.SimpleNamespace(status=Mock())), \
                 patch.object(module, 'perform_restart') as restart:
                self.assertEqual(module.remote_run(operation, {}), initial)
                restart.assert_not_called()
