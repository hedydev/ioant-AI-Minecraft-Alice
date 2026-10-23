## 2026-10-20 — Real Mint Ollama model comparisons and bounded token budget

**Observed on user Mint -> Mac 11435:**
- `gemma4:26b-a4b` with `format:'json'` returned HTTP **501** with exact body `{"error":"structured output is unavailable"}`: constrained format unsupported by current MLX backend. Do not pretend to fix xgrammar by updating Alice code; use opt-in `ALICE_OLLAMA_JSON_MODE=prompt`.
- Without `format`, Gemma with `num_predict:160` returned HTTP 200 in **5.41s**, `done_reason:'length'`, 160 generated tokens, Thinking 575 characters and **empty** `message.content` — **not** an actionable goal.
- Gemma with `num_predict:512`, `think:true`, prompt-only JSON: HTTP 200 in **21.91s**, `done_reason:'stop'`, 390 tokens, 1110 Thinking characters, valid `{"tool":"observe","reason":"..."}`.
- `granite4:3b` with `format:'json'` and `num_predict:256`: HTTP 200 in **3.85s**, 70 tokens, valid `observe` response and no Thinking. This is ~5.7× faster than observed Gemma 4 and smaller (2.1 GB model vs 16 GB), so preferred for initial low-resource Alice autonomy acceptance, while Gemma remains an optional advanced model.

**New source setting:** `ALICE_OLLAMA_NUM_PREDICT` (default 160, strict integer 64–1024), passed into the autonomous-model planner; 512 now possible without editing source. Existing `ALICE_OLLAMA_TIMEOUT_MS` (default 12000, max 120000) supports Gemma, suggested 60000. No default changes, no hidden retries, and no bypass of single strict `JSON.parse` / `validateGoal` allowlist, STOP/FOLLOW, world-safety, Bedrock login or backups. Test includes real 160-token thinking-only failure, bounded 512 override, and limits. Source commit alone is not Mint Node24 or BDS deployment; prior successful `npm test` preceded this new commit.

