'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {pathToFileURL}=require('node:url')
const learningUrl=pathToFileURL(path.resolve(__dirname,'../../../runtime/alice_modules/learning.js')).href
test('Alice creates durable memory before any verified action and loads it on next start',async()=>{
 const {AliceLearningSystem}=await import(learningUrl)
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-memory-'))
 try{
   const agent={name:'AliceAI-Bedrock',memoryRoot:root}
   const alice=new AliceLearningSystem(agent)
   assert(fs.existsSync(alice.filePath))
   assert.equal(alice.summary().itemOutcomes,0)
   const again=new AliceLearningSystem(agent)
   assert.equal(again.filePath,alice.filePath)
   assert.equal(again.data.version,1)
   assert.equal(again.summary().itemOutcomes,0)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('Alice persists verified item outcomes and explicit registry-checked aliases across restart',async()=>{
 const {AliceLearningSystem}=await import(learningUrl)
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-memory-'))
 try{
   const agent={name:'AliceAI-Bedrock',memoryRoot:root}
   const alice=new AliceLearningSystem(agent)
   const registry={itemsByName:{oak_log:{id:5}}}
   assert.throws(()=>alice.rememberItemAlias('蓝宝石','fabricated_item',registry),/Unknown item/)
   alice.rememberItemAlias('原木','oak_log',registry)
   alice.recordItemOutcome('oak_log','gather',{ok:true,delta:3})
   alice.recordItemOutcome('oak_log','gather',{ok:true,delta:0})
   const reloaded=new AliceLearningSystem(agent)
   assert.equal(reloaded.resolveItemAlias('原木'),'oak_log')
   assert.equal(reloaded.data.itemOutcomes['gather:oak_log'].attempts,2)
   assert.equal(reloaded.data.itemOutcomes['gather:oak_log'].successes,1)
   assert.equal(reloaded.data.itemOutcomes['gather:oak_log'].observedItems,3)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
