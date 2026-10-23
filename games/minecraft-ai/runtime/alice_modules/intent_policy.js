// Work resumed after an emergency needs a verified message epoch.
// Without one, no stale player task is replayed automatically.
export function hasMessageEpoch(agent) {
  return Number.isSafeInteger(agent?._aliceMessageEpoch) && agent._aliceMessageEpoch >= 0;
}

export function canResumePendingWork(pending, agent) {
  return Boolean(
    pending &&
    Number.isSafeInteger(pending.epoch) &&
    pending.epoch >= 0 &&
    hasMessageEpoch(agent) &&
    pending.epoch === agent._aliceMessageEpoch
  );
}
