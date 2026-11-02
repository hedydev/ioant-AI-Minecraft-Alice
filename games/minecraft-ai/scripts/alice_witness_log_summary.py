"""Fixed enums from existing witness handoff logs; never export log text."""


def summarize_witness_log(tail):
    import json
    handoff = {
        'runtime_not_ready', 'autonomy_not_enabled', 'human_stop', 'not_idle',
        'follow_intent', 'controller_busy', 'sleeping', 'invalid_clock',
        'already_pending', 'handoff_cooldown', 'queued', 'idle_started',
        'scheduler_unavailable', 'scout_client_server_position_diverged',
        'scout_bds_position_unavailable', 'scout_client_position_unavailable',
    }
    mirror = {
        'idle_mirror_missing_state', 'idle_mirror_safety_gate',
        'idle_mirror_cooldown', 'already_aligned',
        'scout_bds_position_unavailable', 'scout_client_position_unavailable',
        'idle_mirror_not_stationary_same_life', 'local_mirror_activity_unknown',
        'local_mirror_witness_precedes_activity', 'idle_mirror_no_server_position',
        'idle_mirror_delta_out_of_bound',
    }
    result = {'witnessHandoffCount': 0, 'lastWitnessHandoff': 'unknown',
              'idleMirrorDeferredCount': 0, 'lastIdleMirrorDeferred': 'unknown',
              'preparedScoutStartCount': 0, 'endpointFeedbackCount': 0,
              'confirmedEndpointCount': 0, 'unverifiedEndpointCount': 0,
              'waypointFailureCount': 0, 'lastWaypointFailure': 'unknown',
              'lastCompletedLocalWaypoints': None, 'lastLocalTravelEstimate': None}
    for line in tail.splitlines():
        if line.startswith('[Alice autonomy] prepared route admitted:'):
            result['preparedScoutStartCount'] += 1
        for marker, key, count, field, allowed in (
            ('[Alice autonomy] BDS witness idle handoff:', 'lastWitnessHandoff',
             'witnessHandoffCount', 'outcome', handoff),
            ('[Alice movement] safe-idle BDS-local mirror deferred:',
             'lastIdleMirrorDeferred', 'idleMirrorDeferredCount', 'reason', mirror),
        ):
            if not line.startswith(marker):
                continue
            result[count] += 1
            try:
                row = json.loads(line.split(marker, 1)[1])
                value = row.get(field) if isinstance(row, dict) else None
                result[key] = value if value in allowed else 'other_or_unavailable'
            except (ValueError, TypeError):
                result[key] = 'other_or_unavailable'
        for marker in ('[Alice exploration] endpoint feedback:',
                       '[Alice movement] A* waypoint failure:'):
            if not line.startswith(marker):
                continue
            try:
                row = json.loads(line.split(marker, 1)[1])
                if not isinstance(row, dict):
                    continue
                if 'endpoint feedback:' in marker:
                    result['endpointFeedbackCount'] += 1
                    if row.get('outcome') == 'confirmed' and row.get('serverMovementVerified') is True:
                        result['confirmedEndpointCount'] += 1
                    elif row.get('outcome') in ('unverified', 'blocked'):
                        result['unverifiedEndpointCount'] += 1
                else:
                    result['waypointFailureCount'] += 1
                    reason = row.get('reason')
                    result['lastWaypointFailure'] = reason if isinstance(reason, str) and reason in {
                        'pathfinder_no_path', 'navigation_scout_client_server_position_diverged',
                        'navigation_scout_bds_position_unavailable', 'scout_timeout',
                        'scout_conditions_changed', 'scout_waypoint_not_reached',
                        'scout_cancelled', 'scout_cancelled_after_waypoint',
                    } else 'other_or_unavailable'
                    n = row.get('completedLocalWaypoints')
                    result['lastCompletedLocalWaypoints'] = n if type(n) is int and 0 <= n <= 32 else None
                    n = row.get('totalLocalEstimateBlocks')
                    result['lastLocalTravelEstimate'] = round(n, 3) if type(n) in (int, float) and 0 <= n <= 32 else None
            except (ValueError, TypeError):
                pass
    return result


def summarize_witness_journal(records, since, now):
    import json
    if type(since) is not int or type(now) is not int or not 0 < since <= now:
        return {'verifiedTimeRange': False, **summarize_witness_log('')}
    markers = {'[Alice autonomy] BDS witness idle handoff:',
               '[Alice movement] safe-idle BDS-local mirror deferred:',
               '[Alice autonomy] prepared route admitted:',
               '[Alice exploration] endpoint feedback:',
               '[Alice movement] A* waypoint failure:'}
    rows = []
    for r in records:
        if (not isinstance(r, dict) or type(r.get('at')) is not int or
                not since <= r['at'] <= now or not isinstance(r.get('kind'), str) or
                r['kind'] not in markers or
                not isinstance(r.get('detail'), dict)):
            continue
        rows.append(r)
    rows.sort(key=lambda r: r['at'])
    # Feed only exact known event kinds; the shared parser discards arbitrary
    # detail values. Never export journal rows, positions or free-form text.
    lines = [r['kind'] + ' ' + json.dumps(r['detail']) for r in rows]
    return {'verifiedTimeRange': True, **summarize_witness_log('\n'.join(lines))}
