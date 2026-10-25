"""Operator lifecycle regressions: no actual game process is signalled in tests."""
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from alice_operator.config import save_environment, load_environment, validate
from alice_operator.process import AliceProcess
spec = importlib.util.spec_from_file_location('alice_mint_cli', SCRIPTS / 'alice-mint.py')
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)


def config():
    return {'ALICE_BEDROCK_BACKUP_MANIFEST': '/verified/manifest.json',
            'ALICE_BEDROCK_PRODUCTION_CONFIRM': 'I_ACCEPT_WORLD_CHANGES',
            'ALICE_BEDROCK_PROFILE': 'test-profile',
            'ALICE_BEDROCK_BDS_GAMERTAG': 'TestPlayer',
            'ALICE_BEDROCK_BDS_SESSION_LOG': '/private/session.log',
            'ALICE_BEDROCK_CLIENT_MODE': 'legacy-native-injected',
            'ALICE_OLLAMA_URL': 'http://127.0.0.1:11435'}


class ConfigTests(unittest.TestCase):
    def test_capture_never_persists_full_environment_or_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            self.assertTrue(save_environment(root, {**config(), 'SECRET_TOKEN': 'DO_NOT_STORE'}))
            file = root / 'operator-env.json'
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertNotIn('DO_NOT_STORE', file.read_text())
            self.assertEqual(load_environment(root)['ALICE_BEDROCK_PROFILE'], 'test-profile')
            self.assertFalse(save_environment(root, config()))
            with self.assertRaisesRegex(ValueError, 'differs'):
                save_environment(root, {**config(), 'ALICE_OLLAMA_MODEL': 'different'})

    def test_untrusted_config_and_markdown_urls_fail(self):
        for value in [{**config(), 'SECRET_TOKEN': 'bad'}, {},
                      {**config(), 'ALICE_OLLAMA_URL': '[http://127.0.0.1:11435](http://127.0.0.1:11435)'},
                      {**config(), 'ALICE_OLLAMA_URL': 'http://user:password@localhost:11435'}]:
            with self.assertRaises(ValueError):
                validate(value)

    def test_config_symlink_and_public_permissions_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            target = root / 'real.json'; target.write_text('{}')
            (root / 'operator-env.json').symlink_to(target)
            with self.assertRaises(ValueError):
                load_environment(root)
            with self.assertRaises(ValueError):
                save_environment(root, config())
            self.assertEqual(target.read_text(), '{}')



class DeathStatusTests(unittest.TestCase):
    def test_alive_operator_process_can_show_dead_spawn_without_losing_network_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Mock()
            app.root = pathlib.Path(tmp)
            app.owner.return_value = {'pid': 2992409}
            app.inspect.return_value = ('node', 'birth-token', {})
            (app.root / 'status.json').write_text(json.dumps({
                'connected': False, 'sessionEstablished': True,
                'producerPid': 2992409, 'producerStartToken': 'birth-token',
                'health': 0, 'state': 'SURVIVE',
                'deathRecovery': {'phase': 'respawn_stalled', 'retrySent': True,
                                  'serverReadyObserved': False, 'deadSeconds': 31}
            }))
            os.chmod(app.root / 'status.json', 0o600)
            result = cli.status(app)
            self.assertTrue(result['processAlive'])
            self.assertFalse(result['reportedConnected'])
            self.assertTrue(result['sessionEstablished'])
            self.assertEqual(result['health'], 0)
            self.assertEqual(result['deathRecovery']['phase'], 'respawn_stalled')



