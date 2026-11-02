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
              'preparedScoutStartCount': 0}
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
    return result
