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
