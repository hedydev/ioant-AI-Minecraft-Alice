'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {OllamaPlanner}=require('../src/planner.cjs')
test('same Ollama planner serializes chat and autonomous goal transport',async()=>{
  let release,requests=[]
  const fetcher=async(url,init)=>{
    requests.push({url,body:JSON.parse(init.body),signal:init.signal})
    if(requests.length===1)await new Promise(r=>{release=r})
    return {ok:true,json:async()=>({message:{content:'{"tool":"observe","reason":"safe observation"}'}})}
  }
  const planner=new OllamaPlanner({url:'http://127.0.0.1:11435',fetcher,timeoutMs:2000})
  const first=planner.suggestGoal({observation:{health:20},memory:{}})
  await Promise.resolve()
  await assert.rejects(planner.suggestGoal({observation:{},memory:{}}),/model_busy/)
  release()
  assert.equal((await first).tool,'observe')
  assert.equal(requests.length,1)
  assert.equal(requests[0].body.keep_alive,'0')
  assert.equal(requests[0].body.format,'json')
  assert.equal(requests[0].body.options.num_predict,160)
})
test('LLM cannot propose unchecked Minecraft commands or invented coordinates',async()=>{
  const planner=new OllamaPlanner({url:'http://127.0.0.1:11435',fetcher:async()=>({
    ok:true,json:async()=>({message:{content:'{"tool":"scout_safe","reason":"go","position":[1,2,3]}'}})
  })})
  assert.equal(await planner.suggestGoal({}),null)
})


test('opt-in Ollama MLX prompt JSON mode omits format but preserves tool validation',async()=>{
  const bodies=[]
  const fetcher=async(_url,init)=>{
    bodies.push(JSON.parse(init.body))
    return {ok:true,json:async()=>({message:{content:'{"tool":"observe","reason":"unverified terrain"}'}})}
  }
  const planner=new OllamaPlanner({url:'http://127.0.0.1:11435',model:'gemma4:26b-a4b',
    jsonMode:'prompt',timeoutMs:60000,numPredict:512,fetcher})
  assert.deepEqual(await planner.suggestGoal({observation:{health:20}}),
    {tool:'observe',reason:'unverified terrain'})
  assert.equal(Object.hasOwn(bodies[0],'format'),false)
  assert.equal(bodies[0].keep_alive,'0')
  assert.equal(bodies[0].model,'gemma4:26b-a4b')
  assert.equal(bodies[0].options.num_predict,512)
})
test('prompt-only MLX response with unsafe or malformed JSON is never accepted',async()=>{
  for(const content of [
    'I think Alice should run a command',
    '{"tool":"dig_down","reason":"unsafe"}',
    '{"tool":"gather_wood","reason":"fast","position":[0,64,0]}',
    '{"tool":"observe","reason":"safe"}\n{"tool":"scout_safe","reason":"move"}'
  ]){
    let body
    const planner=new OllamaPlanner({url:'http://127.0.0.1:11435',jsonMode:'prompt',
      fetcher:async(_url,options)=>{body=JSON.parse(options.body)
        return {ok:true,json:async()=>({message:{content}})}}
    })
    assert.equal(await planner.suggestGoal({}),null)
    assert.equal(Object.hasOwn(body,'format'),false)
  }
})
test('bounded configuration rejects unsafe Ollama JSON modes and timeouts',()=>{
  for(const jsonMode of ['auto','disabled',false,'',null]){
    assert.throws(()=>new OllamaPlanner({jsonMode}),/Invalid Ollama JSON mode/)
  }
  for(const timeoutMs of [0,-1,999,120001,1.5,NaN,Infinity]){
    assert.throws(()=>new OllamaPlanner({timeoutMs}),/Invalid Ollama timeout/)
  }
  for(const numPredict of [0,63,1025,1.5,NaN,Infinity,'512']){
    assert.throws(()=>new OllamaPlanner({numPredict}),/Invalid Ollama output budget/)
  }
  assert.equal(new OllamaPlanner({numPredict:64}).numPredict,64)
  assert.equal(new OllamaPlanner({numPredict:1024}).numPredict,1024)
})

test('short thinking-only response does not become a Minecraft action',async()=>{
  let requests=0
  const planner=new OllamaPlanner({url:'http://127.0.0.1:11435',
    model:'gemma4:26b-a4b',jsonMode:'prompt',numPredict:160,
    fetcher:async()=>{requests++;return {ok:true,json:async()=>({
      done_reason:'length',eval_count:160,
      message:{thinking:'not enough reasoning budget',content:''}})}}})
  assert.equal(await planner.suggestGoal({}),null)
  assert.equal(requests,1,'no hidden auto-retry or execution without content')
})
