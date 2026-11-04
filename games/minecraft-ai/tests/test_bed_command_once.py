import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

path = Path(__file__).resolve().parents[1] / 'scripts/alice-bed-command-once.py'
spec = importlib.util.spec_from_file_location('bed_command_once', path)
bed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bed)


class BedCommandOnceTest(unittest.TestCase):
    def state(self):
        return {'online': True, 'canCommand': True, 'runtime': {
            'world': 'Bedrock level', 'serverPort': 17879, 'connected': True,
            'sessionEstablished': True, 'producerPid': 123, 'state': 'IDLE',
            'health': 20, 'worldRoutine': {'bedLogicVersion': 6}}}

    def test_only_one_typed_request_and_persisted_receipt(self):
        calls = []
        def api(route, payload=None):
            calls.append((route, payload))
            return self.state() if payload is None else {'status': 'queued', 'id': 'a' * 32}
        with tempfile.TemporaryDirectory() as tmp:
            result = bed.submit('set_spawnpoint', Path(tmp), api)
            self.assertEqual(result['state'], 'queued')
            self.assertFalse(result['bedCompleted'])
            self.assertEqual(calls[-1][1], {'text': '设置重生点'})
            self.assertEqual(json.loads((Path(tmp) / 'bed_command.json').read_text()), result)
            self.assertEqual((Path(tmp) / 'bed_command.json').stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                bed.submit('set_spawnpoint', Path(tmp), api)
            self.assertEqual(len(calls), 2)

    def test_timeout_after_post_never_retries_or_claims_success(self):
        calls = []
        def api(route, payload=None):
            calls.append(route)
            if payload is None:
                return self.state()
            raise TimeoutError()
        with tempfile.TemporaryDirectory() as tmp:
            result = bed.submit('sleep', Path(tmp), api)
            self.assertEqual(result['state'], 'submission_unknown')
            self.assertFalse(result['sleepEntered'])
            self.assertTrue(result['doNotRepeat'])
            with self.assertRaises(FileExistsError):
                bed.submit('sleep', Path(tmp), api)
            self.assertEqual(len(calls), 2)

    def test_wrong_owner_world_version_job_health_do_not_send(self):
        for key, value in [('world', 'other'), ('serverPort', 17880),
                           ('sessionEstablished', False), ('job', 'EXPLORE'),
                           ('health', 2), ('worldRoutine', {})]:
            state = self.state()
            state['runtime'][key] = value
            calls = []
            def api(route, payload=None):
                calls.append(payload)
                return state
            with tempfile.TemporaryDirectory() as tmp:
                self.assertEqual(bed.submit('sleep', Path(tmp), api)['state'], 'blocked')
                self.assertEqual(calls, [None])

    def test_arbitrary_command_rejected_before_network_or_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                bed.submit('teleport', Path(tmp), lambda *args: self.fail('network'))
            self.assertFalse(list(Path(tmp).iterdir()))

    def test_inspect_only_reads_and_does_not_export_raw_data(self):
        calls = []
        state = self.state()
        state['runtime']['secret'] = 'must_not_export'
        state['runtime']['movementEvidence'] = {'witnessDemand': {
            'state': 'needs_two_fresh_samples', 'positionGateSatisfied': False,
            'private': 'must_not_export'}}
        state['runtime']['worldRoutine'].update(idleGate='work_cooldown',
            escapeSurvey={'doorAction': {'reason': 'door_retry_cooldown'},
                          'passageAction': {'reason': 'private message'}})
        state['commandResult'] = {'id': 'b' * 32, 'status': 'started',
                                  'reason': 'awaiting_bds_bed_proof', 'message': 'private message'}
        def api(route, payload=None):
            calls.append((route, payload))
            return state
        with tempfile.TemporaryDirectory() as tmp:
            result = bed.inspect_state(Path(tmp), api)
            self.assertTrue(result['readOnly'])
            self.assertEqual(result['commandId'], 'b' * 32)
            self.assertEqual(result['idleGate'], 'work_cooldown')
            self.assertEqual(result['witnessDemandState'], 'needs_two_fresh_samples')
            self.assertFalse(result['positionGateSatisfied'])
            self.assertEqual(result['doorActionReason'], 'door_retry_cooldown')
            self.assertIsNone(result['passageActionReason'])
            self.assertNotIn('secret', json.dumps(result))
            self.assertNotIn('private message', json.dumps(result))
            self.assertEqual(calls, [('/api/control/status', None)])
