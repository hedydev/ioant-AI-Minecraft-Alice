import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMessageEpoch, canResumePendingWork } from '../runtime/alice_modules/intent_policy.js';

test('older Mindcraft missing epoch remains compatible but never resumes a stale task', () => {
  const agent = {};
  assert.equal(hasMessageEpoch(agent), false);
  assert.equal(canResumePendingWork({ epoch: null, remaining: 4 }, agent), false);
  assert.equal(canResumePendingWork({ epoch: 0, remaining: 4 }, agent), false);
});

test('verified epoch permits resuming same work after safety interruption', () => {
  const agent = { _aliceMessageEpoch: 13 };
  const pending = { epoch: 13, remaining: 4 };
  assert.equal(hasMessageEpoch(agent), true);
  assert.equal(canResumePendingWork(pending, agent), true);
});

test('newer player command always supersedes interrupted older work', () => {
  const agent = { _aliceMessageEpoch: 14 };
  const pending = { epoch: 13, remaining: 4 };
  assert.equal(canResumePendingWork(pending, agent), false);
});

test('invalid, negative and untrusted epoch types are not accepted', () => {
  for (const value of [-1, NaN, Infinity, '13', 1.4, null, undefined]) {
    assert.equal(hasMessageEpoch({ _aliceMessageEpoch: value }), false);
  }
});
