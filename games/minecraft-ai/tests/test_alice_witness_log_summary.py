import importlib.util
import pathlib
import unittest


path = pathlib.Path(__file__).parents[1] / 'scripts/alice_witness_log_summary.py'
spec = importlib.util.spec_from_file_location('witness_log_summary', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WitnessLogSummaryTests(unittest.TestCase):
    def test_chronological_handoff_and_activity_rejection(self):
        r = module.summarize_witness_log('\n'.join([
            '[Alice autonomy] BDS witness idle handoff: {"outcome":"queued"}',
            '[Alice autonomy] BDS witness idle handoff: {"outcome":"controller_busy"}',
            '[Alice movement] safe-idle BDS-local mirror deferred: '
            '{"reason":"local_mirror_witness_precedes_activity","x":12345}',
            '[Alice autonomy] prepared route admitted: {"independentBdsStart":true}',
        ]))
        self.assertEqual(r['witnessHandoffCount'], 2)
        self.assertEqual(r['lastWitnessHandoff'], 'controller_busy')
        self.assertEqual(r['lastIdleMirrorDeferred'], 'local_mirror_witness_precedes_activity')
        self.assertEqual(r['preparedScoutStartCount'], 1)
        self.assertNotIn('12345', str(r))

    def test_untrusted_values_and_broken_json_are_not_exported(self):
        for payload in ['{"outcome":"password=secret"}', '[]', '{broken', 'null']:
            r = module.summarize_witness_log(
                '[Alice autonomy] BDS witness idle handoff: ' + payload)
            self.assertEqual(r['lastWitnessHandoff'], 'other_or_unavailable')
            self.assertNotIn('secret', str(r))

    def test_empty_history_is_unknown_not_a_navigation_failure(self):
        r = module.summarize_witness_log('unrelated message')
        self.assertEqual(r['witnessHandoffCount'], 0)
        self.assertEqual(r['lastWitnessHandoff'], 'unknown')
        self.assertEqual(r['lastIdleMirrorDeferred'], 'unknown')

    def test_quoted_markers_are_not_runtime_handoffs(self):
        r = module.summarize_witness_log(
            '[Alice agent] quoted text [Alice autonomy] BDS witness idle handoff: '
            '{"outcome":"idle_started"}')
        self.assertEqual(r['witnessHandoffCount'], 0)


if __name__ == '__main__':
    unittest.main()
