import { AliceLearningSystem } from './learning.js';

export const AliceState = Object.freeze({
  IDLE: 'IDLE', FOLLOW: 'FOLLOW', COMBAT: 'COMBAT', GUARD: 'GUARD',
  SURVIVE: 'SURVIVE', GATHER: 'GATHER', CRAFT: 'CRAFT', RECOVER: 'RECOVER', STORAGE: 'STORAGE', EXPLORE: 'EXPLORE', BUILD: 'BUILD'
});

export class AliceCore {
  constructor(agent) {
    if (!agent?.name) throw new Error('AliceCore needs an initialized agent name');
    this.agent = agent;
    this.state = AliceState.IDLE;
    this.intent = { type: AliceState.IDLE, data: {} };
    this.changedAt = Date.now();
    this.learning = new AliceLearningSystem(agent);
    this.safetyActive = false;
    this.pendingWood = null;
    this.taskProgress = null;
  }

  transition(next, reason = '') {
    if (!Object.values(AliceState).includes(next)) throw new Error('Invalid Alice state: ' + next);
    if (next === this.state) return;
    console.log('[Alice core] ' + this.state + ' -> ' + next + (reason ? ' (' + reason + ')' : ''));
    this.state = next;
    this.changedAt = Date.now();
  }

  setFollowIntent(playerName, distance = 3) {
    this.intent = { type: AliceState.FOLLOW, data: { playerName, distance } };
    this.transition(AliceState.FOLLOW, 'follow ' + playerName);
  }
  hasFollowIntent() { return this.intent.type === AliceState.FOLLOW; }
  resumeIntent(reason = 'resume') { this.transition(this.intent.type, reason); }
  beginRecover(reason) { this.transition(AliceState.RECOVER, reason); }
  endRecover(reason) { this.resumeIntent(reason); }

  allowsMode(name) {
    // Mint's legacy self_preservation calls a missing skills.moveAway() and
    // competes with AliceSafety for pathfinder. Do not schedule this broken mode.
    // AliceSafety is the sole survival owner; keep legacy defense only if it is offline.
    if (name === 'self_preservation') return false;
    // AliceSafety owns reactive combat when running: avoid competing PvP/pathfinder controllers.
    if (this.safetyActive && (name === 'self_defense' || name === 'cowardice')) return false;
    if (this.state === AliceState.IDLE) return true;
    if ([AliceState.FOLLOW, AliceState.GUARD, AliceState.COMBAT, AliceState.RECOVER,
         AliceState.GATHER, AliceState.CRAFT, AliceState.EXPLORE, AliceState.BUILD].includes(this.state)) return name === 'self_defense';
    return false;
  }

  onActionStart(label) {
    if (label === 'action:followPlayer') { this.transition(AliceState.FOLLOW, label); return; }
    if (label === 'mode:self_preservation') { this.transition(AliceState.SURVIVE, label); return; }
    if (label === 'mode:aliceSafety') return;
    if (label === 'mode:self_defense') {
      this.transition(this.hasFollowIntent() ? AliceState.GUARD : AliceState.COMBAT, label);
      return;
    }
    if (label === 'mode:unstuck') { this.beginRecover(label); return; }
    if (['action:collectBlocks', 'action:collectWood', 'action:aliceCollectWood', 'action:searchForBlock'].includes(label)) {
      if (!this.hasFollowIntent()) this.intent = { type: AliceState.IDLE, data: {} };
      this.transition(AliceState.GATHER, label);
    }
    if (['action:craftRecipe', 'action:smeltItem', 'action:aliceLearnWeapon'].includes(label)) {
      if (!this.hasFollowIntent()) this.intent = { type: AliceState.IDLE, data: {} };
      this.transition(AliceState.CRAFT, label);
    }
  }

  onActionEnd(label, result = {}) {
    if (label.startsWith('mode:')) {
      this.resumeIntent(label + ' ended');
      return;
    }
    if (label === 'action:followPlayer') {
      if (result.interrupted && this.hasFollowIntent()) this.transition(AliceState.FOLLOW, 'resumable follow');
      else if (!result.interrupted) this.stop('follow ended');
      return;
    }
    if (['action:collectBlocks', 'action:collectWood', 'action:aliceCollectWood', 'action:craftRecipe',
         'action:smeltItem', 'action:aliceLearnWeapon'].includes(label)) this.resumeIntent(label + ' ended');
  }

  onActionError(label, error) {
    console.warn('[Alice core] action failure ' + label + ': ' + String(error));
    if (this.hasFollowIntent()) this.resumeIntent('resume after failure');
    else this.transition(AliceState.RECOVER, 'failed ' + label);
  }

  stop(reason = 'stop') {
    this.intent = { type: AliceState.IDLE, data: {} };
    this.pendingWood = null;
    this.taskProgress = null;
    this.transition(AliceState.IDLE, reason);
  }
}
