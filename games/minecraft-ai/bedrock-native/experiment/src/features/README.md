# Runtime feature ownership and dependency contract

The root AliceBedrockRuntime in src/runtime.cjs remains the only owner of the live bot, clock, decision epochs, task/job lifecycle, STOP/FOLLOW intent, model authority, timers and independent BDS witness evidence. Feature module factories receive the existing runtime policy dependencies explicitly and their methods execute with the SAME Alice instance via .apply(this,args). No feature module creates another client, timers, source of coordinate truth, MCSManager query or gameplay mutation beyond the original method body.

- bed/runtime_methods.cjs: bed and personal respawn tasks.
- door/runtime_methods.cjs: door, crossing, post-input witness and room survey.
- safety/runtime_methods.cjs: observed hostile evidence, escort and safety preemption.
- navigation/follow_methods.cjs: following and bounded recovery.
- autonomy/model_methods.cjs: bounded model goal execution and decision records.
- autonomy/night_methods.cjs: guarded night reposition.
- autonomy/idle_methods.cjs: durable autonomous IDLE scheduling.

Keep stable AliceBedrockRuntime instance APIs for all consumers. Add and preserve behavioral tests for each extracted feature; no status-only or local physics indication may be promoted to BDS accepted travel. Source refactors require Mac Python and Mint Node24 full regression with one-client no-restart non-destructive sync.

- commands/runtime_methods.cjs: typed player/chat requests, model text request and allowlisted acquisition.
- tasks/work_methods.cjs: admission, cancellation-aware job lifecycle, gathering, verified resource steps and crafting.
- navigation/scout_methods.cjs: bounded scouting and independent BDS post-input one-cell endpoint verification.

Module factories are not independent controllers: no extra event loops, actor instances or BDS queries. Source-structure tests must read the owning feature, not search the root runtime source for moved method bodies. Asynchronous wrappers return the original feature Promise directly to avoid an extra microtask boundary.

- autonomy/idle_admission.cjs: synchronous server-evidence, STOP/FOLLOW, danger, day/night and HOME admission gates; no extra Promise or action.

- survival/maintenance_methods.cjs: periodic read-only beds, HOME observation, inventory equipment, sleep opportunities and safe food recovery.
- navigation/terrain_methods.cjs: BDS-authorized vertical candidate verification and bounded earthwork/bridge requests.

Maintenance and terrain method bodies continue executing with the original Alice runtime state. Async maintenance proxies must return their original Promise directly.

- autonomy/resource_strategy.cjs: synchronous resource/tree opportunity and previously gated gather/craft admission.
- autonomy/door_strategy.cjs: synchronous fresh-door review and WAIT-mode door task admission, preserving async job callback implementation unchanged.

- bed/sleep_opportunity.cjs: one shared synchronous sleep admission for maintenance and freshly accepted independent BDS witnesses; pending proof/approach does not spend interaction retries.

- bed/door_stage.cjs: bounded bed goal transition through existing independently guarded door executors; no second navigation engine.
