'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { checkChunkImplementation } = require('../src/chunk_preflight.cjs')
const pkg = require('../package.json')
const sha = '02b4a4cc660d0ce6f8f08cbdb78926d7f7590ed3'

test('Pin upstream 1.26 chunk dispatch commit for all nested Mineflayer copies', () => {
  assert.equal(pkg.dependencies['prismarine-chunk'], 'git+https://github.com/Pix3lPirat3/prismarine-chunk.git#'+sha)
  assert.equal(pkg.overrides['prismarine-chunk'], '$prismarine-chunk')
})
function mock ({ chunkMissing = false, wrongBlock = false } = {}) {
  const registry={version:{type:'bedrock',majorVersion:'1.26'},blocksByName:{stone:{defaultState:34}}}
  const load=(name)=>({
    'prismarine-registry':()=>registry,
    'prismarine-chunk':()=>{if(chunkMissing)throw Error('[Prismarine-chunk] No chunk implementation for bedrock 1.26 found');return class {setBlockStateId(_p,id){this.id=id}getBlock(){return {name:wrongBlock?'air':this.id===34?'stone':'air'}}}},
    'vec3':{Vec3:class {constructor(x,y,z){this.x=x;this.y=y;this.z=z}}}
  })[name]
  return {load,log:{log(){}}}
}
test('Preflight verifies exact 1.26 Bedrock registry and a block state round-trip',()=>{
  assert.deepEqual(checkChunkImplementation(mock()),{edition:'bedrock_1.26.51',stoneVerified:true})
})
test('Preflight fails with targeted message when current user error recurs',()=>{
  assert.throws(()=>checkChunkImplementation(mock({chunkMissing:true})),/Bedrock 1.26 chunk implementation missing.*pinned prismarine-chunk #338/)
})
test('Preflight rejects silently broken or all-air world block implementation',()=>{
  assert.throws(()=>checkChunkImplementation(mock({wrongBlock:true})),/chunk state round-trip failed/)
})