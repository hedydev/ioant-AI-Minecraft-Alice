# Alice Bedrock runtime — modularization acceptance (2026-11-03)

## Scope and rationale

Three consecutive, behavior-preserving extraction waves reduced `bedrock-native/experiment/src/runtime.cjs` from **3,566 lines / 204.5 KiB** to **855 lines / 52.2 KiB**. The old runtime is still the one owner of actor identity, state, clocks, BDS witness, controls and tasks. Domain methods forward with `.apply(this,args)` and explicitly injected existing policy dependencies. Async delegation returns the feature's original Promise directly, avoiding extra adoption/microtask ordering (critical to the existing 120s cooldown test).

## Ownership by feature file

| File, relative to src/ | Lines | Responsibilities |
|---|---:|---|
| runtime.cjs | 855 | Alice actor construction, lifecycle, signals, scheduling entrypoints and feature forwarding |
| features/autonomy/idle_methods.cjs | 755 | Autonomous objective selection, IDLE work admission, optional resource/door work |
| features/autonomy/model_methods.cjs | 108 | Allowlisted model-goal proposals and decision journaling |
| features/autonomy/night_methods.cjs | 61 | Guarded night survival reposition |
| features/bed/runtime_methods.cjs | 343 | Sleep/spawnpoint request, bed approach, independent post-input BDS endpoint |
| features/door/runtime_methods.cjs | 297 | Door approach, opening/crossing and BDS landing witness, escape survey |
| features/navigation/follow_methods.cjs | 213 | FOLLOW and bounded short-step fallback |
| features/navigation/scout_methods.cjs | 345 | One-cell scouting, full-route safety and independent endpoint confirmation |
| features/safety/runtime_methods.cjs | 236 | True threat evidence, escort and safety preemption |
| features/commands/runtime_methods.cjs | 202 | Typed player requests and restricted text command parsing/execution |
| features/tasks/work_methods.cjs | 310 | Preemptible job lifetime, resource work and crafting |

## Regression receipts and safety

- First wave bed/door: commit `747e240`, Mint Node24 943/943, Mac Python321 (skip3), non-restart.
- Second wave safety/follow/autonomy: commit `7963b52`, Mint Node24 948/948 and Mac Python321 (skip3), non-restart. Historical intermediate failed 946/948, 947/948 receipts are retained. Source slice contract adjusted; extra async forwarding fixed without weakening the original strict 120s BDS decision budget assertion.
- Third wave commands/tasks/scout: commit `a76d6ca`, Mint Node24 952/952, Mac Python321 (skip3), non-restart. Existing scout contract checks moved to actual owning feature files, never disabled.
- The fixed `alice_mint_nonrestart_sync` process reported `aliceRestarted=false`, `bdsRestarted=false`, `worldModifiedByTask=false`, `consoleCommandSent=false`. Current running Alice does not automatically hot reload new Node source. No new claims of door opening, passage, sleeping, HOME, BDS target completion.
- All original fresh independent BDS pairs, 4s/0.75m admission, after-input landing, 240s single-cell deadline, 40 commands/hour and 180s batch spacing, STOP/FOLLOW and threat gates remain unchanged. No process, BDS or world mutation for refactor.

## Guardrails for future development

1. Keep root `runtime.cjs` at **≤1000 lines** and each `src/features/**/*.cjs` at **≤800 lines**, enforced by `test/runtime_modularization_structure.test.cjs`. These are architecture budgets, not gameplay permission.
2. Extend a named domain or create a separate cohesive file instead of appending 200+ lines to the root runtime. No second bot/identity, timers, BDS query engine, model-driven raw scripts or private state store inside feature folders.
3. Keep the existing instance method names and `this` semantics. Return original async Promises directly; ensure lifecycle and invariant-focused tests cover each affected path.
4. Do not use `fs.readFileSync(runtime.cjs)` source-text slicing to test behavior after methods move; target actual owners or instantiate real methods with bounded fixtures.
5. Run complete Mac Python and Mint Node24 regression with the approved pinned MCP executor before sync, and keep production reload as a distinct authorized game-lifecycle decision.
6. Next maintainability candidates: split the 755-line autonomous IDLE method into smaller reason-labeled decision stages; isolate runtime constructor status assembly. Both require their own equivalence testing, not a blanket move in one pass.

## Final structure test acceptance

- Committed code SHA `0dbb85c20472d412a22e811afa946dfca662a6ea`.
- Fixed MCP `alice_r77_structure_mac_11`: Mac Python **321 tests, 3 skipped, 0 failed**, clean checkout.
- Fixed MCP `alice_r77_structure_mint_12`: Mint Node24 **955/955, zero failures/skips**, Mac Python321, non-restart sync, no client/BDS restart, world mutation or console command.
- The guard is now part of Node24 automated tests, not only a documentation recommendation.
- Running Node client code loading and BDS gameplay proof remain independently unverified.
