'use strict'
// Regression: the shared Paper policy files use .js ESM syntax while this
// Bedrock test runner and entrypoint are CommonJS. Require an explicit
// module package boundary; never rely on Node version-specific inference.
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {pathToFileURL}=require('node:url')

const policies=path.resolve(__dirname,'../../../runtime/alice_modules')

test('Paper policy imports are explicitly ESM from a CommonJS Bedrock entrypoint',async()=>{
  const scope=JSON.parse(fs.readFileSync(path.join(policies,'package.json'),'utf8'))
  assert.equal(scope.type,'module','shared policy directory must explicitly opt in to ESM')
  const autonomy=await import(pathToFileURL(path.join(policies,'autonomy_policy.js')).href)
  assert.equal(autonomy.decideIdleWork({hasUsableWeapon:false,woodResources:0}),'LEARN_WEAPON')
})
