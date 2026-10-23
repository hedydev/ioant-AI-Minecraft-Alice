'use strict'
// Validate the versioned Bedrock world dependency before starting a live client.
// Use Mineflayer's own module resolution path: a top-level copy can otherwise pass
// while its nested prismarine-chunk remains unable to read Bedrock 1.26.
const path = require('node:path')
const { createRequire } = require('node:module')

const EDITION = 'bedrock_1.26.51'

function checkChunkImplementation ({ load, log = console } = {}) {
  let source = load
  if (!source) {
    const mineflayerFile = require.resolve('mineflayer')
    const fromBedrockBlocks = createRequire(path.join(path.dirname(mineflayerFile), 'lib', 'bedrock_plugins', 'blocks.js'))
    source = name => fromBedrockBlocks(name)
  }
  const registry = source('prismarine-registry')(EDITION)
  if (registry.version?.type !== 'bedrock' || registry.version?.majorVersion !== '1.26') {
    throw new Error('Bedrock registry does not describe the expected 1.26 world')
  }
  let Chunk
  try {
    Chunk = source('prismarine-chunk')(registry)
  } catch (err) {
    throw new Error('Bedrock 1.26 chunk implementation missing. Install the pinned prismarine-chunk #338 revision with npm install; '+err.message,{cause:err})
  }
  if (typeof Chunk !== 'function') throw new Error('Bedrock 1.26 chunk loader did not return a constructor')
  const { Vec3 } = source('vec3')
  const position = new Vec3(3,70,5)
  const column = new Chunk({x:0,z:0})
  const stone = registry.blocksByName?.stone?.defaultState
  if (!Number.isInteger(stone)) throw new Error('Bedrock 1.26 registry has no valid stone block state')
  column.setBlockStateId(position,stone)
  const name = column.getBlock(position)?.name
  if (name !== 'stone') {
    throw new Error('Bedrock 1.26 chunk state round-trip failed: expected stone but found '+String(name))
  }
  log.log('[Alice Bedrock] Bedrock 1.26 chunk implementation READY (real registry + block read/write)')
  return { edition: EDITION, stoneVerified: true }
}
module.exports = { checkChunkImplementation, EDITION }