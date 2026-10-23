import test from 'node:test';
import assert from 'node:assert/strict';
import { isStatusQuery, classifyCasualMessage, maySpeakSpontaneously, relevantAction } from '../runtime/alice_modules/social_policy.js';

test('Chinese status questions are direct read-only requests', () => {
  for(const text of ['你在干嘛？','你现在在干什么','Alice，你正在做什么？','当前任务','谁在指挥你','你在执行谁的命令','你在执行谁说的指令？','what are you doing?','what is your current task?']) {
    assert.equal(isStatusQuery(text),true,text);
  }
});
test('real game commands never go to chat-only model', () => {
  for(const text of ['跟着我','收集10个木头','自己做工作台，学习如何做武器',
    '!followPlayer("Steve",3)','攻击僵尸','保护我','give me diamonds']) {
    assert.equal(classifyCasualMessage(text),null,text);
  }
});
test('MC jokes and smalltalk can use optional chat-only model', () => {
  for(const text of ['你好','讲个笑话','tell me a joke','你知道苦力怕为什么会爆炸吗？',
    'Minecraft好玩吗','你觉得村民怎么样？']) {
    assert.equal(classifyCasualMessage(text),'chat',text);
  }
});
test('record unambiguous orders only, never assign a sender from chat', () => {
  assert.equal(relevantAction('跟着我'),'followPlayer');
  assert.equal(relevantAction('收集木头'),'aliceCollectWood');
  assert.equal(relevantAction('!aliceLearnWeapon()'),'aliceLearnWeapon');
  assert.equal(relevantAction('你好'),null);
});
test('autonomous jokes suppressed during action, follow or danger', () => {
  const base={state:'IDLE',hasActiveAction:false,hasFollowIntent:false,
    underThreat:false,nearPlayer:true,elapsed:9*60_000,roll:0.1};
  assert.equal(maySpeakSpontaneously(base),true);
  assert.equal(maySpeakSpontaneously({...base,state:'GATHER'}),false);
  assert.equal(maySpeakSpontaneously({...base,hasActiveAction:true}),false);
  assert.equal(maySpeakSpontaneously({...base,selfPrompting:true}),false);
  assert.equal(maySpeakSpontaneously({...base,chatInFlight:true}),false);
  assert.equal(maySpeakSpontaneously({...base,hasFollowIntent:true}),false);
  assert.equal(maySpeakSpontaneously({...base,underThreat:true}),false);
  assert.equal(maySpeakSpontaneously({...base,nearPlayer:false}),false);
  assert.equal(maySpeakSpontaneously({...base,elapsed:1000}),false);
});
