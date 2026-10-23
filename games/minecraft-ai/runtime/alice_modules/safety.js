import { canResumePendingWork } from './intent_policy.js';
import pf from 'mineflayer-pathfinder';
import { cautiousPathOptions } from './terrain.js';
import * as mc from '../../utils/mcdata.js';
import { equipBestWeapon } from './equipment.js';
import { selectThreat, decideCombatTactic, shouldInterveneAfterRetreat } from './safety_policy.js';

const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));

export class AliceSafety {
  constructor(agent) {
    this.agent=agent;
    this.bot=agent.bot;
    this.active=false;
    this.timer=null;
    this.lastSelfDamageAt=0;
    this.lastOwnerDamageAt=0;
    this.lastHealth=null;
    this.lastReactionAt=0;
    this.cooldownUntil=0;
    this.lastHandledSelfDamageAt=0;
    this.lastHandledOwnerDamageAt=0;
    this.resumingWood=false;
    this._onEntityHurt=entity=>{
      if (entity?.id===this.bot.entity?.id) this.lastSelfDamageAt=Date.now();
      const owner=this.ownerEntity();
      if (owner && entity?.id===owner.id) this.lastOwnerDamageAt=Date.now();
    };
    this._onHealth=()=>{
      if (this.lastHealth!=null && this.bot.health<this.lastHealth)
        this.lastSelfDamageAt=Date.now();
      this.lastHealth=this.bot.health;
    };
    this._onDeath=()=>{
      // Never carry stale harvest results or outdated danger timers into a new life.
      this.agent.aliceCore.pendingWood=null;
      this.agent.aliceCore.taskProgress=null;
      this.lastSelfDamageAt=0;
      this.lastOwnerDamageAt=0;
      this.cooldownUntil=Date.now()+2500;
      this.lastHealth=0;
      try {this.bot.pvp?.stop();} catch(_){}
      console.warn('[Alice safety] death: cancelled unfinished gathering and combat session');
    };
  }

  ownerEntity() {
    const bot=this.bot, core=this.agent.aliceCore;
    const name=core?.intent?.data?.playerName || this.agent.last_sender;
    if (!name) return null;
    return bot.players[name]?.entity || bot.players['.'+name]?.entity || null;
  }

  start() {
    if (this.timer) return;
    this.lastHealth=this.bot.health;
    this.bot.on('entityHurt',this._onEntityHurt);
    this.bot.on('health',this._onHealth);
    this.bot.on('death',this._onDeath);
    this.agent.aliceCore.safetyActive=true;
    this.timer=setInterval(()=>this.tick().catch(err=>{
      console.error('[Alice safety] realtime controller disabled after error: '+String(err));
      // Do not silently leave the bot without its previous defense mode.
      this.stop();
    }),300);
    this.timer.unref?.();
    console.log('[Alice safety] real-time self-defense and player guard enabled');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer=null;
    this.bot.off('entityHurt',this._onEntityHurt);
    this.bot.off('health',this._onHealth);
    this.bot.off('death',this._onDeath);
    if (this.agent.aliceCore) this.agent.aliceCore.safetyActive=false;
  }

  threat() {
    const owner=this.ownerEntity();
    const hostiles=Object.values(this.bot.entities||{}).filter(e=>e?.position &&
      e.id!==this.bot.entity?.id && mc.isHostile(e));
    return selectThreat({
      now:Date.now(), health:this.bot.health, selfPosition:this.bot.entity?.position,
      ownerPosition:owner?.position, lastSelfDamageAt:this.lastSelfDamageAt,
      lastOwnerDamageAt:this.lastOwnerDamageAt, hostiles
    });
  }


