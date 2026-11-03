# Bedrock feature modules

The original AliceBedrockRuntime remains the only owner of bot state, task lifetime, timer, priority, STOP/FOLLOW and independent BDS witness context.

- bed/runtime_methods.cjs owns spawnpoint, bed approach and bed-step witness settlement.
- door/runtime_methods.cjs owns door approach, crossing, raised landing and escape survey.

These factories inject dependencies once. Public instance methods forward using the original this; no second client, timer or independent state store is introduced. Preserve all original safety, geometry, query budget and post-input server-proof gates. Future modules should be extracted incrementally and accepted by full Mint Node24 and Mac Python regression.
