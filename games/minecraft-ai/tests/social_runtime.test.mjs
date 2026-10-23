import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AliceSocial } from '../runtime/alice_modules/social.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function makeAgent(){
  const bot=new EventEmitter();
  bot.username='AliceAI';
  bot.entity={id:1,position:{distanceTo(){return 3}}};
  bot.players={Bob:{entity:{id:2,position:{distanceTo(){return 3}}}}};
  bot.health=20;
  const output=[],forwarded=[];
  const agent={
    name:'AliceAI',bot,
    aliceCore:{state:'FOLLOW',intent:{type:'FOLLOW',data:{playerName:'Bob'}},
      hasFollowIntent(){return true},
      onActionStart(){},onActionEnd(){},onActionError(){}},
    actions:{executing:true,currentActionLabel:'action:followPlayer'},
    handleMessage:async (...args)=>{forwarded.push(args);return false},
    routeResponse:async (to,message)=>{output.push({to,message})}
  };
  return {agent,bot,output,forwarded};
}
test('status does not interrupt current action and gives verified issuer', async()=>{
  const {agent,bot,output,forwarded}=makeAgent();
  const social=new AliceSocial(agent);
  social.config.model='';
  social.start();
  try {
    bot.emit('chat','Bob','跟着我');
    agent.aliceCore.onActionStart('action:followPlayer');
    const result=await agent.handleMessage('Bob','你在干嘛？');
    await flush();
    assert.equal(result,true);
    assert.equal(agent.actions.executing,true);
    assert.equal(agent.actions.currentActionLabel,'action:followPlayer');
    assert.equal(forwarded.length,0);
    assert.match(output.at(-1).message,/Bob/);
    assert.match(output.at(-1).message,/跟随玩家/);
  }finally {social.stop()}
});
test('unknown order origin is never invented', async()=>{
  const {agent,output}=makeAgent();
  const social=new AliceSocial(agent);
  social.start();
  try {
    agent.aliceCore.onActionStart('action:followPlayer');
    await agent.handleMessage('Steve','你在干嘛？');
    await flush();
    assert.match(output.at(-1).message,/无法确认/);
    assert.doesNotMatch(output.at(-1).message,/Steve 让我/);
  }finally {social.stop()}
});
test('normal commands keep existing Mindcraft route', async()=>{
  const {agent,forwarded}=makeAgent();
  const social=new AliceSocial(agent);
  social.start();
  try {
    const result=await agent.handleMessage('Steve','收集10个木头');
    assert.equal(result,false);
    assert.equal(forwarded.length,1);
    assert.equal(forwarded[0][0],'Steve');
  }finally {social.stop()}
});
test('configured social model replies without executing any action', async()=>{
  const {agent,output,forwarded}=makeAgent();
  const social=new AliceSocial(agent);
  social.config.model='mock-chat-only';
  social.config.url='http://127.0.0.1:11434/api/chat';
  const prev=globalThis.fetch;
  globalThis.fetch=async ()=>({ok:true,json:async()=>({message:{content:'村民赚绿宝石可比我挖矿快！'}})});
  social.start();
  try {
    assert.equal(await agent.handleMessage('Steve','讲个笑话'),true);
    for(let i=0;i<8 && !output.length;i++)await flush();
    assert.equal(forwarded.length,0);
    assert.equal(agent.actions.currentActionLabel,'action:followPlayer');
    assert.match(output.at(-1).message,/村民/);
  }finally {
    social.stop();
    globalThis.fetch=prev;
  }
});
test('Chinese acknowledgment is only a received-command receipt and does not stop work',async()=>{
  const {agent,bot,output}=makeAgent();
  const social=new AliceSocial(agent);social.start();
  try{
    bot.emit('chat','Steve','跟着我');
    await flush();
    assert.match(output.at(-1).message,/收到你的跟随指令/);
    assert.equal(agent.actions.executing,true);
    assert.equal(agent.actions.currentActionLabel,'action:followPlayer');
    const n=output.length;
    await agent.handleMessage('Steve','跟着我');
    await flush();
    assert.equal(output.length,n,'duplicate raw event and handler should not double-receipt');
  }finally{social.stop()}
});
