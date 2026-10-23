import fs from 'node:fs';
import path from 'node:path';

const ALLOWED = new Set(['repath', 'jump_forward', 'dig_obstacle', 'pillar_up', 'safe_dig_down', 'destructive_repath']);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class AliceLearningSystem {
  constructor(agent) {
    if (typeof agent?.name !== 'string' || !agent.name) throw new Error('Learning requires agent.name');
    const root = typeof agent.memoryRoot === 'string' && agent.memoryRoot
      ? path.resolve(agent.memoryRoot) : process.cwd();
    this.filePath = path.join(root, 'bots', agent.name, 'alice_learning.json');
    this.data = { version: 1, recoverySkills: {}, knowledgeSkills: {}, episodes: [],
      itemAliases: {}, itemOutcomes: {} };
    this.load();
  }
  load() {
    if (!fs.existsSync(this.filePath)) {
      // A failed first task should NOT cause the next process to look like a new Alice.
      this.save();
      console.log('[Alice learning] initialized persistent memory');
      return;
    }
    try {
      const loaded = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (loaded.version !== 1 || !Array.isArray(loaded.episodes)) throw new Error('unsupported memory schema');
      this.data = { ...this.data, ...loaded, recoverySkills: loaded.recoverySkills || {},
        knowledgeSkills: loaded.knowledgeSkills || {}, itemAliases: loaded.itemAliases || {},
        itemOutcomes: loaded.itemOutcomes || {} };
      console.log('[Alice learning] loaded persisted memory: ' + this.data.episodes.length +
        ' recovery experiences; ' + Object.keys(this.data.knowledgeSkills).length +
        ' learned skill records; ' + Object.keys(this.data.itemAliases).length + ' item aliases');
    } catch (e) {
      console.warn('[Alice learning] load failed; original left untouched: ' + e.message);
      throw e;
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const tmp = this.filePath + '.' + process.pid + '.tmp';
    this.data.updatedAt = new Date().toISOString();
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n', {mode: 0o600});
    fs.renameSync(tmp, this.filePath);
  }
  contextKey(ctx) {
    return ['vertical:' + ctx.vertical, 'obstacle:' + ctx.obstacle, 'scaffold:' + Boolean(ctx.hasScaffold),
      'moving:' + Boolean(ctx.pathfinderMoving)].join('|');
  }
  key(ctx, skill) { return this.contextKey(ctx) + '::' + skill; }
  stats(ctx, skill) {
    return this.data.recoverySkills[this.key(ctx, skill)] ||
      { attempts: 0, successes: 0, failures: 0, totalReward: 0, averageReward: 0, successRate: 0, status: 'experimental' };
  }
  chooseRecoverySkill(ctx, candidates) {
    const valid = candidates.filter(s => ALLOWED.has(s));
    if (!valid.length) return null;
    const unseen = valid.find(s => this.stats(ctx, s).attempts === 0);
    if (unseen) return unseen;
    return valid.slice().sort((a, b) => {
      const sa = this.stats(ctx, a), sb = this.stats(ctx, b);
      const score = s => s.averageReward * 0.65 + s.successRate * 0.35 +
        0.15 / Math.sqrt(s.attempts);
      return score(sb) - score(sa);
    })[0];
  }
  recordRecoveryAttempt({ context, skill, success, reward, details = {} }) {
    if (!ALLOWED.has(skill)) throw new Error('Unapproved recovery skill ' + skill);
    const st = { ...this.stats(context, skill) };
    st.attempts++;
    success ? st.successes++ : st.failures++;
    st.totalReward += clamp(Number(reward) || 0, -1, 1);
    st.averageReward = st.totalReward / st.attempts;
    st.successRate = st.successes / st.attempts;
    st.status = st.attempts >= 10 && st.successRate >= 0.85 ? 'trusted' :
      st.attempts >= 5 && st.successRate >= 0.60 ? 'learned' :
      st.attempts >= 5 && st.successRate < 0.35 ? 'degraded' : 'experimental';
    st.lastUsedAt = new Date().toISOString();
    this.data.recoverySkills[this.key(context, skill)] = st;
    this.data.episodes.push({ at: st.lastUsedAt, domain: 'movement_recovery', context, skill,
      success: Boolean(success), reward: clamp(Number(reward) || 0, -1, 1), details });
    this.data.episodes = this.data.episodes.slice(-500);
    this.save();
    console.log('[Alice learning] ' + skill + ' ' + (success ? 'success' : 'failed') +
      ' (' + st.successes + '/' + st.attempts + ', ' + st.status + ')');
    return st;
  }
  recordKnowledge(skill, success, details = {}) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(skill)) throw new Error('invalid knowledge key');
    const st = this.data.knowledgeSkills[skill] ||
      { attempts: 0, successes: 0, failures: 0, status: 'experimental' };
    st.attempts++;
    success ? st.successes++ : st.failures++;
    st.successRate = st.successes / st.attempts;
    st.status = st.attempts >= 8 && st.successRate >= .85 ? 'trusted' :
      st.attempts >= 3 && st.successRate >= .6 ? 'learned' : 'experimental';
    st.lastResult = details;
    st.lastUsedAt = new Date().toISOString();
    this.data.knowledgeSkills[skill] = st;
    this.save();
    return st;
  }
  rememberItemAlias(phrase, item, registry) {
    const term = String(phrase || '').trim().toLowerCase();
    const canonical = String(item || '').replace(/^minecraft:/, '').trim();
    if (!/^[\p{L}\p{N}_ -]{1,32}$/u.test(term) ||
        !/^[a-z][a-z0-9_]{1,63}$/.test(canonical)) throw Error('Invalid alias or canonical item');
    if (['__proto__','prototype','constructor'].includes(term)) throw Error('Reserved memory key');
    if (!registry?.itemsByName?.[canonical]) throw Error('Unknown item in server registry');
    if (Object.keys(this.data.itemAliases).length >= 200 && !(term in this.data.itemAliases))
      throw Error('Item alias memory full');
    this.data.itemAliases[term] = canonical;
    this.save();
    return {phrase:term, item:canonical};
  }
  resolveItemAlias(phrase) {
    return this.data.itemAliases[String(phrase || '').trim().toLowerCase()] || null;
  }
  recordItemOutcome(item, action, outcome) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(String(item)) ||
        !['gather','craft','withdraw','deposit'].includes(action)) throw Error('Invalid observed action');
    const count=Number(outcome?.delta);
    const ok=outcome?.ok === true && Number.isSafeInteger(count) && count > 0;
    const key=action+':'+item;
    const old=this.data.itemOutcomes[key] || {attempts:0, successes:0, observedItems:0};
    const record={attempts:old.attempts+1, successes:old.successes+Number(ok),
      observedItems:old.observedItems+(ok?count:0), lastAt:new Date().toISOString(),
      lastReason:String(outcome?.reason||'').slice(0,90)};
    this.data.itemOutcomes[key]=record;
    this.save();
    return {key,...record};
  }
  summary() { return { experiences: this.data.episodes.length,
    skills: Object.keys(this.data.recoverySkills).length,
    knowledgeSkills: Object.keys(this.data.knowledgeSkills).length,
    itemAliases: Object.keys(this.data.itemAliases).length,
    itemOutcomes: Object.keys(this.data.itemOutcomes).length }; }
}
