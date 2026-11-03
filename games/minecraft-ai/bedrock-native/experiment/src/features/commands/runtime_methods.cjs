'use strict'
// Original AliceBedrockRuntime methods, same instance and validated policy.
function createCommandRuntimeMethods({WOOD_LOGS,LOG_GROUP,resolveItem,acquisitionStrategy,inRange,compact,recognize,parseTask}){
  return {
  async onChat(sender,message){
    if(this.closed||!sender)return
    const own=[this.bot.username,this.bot._client?.profile?.name].filter(Boolean).map(x=>x.toLowerCase())
    if(own.includes(sender.toLowerCase()))return
    let cmd=recognize(message)
    const asking=this.pendingWood.get(sender)
    if(!cmd&&asking&&this.clock()-asking.at<=45000)cmd=compact(message)
    if(!cmd)return
    if(this.p.social_policy.isStatusQuery(cmd)||/^(状态|你在干嘛[?？]?)$/.test(cmd))return this.say(this.status())
    if(this.p.inventory_policy.isInventoryQuery(cmd)||/^(背包|背包有什么)$/.test(cmd))return this.say(this.inventorySummary())
    if(this.p.inventory_policy.isLocationQuery(cmd)||/^(你在哪里[?？]?)$/.test(cmd))return this.say(this.locationSummary())
    if(/^(?:记忆|学习状态|学到了什么|记住了什么)$/.test(cmd)){
      const summary=this.core.learning?.summary?.()||{}
      const outcomes=Object.entries(this.core.learning?.data?.itemOutcomes||{}).slice(-4)
        .map(([name,r])=>name+' '+r.successes+'/'+r.attempts).join('，')
      return this.say('长期记忆：'+(summary.knowledgeSkills||0)+'种技能经验、'+(summary.itemAliases||0)+
        '个物品别名、'+(summary.itemOutcomes||0)+'种物品任务；'+(outcomes||'尚无已验证物品任务')+'。')
    }
    if(/^(帮助|help)$/.test(cmd))return this.say('命令：跟紧我、保护我、停止、记忆、吃东西、收集5个橡木原木、收集3个铁锭、记住：闪亮矿=diamond、从箱子里拿3个苹果。')
    if(asking && this.clock()-asking.at<=45000){
      const number=this.p.wood_policy.parseCountReply(cmd)
      if(number!=null){this.pendingWood.delete(sender);if(number>32)return this.say('单次最多采集32个，避免长时间破坏环境。')
        return this.acceptGather(sender,number)}
    }
    const task=parseTask(cmd)
    if(task.type==='UNKNOWN'){
      if(this.planner?.url)return this.askModel(sender,cmd)
      if(this.p.social_policy.classifyCasualMessage(cmd)==='chat')return this.say('我在这里。正在留意周围环境，有需要就叫我。')
      return this.say('尚未识别这条指令。若启用 Ollama，可以用自然语言与我交谈；没有执行未知命令。')
    }
    if(task.type==='INVALID_QUANTITY')return this.say('数量超出限制：采集1到32个，箱子单次取放1到64个。')
    if(task.type==='UNKNOWN_ITEM')return this.say('暂不识别物品 '+task.raw+'；请使用常见中文物品名或 minecraft:物品ID。')
    if(task.type==='TEACH_ITEM'){
      try {
        const existing=resolveItem(task.alias,this.bot.registry,null)
        if(existing.ok&&existing.item!==task.item)
          return this.say('不能覆盖 Minecraft 已知物品名称：'+task.alias)
        const saved=this.core.learning.rememberItemAlias(task.alias,task.item,this.bot.registry)
        return this.say('记住了：'+saved.phrase+' 是 '+saved.item+'（已写入持久记忆）。')
      }catch(e){return this.say('无法记住这个对应关系：'+String(e.message).slice(0,70))}
    }
    if(task.type==='WOOD_QUESTION'){
      this.pendingWood.set(sender,{at:this.clock()})
      return this.say(`${sender}，需要收集多少个原木？回复1到32之间的数量。`)
    }
    this.lastHumanAt=this.clock();this.nextIdleAt=Math.max(this.nextIdleAt,this.clock()+this.p.autonomy_policy.AUTONOMY_GRACE_MS)
    if(task.type==='SLEEP'||task.type==='SET_SPAWNPOINT'){
      const requested=task.type==='SLEEP'?'sleep':'set_spawnpoint'
      const response=this.requestBedTask(requested,sender,(status,reason,message)=>{
        if(status==='completed'||status==='failed')this.say(message)
      })
      this.say(response.message)
      return
    }
    if(task.type==='WAKE'){
      if(!this.bot.isSleeping)return this.say('我现在没有睡觉。')
      try{await this.bot.wake();this.say('已收到起床操作，等待服务器确认。')}
      catch(e){this.say('起床失败：'+String(e.message).slice(0,60))}
      return
    }
    if(task.type==='STOP'){
      this.cancelActive('stop from '+sender);this.goalPlanner.halt();this.core.stop('user stop')
      this.continuousGoal.interrupt('user_stop')
      this.lastGuardedPlayer=null
      if(this.bot.isSleeping){try{await this.bot.wake()}catch(e){this.log.warn('[Alice sleep] stop while sleeping:',String(e.message).slice(0,80))}}
      this.say('已停止当前任务和跟随；如仍在睡觉，等待服务器起床确认。')
      return
    }
    if(this.bot.isSleeping){
      try{await this.bot.wake()}catch(e){return this.say('我还在睡觉，起床未成功：'+String(e.message).slice(0,60))}
      if(this.bot.isSleeping)return this.say('尚未收到起床确认，暂不行动。')
    }
    if(task.type==='FOLLOW'||task.type==='GUARD'){
      if(!this.safetyBusy)this.cancelActive('new movement order from '+sender)
      this.ownerMotion.reset()
      this.continuousGoal.interrupt('player_override')
      this.refreshBehavior()
      this.core.setFollowIntent(sender,this.liveBehavior.settings.followDistance)
      this.followSource=sender;this.lastFollowEnd=null
      if(task.type==='GUARD'){this.lastGuardedPlayer=sender;this.log.log('[Alice guard] persistent follow with automatic nearby defense enabled for',sender)}
      else this.lastGuardedPlayer=null
      this.say(task.type==='GUARD'?`收到，保护${sender}；会跟随并观察附近威胁。`:`收到，跟随${sender}；移动是否成功以服务器坐标为准。`)
      return
    }
    if(task.type==='EAT'){
      if(!this.ready())return this.say('需要先同步可信生命和背包，才能进食。')
      this.cancelActive('eat requested')
      this.startJob('RECOVER',sender,async signal=>{
        const r=await this.ops.eatIfSafe({signal,underThreat:!!this.threat()})
        return {ok:r.ok,message:r.ok?'饥饿值从'+r.foodBefore+'恢复至'+r.foodAfter:'',reason:r.reason||'食物未确认生效'}
      },{label:'安全进食'})
      return
    }
    if(task.type==='ITEM_REQUEST')return this.acceptAcquire(sender,task.term,task.count??1)
    if(task.type==='STORAGE'){
      this.cancelActive('container order from '+sender)
      this.startJob('STORAGE',sender,signal=>this.ops.transferNearby({...task,signal,radius:12}),{
        label:task.direction==='withdraw'?'从箱子取物':'存入箱子'})
      return
    }
    if(task.type==='WOOD')return this.acceptGather(sender,task.count)
    if(task.type==='CRAFT'){
      this.cancelActive('craft supersedes previous task')
      // Paper's FOLLOW intent is durable; a craft command is temporary work.
      this.startJob('CRAFT',sender,signal=>this.craftWeaponOrTable(task.item,signal))
    }
  },
  async askModel(sender,command){
    if(!this.planner||this.plannerBusy)return this.say('我正在处理上一条复杂指令，请稍后。')
    // Capture priority generation BEFORE the first await; player STOP/FOLLOW
    // may arrive while cancelling an existing autonomous model request.
    const epoch=this.epoch
    this.plannerBusy=true
    let ctrl=null
    try{
      await this.goalPlanner.cancelAndWait('human_chat')
      if(this.closed||epoch!==this.epoch)return
      ctrl=new AbortController();this.plannerAbort=ctrl
      const memories=this.core.learning?.data
      const memory=JSON.stringify({aliases:Object.entries(memories?.itemAliases||{}).slice(-12),
        outcomes:Object.entries(memories?.itemOutcomes||{}).slice(-12)})
      const plan=await this.planner.suggest({message:command,status:this.status(),memory,signal:ctrl.signal})
      if(ctrl.signal.aborted||this.closed||epoch!==this.epoch)return
      if(!plan)return this.say('我暂时无法安全理解这条指令。')
      switch(plan.action){
        case 'reply': return this.say(plan.message)
        case 'status': return this.say(this.status())
        case 'follow_player':return this.onChat(sender,'AliceAI 跟着我')
        case 'guard_player':return this.onChat(sender,'AliceAI 保护我')
        case 'collect_wood':return this.acceptGather(sender,plan.count)
        case 'collect_item':return this.acceptAcquire(sender,plan.item,plan.count,true)
        case 'eat_food':return this.onChat(sender,'AliceAI 吃东西')
        case 'craft_item':return this.onChat(sender,'AliceAI 制作'+(plan.item==='wooden_sword'?'木剑':'工作台'))
        case 'stop':return this.onChat(sender,'AliceAI 停止')
      }
    }catch(err){
      if(!ctrl?.signal.aborted&&!this.closed&&epoch===this.epoch)
        this.say('本地 Ollama 暂时不可用，我继续保持自主生存与安全观察。')
    }finally{this.plannerBusy=false;if(this.plannerAbort===ctrl)this.plannerAbort=null}
  },
  acceptAcquire(sender,term,count=1,skipModel=false){
    if(!inRange(count,1,32))return this.say('单次获取数量必须为1到32。')
    const resolved=resolveItem(term,this.bot.registry,this.core.learning)
    if(!resolved.ok){
      if(this.planner?.url&&resolved.reason==='unknown_registry_item'&&term.length>1&&!skipModel)
        return this.askModel(sender,'将物品 '+term+' 识别成Minecraft注册表中的标准物品并收集'+count+'个')
      return this.say('目前无法从基岩物品注册表识别 '+String(term).slice(0,35)+'；可以用 minecraft:物品ID，或教我物品别名。')
    }
    const item=resolved.item,strategy=acquisitionStrategy(item,WOOD_LOGS)
    const actionType=strategy==='verified_natural_tree'?'GATHER':'CRAFT'
    this.cancelActive('new item collection from '+sender)
    this.startJob(actionType,sender,signal=>this.acquireItem(item,count,signal),{label:'获取'+count+'个 '+item})
  },
  async acquireItem(item,requested,signal){
    // A Minecraft goal may have multiple sources: natural blocks, recipes,
    // farming, mob drops and mining. Only VERIFIED executors are permitted.
    const strategy=acquisitionStrategy(item,WOOD_LOGS)
    const isLogs=strategy==='verified_natural_tree'
    const skillItem=item===LOG_GROUP?'natural_logs':item
    const started=this.bot.entity?.position?.clone?.()
    let gained=0,reason='source_unavailable'
    for(let i=0;i<Math.min(requested*3,40)&&gained<requested;i++){
      if(signal.aborted||this.bot.health<14||this.threat())throw Error('collection interrupted by danger')
      let r
      if(isLogs)r=await this.ops.gatherOne({signal,origin:started,maxDistance:28,
        targetItem:item===LOG_GROUP?null:item})
      else {
        // Try a server-advertised recipe with existing ingredients only;
        // unknown underground/farm/mob sources do not get blind mining code.
        const p=this.bot.entity?.position
        const table=this.bot.findBlock?.({matching:b=>b?.name==='crafting_table',maxDistance:4})||null
        const nearby=table&&p&&table.position.distanceTo(p)<=4.5?table:null
        r=await this.ops.craftVerified(item,{signal,craftingTable:nearby})
      }
      if(!r?.ok||!Number.isSafeInteger(r.gained)||r.gained<=0){
        reason=r?.reason||'unverified_item_result';break
      }
      gained+=r.gained
    }
    const mode=isLogs?'gather':'craft'
    this.core.learning?.recordItemOutcome?.(skillItem,mode,{ok:gained>0,delta:gained,
      reason:gained>0?'server_inventory_delta_verified':reason})
    const verified=gained>=requested
    return {ok:verified,message:verified?'实际获得'+gained+'个 '+item:'',
      reason:'仅确认获得'+gained+'/'+requested+'个 '+item+'；'+
        (gained<requested?(isLogs?reason:'当前只有材料已齐全的配方合成器；矿石开采/农作物/怪物掉落尚无安全执行器。'+reason):'已完成')}
  },
  acceptGather(sender,count){
    if(!inRange(count,1,32))return this.say('一次只支持1到32个原木。')
    this.cancelActive('gather supersedes earlier task')
    // Leave the player for the requested task without forgetting the long-lived
    // FOLLOW intent. startJob() temporarily owns the body; finally resumes it.
    this.startJob('GATHER',sender,signal=>this.gatherCount(count,signal))
  },
  }
}
module.exports={createCommandRuntimeMethods}
