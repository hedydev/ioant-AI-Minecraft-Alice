import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('alice_stop', Path(__file__).parents[1]/'scripts/alice-client-stop-mac.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StopTests(unittest.TestCase):
    def test_only_verified_owner_stopped_once_without_launch(self):
        owner = {'pid': 123, 'nonce': 'verified'}
        app = Mock()
        app.owner.side_effect = [owner, None]
        app.inspect.return_value = ('node', 'birth-token', {})
        pause = Mock()
        self.assertEqual(module.stop_client(app, pause)['state'], 'stopped')
        app.stop.assert_called_once_with(owner, 'birth-token')
        app.launch.assert_not_called()
        pause.assert_called_once_with(5)

    def test_offline_is_not_started_or_signalled(self):
        app = Mock()
        app.owner.return_value = None
        self.assertEqual(module.stop_client(app, Mock())['state'], 'already_offline')
        app.stop.assert_not_called()
        app.launch.assert_not_called()

    def test_replacement_owner_blocks_without_second_signal(self):
        app = Mock()
        app.owner.side_effect = [{'pid': 123}, {'pid': 456}]
        app.inspect.return_value = ('node', 'token', {})
        with self.assertRaisesRegex(ValueError, 'do not repeat'):
            module.stop_client(app, Mock())
        app.stop.assert_called_once()
        app.launch.assert_not_called()

    def test_identity_error_never_signals(self):
        app = Mock()
        app.owner.return_value = {'pid': 123}
        app.inspect.side_effect = ValueError('wrong identity')
        with self.assertRaises(ValueError):
            module.stop_client(app, Mock())
        app.stop.assert_not_called()

