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

    def test_journal_filters_previous_process_future_and_unrelated_rows(self):
        kind = '[Alice autonomy] BDS witness idle handoff:'
        rows = [{'at': a, 'kind': kind, 'detail': {'outcome': o}}
                for a, o in [(50, 'controller_busy'), (110, 'queued'),
                             (120, 'idle_started'), (210, 'sleeping')]]
        rows.append({'at': 130, 'kind': '[Alice agent] private text',
                     'detail': {'outcome': 'controller_busy'}})
        r = module.summarize_witness_journal(rows, 100, 200)
        self.assertTrue(r['verifiedTimeRange'])
        self.assertEqual(r['witnessHandoffCount'], 2)
        self.assertEqual(r['lastWitnessHandoff'], 'idle_started')
        self.assertNotIn('private', str(r))

    def test_unknown_current_process_time_does_not_inherit_old_journal(self):
        r = module.summarize_witness_journal([], None, 200)
        self.assertFalse(r['verifiedTimeRange'])
        self.assertEqual(r['lastWitnessHandoff'], 'unknown')

    def test_real_endpoint_feedback_and_intermediate_rejection_do_not_mean_success(self):
        r = module.summarize_witness_log('\n'.join([
            '[Alice exploration] endpoint feedback: {"outcome":"unverified","serverMovementVerified":false}',
            '[Alice movement] A* waypoint failure: '
            '{"reason":"navigation_scout_client_server_position_diverged",'
            '"completedLocalWaypoints":1,"totalLocalEstimateBlocks":1.17,"lastAfter":{"x":999}}',
        ]))
        self.assertEqual(r['endpointFeedbackCount'], 1)
        self.assertEqual(r['confirmedEndpointCount'], 0)
        self.assertEqual(r['lastCompletedLocalWaypoints'], 1)
        self.assertEqual(r['lastLocalTravelEstimate'], 1.17)
        self.assertEqual(r['postWaypointDivergenceCount'], 1)
        self.assertNotIn('999', str(r))


    def test_partial_server_step_is_separate_from_whole_route_success(self):
        r = module.summarize_witness_log('\\n'.join([
            '[Alice exploration] endpoint feedback: '
            '{"outcome":"partial_verified","serverMovementVerified":true}',
            '[Alice exploration] endpoint feedback: '
            '{"outcome":"partial_verified","serverMovementVerified":false}',
            '[Alice exploration] endpoint feedback: '
            '{"outcome":"confirmed","serverMovementVerified":true}'
        ]))
        self.assertEqual(r['endpointFeedbackCount'], 3)
        self.assertEqual(r['partialEndpointCount'], 1)
        self.assertEqual(r['confirmedEndpointCount'], 1)
        self.assertEqual(r['unverifiedEndpointCount'], 1)

if __name__ == '__main__':
    unittest.main()
