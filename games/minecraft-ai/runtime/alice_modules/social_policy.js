const strip = text => String(text ?? '').trim()
  .replace(/^[\s@]*(?:alice|艾丽丝|爱丽丝)[，,:：\s]*/i, '')
  .replace(/[？！?!。．~～\s]+$/g, '');

export function isStatusQuery(message) {
  const q = strip(message);
  if (/^(?:what(?:'s| is| are)? (?:your (?:current )?(?:task|mission|status)|you doing)|who (?:told|asked) you (?:to do|to work)|who(?:'s| is) giving you orders)(?: right now| now)?$/i.test(q))
    return true;
  return /^(?:你(?:现在|正在|目前)?(?:在|正)?(?:干嘛|干什么|做什么|忙什么|忙啥)|(?:现在|目前|当前)(?:的)?(?:任务|状态|在做什么|在干嘛)|在(?:干嘛|干什么|做什么)|你忙啥呢|(?:谁(?:让你|叫你)(?:做|干)(?:这些|这个|的|事)?)|谁的指令|谁下的命令|谁在指挥你|你在执行谁(?:(?:说)?的)?(?:指令|命令|任务)|(?:现在)?在执行谁(?:(?:说)?的)?(?:指令|命令|任务))(?:呢|呀|啊|了|来着)?$/.test(q);
}

export function classifyCasualMessage(message) {
  const q = strip(message);
  if (!q || q.length > 120 || /[!！\/]/.test(q) || isStatusQuery(q)) return null;
  // Command-like sentences must flow to the existing Mindcraft command router.
  if (/(?:收集|采集|砍树|砍木头|挖矿|制作|合成|建造|去找|跟着|跟随|过来|停止|别动|攻击|保护|准备|打造|装备|给我|帮我|教你|学会|创建|拿来|放下|丢掉|拾取|杀掉|传送|前往)/.test(q) ||
      /\b(?:follow|collect|craft|build|attack|mine|gather|come here|stop|give me|protect|equip|fetch)\b/i.test(q)) return null;
  if (/^(你好|嗨|哈喽|hello|hi|hey|早上好|晚上好|在吗|聊聊天|聊会天|讲个笑话|来个笑话|笑话|讲笑话|讲一个笑话|无聊|tell me a joke|tell a joke|how are you|let's chat|好玩吗|最近怎么样|你喜欢什么|今天天气|你觉得.+|你知道.+|mc.+|Minecraft.+|我的世界.+|僵尸.+|村民.+|苦力怕.+|末影人.+|铁傀儡.+)$/i.test(q)) return 'chat';
  if (/[？?]$/.test(String(message).trim()) && /(你|我|游戏|世界|怪物|村民|苦力怕|僵尸|末影人|钻石|下界|末地|挖矿|红石|Minecraft|MC)/i.test(q)) return 'chat';
  return null;
}

export function maySpeakSpontaneously({state,hasActiveAction,hasFollowIntent,underThreat,nearPlayer,elapsed,roll,selfPrompting=false,chatInFlight=false}) {
  return state === 'IDLE' && !hasActiveAction && !hasFollowIntent && !selfPrompting && !chatInFlight && !underThreat &&
    nearPlayer && elapsed >= 8 * 60_000 && roll < 0.22;
}

export function actionDescription(label, state) {
  const action=String(label || '').replace(/^(?:action|mode):/,'');
  const names={
    followPlayer:'跟随玩家', collectBlocks:'采集方块', collectWood:'收集木头',
    aliceCollectWood:'收集木头', aliceLearnWeapon:'制作工作台和武器',
    craftRecipe:'制作物品', smeltItem:'熔炼', aliceSafety:'战斗或保命',
    searchForBlock:'寻找方块'
  };
  const states={IDLE:'休息中',FOLLOW:'跟随玩家',GUARD:'保护玩家',COMBAT:'战斗',
    SURVIVE:'撤退保命',GATHER:'采集资源',CRAFT:'制作物品',RECOVER:'脱困'};
  return names[action] || (label ? '执行 ' + action : states[state] || '观察周围');
}

export function relevantAction(message) {
  const text=String(message||'');
  const explicit=text.match(/!([A-Za-z][\w]*)/);
  if (explicit) return explicit[1];
  if (/跟着我|跟随我|跟着.+|follow me/i.test(text)) return 'followPlayer';
  if (/收集.{0,12}(木头|原木|木材)|砍.{0,8}(树|木头)/.test(text)) return 'aliceCollectWood';
  if (/工作台|武器|做剑|造剑/.test(text)) return 'aliceLearnWeapon';
  return null;
}