  async resumeInterruptedWood() {
    const agent=this.agent, core=agent.aliceCore, pending=core?.pendingWood;
    if (!pending || this.resumingWood || this.active || this.bot.health < 10 ||
        Date.now()-this.lastReactionAt < 1500) return;
    // A later human command supersedes an interrupted gathering job.
    if (!canResumePendingWork(pending, agent)) {
      core.pendingWood=null;
      console.log('[Alice safety] discarded interrupted wood work: message epoch missing or superseded');
      return;
    }
    if (!pending.remaining || pending.remaining<=0) { core.pendingWood=null; return; }
    const actions=agent.actions;
    if (actions.executing || actions.currentActionLabel?.startsWith('mode:') ||
        actions.currentActionLabel?.includes('aliceCollectWood')) return;
    this.resumingWood=true;
    const amount=pending.remaining;
    console.log('[Alice safety] resuming interrupted wood gather: remaining='+amount);
    try {
      const {collectWoodSmart}=await import('./tasks.js');
      await actions.runAction('action:aliceCollectWood',async()=>{
        core.transition('GATHER','resume after safety');
        await collectWoodSmart(agent,amount,{resume:true});
      },{timeout:10});
    } catch(err) {
      console.error('[Alice safety] resume wood failed: '+String(err));
      core.pendingWood=null;
    } finally { this.resumingWood=false; }
  }


  createRetreatMovements() {
    const moves=new pf.Movements(this.bot);
    return cautiousPathOptions(moves);
  }

  async evadeSafely(entity, milliseconds=1400, gap=6) {
    if (!entity?.position || !this.bot.entity?.position) return false;
    const bot=this.bot;
    const before=bot.entity.position.distanceTo(entity.position);
    bot.pathfinder.setMovements(this.createRetreatMovements());
    const away=new pf.goals.GoalInvert(new pf.goals.GoalFollow(entity,gap));
    bot.pathfinder.setGoal(away,true);
    try {
      const until=Date.now()+milliseconds;
      while (!bot.interrupt_code && Date.now()<until) {
        await wait(150);
        if (!bot.entities?.[entity.id]) break;
        if (bot.entity.position.distanceTo(entity.position)>gap+1) break;
      }
    } finally {
      bot.pathfinder.stop();
    }
    const after=bot.entity.position.distanceTo(entity.position);
    console.log('[Alice safety] EVADE distance='+before.toFixed(1)+' -> '+after.toFixed(1));
    return after>before+0.5;
  }

  async eatToRecover() {
    const bot=this.bot;
    if (bot.food==null || bot.food>=18 || bot.health>=18) return false;
    const foods=['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken',
      'baked_potato','bread','apple','carrot'];
    const item=foods.map(name=>bot.inventory.items().find(i=>i.name===name)).find(Boolean);
    if (!item) {
      console.log('[Alice safety] no food available for regeneration');
      return false;
    }
    try {
      await bot.equip(item,'hand');
      await bot.consume();
      console.log('[Alice safety] ate '+item.name+' for hunger/regeneration');
      return true;
    } catch(err) {
      console.warn('[Alice safety] recovery food failed: '+String(err));
      return false;
    }
  }

  async engage(danger) {
    const bot=this.bot, target=danger.target;
    const distance=bot.entity.position.distanceTo(target.position);
    const tactic=decideCombatTactic({health:bot.health,enemyType:target.name,
      distance,lastDamageMs:Date.now()-this.lastSelfDamageAt});
    console.log('[Alice safety] health='+bot.health+'/20 tactic='+tactic+
      ' target='+target.name+' range='+distance.toFixed(1));
    if (tactic==='RETREAT' || tactic==='KITE_RECOVER') {
      bot.pvp.stop();
      await this.evadeSafely(target,2400,9);
      // Eating improves hunger/saturation; health regeneration occurs via game mechanics.
      if (bot.entities?.[target.id] && bot.entity.position.distanceTo(target.position)>7)
        await this.eatToRecover();
      return;
    }
    if (tactic==='EVADE_COUNTER') {
      await this.evadeSafely(target,1100,5);
      if (bot.health<=13) return; // new damage changed the plan
    }
    const weapon=await equipBestWeapon(bot);
    if (!weapon && bot.health<18) {
      console.warn('[Alice safety] no weapon while injured; disengaging rather than fighting with junk');
      await this.evadeSafely(target,2200,9);
      return;
    }
    bot.pvp.attack(target);
    const until=Date.now()+7000;
    try {
      while (Date.now()<until && !bot.interrupt_code) {
        if (!bot.entities?.[target.id] ||
            bot.entity.position.distanceTo(target.position)>13) break;
        if (bot.health<=13) {
          bot.pvp.stop();
          console.log('[Alice safety] health dropped during counterattack, retreating');
          await this.evadeSafely(target,2200,9);
          return;
        }
        await wait(250);
      }
    } finally { bot.pvp.stop(); }
  }