class StatusProvenanceTests(unittest.TestCase):
    def test_immediate_restart_does_not_report_previous_dead_status_as_new_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Mock()
            app.root = pathlib.Path(tmp)
            app.owner.return_value = {'pid': 3125378}
            app.inspect.return_value = ('node', 'new-birth-token', {})
            file = app.root / 'status.json'
            file.write_text(json.dumps({
                'producerPid': 3045722, 'producerStartToken': 'old-birth-token',
                'connected': False, 'sessionEstablished': True,
                'health': 0, 'state': 'SURVIVE',
                'deathRecovery': {'phase': 'respawn_stalled',
                                  'deadSeconds': 3032, 'cycles': 3},
                'movementEvidence': {'travelBlocks': 54, 'independentSamples': 1273}
            }))
            file.chmod(0o600)
            status = cli.status(app)
            self.assertEqual(status['pid'], 3125378)
            self.assertTrue(status['processAlive'])
            self.assertEqual(status['statusSource'], 'awaiting_current_process_heartbeat')
            self.assertEqual(status['statusFilePid'], 3045722)
            self.assertIsNone(status['health'])
            self.assertIsNone(status['deathRecovery'])
            self.assertIsNone(status['reportedConnected'])
            self.assertIsNone(status['sessionEstablished'])
            self.assertIsNone(status['heartbeatAgeSeconds'])
            self.assertFalse(status['heartbeatFresh'])
            self.assertIsNone(status['serverTravelBlocks'])

    def test_pid_reuse_cannot_reuse_prior_boot_start_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Mock()
            app.root = pathlib.Path(tmp)
            app.owner.return_value = {'pid': 88}
            app.inspect.return_value = ('node', 'new-start-token', {})
            file = app.root / 'status.json'
            file.write_text(json.dumps({
                'producerPid': 88, 'producerStartToken': 'old-start-token',
                'health': 20, 'connected': True
            }))
            file.chmod(0o600)
            status = cli.status(app)
            self.assertFalse(status['heartbeatFresh'])
            self.assertEqual(status['statusSource'], 'awaiting_current_process_heartbeat')
            self.assertIsNone(status['health'])

    def test_same_process_identity_reports_actual_heartbeat(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Mock()
            app.root = pathlib.Path(tmp)
            app.owner.return_value = {'pid': 88}
            app.inspect.return_value = ('node', 'actual-token', {})
            file = app.root / 'status.json'
            file.write_text(json.dumps({
                'producerPid': 88, 'producerStartToken': 'actual-token',
                'health': 20, 'connected': True, 'sessionEstablished': True
            }))
            file.chmod(0o600)
            status = cli.status(app)
            self.assertTrue(status['heartbeatFresh'])
            self.assertEqual(status['statusSource'], 'current_process')
            self.assertEqual(status['health'], 20)
            self.assertTrue(status['sessionEstablished'])


class WitnessStatusReportTests(unittest.TestCase):
    def make_status(self, movement, *, token='current-birth', producer='current-birth'):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        app = Mock()
        app.root = pathlib.Path(temporary.name)
        app.owner.return_value = {'pid': 3895891}
        app.inspect.return_value = ('node', token, {})
        (app.root / 'status.json').write_text(json.dumps({
            'producerPid': 3895891, 'producerStartToken': producer,
            'connected': True, 'sessionEstablished': True,
            'movementEvidence': movement
        }))
        (app.root / 'status.json').chmod(0o600)
        return cli.status(app)

    def test_zero_samples_exposes_runtime_witness_rejection_without_bds_commands(self):
        result = self.make_status({
            'witnessStatus': 'stale_or_invalid_witness',
            'independentSamples': 0, 'independentAt': None,
            'travelBlocks': 28428.01, 'latestFeet': {'x': -4.5, 'y': 63, 'z': -5.5}
        })
        self.assertEqual(result['statusSource'], 'current_process')
        self.assertEqual(result['bdsWitnessStatus'], 'stale_or_invalid_witness')
        self.assertIsNone(result['bdsLastIndependentAgeSeconds'])
        self.assertIsNone(result['bdsIndependentSource'])
        self.assertEqual(result['mixedObservedTravelUnverified'], 28428.01)
        self.assertEqual(result['bdsSamples'], 0)

    def test_accepted_witness_with_old_timestamp_is_not_called_fresh(self):
        past = 60_000
        with patch.object(cli.time, 'time', return_value=1000):
            result = self.make_status({
                'witnessStatus': 'accepted', 'independentSamples': 2,
                'independentSource': 'bds_querytarget',
                'independentAt': 1_000_000 - past
            })
        self.assertEqual(result['bdsWitnessStatus'], 'accepted')
        self.assertEqual(result['bdsLastIndependentAgeSeconds'], 60.0)
        self.assertEqual(result['bdsIndependentSource'], 'bds_querytarget')

    def test_untrusted_witness_status_never_echoes_private_string(self):
        result = self.make_status({
            'witnessStatus': 'apikey=SHOULD_NOT_APPEAR', 'independentSamples': 0,
            'independentSource': 'fake_server', 'independentAt': 'invalid'
        })
        self.assertEqual(result['bdsWitnessStatus'], 'unknown')
        self.assertIsNone(result['bdsIndependentSource'])
        self.assertIsNone(result['bdsLastIndependentAgeSeconds'])
        self.assertNotIn('SHOULD_NOT_APPEAR', json.dumps(result))

    def test_old_pid_birth_token_never_exposes_old_witness(self):
        result = self.make_status({
            'witnessStatus': 'accepted', 'independentSamples': 6,
            'independentSource': 'bds_querytarget', 'independentAt': 999000
        }, producer='prior-birth')
        self.assertEqual(result['statusSource'], 'awaiting_current_process_heartbeat')
        self.assertIsNone(result['bdsWitnessStatus'])
        self.assertIsNone(result['bdsIndependentSource'])
        self.assertIsNone(result['bdsLastIndependentAgeSeconds'])
        self.assertIsNone(result['bdsSamples'])
        self.assertIsNone(result['mixedObservedTravelUnverified'])



class WitnessFileDiagnosticTests(unittest.TestCase):
    def prepare(self, *, now=None, login_offset_ms=20_000):
        from alice_operator.diagnostics import witness_file_diagnose
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        root = pathlib.Path(td.name)
        root.chmod(0o700)
        app = Mock()
        app.root = root
        app.owner.return_value = {'pid': 3895891, 'nonce': 'a' * 32}
        app.inspect.return_value = ('node', 'birth-token', {})
        now = int(__import__('time').time() * 1000) if now is None else now
        status = {'producerPid': 3895891, 'producerStartToken': 'birth-token',
                  'movementEvidence': {'loginAt': now - login_offset_ms,
                                       'witnessStatus': 'stale_or_invalid_witness'}}
        file = root / 'status.json'
        file.write_text(json.dumps(status))
        file.chmod(0o600)
        # Frozen now precedes fixture writes. Keep the synthetic heartbeat
        # timestamp in the past, not accidentally a future file mtime.
        heartbeat_seconds = (now - 1000) / 1000
        os.utime(file, (heartbeat_seconds, heartbeat_seconds))
        def witness(at):
            file = root / 'bds-position-witness.json'
            file.write_text(json.dumps({
                'version': 1, 'source': 'mcsm_querytarget', 'gamertag': 'SecretPlayer',
                'uniqueId': 'private-player-uuid', 'serial': '1792941234567890123',
                'feet': {'x': 1, 'y': 60, 'z': 2}, 'observedAt': at,
            }))
            file.chmod(0o600)
            return file
        return app, now, witness, witness_file_diagnose

    def test_missing_witness_never_runs_console_and_exposes_no_identity(self):
        app, now, witness, diagnose = self.prepare()
        report = diagnose(app, now_ms=now)
        self.assertEqual(report['state'], 'file_missing')
        self.assertEqual(report['runtimeWitnessStatus'], 'stale_or_invalid_witness')
        self.assertFalse(report['bdsCommandSent'])
        self.assertFalse(report['filePresent'])
        self.assertNotIn('SecretPlayer', json.dumps(report))

    def test_prior_login_sample_is_rejected_with_no_personal_details(self):
        app, now, witness, diagnose = self.prepare()
        witness(now - 25_000)
        result = diagnose(app, now_ms=now)
        self.assertEqual(result['state'], 'sample_predates_current_login')
        self.assertTrue(result['sampleBeforeCurrentLogin'])
        self.assertNotIn('private-player-uuid', json.dumps(result))
        self.assertNotIn('SecretPlayer', json.dumps(result))

    def test_expired_sample_not_reframed_as_valid_even_if_after_login(self):
        app, now, witness, diagnose = self.prepare()
        witness(now - 10_000)
        result = diagnose(app, now_ms=now)
        self.assertEqual(result['state'], 'sample_expired_over_4s')
        self.assertEqual(result['sampleAgeSeconds'], 10.0)
        self.assertFalse(result['sampleBeforeCurrentLogin'])

    def test_recent_candidate_is_not_reported_as_bds_acceptance(self):
        app, now, witness, diagnose = self.prepare()
        witness(now - 1500)
        result = diagnose(app, now_ms=now)
        self.assertEqual(result['state'], 'recent_candidate_not_acceptance_proof')
        self.assertFalse(result['bdsCommandSent'])

    def test_bad_permissions_fail_closed_and_do_not_emit_payload(self):
        app, now, witness, diagnose = self.prepare()
        file = witness(now - 1500)
        file.chmod(0o644)
        result = diagnose(app, now_ms=now)
        self.assertEqual(result['state'], 'unsafe_or_unreadable_source')
        self.assertNotIn('SecretPlayer', json.dumps(result))

    def test_wrong_birth_token_hides_witness_and_owner_change_is_rejected(self):
        app, now, witness, diagnose = self.prepare()
        witness(now - 1500)
        app.inspect.return_value = ('node', 'another-start-token', {})
        result = diagnose(app, now_ms=now)
        self.assertEqual(result['state'], 'current_heartbeat_unavailable')
        self.assertIsNone(result['sampleAgeSeconds'])
        app.inspect.return_value = ('node', 'birth-token', {})
        app.owner.side_effect = [{'pid':3895891,'nonce':'a'*32},
                                 {'pid':3895891,'nonce':'b'*32}]
        result = diagnose(app, now_ms=now)
        self.assertEqual(result['state'], 'owner_changed_during_check')
        self.assertIsNone(result['sampleAgeSeconds'])

    def test_lifecycle_excerpt_shows_only_allowlisted_respawn_reasons(self):
        from alice_operator.diagnostics import recent_lifecycle
        with tempfile.TemporaryDirectory() as temp:
            file = pathlib.Path(temp) / 'operator-alice-check.log'
            lines = [
                '[2026-10-25T23:00:39.892+08:00 PID=3895891] [Alice life] respawn recovery: '+
                json.dumps({'phase':'waiting_for_server_respawn',
                            'reason':'death_observed','private':'DONT_EMIT'},separators=(',',':')),
                '[2026-10-25T23:00:40.168+08:00 PID=3895891] [Alice life] respawn recovery: '+
                json.dumps({'phase':'respawn_verified',
                            'reason':'spawn_with_positive_health'},separators=(',',':')),
            ]
            file.write_text('\n'.join(lines)+'\n')
            file.chmod(0o600)
            rows=recent_lifecycle([{'path':str(file)}])
            self.assertEqual(rows[0]['phase'],'waiting_for_server_respawn')
            self.assertEqual(rows[0]['reason'],'death_observed')
            self.assertEqual(rows[1]['phase'],'respawn_verified')
            self.assertEqual(rows[1]['reason'],'spawn_with_positive_health')
            self.assertNotIn('DONT_EMIT',json.dumps(rows))

class DiagnosticTests(unittest.TestCase):
    def test_readonly_duplicate_alice_candidates_and_private_logs(self):
        from alice_operator.diagnostics import alice_processes, recent_logs
        with tempfile.TemporaryDirectory() as tmp:
            app = AliceProcess(tmp)
            app.root.mkdir(mode=0o700)
            app.project.mkdir(parents=True)
            app.node.parent.mkdir(parents=True)
            app.node.write_text('test-binary')
            proc = pathlib.Path(tmp) / 'fake-proc'
            proc.mkdir()
            for pid in (1001, 1002):
                directory = proc / str(pid)
                directory.mkdir()
                (directory / 'cmdline').write_bytes(b'/usr/bin/node\0src/main.cjs\0--production-start\0')
                (directory / 'exe').symlink_to(app.node)
                (directory / 'cwd').symlink_to(app.project)
            other = proc / '1003'
            other.mkdir()
            (other / 'cmdline').write_bytes(b'/usr/bin/node\0other.js\0')
            (other / 'exe').symlink_to(app.node)
            (other / 'cwd').symlink_to(app.project)
            found = alice_processes(app, proc=proc)
            self.assertEqual([x['pid'] for x in found], [1001, 1002])

            good = app.root / 'operator-alice-20261023.log'
            good.write_text('[timestamp] Alice shutdown')
            good.chmod(0o600)
            public = app.root / 'operator-alice-public.log'
            public.write_text('unsafe')
            public.chmod(0o644)
            symlink = app.root / 'operator-alice-link.log'
            symlink.symlink_to(good)
            logs = recent_logs(app)
            self.assertEqual([x['path'] for x in logs], [str(good)])
            self.assertEqual(logs[0]['bytes'], good.stat().st_size)

    def test_diagnose_is_readonly_and_reports_lock_pid_without_process_changes(self):
        from alice_operator.diagnostics import diagnose
        app = Mock()
        app.owner.return_value = {'pid': 55}
        app.inspect.return_value = ('node', 'token', {})
        with (patch('alice_operator.diagnostics.alice_processes',
                    return_value=[{'pid': 55}, {'pid': 56}]),
              patch('alice_operator.diagnostics.current_log',
                    return_value='/private/operator-alice-now.log'),
              patch('alice_operator.diagnostics.recent_logs', return_value=[])):
            report = diagnose(app)
        self.assertEqual(report['lockedPid'], 55)
        self.assertTrue(report['possibleDuplicate'])
        self.assertEqual(report['candidateCount'], 2)
        self.assertEqual(report['currentOperatorLog'], '/private/operator-alice-now.log')
        app.inspect.assert_not_called()
        app.launch.assert_not_called()
        app.stop.assert_not_called()



class SessionEvidenceTests(unittest.TestCase):
    def test_recent_lifecycle_redacts_raw_server_and_xbox_messages(self):
        from alice_operator.diagnostics import recent_lifecycle
        with tempfile.TemporaryDirectory() as tmp:
            file = pathlib.Path(tmp) / 'operator-alice-test.log'
            file.write_text(
              '[2026-10-23T05:10:00.123+08:00 PID=99] [Alice wire] server_disconnect details=SECRET_XBOX_MESSAGE\n'
              '[2026-10-23T05:10:00.124+08:00 PID=99] [Alice session] lifecycle: {"kind":"server_disconnect","at":1,"phase":"spawn_confirmed"}\n'
              '[2026-10-23T05:10:00.126+08:00 PID=99] Xbox authorization requested: SECRET_DEVICE_CODE\n'
              '[2026-10-23T05:10:00.130+08:00 PID=99] [Alice wire] session_closed {"receivedServerDisconnect":true}\n'
            )
            file.chmod(0o600)
            rows = recent_lifecycle([{'path': str(file)}])
            self.assertEqual([x['event'] for x in rows],
                ['server_disconnect', 'session_lifecycle', 'session_closed'])
            self.assertEqual(rows[1]['kind'], 'server_disconnect')
            self.assertEqual(rows[1]['pid'], 99)
            self.assertEqual(rows[0]['time'], '2026-10-23T05:10:00.123+08:00')
            self.assertNotIn('SECRET', json.dumps(rows))

    def test_lifecycle_tail_is_from_newest_operator_process_not_prior_restarts(self):
        from alice_operator.diagnostics import recent_lifecycle
        with tempfile.TemporaryDirectory() as tmp:
            files = []
            for pid in (100, 200, 300):
                path = pathlib.Path(tmp) / f'operator-alice-{pid}.log'
                path.write_text(
                    f'[2026-10-23T05:10:00.123+08:00 PID={pid}] '
                    '[Alice life] respawn recovery: {"phase":"respawn_stalled"}\\n')
                path.chmod(0o600)
                files.append({'path': str(path)})
            rows = recent_lifecycle(list(reversed(files)), max_events=2)
            self.assertEqual([r['pid'] for r in rows], [200, 300])

    def test_operator_status_exposes_server_session_end_distinct_from_death(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Mock()
            app.root = pathlib.Path(tmp)
            app.owner.return_value = {'pid': 55}
            app.inspect.return_value = ('node', 'birth-token', {})
            (app.root / 'status.json').write_text(json.dumps({
                'connected': False, 'sessionEstablished': False,
                'producerPid': 55, 'producerStartToken': 'birth-token',
                'sessionExit': {'kind': 'transport_closed', 'at': 123456,
                                'serverDisconnectSeen': False},
                'deathRecovery': {'phase': 'respawn_stalled'},
                'health': 0, 'state': 'SURVIVE'
            }))
            (app.root / 'status.json').chmod(0o600)
            result = cli.status(app)
            self.assertEqual(result['sessionExit']['kind'], 'transport_closed')
            self.assertFalse(result['reportedConnected'])
            self.assertFalse(result['sessionEstablished'])


class LifecycleTests(unittest.TestCase):
    def test_start_with_active_owner_never_checks_or_launches(self):
        app = Mock(); app.owner.return_value = {'pid': 123}
        with patch.object(cli.sys, 'platform', 'linux'), patch.object(cli, 'AliceProcess', return_value=app):
            with self.assertRaisesRegex(ValueError, 'already running'):
                cli.main(['start'])
        app.launch.assert_not_called(); app.check.assert_not_called()

    def test_restart_cannot_guess_environment_without_old_process(self):
        app = Mock(); app.owner.return_value = None
        with patch.object(cli.sys, 'platform', 'linux'), patch.object(cli, 'AliceProcess', return_value=app):
            with self.assertRaisesRegex(ValueError, 'No active'):
                cli.main(['restart'])
        app.launch.assert_not_called()

    def test_failed_preflight_does_not_stop_old_alice(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = AliceProcess(tmp); app.root.mkdir(mode=0o700)
            app.inspect = Mock(return_value=('node', 'token', config()))
            app.check = Mock(side_effect=ValueError('preflight failed'))
            app.stop = Mock()
            with self.assertRaisesRegex(ValueError, 'preflight failed'):
                app.launch(config(), {'pid': 123})
            app.stop.assert_not_called()
            self.assertEqual(list(app.root.iterdir()), [])

    def test_log_creation_failure_cannot_stop_old_client(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = AliceProcess(tmp); app.root.mkdir(mode=0o700)
            app.inspect = Mock(return_value=('node', 'token', config())); app.check = Mock(); app.stop = Mock()
            with patch('alice_operator.process.os.open', side_effect=OSError('disk full')):
                with self.assertRaises(OSError): app.launch(config(), {'pid': 123})
            app.stop.assert_not_called()

    def test_no_replacement_when_bds_release_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = AliceProcess(tmp); app.root.mkdir(mode=0o700)
            app.inspect = Mock(return_value=('node', 'token', config())); app.check = Mock(); app.stop = Mock()
            app.wait_bds_release = Mock(side_effect=ValueError('BDS still online'))
            with patch('alice_operator.process.subprocess.Popen') as launch:
                with self.assertRaisesRegex(ValueError, 'BDS still online'):
                    app.launch(config(), {'pid': 123})
                launch.assert_not_called()
            app.stop.assert_called_once_with({'pid': 123}, 'token')

    def test_successful_restart_orders_stop_logout_and_one_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = AliceProcess(tmp); app.root.mkdir(mode=0o700); calls=[]
            app.inspect = Mock(return_value=('node', 'token', config()))
            app.check = lambda env: calls.append('check')
            app.stop = lambda o, t: calls.append('stop')
            app.wait_bds_release = lambda env: calls.append('logout')
            child = Mock(pid=456); child.poll.return_value = None
            def spawn(*args, **kwargs):
                calls.append('launch')
                self.assertTrue(kwargs['start_new_session'])
                self.assertEqual(kwargs['env'], config())
                return child
            with patch('alice_operator.process.subprocess.Popen', side_effect=spawn) as run, patch('alice_operator.process.time.sleep'):
                result = app.launch(config(), {'pid': 123})
            self.assertEqual(calls, ['check','stop','logout','launch']); run.assert_called_once()
            self.assertEqual(result['newPid'], 456)

    def test_changed_owner_is_never_signalled(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = AliceProcess(tmp); app.owner = Mock(return_value={'pid': 999})
            with patch('alice_operator.process.os.pidfd_open', return_value=42, create=True), patch('alice_operator.process.os.close'), patch('alice_operator.process.signal.pidfd_send_signal', create=True) as send:
                with self.assertRaisesRegex(ValueError, 'owner changed'):
                    app.stop({'pid': 123}, 'token')
                send.assert_not_called()

    def test_recycled_pid_token_is_never_signalled(self):
        app = AliceProcess(); owner = {'pid': 123}
        app.owner = Mock(return_value=owner); app.inspect = Mock(return_value=('node', 'different-token', {}))
        with patch('alice_operator.process.os.pidfd_open', return_value=42, create=True), patch('alice_operator.process.os.close'), patch('alice_operator.process.signal.pidfd_send_signal', create=True) as send:
            with self.assertRaisesRegex(ValueError, 'owner changed'):
                app.stop(owner, 'token')
            send.assert_not_called()

    def test_bds_wait_only_retries_online_state_never_unknown_errors(self):
        app = AliceProcess()
        online = Mock(returncode=1, stderr=b'BDS still records configured Alice Gamertag ONLINE')
        ok = Mock(returncode=0)
        with patch('alice_operator.process.subprocess.run', side_effect=[online,ok]) as run, patch('alice_operator.process.time.sleep'):
            app.wait_bds_release(config()); self.assertEqual(run.call_count, 2)
        with patch('alice_operator.process.subprocess.run', return_value=Mock(returncode=1, stderr=b'unknown error')) as run:
            with self.assertRaisesRegex(ValueError, 'check failed'): app.wait_bds_release(config())
            self.assertEqual(run.call_count, 1)
        with patch('alice_operator.process.subprocess.run', return_value=online):
            with self.assertRaisesRegex(ValueError, 'still reports'): app.wait_bds_release(config(), seconds=0)


class PreflightWitnessSeparationTests(unittest.TestCase):
    def test_preflight_does_not_require_disabled_console_poll_witness(self):
        # A disabled mcsm_querytarget service must not prevent loading a new
        # Alice executable / voxel producer. It does NOT authorize movement.
        with tempfile.TemporaryDirectory() as tmp:
            app=AliceProcess(tmp)
            app.node.parent.mkdir(parents=True)
            app.node.write_bytes(b'node-fixture')
            app.project.mkdir(parents=True)
            app.run_check=Mock()
            with patch('alice_operator.process.subprocess.run') as run:
                app.check(config())
                run.assert_not_called()
            app.run_check.assert_called_once()
            arguments=app.run_check.call_args.args[0]
            self.assertIn('productionGate()',arguments[-1])
            self.assertIn('checkChunkImplementation()',arguments[-1])
            self.assertNotIn('alice-bds-position-witness.service',
                             (SCRIPTS/'alice_operator'/'process.py').read_text().split(
                                 '    def run_check')[0].split('    def check')[1])

    def test_missing_independent_position_still_denies_scout(self):
        proof=(SCRIPTS.parent/'bedrock-native'/'experiment'/'src'/
               'scout_start_proof.cjs').read_text()
        self.assertIn("s.independentSamples<2",proof)
        self.assertIn("clock()-at>4000",proof)
        self.assertIn("scout_bds_position_unavailable",proof)
        self.assertIn("meters>0.75",proof)


class MacTests(unittest.TestCase):
    def test_dry_run_and_destination_validation(self):
        env={**os.environ,'ALICE_SSH_TARGET':'test@127.0.0.1'}
        p=subprocess.run(['bash',str(SCRIPTS/'alice-mac.sh'),'deploy','--dry-run'],env=env,capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stderr);self.assertIn('no network',p.stdout)
        q=subprocess.run(['bash',str(SCRIPTS/'alice-mac.sh'),'diagnose','--dry-run'],env=env,capture_output=True,text=True)
        self.assertEqual(q.returncode,0,q.stderr);self.assertIn('Preview: diagnose',q.stdout)
        env['ALICE_SSH_TARGET']='test@localhost;echo injected'
        p=subprocess.run(['bash',str(SCRIPTS/'alice-mac.sh'),'status','--dry-run'],env=env,capture_output=True,text=True)
        self.assertEqual(p.returncode,2)


if __name__ == '__main__': unittest.main()
