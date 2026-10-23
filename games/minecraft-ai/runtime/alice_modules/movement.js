import { inspectAdvance, cautiousPathOptions } from './terrain.js';
import { AlicePlayerTracker } from './tracking.js';
import { formatLocation } from './inventory_policy.js';
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const scaffoldNames = ['dirt', 'cobblestone', 'cobbled_deepslate', 'netherrack',
  'stone', 'tuff', 'andesite', 'diorite', 'granite', 'oak_planks', 'spruce_planks', 'birch_planks'];
const protectedNames = new Set(['bedrock','barrier','chest','trapped_chest','barrel','ender_chest',
  'crafting_table','furnace','blast_furnace','smoker','enchanting_table','beacon',
  'nether_portal','end_portal','end_portal_frame','respawn_anchor']);
const hazardous = new Set(['lava','fire','soul_fire','magma_block','cactus','campfire','soul_campfire']);
const isSolid = b => b && b.boundingBox !== 'empty' && !['air','cave_air','void_air'].includes(b.name);

export class AliceMovementController {
  constructor(bot, core = null) {
    this.bot = bot;
    this.core = core;
    this.lastPosition = bot.entity.position.clone();
    this.lastDistance = Infinity;
    this.lastProgressAt = Date.now();
    this.recoveryStage = 0;
    this.recovering = false;
    this.tried = new Set();
    this.tracker = new AlicePlayerTracker(bot,core?.agent?.name || bot.username);
    this.lastTrackingLog = 0;
    this.navigationMode = 'none';
    this.lastTerrainStatus = null;
    this.lastTerrainLogAt=0;
    this.failedRecoveryStreak=0;
    this.lastRecoveryNoticeAt=0;
  }
  log(message) { console.log('[Alice movement] ' + message); }
  warn(message) { console.warn('[Alice movement] ' + message); }
  scaffold() {
    for (const name of scaffoldNames) {
      const item = this.bot.inventory.items().find(i => i.name === name);
      if (item) return item;
    }
    return null;
  }
  movements(destructive = false) {
    const moves = new pf.Movements(this.bot);
    cautiousPathOptions(moves);
    moves.canDig = destructive;
    moves.allow1by1towers = destructive;
    moves.digCost = 8;
    moves.placeCost = 8;
    moves.scafoldingBlocks = destructive ? this.bot.inventory.items()
      .filter(i => scaffoldNames.includes(i.name)).map(i => i.type) : [];
    // Pathfinder, not only manual dig, must respect this list.
    if (moves.blocksCantBreak?.add) {
      for (const name of protectedNames) {
        const type = this.bot.registry?.blocksByName?.[name]?.id;
        if (type != null) moves.blocksCantBreak.add(type);
      }
    }
    return moves;
  }
  setFollow(player, distance, destructive = false) {
    this.bot.pathfinder.setMovements(this.movements(destructive));
    this.bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, distance), true);
    this.navigationMode='visible';
  }
  setCoordinateGoal(fix, distance=8) {
    this.bot.pathfinder.setMovements(this.movements(false));
    this.bot.pathfinder.setGoal(new pf.goals.GoalNear(fix.x,fix.y,fix.z,Math.max(6,distance)));
    this.navigationMode='coordinate';
  }
  direction(player) {
    const p = this.bot.entity.position, dx = player.position.x - p.x, dz = player.position.z - p.z;
    return Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  }
  context(player) {
    const p = this.bot.entity.position.floored(), [x,z] = this.direction(player);
    const front = this.bot.blockAt(new Vec3(p.x+x,p.y,p.z+z));
    const head = this.bot.blockAt(new Vec3(p.x+x,p.y+1,p.z+z));
    const top = this.bot.blockAt(p.offset(0,2,0));
    const dy = player.position.y - this.bot.entity.position.y;
    const terrain=inspectAdvance(this.bot,this.bot.entity.position,player.position);
    return { terrain, vertical: dy > 1.25 ? 'up' : dy < -1.5 ? 'down' : 'level',
      obstacle: isSolid(front) ? 'front' : isSolid(head) ? 'head' : isSolid(top) ? 'overhead' : 'clear',
      hasScaffold: Boolean(this.scaffold()), pathfinderMoving: this.bot.pathfinder.isMoving() };
  }
  async jumpForward(player) {
    const terrain=inspectAdvance(this.bot,this.bot.entity.position,player.position);
    if (!terrain.canStep) {
      this.warn('jump rejected: '+terrain.status);
      return false;
    }
    const before = this.bot.entity.position.clone();
    this.bot.pathfinder.stop();
    this.bot.clearControlStates();
    try {
      await this.bot.lookAt(player.position.offset(0,1,0), true);
      this.bot.setControlState('forward', true);
      this.bot.setControlState('jump', true);
      await sleep(800);
    } finally { this.bot.setControlState('jump',false); this.bot.setControlState('forward',false); }
    return this.bot.entity.position.distanceTo(before) >= .3;
  }
  canBreak(block) {
    return isSolid(block) && !protectedNames.has(block.name) &&
      !block.name.includes('shulker_box') && !hazardous.has(block.name) &&
      this.bot.canDigBlock?.(block) !== false;
  }
  async digObstacle(player) {
    const p = this.bot.entity.position.floored(), [x,z] = this.direction(player);
    const spots = [p.offset(x,0,z),p.offset(x,1,z)];
    if (player.position.y > this.bot.entity.position.y + 1) spots.push(p.offset(0,2,0));
    for (const pos of spots) {
      const block = this.bot.blockAt(pos);
      if (!this.canBreak(block)) continue;
      try {
        if (this.bot.tool?.equipForBlock) await this.bot.tool.equipForBlock(block);
        this.warn('digging obstacle ' + block.name + ' at ' + pos);
        await this.bot.dig(block, true);
        return true;
      } catch (e) { this.warn('digging failed: ' + String(e)); }
    }
    return false;
  }
  async safeDown(player) {
    if (player.position.y >= this.bot.entity.position.y - 1.5) return false;
    const p = this.bot.entity.position.floored();
    const floor = this.bot.blockAt(p.offset(0,-1,0));
    const below = this.bot.blockAt(p.offset(0,-2,0));
    if (!this.canBreak(floor) || !isSolid(below) || hazardous.has(below.name)) return false;
    try { await this.bot.dig(floor, true); return true; }
    catch (e) { this.warn('safe descent failed: ' + String(e)); return false; }
  }
  async runSkill(skill, player, distance) {
    if (skill === 'repath') { this.setFollow(player,distance); return true; }
    if (skill === 'jump_forward') {
      const ok = await this.jumpForward(player); this.setFollow(player,distance); return ok;
    }
    if (skill === 'dig_obstacle') {
      this.bot.pathfinder.stop();
      const ok = await this.digObstacle(player); this.setFollow(player,distance); return ok;
    }
    if (skill === 'safe_dig_down') {
      this.bot.pathfinder.stop();
      const ok = await this.safeDown(player); this.setFollow(player,distance); return ok;
    }
    if (skill === 'pillar_up' || skill === 'destructive_repath') {
      // Pathfinder owns block placement; no blind pillar under a moving entity.
      this.setFollow(player,distance,true);
      return true;
    }
    throw new Error('Unregistered movement skill ' + skill);
  }
  candidates(ctx) {
    // No blind jump, dig or scaffold into unsupported / unloaded terrain.
    if (['UNKNOWN','DROP_OR_VOID','HAZARD','UNSAFE_START'].includes(ctx.terrain.status))
      return ['repath'];
    const result = ['repath', 'jump_forward'];
    if (ctx.obstacle !== 'clear') result.push('dig_obstacle');
    if (ctx.vertical === 'down') result.push('safe_dig_down');
    if (ctx.vertical === 'up' && ctx.hasScaffold) result.push('pillar_up');
    result.push('destructive_repath');
    return result;
  }
  async recover(player, distance) {
    if (this.recovering || this.bot.interrupt_code) return;
    this.recovering = true;
    this.recoveryStage = Math.min(this.recoveryStage + 1, 5);
    const ctx = this.context(player);
    const choices = this.candidates(ctx).filter(x => !this.tried.has(x));
    const candidates = choices.length ? choices : this.candidates(ctx);
    // The first two stages prefer non-destructive recovery before learned policy can use destructive moves.
    const eligible = this.recoveryStage === 1 ? ['repath'] :
      this.recoveryStage === 2 && ctx.terrain.canStep ? ['jump_forward'] : candidates;
    const skill = this.core?.learning?.chooseRecoverySkill(ctx,eligible) || eligible[0];
    if (!skill) { this.recovering = false; return; }
    this.tried.add(skill);
    const start = this.bot.entity.position.clone();
    const before = start.distanceTo(player.position);
    this.core?.beginRecover('movement ' + skill);
    this.warn('RECOVER stage=' + this.recoveryStage + ' skill=' + skill + ' obstacle=' + ctx.obstacle +
      ' terrain=' + ctx.terrain.status);
    try {
      await this.runSkill(skill,player,distance);
      await sleep(1300);
      const moved = start.distanceTo(this.bot.entity.position);
      const closed = before - this.bot.entity.position.distanceTo(player.position);
      const success = closed >= .5 || (moved >= .4 && closed >= -.2);
      this.core?.learning?.recordRecoveryAttempt({ context:ctx,skill,success,
        reward:Math.max(-1,Math.min(1,closed/3)),details:{moved,closed} });
      if(success)this.failedRecoveryStreak=0;
      else this.failedRecoveryStreak++;
      if(!success&&this.failedRecoveryStreak>=3&&Date.now()-this.lastRecoveryNoticeAt>60000){
        this.lastRecoveryNoticeAt=Date.now();
        const message='前面道路不好走，我已经多次重新寻路。'+formatLocation(this.bot)+'你可以过来接我。';
        this.warn('navigation assistance requested: '+message);
        if(this.core?.agent?.routeResponse)void Promise.resolve().then(()=>this.core.agent.routeResponse('system',message)).catch(err=>this.warn('navigation chat failed: '+String(err)));
      }
      if (success) {
        this.recoveryStage = 0;
        this.tried.clear();
        this.core?.endRecover('movement progress');
      }
    } catch (err) {
      this.warn('RECOVER failed: ' + String(err));
      this.core?.learning?.recordRecoveryAttempt({context:ctx,skill,success:false,reward:-1,
        details:{error:String(err)}});
    } finally {
      this.lastPosition = this.bot.entity.position.clone();
      this.lastDistance = this.bot.entity.position.distanceTo(player.position);
      this.lastProgressAt = Date.now();
      this.recovering = false;
    }
  }

  async follow(username,distance=3) {
    distance=Math.max(.5,Number(distance)||3);
    const bot=this.bot;
    const first=this.tracker.locate(username);
    if (first.kind==='unknown') {
      this.warn('Cannot follow '+username+': player entity and trusted position unavailable');
      return false;
    }
    this.core?.setFollowIntent(username,distance);
    if (first.entity) this.setFollow(first.entity,distance);
    else this.setCoordinateGoal(first.fix,distance);
    this.log('FOLLOW '+username+' via '+first.kind+' distance='+distance);
    this.lastPosition=bot.entity.position.clone();
    this.lastDistance=first.entity ? bot.entity.position.distanceTo(first.entity.position) : Infinity;
    this.lastProgressAt=Date.now();
    let lastCoordinate=null;
    while (!bot.interrupt_code) {
      await sleep(500);
      const located=this.tracker.locate(username);
      if (located.kind==='unknown') {
        if (Date.now()-this.lastTrackingLog>5000) {
          this.warn('Target out of range; no fresh coordinate. Holding safely.');
          this.lastTrackingLog=Date.now();
        }
        if (this.navigationMode!=='waiting') {
          bot.pathfinder.stop();
          this.navigationMode='waiting';
        }
        continue;
      }
      if (!located.entity) {
        const fix=located.fix;
        if (!lastCoordinate || this.navigationMode==='visible' ||
            Math.hypot(fix.x-lastCoordinate.x,fix.y-lastCoordinate.y,
              fix.z-lastCoordinate.z)>4) {
          this.setCoordinateGoal(fix,distance);
          lastCoordinate={...fix};
          this.log('LONG RANGE '+username+' via '+located.kind+
            ' destination=('+fix.x.toFixed(1)+','+fix.y.toFixed(1)+','+fix.z.toFixed(1)+')');
        }
        // Last-known/remote coordinates are only a waypoint, not a visible player.
        // Stop at the waypoint, observe surroundings, await a fresh server fix.
        const distanceFromFix=bot.entity.position.distanceTo(fix);
        if (distanceFromFix<=Math.max(6,distance+2) && this.navigationMode!=='waiting') {
          bot.pathfinder.stop();
          this.navigationMode='waiting';
          this.log('At last known position; waiting to reacquire '+username);
        }
        continue;
      }
      const player=located.entity;
      lastCoordinate=null;
      // Visual inspection is block-based and local, not a remote screenshot.
      const terrain=inspectAdvance(bot,bot.entity.position,player.position);
      if (terrain.status!==this.lastTerrainStatus && Date.now()-this.lastTerrainLogAt>=2500) {
        this.lastTerrainLogAt=Date.now();
        this.log('OBSERVE forward='+terrain.status+
          ' narrow='+terrain.narrow+' (local block snapshot)');
        this.lastTerrainStatus=terrain.status;
      }
      if (this.navigationMode!=='visible') {
        this.setFollow(player,distance);
        this.log('Player entity reacquired; dynamic FOLLOW restored');
        this.lastPosition=bot.entity.position.clone();
        this.lastDistance=bot.entity.position.distanceTo(player.position);
        this.lastProgressAt=Date.now();
      }
      const current=bot.entity.position,d=current.distanceTo(player.position);
      const moved=current.distanceTo(this.lastPosition);
      const closed=this.lastDistance-d;
      if (moved>=.3 || closed>=.4 || d<=distance+2) {
        this.lastPosition=current.clone();this.lastDistance=d;this.lastProgressAt=Date.now();
        if (this.recoveryStage) {
          this.core?.endRecover('following again');this.recoveryStage=0;this.tried.clear();
        }
      }
      if (d>distance+2 && Date.now()-this.lastProgressAt>3000 && !bot.interrupt_code)
        await this.recover(player,distance);
    }
    bot.clearControlStates();
    return true;
  }
}