  async tick() {
    if (this.active || !this.bot?.entity || this.bot.health<=0) return;
    if (Date.now()-this.lastReactionAt<1200) return;
    const danger=this.threat();
    if (!danger) {
      await this.resumeInterruptedWood();
      return;
    }
    // Don't repeatedly steal FOLLOW after a successful retreat merely because
    // a distant zombie is still loaded. Nearby attackers or new damage override.
    const now=Date.now();
    const distance=this.bot.entity.position.distanceTo(danger.target.position);
    const newSelfHit=this.lastSelfDamageAt>this.lastHandledSelfDamageAt;
    const newOwnerHit=this.lastOwnerDamageAt>this.lastHandledOwnerDamageAt;
    if (!shouldInterveneAfterRetreat({
      now,cooldownUntil:this.cooldownUntil,distance,newSelfHit,newOwnerHit
    })) return;
    this.active=true;
    this.lastReactionAt=now;
    this.lastHandledSelfDamageAt=this.lastSelfDamageAt;
    this.lastHandledOwnerDamageAt=this.lastOwnerDamageAt;
    const agent=this.agent, bot=this.bot, core=agent.aliceCore;
    const previous=agent.actions.currentActionLabel;
    console.warn('[Alice safety] '+danger.type+' > '+(previous||'IDLE')+
      ' target='+danger.target?.name);
    core.transition(danger.type==='SURVIVE'?'SURVIVE':
      danger.type==='GUARD'?'GUARD':'COMBAT','priority '+danger.priority);
    try {
      // Alice may be in mineflayer-collectblock.collect(). Signal the plugin
      // to cancel its target queue before ActionManager waits for release.
      // Do not await the plugin here: survival must begin as soon as possible.
      if (previous==='action:aliceCollectWood' || previous==='action:collectBlocks') {
        try {
          const cancel=bot.collectBlock?.cancelTask?.();
          if (cancel?.catch) void cancel.catch(err=>
            console.warn('[Alice safety] collect cancel failed: '+String(err)));
          if (cancel) console.warn('[Alice safety] cancelling active collectBlock before intervention');
        } catch(err) {
          console.warn('[Alice safety] could not request collectBlock cancellation: '+String(err));
        }
      }
      const result=await agent.actions.runAction('mode:aliceSafety',async()=>{
        // The interrupted task has finished releasing ActionManager ownership here.
        core.transition(danger.type==='SURVIVE'?'SURVIVE':
          danger.type==='GUARD'?'GUARD':'COMBAT','safety owns action');
        await this.engage(danger);
      },{timeout:0.5});
      console.log('[Alice safety] '+danger.type+' resolved; interrupted='+Boolean(result?.interrupted));
    } catch(err) {
      console.error('[Alice safety] intervention failed: '+String(err));
    } finally {
      // Threats immediately beside Alice can still retrigger. For distant mobs,
      // allow the current movement/task to regain control before considering another retreat.
      this.cooldownUntil=Date.now()+4000;
      if (bot.health>0) core.resumeIntent('safety complete');
      this.active=false;
    }
  }
}
