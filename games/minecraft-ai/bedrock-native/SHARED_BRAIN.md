# Shared AliceAI brain across Paper and Bedrock

The original, maintained Paper Alice rules remain in `../runtime/alice_modules/`. Native Bedrock imports **those exact source files** at startup via `src/shared_brain.cjs` rather than copying or rewriting their logic. The policy modules currently imported are:

- `inventory_policy.js`: item snapshot/formatting, inventory query, coordinate query;
- `wood_policy.js`: amount clarification and nearby-wood selection;
- `safety_policy.js`: health/combat priority/tactic selection;
- `social_policy.js`: status/source query recognition;
- `recipe_plan.js`: bounded dependency planning, NOT automatic crafting;
- `terrain_policy.js`: conservative navigation hazards;
- `task_observation.js`: verified nonnegative collection deltas;
- `intent_policy.js`: message epoch safety (not implicitly activated without an actual epoch).

## Protocol adapters

Paper's Mineflayer `bot` state, Vec3, pathfinder, inventory slot model, combat and crafting are **not** valid Bedrock protocol APIs. Those executors remain exclusively in `runtime/alice_modules/{movement,safety,tasks,crafting,storage,autonomy}.js` and are not imported into a Bedrock process.

The initial Bedrock adapter subscribes to `start_game`, `move_player` (only the local entity runtime ID), and `update_attributes` (only the local entity's actual health). All fields are verified for shape/range; an initial player position is marked *spawn-only* rather than real-time. Location observations expire after 30 seconds. Bedrock numeric inventory network IDs are deliberately *not* displayed as canonical item names; after implementing and validating a versioned Bedrock inventory/registry adapter, that adapter can call `observeVerifiedInventory()` with genuine normalized item names and bounds. Until then, inventory queries state that data is not trustworthy.

The command router now uses Paper policies for real status, location, inventory and exact wood-count clarification. Follow/harvest/craft/guard commands are tracked as *requested*, not *executing*. Both explicit `AliceAI`-prefixed and the existing known short bare commands work. A pending wood-count reply is scoped to the player and expires after 45 seconds. No Bedrock motion, dig, attack, place, craft or drop packets are emitted by this integration.

## Validation and next steps

`node --test bedrock-native/test/*.test.cjs` must pass on Mint with isolated Node24. The new `shared_brain.test.cjs` imports real source policies, checks ID-scoped health/location, expiry, honest inventory, intent cancellation and count follow-ups. It is a unit test **not proof of live packet fields**. On a live `bedrock-default` connection verify chat `AliceAI 状态`, `AliceAI 你在哪里`, `AliceAI 背包有什么`, `AliceAI 收集木头`, `12个木头`, `AliceAI 跟着我` and `AliceAI 停止`. Do not claim active following until the Bedrock motion adapter and real player position feedback are measured in a *disposable world* first.

Subsequent stages: verified Bedrock entity/player/block/chunk observation, safe client-side motion and pathfinding, single-owner safety/combat interrupts, game-item registry/inventory adapters, transaction-confirmed digging/crafting/chest/toss, autonomy and learning persistence in Bedrock-only profile data. Reuse Paper policy modules, never its Mineflayer-specific operations. Never overwrite the successfully backed-up Bedrock world or Paper `bots/AliceAI` files.