
import fs from 'node:fs';
import path from 'node:path';
import { AliceActivity } from './activity.js';
import { inventorySnapshot, formatInventory, formatLocation, isInventoryQuery, isLocationQuery } from './inventory_policy.js';
import { parseWoodCountRequest, parseCountReply } from './wood_policy.js';
import { isStatusQuery, classifyCasualMessage, maySpeakSpontaneously, relevantAction } from './social_policy.js';

const cleanText = s => String(s||'').replace(/[!！][A-Za-z][\w]*/g,'')
  .replace(/(^|\s)\/[A-Za-z][\w]*/g,'').replace(/[\r\n\t]+/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,150);
const jokes=[
  '这地形有点像跑酷地图……但我不想拿生命测试。😂',
  '苦力怕为什么总是那么安静？因为它想给你一个惊喜。💥',
  '今天要是挖到钻石，我一定先看看下面有没有岩浆。',
  '村民的交易真会做生意，我都想开个木材店了。',
  'MC里最重要的不是钻石，是出门时记得带桶水。'
];

export class AliceSocial {
  constructor(agent) {
    this.agent=agent;
    this.activity=new AliceActivity(agent);
    this.active=false;
    this.originalHandle=null;
    this.handler=null;
    this.capture=null;
    this.timer=null;
    this.inventoryTimer=null;
    this.fullInventoryAlerted=false;
    this.pendingWoodQuantity=new Map();
    this.commandReceiptAt=new Map();
    this.lastSpokenAt=Date.now();
    this.lastStatusAt=0;
    this.chatInFlight=0;
    this.chatCooldownAt=0;
    this.lastPlayerMessageAt=Date.now();
    this.lastCommandAt=0;
    this.chatHistory=[];
    this.config=this.loadConfig();
  }
  loadConfig() {
    let file={};
    const loc=path.join(process.cwd(),'bots',this.agent.name,'alice_social.json');
    try {if(fs.existsSync(loc))file=JSON.parse(fs.readFileSync(loc,'utf8'))}
    catch(err){console.warn('[Alice social] invalid optional config: '+String(err))}
    const model=String(process.env.ALICE_CHAT_MODEL||file.chat_model||'').trim().slice(0,100);
    const endpoint=String(process.env.ALICE_CHAT_URL||file.chat_url||
      'http://127.0.0.1:11434/api/chat').trim();
    let url=null;
    try {
      const u=new URL(endpoint);
      if(['http:','https:'].includes(u.protocol))url=u.toString();
    }catch(_){}
    const timeoutMs=Number(process.env.ALICE_CHAT_TIMEOUT_MS||file.timeout_ms)||5000;
    return {model,url,timeout:Math.min(12000,Math.max(1000,timeoutMs)),spontaneous:file.spontaneous!==false};
  }
  start() {
    if(this.active)return;
    if(!this.agent.bot || !this.agent.aliceCore) return;
    this.activity.start();
    const self=this;
    this.originalHandle=this.agent.handleMessage;
    // Social middleware only wraps incoming text. It never owns pathfinder
    // or runs an action, and unknown commands fall through unchanged.
    this.handler=async function(source,message,...rest) {
      return self.handleMessage(source,message,rest);
    };
    this.agent.handleMessage=this.handler;
    this.capture=(sender,message)=>{
      if(sender===this.agent.name||!message)return;
      this.lastPlayerMessageAt=Date.now();
      this.agent.aliceAutonomy?.notifyHumanMessage?.();
      this.activity.notePlayerMessage(sender,message);
      if(relevantAction(message))this.lastCommandAt=Date.now();
      this.acknowledge(sender,message);
    };
    this.agent.bot.prependListener('chat',this.capture);
    this.agent.bot.prependListener('whisper',this.capture);
    this.timer=setInterval(()=>this.spontaneousTick().catch(err=>
      console.warn('[Alice social] idle chat error: '+String(err))),30000);
    this.timer.unref?.();
    this.active=true;
    this.inventoryTimer=setInterval(()=>this.checkInventoryAlert().catch(e=>console.warn('[Alice inventory] '+String(e))),5000);
    this.inventoryTimer.unref?.();
    console.log('[Alice social] quick status and MC smalltalk active; chat model='+
      (this.config.model||'existing Mindcraft model'));
  }
  stop() {
    if(!this.active)return;
    if(this.timer)clearInterval(this.timer);
    this.timer=null;
    if(this.inventoryTimer)clearInterval(this.inventoryTimer);
    this.inventoryTimer=null;
    this.pendingWoodQuantity.clear();
    this.commandReceiptAt.clear();
    this.agent.bot.off('chat',this.capture);
    this.agent.bot.off('whisper',this.capture);
    if(this.agent.handleMessage===this.handler)this.agent.handleMessage=this.originalHandle;
    this.activity.stop();
    this.active=false;
  }
  async handleMessage(source,message,rest) {
    if(!source||!message||source==='system'||source===this.agent.name)
      return this.originalHandle.call(this.agent,source,message,...rest);
    this.lastPlayerMessageAt=Date.now();
    this.agent.aliceAutonomy?.notifyHumanMessage?.();
    this.activity.notePlayerMessage(source,message);
    this.acknowledge(source,message);
    if(isStatusQuery(message)) {
      if(Date.now()-this.lastStatusAt>650) {
        this.lastStatusAt=Date.now();
        const answer=this.activity.answer();
        console.log('[Alice status] '+source+': '+answer);
        void this.say(source,answer);
      }
      return true; // Critical: no LLM request, no action interruption
    }
    if(isInventoryQuery(message)) {
      void this.say(source,formatInventory(inventorySnapshot(this.agent.bot)));
      return true;
    }
    if(isLocationQuery(message)) {
      void this.say(source,formatLocation(this.agent.bot));
      return true;
    }
    const waiting=this.pendingWoodQuantity.get(source);
    this.pendingWoodQuantity.delete(source);
    if(waiting && Date.now()-waiting<45000) {
      const amount=parseCountReply(message);
      if(amount!==null) {
        void this.say(source,'收到，我试着在附近收集'+amount+'个木头；遇到问题我会报告。');
        // Route through the ORIGINAL Mindcraft command handler. Do not bypass ActionManager.
        return this.originalHandle.call(this.agent,source,'!aliceCollectWood('+amount+')',...rest);
      }
    }
    if(parseWoodCountRequest(message)) {
      this.pendingWoodQuantity.set(source,Date.now());
      void this.say(source,'你需要多少个木头？回复数字（1到128）就行。');
      return true;
    }
    // No dedicated model configured? Ordinary Mindcraft handles conversation.
    if(classifyCasualMessage(message) && this.config.model && this.config.url) {
      if(this.chatInFlight>=2||Date.now()-this.chatCooldownAt<1800)return true;
      this.chatCooldownAt=Date.now();
      void this.replyChat(source,message);
      return true;
    }
    return this.originalHandle.call(this.agent,source,message,...rest);
  }
  async say(to,message) {
    const safe=cleanText(message);
    if(!safe)return;
    try {
      // Reuse Mindcraft's existing broadcast/translation settings.
      await this.agent.routeResponse(to,safe);
      this.lastSpokenAt=Date.now();
    }catch(err){console.warn('[Alice social] chat failed: '+String(err))}
  }
  async replyChat(source,message) {
    const started=Date.now(),commandAt=this.lastCommandAt;
    this.chatInFlight++;
    try {
      const state=this.activity.snapshot();
      const system='你是Minecraft游戏里的AI队友Alice。自然、活泼、像队友一样聊游戏；'+
        '不要假装自己是人类，偶尔幽默但不要刷屏。1-2句简短中文，口语化。'+
        '绝不输出!命令、/命令、代码或工具调用；不要编造你已完成的动作。'+
        '当前真实状态：'+state.description+'，血量：'+(this.agent.bot?.health??'未知')+'/20。';
      const messages=[{role:'system',content:system},...this.chatHistory.slice(-6),
        {role:'user',content:String(source).slice(0,32)+'说：'+String(message).slice(0,170)}];
      const result=await fetch(this.config.url,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:this.config.model,messages,stream:false,
          options:{temperature:0.7,num_predict:95}}),
        signal:AbortSignal.timeout(this.config.timeout)
      });
      if(!result.ok)throw new Error('Ollama HTTP '+result.status);
      const json=await result.json();
      const answer=cleanText(json?.message?.content);
      if(!answer||this.lastCommandAt>commandAt||Date.now()-started>this.config.timeout+1000)return;
      this.chatHistory.push({role:'user',content:String(message).slice(0,170)},
        {role:'assistant',content:answer});
      this.chatHistory=this.chatHistory.slice(-8);
      await this.say(source,answer);
    }catch(err){
      console.warn('[Alice social] chat-only model failed; tasks unaffected: '+String(err));
      if(this.lastCommandAt===commandAt)
        await this.say(source,'我刚才有点走神了，换个话题聊聊？');
    }finally{this.chatInFlight--}
  }
  acknowledge(sender,message) {
    const action=relevantAction(message);
    if(!['followPlayer','aliceCollectWood','aliceLearnWeapon'].includes(action))return;
    const key=String(sender)+':'+String(message).slice(0,140),now=Date.now();
    if(now-(this.commandReceiptAt.get(key)||0)<2500)return;
    if(this.commandReceiptAt.size>48)this.commandReceiptAt.clear();
    this.commandReceiptAt.set(key,now);
    // A receipt is not a promise of ActionManager acceptance or task completion.
    const label={followPlayer:'跟随',aliceCollectWood:'采集木头',aliceLearnWeapon:'制作装备'}[action];
    void this.say(sender,'收到你的'+label+'指令，我正在处理。');
  }
  async checkInventoryAlert() {
    if(!this.active)return;
    const snap=inventorySnapshot(this.agent.bot);
    if(!snap.slotsKnown)return;
    if(snap.freeSlots>0){this.fullInventoryAlerted=false;return;}
    if(this.fullInventoryAlerted)return;
    const core=this.agent.aliceCore;
    if(this.agent.aliceAutonomy?.safety?.active || ['SURVIVE','COMBAT','GUARD'].includes(core?.state))return;
    this.fullInventoryAlerted=true;
    console.warn('[Alice inventory] no empty inventory slots; '+snap.usedSlots+'/'+snap.totalSlots);
    await this.say('system','我的背包没有空格了！可以让我把多余物品放进附近的箱子。');
  }
  async spontaneousTick() {
    if(!this.active||!this.config.spontaneous||!this.agent.bot?.entity)return;
    const bot=this.agent.bot,core=this.agent.aliceCore;
    const near=Object.values(bot.players||{}).some(player=>
      player?.entity?.position && player.entity.id!==bot.entity.id &&
      player.entity.position.distanceTo(bot.entity.position)<=16);
    const safety=this.agent.aliceAutonomy?.safety;
    const danger=safety?.active||Boolean(safety?.threat?.());
    if(!maySpeakSpontaneously({
      state:core.state,hasActiveAction:Boolean(this.agent.actions?.executing),
      selfPrompting:Boolean(this.agent.self_prompter?.isActive?.()),
      chatInFlight:this.chatInFlight>0,
      hasFollowIntent:core.hasFollowIntent(),underThreat:danger,nearPlayer:near,
      elapsed:Date.now()-Math.max(this.lastSpokenAt,this.lastPlayerMessageAt),roll:Math.random()
    }))return;
    this.lastSpokenAt=Date.now();
    await this.say('system',jokes[Math.floor(Math.random()*jokes.length)]);
  }
}
