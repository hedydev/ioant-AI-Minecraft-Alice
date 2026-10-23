import { AliceSafety } from './safety.js';
import { AliceSocial } from './social.js';
import { hasUsableWeapon, countWoodResources, learnBasicWeapon, collectWoodSmart } from './tasks.js';
import { AUTONOMY_GRACE_MS, AUTONOMY_WORK_COOLDOWN_MS, decideIdleWork } from './autonomy_policy.js';

export class AliceAutonomy {
  constructor(agent) {
    this.agent=agent;
    this.safety=new AliceSafety(agent);
    this.social=new AliceSocial(agent);
    this.timer=null;
    this.busy=false;
    this.lastHumanAt=Date.now();
    this.nextWorkAt=Date.now()+AUTONOMY_GRACE_MS;
    this.lastLookAt=0;
  }
  start() {
    if (this.timer) return;
    // Combat is not idle work; start it before the idle task timer.
    this.safety.start();
    this.social.start();
    this.timer=setInterval(()=>this.tick().catch(e=>console.warn('[Alice autonomy] tick: '+String(e))),5000);
    this.timer.unref?.();
    console.log('[Alice autonomy] enabled; idle work starts after 20s');
  }
  stop() {
    this.social.stop();
    this.safety.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer=null;
  }
  notifyHumanMessage() {
    this.lastHumanAt=Date.now();
    this.nextWorkAt=Math.max(this.nextWorkAt,Date.now()+AUTONOMY_GRACE_MS);
  }
  async tick() {
    if (this.busy || Date.now()<this.nextWorkAt || Date.now()-this.lastHumanAt<AUTONOMY_GRACE_MS) return;
    const agent=this.agent, bot=agent.bot;
    if (!bot?.entity || agent.actions?.executing || agent.aliceCore?.state!=='IDLE' ||
        agent.aliceCore?.hasFollowIntent?.() || bot.interrupt_code) return;
    // Never start elective resource work while wounded or exposed to a nearby hostile.
    if (bot.health<14 || this.safety.active || this.safety.threat()) return;
    this.busy=true;
    this.nextWorkAt=Date.now()+AUTONOMY_WORK_COOLDOWN_MS;
    try {
      try { await bot.armorManager?.equipAll?.(); }
      catch(e) { console.warn('[Alice autonomy] armor: '+String(e)); }
      let job=null, action=null;
      // Shared Paper/Bedrock pure job ordering; Paper task executors unchanged.
      const next=decideIdleWork({hasUsableWeapon:hasUsableWeapon(bot),woodResources:countWoodResources(bot)});
      if (next==='LEARN_WEAPON') {
        job=()=>learnBasicWeapon(agent);
        action='action:aliceLearnWeapon';
      } else if (next==='COLLECT_WOOD') {
        job=()=>collectWoodSmart(agent,4);
        action='action:aliceCollectWood';
      }
      if (job) {
        this.social.activity.markAutonomousAction(action);
        console.log('[Alice autonomy] starting '+action);
        const result=await agent.actions.runAction(action,job,{timeout:5});
        console.log('[Alice autonomy] '+action+' complete '+JSON.stringify(result));
      } else if (Date.now()-this.lastLookAt>20000) {
        this.lastLookAt=Date.now();
        await bot.look(Math.random()*Math.PI*2, (Math.random()-.5)*.35, true);
      }
    } finally { this.busy=false; }
  }
}