Recommended phase-1 Alice environment: `ALICE_OLLAMA_MODEL=granite4:3b` with default `ALICE_OLLAMA_JSON_MODE=strict`, `ALICE_OLLAMA_TIMEOUT_MS=12000`, `ALICE_OLLAMA_NUM_PREDICT=160` (the user's earlier Granite test at 256 tokens produced a response of 70). Gemma option: `ALICE_OLLAMA_MODEL=gemma4:26b-a4b`, `ALICE_OLLAMA_JSON_MODE=prompt`, `ALICE_OLLAMA_TIMEOUT_MS=60000`, `ALICE_OLLAMA_NUM_PREDICT=512`. Keep safety validation and clear model-status evidence regardless of endpoint.

## 2026-10-20 — Ollama MLX HTTP 501 workaround (opt-in, not a model success claim)

User's Mint -> Mac `POST /api/chat` using `gemma4:26b-a4b`, `format:"json"` returned HTTP **501** after ~9 s; therefore no output file was written by `curl -f`. A published Ollama MLX report documents the same HTTP 501 when `libollama_xgrammar.dylib` (structured decoding library) is missing in some Homebrew builds. This remains a **likely diagnosis, not proof** until the user's exact HTTP 501 response body and Ollama packaging/version are checked. The failed call is not a model-inference benchmark.

To support this without loosening Bedrock tool permissions: `OllamaPlanner` now takes `jsonMode:'strict'|'prompt'` (default **strict**), forwarded from Mint env `ALICE_OLLAMA_JSON_MODE`. Opt-in `prompt` omits only the optional Ollama `format:'json'` field when proposing an autonomous goal. The existing exact `JSON.parse` + `validateGoal` one-tool whitelist still rejects prose, extra keys, arbitrary commands, invented coordinates and multi-object responses. `ALICE_OLLAMA_TIMEOUT_MS` allows a deliberately chosen 1000–120000 ms instead of fixed 12000 ms, default unchanged; useful to test cold-loaded MLX but verify measured latency first. `keep_alive:'0'` remains unchanged for Mac resource conservation, and the model remains serialized with human chats. No automatic retries or hidden additional model calls, no BDS restart, no auth/backup/learning state modifications.

Mint diagnostic: test without `format` first, capturing HTTP body and request wall time even for failures. If successful and the JSON passes local validation, configure `ALICE_OLLAMA_JSON_MODE=prompt` plus `ALICE_OLLAMA_MODEL=gemma4:26b-a4b` and a measured `ALICE_OLLAMA_TIMEOUT_MS` (e.g. 60000), then test with Node24. Model status remains `unverified` until a real successful valid proposal. **No user's model request, full test suite, or BDS integration has been re-run by this commit.**

# AliceAI — 单大脑双模式 Agent 架构（选择 C）
状态：用户于 2026-10-20 确认方向；**M1/M2 源码已提交，尚未部署或 Mint/BDS 实测**。默认低资源，不等于已有模型主动驱动。

## 产品目标与范围

用户选择 **C：自主生活 + 智能队友双模式**，要求兼顾 Mac M1 Pro 32GB 的推理内存/功耗，以及 Mint 上 Minecraft Bedrock Dedicated Server 的稳定性。**仅一个 Alice 身份、一个游戏客户端、一个模型接口、一个工具注册表、一套学习/世界记忆**；不是两个独立机器人，亦不额外加载第二份模型。

- `companion`（智能队友）：默认启动模式。玩家指令优先；自动任务只维持生存/装备/安全与已经承诺的工作。复杂聊天、目标拆解和执行失败可按需唤醒 LLM。不对没有指令的世界进行周期性长程大模型规划。
- `autonomous`（自主生活）：安全和玩家指令照常最高优先，闲时自己提出、推进可证实的探索/资源/工具目标；需要新目标或失败重规划时请求 LLM；已批准的计划逐步复用现有确定性执行器。
- 切换模式时保留 **同一** 持久记忆与经过验证的世界认知。停止/暂停自主发起的新任务不能停止生命安全或抢夺正在执行的玩家指令。FOLLOW/STOP/守卫/其他人类任务优先级不因模式改变。

与现有 `autonomyEnabled` 区别：它是 **自主闲时任务的总开关**，关闭仍要服从玩家指令并执行紧急生存行为；未来 `agentMode` 只决定闲时策略。兼容旧控制台配置文件（缺失 `agentMode` 默认 `companion`），不可直接把现有配置 schema 从 3 字段改成强制 4 字段而拒绝现存设置。所有可编辑字段必须通过 Mac localhost 原有 POST 白名单、Mint `remote_control.py`、`live_control.cjs` 双侧验证、修订号 ack 和测试。

## 统一运行链路

```text
真实 BDS 方块/实体/库存/时间/位置(含来源和时间戳) + 玩家指令
                         |
                Observer / Situation
                         |
                 Goal & Task Journal <---- 经验证的长期记忆
                         |                         ^
              Mode / Goal Scheduler                |
          companion 或 autonomous                  |
                         |                         |
           事件触发的 Ollama Planner               |
             (一个实例、有预算、可取消)            |
                         | 合法 JSON 目标/步骤      |
               Validator / Action Registry         |
          拒绝假坐标、未加载区块、越权采集          |
                         |                         |
               现有 Bedrock 执行器  -----------------
          follow/scout/door/gather/craft/eat...
                         |
            实际 BDS/背包/路径观测反馈
```

### 划分“智能”与硬规则

- **LLM 决定**目标是什么、为什么要做、多个允许工具的先后、失败后的替代路径、是否放弃；输出严格结构化的候选目标和短计划，不是任意 JS/终端/游戏命令。
- **代码必须决定**认证/实例锁、真值来源、STOP/人类优先、敌人/生命安全、碰撞和安全落点、建筑所有权限制、已知工具能力、库存/BDS 成功证据；大模型不得关闭这些保护。
- Planner 无法提出当前执行器未注册的动作；若“获取铁锭”缺少熔炼/矿物开采执行器，必须回应技能未实现而不是伪造成功。
- 目前 `self_drive.cjs` 的 `SelfDriveJournal` 仅会话内、按固定规则选目标；`planner.cjs` 只在未知聊天解析时请求 Ollama。**二者尚未连通**，故当前 Alice 不具备上述模型自驱。
- 原有 `autonomy_policy.decideIdleWork` 只看武器与木材，后续应逐步替换为目标计划调度，而非不断为每种情境添加特殊 if/else。移植旧 Paper Mindcraft 的规划思路，但**不**迁回 Paper 服务端，也不复制另一套登录/移动体。

## Mac/Mint 资源预算（设计目标，不是现有可用配置）

- Mac 上单个 Ollama endpoint/单主力模型（先使用当前已安装且实测可用的模型），无论两种模式如何切换都不加载两份。
- Mint 上保持现有快速控制频率：安全 ~300ms、跟随 ~1s、轻量观察/执行 ~5s；**这些 tick 不直接调用 LLM**。
- LLM 触发：新的人类复杂任务；自主模式下需要新目标；被真实任务结果阻断、计划过期、环境出现明确重大变化；手动请求重新规划。未达到触发条件不询问模型。
- 初始限流建议：同一 Alice 同时最多 1 个模型请求；非玩家紧急触发 90s 最短间隔；每小时最多 12 次**自主**规划请求；每个请求 12s 超时。上述数值作为新调度器的可测试配置建议，不宣称已接入、不限制即时 STOP/FOLLOW 或基础生存。复杂场景可调整预算，不“每5秒问一次模型”。
- 传输摘要限制：最多近场小范围地形/实体事实、必要背包/健康和当前目标、最近 3–5 条有关联的经验；不发送世界原始数据、Microsoft 身份信息或无限历史。推理失败时可继续已获准计划的**安全**步骤，但不能把静默固定策略伪装成大模型决策。
- 模型空闲时可通过 Ollama keep_alive 卸载以降低统一内存占用；会增加下次请求首响延迟。需要在 Mac 真实测试模型常驻 RSS、KV cache、首 token 和计划时延，不以磁盘文件大小等同 RAM 使用量。
- 默认使用 Mac 127.0.0.1 现有 Ollama 端口（根据当前实际配置检查，之前为 11435）；Mint 仅走认证 SSH 反向转发/信任的局域网，不扩大 Ollama 公网暴露。

## 协议/状态契约（拟定）

**WorldObservation**：`observedAt`、`source`、`position{feet,provenance,lastVerifiedAt}`、`dimension`、`timeOfDay`、`weather`、`health`、`food`、`inventory`、`visibleThreats`、`nearbyTerrain`、`knownRoutes`、`ownedStructureExclusion`、`capabilities`，所有不确定事实标明 unknown。

**GoalProposal**（仅建议，不自动发包）：`goalId`、`goalType`（当前已实现枚举）、`reason`、`priority`、`steps[{tool,args,expectedEvidence}]`、`stopConditions`、`expiresAt`。限制工具名、步数、响应大小与参数范围；模型不能创造执行器。

**TaskJournal**：跨重启持久保存 `goalId/mode/phase/planVersion/steps/attempts/lastVerifiedEvidence/blockedReason/updatedAt`。仅 BDS/库存真实证据可提升 `confirmed`；客户端预测位移为 `unverified`。模式改变保留已知事实，不盲目自动续接被 STOP 的计划。

**LLM Observability**：控制台显示 `agentMode`、`modelStatus` (disabled/ready/busy/error)、`lastPlanningAt`、`planningLatencyMs`、`planningTrigger`、`goalSource` (model/human/fixed-safety)、`planSteps`、`rejectedReason`、`nextEligibleAt`。绝不展示 OAuth/Xbox 凭据、原始无过滤聊天/提示词。**只有有真实模型调用证据才能显示“AI 思考中”**。

## 分期交付与验收（避免无止境微补丁）

**M1（模式与可观察性）**：扩展并迁移 `live_control` + `remote_control` + Dashboard；`agentMode` 两值，旧配置无损兼容。切换前后不丢 FOLLOW、设置修订号生效，不引入第二 Xbox 连接。测试 Mac Python/Mint Node24。

**M2（真正 Ollama 自主规划闭环）**：建立单实例 `GoalPlanner`、事件驱动调度、可取消/限流/超时、合法计划校验；在 `autonomous` 模式中 **实际调用模型** 生成一次只读目标建议，验证后从已有工具中执行短步骤，再接收真实反馈。模型离线/错误必须透明呈现，不能假装已思考。仪表盘证明触发次数与结果。

**M3（长计划和记忆）**：以实际背包/BDS证据保存步骤；遇失败重规划，避免循环追旧木门/旧树木；换模式和重启能恢复目标摘要，但人工 STOP 不得自动恢复移动。

**M4（实机验收与预算）**：Mint 17879 在玩家许可/备份前提下观察：白天找自然资源→合法采集→证实背包→成功合成；协作模式按玩家复杂指令执行；任意时刻 STOP、低血/威胁和模式切换均优先；Mac 用实际内存/推理延迟/每小时规划次数证明模型不会持续高负载。缺技能时要明确提示。

## 本次架构决策不意味着部署成功

截至决策日期：Mint 当前正在跑的 Alice 仍以固定闲时策略为主；`OllamaPlanner` 可选且只在未识别聊天中触发；双模式按钮、真实 LLM 空闲规划、跨重启目标日志均尚未实现。刚提交的木门碰撞修改也尚未通过完整 Mint Node24/npm 和 BDS 验收。**不要重启 Minecraft BDS、不要覆盖当前 Xbox auth/学习/世界数据**，实现要遵循 `AGENTS.md` 的登录保护、非破坏同步和实测要求。

## 2026-10-20 — M1/M2 source staged; never claimed deployed

- Dual mode: companion is the default for missing agentMode on legacy three-field configs; autonomous opt-in uses the same Xbox identity, Bedrock executor, and learning state. Runtime, Mint Python and Mac localhost UI all accept the new bounded key and retain applied revision acknowledgement.
- The companion mode stops new idle resource jobs; fast SURVIVE/FOLLOW/player work and safety maintenance remain independent. In autonomous with an Ollama endpoint, the registered single ModelGoalScheduler plans only on new-goal, mode-change, observed-world change and task-outcome events. One pending request, 90s minimum spacing, 12/hour autonomous budget, 12s timeout; no 300ms/1s/5s LLM polling.
- Model responses may suggest only observe, gather_wood, craft_wooden_sword, scout_safe. One validated step passes through the pre-existing Bedrock job executor with fresh guards; never authorize raw coordinates, direct mining, BDS commands or arbitrary JavaScript. Model output can never assert a BDS-verified success. No model endpoint means legacy deterministic autonomous work, shown as fixed-safety; configured Ollama failure is reported and does not silently switch to fake model planning.
- One OllamaPlanner transports human chat and autonomous proposals with a shared busy lock. Human chat cancels/waits for pending autonomous requests; STOP and safety preempt pending work. Mac dashboard agent heartbeat reports bounded status/trigger/tool/rejection/budget, no prompt or auth tokens.
- Code and regression cases are committed, NOT deployed. Node24 suite, Python suite, Mint BDS 17879 querytarget and wooden-door collision repair acceptance remain pending. World backups, Xbox auth, protected structures and learning files unchanged; do not restart BDS.

**Ollama status truthfulness:** An endpoint configured on Mint is initially `unverified`, **not** `ready`; `ready` requires a real successful valid model response. Rejected/failed requests report `error`, and a cancelled in-flight request returns to `unverified`. The model name is included in the private status heartbeat (never an endpoint credential or prompt). Mac 127.0.0.1:11435 is historical, so check local Ollama and the private Mint SSH reverse tunnel before enabling autonomous mode. Do not start a second Alice login to test model reachability. Added regression coverage for the unverified-to-ready transition.

## 2026-10-20 — Mac Python suite: 4 failures / 2 errors root-caused (source fix staged)

User-supplied **Mac** `python3 -m unittest discover -s games/minecraft-ai/tests -v`: 46 tests, 4 failures, 2 errors, 3 skipped. Five cases arose from macOS `/var/folders` versus real `/private/var/folders`: `find_worlds` resolved each world but compared against an unresolved root, and sandbox/stage/log tests compared raw temp path text with canonical paths. Fix `find_worlds` by resolving the root **before** the existing strict `is_relative_to(root)` containment gate, then assert canonical results in tests. Add a cross-platform symlink-alias fixture and verify an external symlinked world still gets rejected. No security bypass, no backup policy change, no world mutation.

The sixth failure used a stale assertion about the old **three** editable settings. Replace that prose assertion with an exact fixed-SSH-script assertion. While investigating, found a real M1 regression: Mac `dashboard/server.py` still rejected the new `agentMode` field before forwarding to Mint. Add the same two-value allowlist (`companion`, `autonomous`) at the Mac backend; retain all other strict type/bounds, localhost/Origin and JSON protections; exercise valid and invalid mode writes via HTTP tests. The optional `_aliceMessageEpoch` warning is a separate integration limitation, not one of these six failures.

This commit is **source/test/documentation only**. Python suite has NOT been re-run on user's macOS, and Mint Node24, Ollama real requests, Bedrock BDS 17879, wood-door collision and Minecraft movement are NOT tested or redeployed here. The `Installed successfully` line is from an isolated `test_install` temporary directory, not verified production deployment. Never restart BDS, clear auth/learning data, or infer movement success from this test report.

