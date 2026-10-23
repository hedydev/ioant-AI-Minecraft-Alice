'use strict'
// Bedrock experimental executor using Mineflayer's HIGH LEVEL bot API.
// Only on verified disposable BDS. Decisions import the canonical Paper policies.
const LOGS=new Set(['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log','pale_oak_log'])
const HOSTILES=new Set(['zombie','husk','drowned','skeleton','stray','spider','creeper','witch','pillager','enderman','ravager','wither_skeleton'])
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const finite=v=>typeof v==='number'&&Number.isFinite(v)
const countLogs=bot=>(bot.inventory?.items?.()||[]).filter(i=>LOGS.has(i.name)).reduce((n,i)=>n+Number(i.count||0),0)
const woodResources=bot=>(bot.inventory?.items?.()||[]).filter(i=>LOGS.has(i.name)||i.name.endsWith('_planks')).reduce((n,i)=>n+Number(i.count||0),0)
const hasWeapon=bot=>(bot.inventory?.items?.()||[]).some(i=>i.name.endsWith('_sword')||i.name.endsWith('_axe'))

class NativeAutonomyExperiment {
  constructor({bot,core,policies,api,label='实验世界',log=console,now=Date.now,random=Math.random,sleep:wait=sleep}) {
    this.bot=bot;this.core=core;this.p=policies;this.api=api;this.label=label;this.log=log;this.now=now;this.random=random;this.sleep=wait
    this.started=false;this.closed=false;this.busy=false;this.action=null;this.controller=null
    this.lastHumanAt=now();this.nextWorkAt=now()+20_000;this.lastLookAt=0;this.lastQuipAt=now()
    this.followingGoal=null;this.lastTargetNoticeAt=0;this.timer=null;this.safetyTimer=null;this.healthSeen=false
    this.lastSafety=null;this.taskSource=null
  }
  say(message) {
    const msg=String(message||'').replace(/[\r\n\t]/g,' ').trim().slice(0,180)
    if(!msg)return
    try {this.bot.chat(msg)} catch(err){this.log.error('[Alice lab] chat failed:',err.message)}
  }
  ready(){return this.started&&!this.closed&&this.bot.entity?.position&&this.healthSeen&&finite(this.bot.health)}
  configureMovement(){
    const moves=new this.api.Movements(this.bot)
    this.p.terrain_policy.cautiousPathOptions(moves)
    moves.canOpenDoors=false
    this.bot.pathfinder.setMovements(moves)
  }
  start(){
    if(this.started)return
    this.started=true;this.closed=false
    this.configureMovement()
    this.timer=setInterval(()=>this.tick().catch(e=>this.log.error('[Alice AI] tick:',e.stack||e)),5000)
    this.timer.unref?.()
    // Safety is independent of idle/gather loops, as in Paper. It can stop
    // a live follow or long-running dig before the next five-second work tick.
    this.safetyTimer=setInterval(()=>this.safetyTick(),300)
    this.safetyTimer.unref?.()
    this.log.log('[Alice AI] AUTONOMY RUNNING:',this.label,'safety at 300ms, follow, bounded wood work, idle looks/chat; combat/retreat unimplemented')
  }
  stop(reason='stopped') {
    this.closed=true;this.started=false
    if(this.timer){clearInterval(this.timer);this.timer=null}
    if(this.safetyTimer){clearInterval(this.safetyTimer);this.safetyTimer=null}
    this.cancel(reason)
  }
  cancel(reason){
    if(this.controller){this.controller.abort(new Error(reason));this.controller=null}
    if(this.followingGoal){this.followingGoal=null}
    try{this.bot.pathfinder?.setGoal(null)}catch{}
    try{this.bot.pathfinder?.stop?.()}catch{}
    try{this.bot.stopDigging?.()}catch{}
    try{this.bot.clearControlStates?.()}catch{}
  }
  noteHealth(){this.healthSeen=true;if(finite(this.bot.health)&&this.bot.health<=0){this.cancel('death');this.core.transition('SURVIVE','death')}}
  visiblePlayer(name){
    const target=this.bot.players?.[name]?.entity ||
      Object.entries(this.bot.players||{}).find(([key])=>key.toLowerCase()===String(name).toLowerCase())?.[1]?.entity
    return target?.position?target:null
  }
  threat(){
    if(!this.ready())return null
    const hostiles=Object.values(this.bot.entities||{}).filter(e=>HOSTILES.has(e?.name)&&e.position?.distanceTo)
    const target=this.core.intent?.data?.playerName
    return this.p.safety_policy.selectThreat({now:this.now(),health:this.bot.health,selfPosition:this.bot.entity.position,
      ownerPosition:target?this.visiblePlayer(target)?.position:null,hostiles})
  }
  status(){
    if(!this.ready())return '自主控制器已加载，但还没有收到完整生命值/坐标；暂不执行动作。'
    const p=this.bot.entity.position
    return `${this.label}：${this.core.state}；生命${this.bot.health}/20；坐标 ${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}；${this.action||'无正在执行的任务'}。`
  }
  async onChat(sender,message){
    if(!sender||sender.toLowerCase()===String(this.bot.username||'').toLowerCase())return
    const raw=String(message||'').trim()
    const cmd=raw.match(/^(?:@?aliceai|@?alice|ai)[\s:：,，]+(.+)$/i)?.[1] || (/^(状态|你在干嘛[？?]?|跟着我|跟我走|停止|别跟了|收集木头)$/.test(raw)?raw:null)
    if(!cmd)return
    this.lastHumanAt=this.now();this.nextWorkAt=Math.max(this.nextWorkAt,this.now()+20_000)
    if(/^(状态|你在干嘛[？?]?)$/.test(cmd))return this.say(this.status())
    if(/^(停|停止|别跟了|取消)$/.test(cmd)){
      this.cancel('player stop');this.core.stop('command from '+sender);this.say('已停止当前动作。');return
    }
    if(/^(跟着我|跟我走|跟随我)$/.test(cmd)){
      this.cancel('follow supersedes current task')
      this.core.setFollowIntent(sender,3)
      this.taskSource=sender
      return this.say(`收到${sender}的跟随命令；正在${this.label}寻找目标，移动结果以服务器位置为准。`)
    }
    if(/^(收集木头|砍树)$/.test(cmd)){
      this.cancel('gather supersedes current task')
      this.core.stop('new gather order')
      this.taskSource=sender
      this.nextWorkAt=this.now()+120_000
      this.runWoodGather(1).catch(e=>this.log.error('[Alice lab] gather task:',e.message))
      this.say('开始尝试采集一块附近原木；只以背包真实增量判断成功。')
      return
    }
    if(this.p.social_policy.classifyCasualMessage(cmd)==='chat')return this.say('我在观察周围环境，随时可以接受安全的行动指令。')
    this.say('这个指令的基岩动作接口尚未接入，不会伪报已经执行。')
  }
  async runWoodGather(target=1){
    if(this.busy||!this.ready()||this.threat()||this.bot.health<14)return false
    this.busy=true;this.action='采集原木';this.controller=new AbortController()
    const signal=this.controller.signal
    const before=countLogs(this.bot)
    const origin=this.bot.entity.position.clone()
    this.core.transition('GATHER','native Bedrock action')
    let outcome=false
    try {
      const coords=this.bot.findBlocks({matching:block=>LOGS.has(block?.name),maxDistance:12,count:10})||[]
      const blocks=coords.map(position=>this.bot.blockAt(position)).filter(Boolean)
      const candidates=this.p.wood_policy.nearbyWoodCandidates(blocks,origin,this.bot.entity.position,
        {maxFromOrigin:12,maxFromCurrent:12})
      const b=candidates[0]
      if(!b){this.log.log('[Alice lab] no verified nearby log; no dig packet');return false}
      const pos=b.position
      const timer=setTimeout(()=>{this.controller?.abort(new Error('gather deadline'));this.cancel('gather deadline')},25_000)
      try {
        const go=this.bot.pathfinder.goto(new this.api.GoalNear(pos.x,pos.y,pos.z,2))
        await Promise.race([go,new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))])
        if(signal.aborted||this.safetyTick())throw Error('gather interrupted by safety')
        if(this.bot.entity.position.distanceTo(pos)>4.5)throw Error('dig target out of range')
        const current=this.bot.blockAt(pos)
        if(!current||!LOGS.has(current.name))throw Error('target changed before dig')
        await this.bot.dig(current)
        await this.sleep(1600)
        if(signal.aborted)throw Error('gather cancelled')
        const after=countLogs(this.bot)
        outcome=after>before
        this.log.log(`[Alice lab] world attempt: block dig requested, inventory logs ${before} -> ${after}; verified=${outcome}`)
        if(outcome)this.core.learning?.recordKnowledge?.('bedrock_gather_log',true,{before,after})
        return outcome
      }finally{clearTimeout(timer)}
    }catch(err){this.log.warn('[Alice lab] gather did not finish:',err.message);return false}
    finally{
      this.busy=false;this.action=null;this.controller=null
      if(!this.closed && this.core.state==='GATHER')this.core.resumeIntent(outcome?'verified resource pickup':'gather incomplete')
    }
  }
  safetyTick(){
    if(!this.ready())return true
    const danger=this.threat()
    if(danger||this.bot.health<14){
      // Preserve intent but make body stop immediately. This is *not* a
      // successful escape; no unsafe blind direction is chosen.
      if(this.followingGoal||this.busy)this.cancel('threat / low health')
      const kind=danger?.type==='GUARD'?'GUARD':'SURVIVE'
      if(this.core.state!==kind)this.core.transition(kind,'safety preempt: motion halted; retreat/attack NOT IMPLEMENTED')
      this.lastSafety=this.now()
      return true
    }
    if((this.core.state==='SURVIVE'||this.core.state==='GUARD')&&this.lastSafety){
      this.lastSafety=null;this.core.resumeIntent('danger no longer observed')
    }
    return false
  }
  async tick(){
    if(!this.ready())return
    const danger=this.safetyTick()
    if(danger)return
    if(this.core.hasFollowIntent()){
      const player=this.core.intent.data.playerName
      const visible=this.visiblePlayer(player)
      if(visible){
        if(this.followingGoal!==player){
          this.configureMovement()
          this.bot.pathfinder.setGoal(new this.api.GoalFollow(visible,3),true)
          this.followingGoal=player
          this.log.log('[Alice lab] requested FOLLOW '+player+'; awaiting actual movement')
        }
      }else if(this.followingGoal){this.cancel('follow player out of view')}
      return
    }
    if(this.busy||this.core.state!=='IDLE')return
    if(this.followingGoal)this.cancel('idle clear')
    const canWork=this.p.autonomy_policy.mayStartIdleWork({now:this.now(),lastHumanAt:this.lastHumanAt,
      nextWorkAt:this.nextWorkAt,busy:this.busy,state:this.core.state,following:false,
      activeAction:false,health:this.bot.health,underThreat:Boolean(danger)})
    if(canWork){
      this.nextWorkAt=this.now()+this.p.autonomy_policy.AUTONOMY_WORK_COOLDOWN_MS
      const plan=this.p.autonomy_policy.decideIdleWork({hasUsableWeapon:hasWeapon(this.bot),woodResources:woodResources(this.bot)})
      this.log.log('[Alice lab] autonomous work plan from canonical Paper policy: '+plan)
      if((plan==='LEARN_WEAPON'||plan==='COLLECT_WOOD')&&countLogs(this.bot)<4){
        await this.runWoodGather(1)
      }else if(plan==='LEARN_WEAPON'){
        this.log.log('[Alice lab] weapon crafting executor not yet validated; cannot claim craft')
      }
    }
    if(this.now()-this.lastLookAt>20_000&&!this.busy){
      this.lastLookAt=this.now()
      await this.bot.look(this.random()*Math.PI*2,(this.random()-.5)*0.35,true)
    }
    const nearby=Object.values(this.bot.players||{}).some(p=>p?.entity?.position?.distanceTo?.(this.bot.entity.position)<16)
    if(this.p.social_policy.maySpeakSpontaneously({state:this.core.state,hasActiveAction:this.busy,
      hasFollowIntent:false,underThreat:false,nearPlayer:nearby,elapsed:this.now()-this.lastQuipAt,
      roll:this.random()})){
      this.lastQuipAt=this.now()
      this.say('我正在附近观察。需要帮忙就叫 AliceAI。')
    }
  }
}
module.exports={NativeAutonomyExperiment,countLogs,woodResources,hasWeapon}