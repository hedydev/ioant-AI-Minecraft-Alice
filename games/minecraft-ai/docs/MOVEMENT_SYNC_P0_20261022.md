## 2026-10-25 — Back to existing 17879 production world, no extra BDS

Operator clarified three pre-existing MCSManager Bedrock services: `bedrock-default` at 17879 (Alice's actual world), `zombie-apocalypse` at UDP 17880/27880 (world `zombie-apocalypse`), and `fight-alwasys` (port not yet verified). The disposable Alice beta lab previously assigned 17880 was a **fourth, separate, not-started** BDS clone. The observed `lab_udp_ports_busy` is explained by the long-running `zombie-apocalypse` BDS: PID 1712655, working directory `~/minecraft-bedrock-zombie-apocalypse`, independently confirmed by operator with read-only `sudo ss`, `fuser` and proc cwd; port 17879 is occupied by production PID 2875730. These are historical observations only, not live guarantees. **No existing BDS should be killed, stopped, restarted, modified or have ports moved.** Do not run 17880 startup probe or create a fourth BDS unless the operator explicitly reauthorizes a separate lab test.

Main task returns to reliable Alice autonomous movement on existing `bedrock-default:17879`. The repo already implements a separately operator-controlled, fixed-`querytarget` MCSManager witness via `scripts/bds_position_witness.py` and private `~/.alice-bedrock-control/bds-position-witness.json`. It is **not** proof that a fresh service is running. A historical witness became stale; previous BDS queries showed unchanged Alice feet and zero server-travel despite client-predicted displacement. The Mint operator Python process documentation says the former automatic `mcsm_querytarget` unit was disabled because it flooded the console. **Do not re-enable `--loop` or issue any console command as part of a passive status check.** A future single fixed `querytarget` requires its own separate opt-in and confirmation that MCSManager instance ID maps to bedrock-default, not zombie/fight instances.

Read-only inspector `bedrock-native/experiment/scripts/inspect_movement_sync.cjs` now fails closed if the private active Alice owner lock PID, expected Node24 executable / entrypoint / cwd, live `/proc/PID/stat` process birth token, and `status.json` producerPid/producerStartToken don't match. The 0600 owner-only `status.json` and `outbound-input-audit.json` must both be fresh (<=15s) with a properly typed audit record. A current-session movement verdict additionally requires `connected===true`, `sessionEstablished===true`, exact 17879/Bedrock level and >=2 fresh independent querytarget samples plus >=0.25 actual recorded server motion. If any provenance or freshness condition fails, the inspector reports unavailable or unconfirmed; it never manufactures online status from an old session. The script neither queries MCSManager nor reads credentials or world files, nor alters game state. New offline Node fixtures exercise matching session, PID reuse, stale wire, wrong executable/cwd and unsafe permissions. Tests are **source only until Mac/Mint suites run**.

Safe verification order: use the existing operator `alice-mac.sh status` (read-only, already checks PID/start token), optionally `python3 ~/minecraft-ai/scripts/bds_position_witness.py --check` and `--diagnose` for private config + MCSManager outputlog availability **without console command**, and the strengthened Node inspector only when audit files exist. Do not automatically launch/stop Alice or BDS or install behavior packs. Reassess movement protocol only after fresh server-origin position evidence establishes lack of BDS progress.


## 2026-10-23 — first-burst encoded PlayerAuthInput parity proof (代码已实现，BDS 未验收)

在 `src/serialized_input_probe.cjs` 引入只对首 32 个**移动输入帧**进行的可选内存诊断，接入已有 `ALICE_BEDROCK_INPUT_AUDIT=1` 的 `client.queue` 包装：在 `bedrock-protocol Connection.queue` 序列化成功后，只从刚刚新增的 `sendQ` Buffer 通过已有 `client.deserializer.parsePacketBuffer` 回读 `player_auth_input`，检查 `tick`、`input_data`、`move_vector`、`raw_move_vector`、`analogue_move_vector`、`position`、`delta`、`yaw/pitch` 与序列化前原始帧语义是否一致。**不更改任何一个发包参数、Tick、网络 Buffer 或服务器行为**；原始/解码包仅在同步局部作用域存在，不持久化也不输出，出错仅返回固定枚举 `tick_mismatch/flags_mismatch/move_mismatch/raw_mismatch/analog_mismatch/position_mismatch/velocity_mismatch/rotation_mismatch/decode_error/decoder_unavailable/queue_unavailable/unexpected_packet`。检测结果和总数经现有 2048-byte、0600 匿名快照 `outbound-input-audit.json` 保存：`wireProbeFrames/wireProbeMatched/wireProbeMismatches/wireProbeUnavailable/wireProbeFirstIssue`。在新登录时重置；无需写原始认证包，不抓包，不改 BDS。**同一编解码器往返匹配只能证实本地序列化自洽，仍不能证明协议 Flag 数字是 BDS 正确版本，更不能证明服务端收包或接受移动。** `scripts/inspect_movement_sync.cjs` 汇报当前 `syncTickMode` 与这些指标。

`runtime.cjs:boundedScout()` 的异常日志更名为 `[Alice movement] A* waypoint failure:`，添加 `completedLocalWaypoints/totalLocalEstimateBlocks/bdsWitnessSamples`，保留最后失败段 `localMovedBlocks/firstWaypoint/failedWaypoint` 和 server position packet 数；匿名 acceptance journal 的字段白名单同步更新。2026-10-22 的真实故障：第一 waypoint `(-1,68,0)` 本地已完成，第二 waypoint `(-2,69,0)` 被 BDS 位置一致性保护拒绝；旧日志 `localMovedBlocks=0` 只是第二段未移动，不能代表总移动。

离线安全验证：全新编码回读纯 Node 测试 **5/5 通过**（无需账号/BDS），另外新增发送队列集成与第二段导航拒绝回归；Mint Node24 全套测试和 BDS 1.26.52.3 **尚未实测**。新增诊断默认为已有审计 opt-in 的子功能，部署新源码必须优先在 Mint 跑 `npm test`。回读的第一帧应在 Alice *自然* 白天启动安全 SCOUT 时触发；没有移动输入则 `wireProbeFrames=0`，不能制造强制移动。不放宽 `scoutStartProof` 的 0.75m 阈值、不操作生产备份或账号、不重启 BDS。

下一轮一次性判断：`wireProbeMismatches>0` 则按照枚举对比原始序列化字段；`wireProbeUnavailable>0` 则调查 decoder / native sendQ 访问边界；`wireProbeMatched==wireProbeFrames>0` 且 BDS 仍零位移，则聚焦**协议号/输入时钟相对服务端、RakNet 到达和服务端实际处理**，不再指责输入队列里的字段失真。必须以独立 BDS querytarget ≥0.25 格位移结束 P0。当前 `client_local_1` 是已失败的探索性 A/B，真实对照使用未设置 `ALICE_BEDROCK_INPUT_TICK_MODE` 的默认 `world_anchor`（只能在经确认完全退出旧 Alice + BDS 玩家登出之后换）。

# Alice Bedrock P0 — 输入与物理帧同步修复（2026-10-22）

## 证据与边界

Codex 在 Mint 固定依赖（mineflayer@b24015a / prismarine-physics@e6181 / pathfinder@789d9）离线复现：400ms 调度滞后补跑 8 个物理帧（7 帧 Pathfinder 开始前进），本地预测前进约 0.79954 格，旧 client_input.js 在模拟之前读取了移动输入，最终只发送一个 tick 1008 的旧零向量。先前 2193 枚举修复已启用，analog 兼容只修正非零主向量配零模拟向量的情况，因此对此复现无效。现场 06:23:33–53，GATHER 中的 pathfinder 首轮失败后本地/BDS 差约 2.47 格，第二轮 GATHER 仍尝试导航；随后 EXPLORE 才被位置守卫拒绝，67 次独立 BDS 位置见证为零位移。

根因（离线可复现）：**输入快照与多个物理帧的预测位置错配**。服务端不移动的完整因果链仍需真正发送后、由 BDS 独立 querytarget 才能确定。

## 已实现

- `src/bedrock_client_input_sync.cjs`：以固定 Mineflayer fork 的 `lib/bedrock_plugins/client_input.js` 为基础，在 hero-skills 中维护的单一专用插件。生产通过 Mineflayer 官方 `plugins.client_input` 覆盖内置插件；无 npm/node_modules 文件写入，不创建第二个连接。每个服务端 Tick 对应一个输入快照、一个物理模拟帧、一个预测位置和一个 `player_auth_input`。模拟完成后触发的 `physicsTick` 控制变化明确归属于下一帧。连续延迟 <=32 帧内全部发送递增 Tick 的独立数据包；超过 32 帧（约 1.6 s）的异常卡顿时**不补造预测位移**，释放控制、停止 Pathfinder、记录 overruns/skippedTicks，等待新的可靠位置基线。保留了原 fork 的 block action、车辆、Creative、视角以及 Minecraft physics 行为。现场性能/服务器兼容仍需验收。
- `src/navigation_position_guard.cjs`：使用原有 `scoutStartProof` 做同一份 BDS 见证判定，为正式世界全部标准 Pathfinder `goto` 和 `setGoal` 提供共用保护，覆盖 GATHER、EXPLORE 和 FOLLOW。停止/取消时 `setGoal(null)` 必须允许，以免保护拦截取消。守卫等 Mineflayer `inject_allowed` 完成插件装载后再安装；实验世界不改变默认逻辑；生命安全控制与具体任务的后续异常由原有控制器负责。守卫不传送、不覆盖任何位置或世界状态。
- `src/outbound_input_status.cjs`/main：私有 `~/.alice-bedrock-control/outbound-input-audit.json` 加入匿名合计 `syncEmitted`, `syncCatchupFrames`, `syncMaxBatchFrames`, `syncOverruns`, `syncSkippedTicks`, `syncLastBatchFrames`, `syncControlsChangedInsideFrame`；本地原始数据包、令牌和逐 Tick 坐标均不写日志。
- `scripts/inspect_movement_sync.cjs`：一次性只读验收，融合受保护 live status 和匿名输入统计；只有至少 2 次新鲜可信 querytarget 样本且 BDS 本身累计发生 >=0.25 格位移才返回 `BDS_MOVEMENT_CONFIRMED`，其他状态明确标为无输入、样本陈旧或运动未确认。
- 测试：`test/client_input_tick_sync.test.cjs` 复用 Codex 实际物理引擎+Pathfinder 的隔离场景覆盖 50/400/750/1800ms，以及回调期间按键变化；`test/navigation_position_guard.test.cjs` 覆盖 GATHER/FOLLOW、旧/错 BDS 证据、停止取消与禁用模式。未部署到 Mint 的情况下不能声称真实依赖测试通过。

## 关键工程约束

1. 源码锁定 `Pix3lPirat3/mineflayer@b24015aeeec68a5c94f54444f104f0e563595a30`，修改插件必须与该版本同步审查；不要在 `node_modules` 中直接修改。不变更世界、Xbox 凭证与 BDS 服务配置。
2. 保留 `ALICE_BEDROCK_INPUT_FLAG_COMPAT=official_2193` 以纠正确认存在的 66 项错误输入枚举；`ALICE_BEDROCK_INPUT_ANALOG_COMPAT=official_2193_analog` 仍为可关闭的独立实验，不能以 `analogCompatCorrected` 作为成功证明。
3. `node --test test/client_input_tick_sync.test.cjs test/navigation_position_guard.test.cjs test/runtime.test.cjs test/analog_move_compat.test.cjs test/scout_start_proof.test.cjs` 在真实 Mint 固定依赖上执行；未通过则不重启正式 Alice。标准生产命令保留原有环境变量，BDS/MCSManager 坐标见证不停止。
4. 物理世界验收先在白天安全平地、单个 Alice 会话，用已验证 BDS 起点执行有界移动，然后 `node scripts/inspect_movement_sync.cjs` 检查 `movingQueued>0`、`syncCatchupFrames`、`syncSkippedTicks` 和真正的 BDS 位移。若遇 `BDS_POSITION_NOT_FRESH` 或 `NO_MOVEMENT_INPUT_ATTEMPTED`，**不能**据此推断协议失效；如果输入>0但 BDS仍不动，继续分析发包与服务端接受差异。
5. 尚需 Mint 端全套自动化测试 + 真机接受证明；提交源码并不等于服务器已修好。

## 复现与验收命令（Mint）

```bash
cd ~/minecraft-ai/bedrock-native/experiment
node --test test/client_input_tick_sync.test.cjs test/navigation_position_guard.test.cjs test/runtime.test.cjs test/analog_move_compat.test.cjs test/scout_start_proof.test.cjs
# Tests pass; stop only current Alice and confirm no duplicate; then restart with original runtime env.
ALICE_BEDROCK_INPUT_FLAG_COMPAT=official_2193 ALICE_BEDROCK_INPUT_ANALOG_COMPAT=official_2193_analog ALICE_BEDROCK_INPUT_AUDIT=1 npm run production
# When an authorized move has actually occurred:
node scripts/inspect_movement_sync.cjs
```

## 集成补充

`setGoal()` 在 Bedrock Pathfinder 中是同步的无等待调用，拒绝导航时必须返回 `false`，不能在 FOLLOW 定时器内制造同步异常。`runtime.followTick` 所有非空 `setGoal` 调用均识别此返回值，不再把拒绝的路线标成已跟随。`goto()` 仍以 `navigation_scout_...` 稳定错误拒绝。GATHER `operations.gatherFailureCode` 将共享校验拒绝具体映射为 `navigation_bds_position_diverged` / `navigation_bds_position_unavailable` / `navigation_local_position_unavailable`，不泄露完整异常文本。新增两个 `gather_stages.test.cjs` 回归。

插件覆盖顺序：Mineflayer fork `lib/loader.js` 的 `options.plugins.client_input` 允许函数覆盖内置项，实际注入被推迟到 `inject_allowed`；共享守卫必须在注入回调完成后安装。生产环境输出 `sync*` 计数需启用 `ALICE_BEDROCK_INPUT_AUDIT=1`。在真实 Mint 部署前仍不能确认客户端固定 fork 的 Physics+Pathfinder 回归或 BDS 服务器位移。


## 2026-10-22 Codex 二次复核：Pathfinder fullStop 污染回调后的物理帧

Codex 用 Mint 真实依赖验证上一版 14/14 测试通过，但又从 `mineflayer-pathfinder/index.js` `fullStop()` 复现新的确定缺陷：tick1007 物理模拟 Z=-0.1640286849、vz=-0.0730871243，`physicsTick` 调用到 fullStop 后被私自改写为 Z=-0.5、vz=0。也就是本帧输出中出现约 0.336 格的非物理跳变，下一帧还可能继承这个坐标。离线实验 30 模拟帧/30 包，所以先前只检查帧数确实不充分。Mint 生产坐标仍相差 2.47 格、434 次独立 BDS 位置见证仍无位移、累计移动意图 17 次，**尚不能用新的物理错帧单独解释整个服务器故障**。

修复：`src/physics_frame_snapshot.cjs` 在每次真实 `simulatePlayer(...).apply(bot)` 后保存 position(x,y,z)、velocity(x,y,z) 和接触碰撞标志；`bedrock_client_input_sync.cjs` 在调用 `physicsTick` / `physicTick` 后（包括异常时的 finally）恢复唯一真正由物理引擎完成的状态。这样当 Pathfinder 的 fullStop 释放控制或改变目标时，控制状态仍可影响**下一帧**，但本帧位置/速度不能被回调改写，下一帧也不会从伪造的吸附位置出发。保留同一对象身份，避免 Pathfinder、实体观察者持有的引用失效。当前限制：保护针对 `physicsTick` 回调同步修改；如果第三方库在其他事件中直接修改自身位置，需要单独加见证与源码处理，不应称整个自定位问题根治。

诊断：`syncCallbackPositionMutationsPrevented`、`syncCallbackVelocityMutationsPrevented`、`syncCallbackContactMutationsPrevented` 加入原先的所有权私有匿名计数；传输观察还增加 `movingBurstCount` / `maxConsecutiveMovingTicks` / `currentMovingRun` / `lastMovingAgeMs`，避免累计17次移动输入被误解释为17个连续移动帧。只读 `inspect_movement_sync.cjs` 也会显示这些字段，不包含每 Tick 包体或隐私数据。

测试：新增 `test/physics_frame_snapshot.test.cjs` 的4项纯函数测试、`test/post_callback_frame_sync.test.cjs` 的4项真实依赖离线回归，包括原 GoalNear 到达节点、stop/cancel、转向+跳跃、恶意物理回调修改；既检查与真实物理引擎结果对应的位置/速度，又检查下一帧起点连续性。隔离 V8 模拟验证8次补帧全部保持逐帧一致，且阻止了注入的 x/z 跳变；**新的真实 Mint 依赖回归尚未执行，不能合并到此前的14/14通过结论。**

Mint 新回归命令（尚未通过前不要重启 Alice）：
```bash
cd ~/minecraft-ai/bedrock-native/experiment
node --test \
  test/physics_frame_snapshot.test.cjs \
  test/post_callback_frame_sync.test.cjs \
  test/client_input_tick_sync.test.cjs \
  test/outbound_input_audit.test.cjs \
  test/outbound_input_status.test.cjs \
  test/navigation_position_guard.test.cjs \
  test/gather_stages.test.cjs \
  test/runtime.test.cjs
```
仅在全部通过后，正常停止旧 Alice 且确保没有第二个进程，保持所有 BDS 与 witness 原状，启动原生产命令；随后 `node scripts/inspect_movement_sync.cjs` 检查 `maxConsecutiveMovingTicks`、回调拦截数和 BDS 位移。真实成功仍需单次可归因动作前后的独立 BDS 查询结果支持，排除传送与其他外力。

## 2026-10-22 P0 回归阻断项修复（Mint 全套重测仍未执行）

Mint 最新一轮共 155 项测试，52 通过、103 失败。失败先按共同依赖排查，**不能**直接说 103 项独立业务逻辑回归：

1. `test/post_callback_frame_sync.test.cjs` 的 yaw 断言将内部弧度 0 当作 Bedrock 网络度数 0；实际固定 Mineflayer `lib/conversions.js` 定义 `toNotchianYaw(yaw) = toDegrees(PI - yaw)`，所以 0 弧度对应**180 度**。测试现在检查首帧 180 度，以及物理回调将内部 yaw 设为 0.9 弧度后的下一包 `(PI - 0.9) * 180 / PI`，验证回调转向只作用于下一帧。生产转换函数和网络协议均未改动。
2. `test/runtime.test.cjs` 用 CommonJS 测试入口的动态 `import()` 加载 `runtime/alice_modules/*.js`，原文件均为 ESM `export` 而该目录原先没有显式 `package.json`；CommonJS 解析器会抛出语法错误，导致大量依赖 `policies()` 的测试一起失败。现新增仅限该目录的 `package.json`（`"type":"module"`）和 `test/shared_policy_esm_scope.test.cjs` 确认该边界；Bedrock `src/*.cjs`、Minecraft 依赖及生产移动逻辑均未修改。Mint 同步文件时必须包含新的 package.json（只同步 `*.js` 不足以部署此修复）。
3. 本地独立 Node 22 小型验证：`--no-experimental-detect-module` 下显式 ESM 目录仍可用 `import()` 加载；固定转换公式 0→180、0.9→128.43379843822592。**不是**完整 Mineflayer、Pathfinder、Mint/BDS 验收；没有直接连接 Mint 或重启任何生产进程。

GitHub 关联提交：`d0d548e`（ESM 目录边界），`a9ee34c`（yaw 单测），`1eecde1`（ESM 边界回归）。

下一道唯一发布门禁：Mint 在同步代码后先执行以下离线测试，任何失败都禁止生产 Alice 重启，也不对 BDS 执行任何操作：

```bash
cd ~/minecraft-ai/bedrock-native/experiment
node --version # 必须 >=24，与 Bedrock main.cjs 的运行门禁一致
node --test \
  test/shared_policy_esm_scope.test.cjs \
  test/physics_frame_snapshot.test.cjs \
  test/post_callback_frame_sync.test.cjs \
  test/client_input_tick_sync.test.cjs \
  test/outbound_input_audit.test.cjs \
  test/outbound_input_status.test.cjs \
  test/navigation_position_guard.test.cjs \
  test/gather_stages.test.cjs \
  test/runtime.test.cjs
npm test
```

若全部通过，下一步仍必须先检查发包实数值对逐帧物理结果的对应，再在稳定、白天、安全、同 BDS 见证的前提下，**仅停旧 Alice、确认无重复会话，再启动单次短程移动验收**；不重启 BDS，不修改世界，不绕过导航保护。使用 `node scripts/inspect_movement_sync.cjs` 确认新鲜真实 BDS 两点位移 >=0.25 格且输入有连续 Tick，才能宣布 movement P0 实机解决。当前实机证据仍为 434 次 BDS 见证、17 次累计移动输入、零位移及 2.47 格偏差，状态仍是 NOT CONFIRMED。

## 2026-10-22 Mint full-suite result: 504/504 at system Node 20 (not production acceptance)

Operator supplied full `npm test` TAP output from Mint `/home/tedz/minecraft-ai/bedrock-native/experiment` on 2026-10-22. `node --version` was **v20.11.0**, and `npm test` (`node --test test/*.test.cjs ../test/*.test.cjs`) reported **504 tests / 504 passed / 0 failed / 0 skipped / 0 cancelled**, elapsed **6275.300268 ms**. This includes:

- `post_callback_frame_sync.test.cjs` 4/4: real Pathfinder goal arrival, goal interruption, yaw+jump+stop next-frame ownership, and a callback attempting to corrupt entity position/velocity;
- `physics_frame_snapshot.test.cjs` 4/4: undo `fullStop()` mutation, restore object identity/contact, no-op unchanged, reject nonfinite physics;
- `client_input_tick_sync.test.cjs` 5/5: 50ms 1 tick, 400ms 8 ticks, real Pathfinder forward snapshots, 750ms catchup, 1800ms overrun;
- `runtime.test.cjs`, new `shared_policy_esm_scope.test.cjs`, `navigation_position_guard.test.cjs`, and all other invoked suites passed.

These results independently confirm the previous common test failures from ESM loading and yaw assertion are gone in the operator's installed Mint dependencies. **They do not meet the project engine gate**, because `package.json` declares Node >=24 and `src/main.cjs` explicitly rejects Node <24. They are offline unit/integration tests, not BDS accepted motion.

The previously established isolated runtime on this Mint is `$HOME/.local/share/alice-bedrock/node24/current/bin`; it must take precedence in PATH without replacing Mint's system Node/MCSManager process. Next required read-only action:

```bash
ssh tedz@192.168.0.104
cd ~/minecraft-ai/bedrock-native/experiment
export PATH="$HOME/.local/share/alice-bedrock/node24/current/bin:$PATH"
node --version
command -v node
test "$(node -p 'process.versions.node.split(".")[0]')" -ge 24 || { echo 'STOP: Node >=24 required'; exit 1; }
set -o pipefail
npm test 2>&1 | tee "$HOME/alice-p0-node24-full-tests.log"
```

If Node24 tests fail, investigate; do not restart Alice/BDS. If all pass, inspect exact ownership of running Alice process, its existing environment and startup method, and freshness of same-instance BDS `querytarget` and starting pose. Stop **only the existing Alice** gracefully with Ctrl+C in its owning terminal and verify BDS disconnect + no second Alice session. Preserve the existing BDS process, MCSManager, model route, world backup and auth cache. Use the previously configured gated production env (including `ALICE_BEDROCK_PRODUCTION_CONFIRM`, profile, manifest and session-witness path) rather than guessing or replacing it. One safe, short daytime movement attempt is required; then run `node scripts/inspect_movement_sync.cjs`. Approval remains conditional on >=2 new independent BDS samples and >=0.25 block server movement attributable to Alice's own movement inputs, not merely the local 504/504 test result.

**Current P0 state**: offline full suite PASS on Node20, Node24 runtime replay PENDING, real BDS movement NOT CONFIRMED; baseline last witnessed 434 BDS samples / 17 accumulated move intents / 0 server displacement / approx 2.47 block local-server drift.

## 2026-10-22 更新 — Node 24 生产运行时全套回归通过（BDS 移动仍未验收）

操作者在 Mint 的 Alice 隔离 Node 24 环境运行全套 `npm test` 后报告：`tests 504`、`pass 504`、`fail 0`、`cancelled 0`、`skipped 0`、`todo 0`，总耗时 `6698.777274ms`。这是第二次全量通过；上一轮系统 Node 20 的 504/504 耗时 6275.300268ms。该结果消除了此前 103 项加载/断言失败的回归阻断；但仅收到测试汇总，实际 Node 版本与生产部署进程环境仍应在启停前只读核实。

**门禁已达成**：Mint 离线回归通过，可进入生产单次实机验收的准备检查。**门禁未达成**：真实 BDS 位置移动 >=0.25 格仍没有新证据；不得宣称 Alice 已会走路。安全次序：先只读核对 Node 路径、实际启动进程、版本源码、当前连接/起点与 querytarget 新鲜性，再经原终端优雅停止唯一 Alice、确保同实例已断开且没有第二连接；保留 BDS、MCSManager、世界、权限、认证缓存和独立见证服务不变；原生产环境（含已配置的 PRODUCTION_CONFIRM / backup manifest / profile）重启仅 Alice 一次，白天安全短程任务，最后读取 `node scripts/inspect_movement_sync.cjs` 并由独立 querytarget 前后坐标认证。

当前阶段：**OFFLINE PASS (504/504, Node24 operator report) / REAL BDS MOVEMENT PENDING**。

## 2026-10-22 新鲜生产证据：2279 次 BDS 坐标见证仍零位移

用户最新执行 `scripts/inspect_movement_sync.cjs` 得到 `MOVEMENT_NOT_CONFIRMED`：`connected=true`、`world=Bedrock level`、`serverPort=17879`，登录位置与 BDS 最新位置均为 `(0.5,69,0.5)`，客户端预测位置 `(1.54,70,-1.5)`，差距 2.47 格；同实例 MCSManager `querytarget` 累计 **2279** 个独立新鲜样本，`bdsVerifiedTravel=0`。审计报告：`inputPackets=124698`、`movementInputs=17`、`analogCorrections=17`、`syncFrames=124698`、`syncCatchupFrames=1813`、`syncMaxBatchFrames=20`、`syncOverruns=0`、`syncSkippedTicks=0`、`syncControlsChangedInsideFrame=4`。

**关键归因边界**：上次见证 434 样本 / 17 个累计移动输入 / 0 位移；现在 BDS 样本增长到 2279 而累计移动输入仍为 17，不能把增加的常规零输入帧当作新的有效行走测试；暂不推定服务器拒绝新版移动帧。当前 `inspect_movement_sync.cjs` 把历史任意时点有 `movingQueued>0` 视作 `attempted`，因此 `MOVEMENT_NOT_CONFIRMED` 还不足以说明近期存在一次完整连续运动。必须读取 `lastMovingAgeMs`、`movingBurstCount`、`maxConsecutiveMovingTicks` 和运行状态差分。

**可能存在旧进程**：返回报告中未出现 `movementBursts/maxConsecutiveMovingTicks/lastMovingAgeMs` 和 `syncCallbackPositionMutationsPrevented/Velocity/Contact`，但这几项在当前 `outbound_input_audit.cjs`、`outbound_input_status.cjs`、`main.cjs` 与报告脚本中都已定义。JSON.stringify 会省略 `undefined` 字段，这与旧 Alice 进程继续运行旧版审计模块相符；并非单凭缺字段即可最终证明老进程，需要核对当前 Alice 独占锁 PID、进程启动时间、审计文件 `updatedAt` 和布尔字段存在性。Node24 504/504 只检查新磁盘代码，**不会**自动升级此前已运行的 Alice。

下一步只读检查：`~/.alice-bedrock-control/active-alice-client.lock/owner.json` PID、进程耗时、`outbound-input-audit.json` 新字段是否存在、`lastMovingAgeMs`、`movingLast10s`、`maxConsecutiveMovingTicks`、以及 `status.json` 状态和 `updatedAt`；不要读取或上传原始认证缓存或全部环境变量。确认原有进程及启动方式后，允许在原终端优雅 Ctrl+C 仅停止 Alice，须确认 BDS 释放连接后再使用原生产配置重新启动 Alice 一次，不重启 BDS/MCSManager；安全平地白天单次有限移动，比较会话前后新移动帧计数与 BDS 新鲜真实坐标。不能因为 `npm test` PASS 就声称移动修复。

## 2026-10-22 — 实机新进程真实移动验收失败：17 连续帧但 BDS 零位移

**用户新进程 `inspect_movement_sync.cjs` 返回 `MOVEMENT_NOT_CONFIRMED`**：新会话 `connected=true`、BDS 端口 17879、登录/BDS 坐标均 (0.5,69,0.5)、客户端坐标 (1.6,70,-1.5)，偏差 2.49 格；142 次新鲜独立 BDS 见证，`bdsVerifiedTravel=0`。

本轮队列与物理计数：`inputPackets=8226`、`movementInputs=17`、`analogCorrections=17`、`movementBursts=1`、`maxConsecutiveMovingTicks=17`、`lastMovingAgeMs=19310`、`syncFrames=8226`、`syncCatchupFrames=248`、`syncMaxBatchFrames=20`、`syncOverruns=0`、`syncSkippedTicks=0`、`syncControlsChangedInsideFrame=4`、`syncCallbackPositionMutationsPrevented=1`、`syncCallbackVelocityMutationsPrevented=8`、`syncCallbackContactMutationsPrevented=0`。新字段存在且实际拦截发生，证明新版物理快照插件已在**这个生产进程**运行；此前“旧进程未加载新版”的结论不再适用于此会话。17 连续输入 tick 等价于 ~850ms 的**模拟时间**，不保证实际网络时间、被 BDS 接收/重放或服务器承认位移。

**失败归因目前不能越级**：同实例 BDS 仍零位移，但成功 `client.queue` 与 `serialized` 计数不是可靠 RakNet 包送达，更不等于 BDS 验证/模拟接受；`analogue` 修正 17 次不是接受证明；单纯缺少 `correct_player_move_prediction` 也不构成拒绝证明。当前代码的 `world_anchor` tick 是由 `start_game.current_tick` 和墙钟推算，注释明确此 world tick **不一定**等于 PlayerAuthInput 客户端 frame tick；此假设需要独立证据检验，不得未经验收直接改成 `client_local_1`。

**下一步只读诊断，不增加协议补丁/不强制移动**：白名单读取 `~/.alice-bedrock-control/outbound-input-audit.json` 的 `loginTickShape/loginTickPresent/tickAdvance/tickVsExpectedWallTick/repeatedTicks/regressedTicks/lastTickStep/serialized/serializationErrors/transportHookState/transportCalls/transportThrows/pendingPacketBuffers/corrections/correctionTickPresent/lastMovingAgeMs/maxConsecutiveMovingTicks`；从 `status.json` 读取 `movementEvidence.authority/rewindHistory/received/serverTick/lastSource`、`settings.agentMode/autonomyEnabled`、`worldRoutine.phase/idleHold/decision` 和长目标阶段。所有读取是即时匿名聚合字段，不读取原始包、玩家或认证内容。先判断 BDS 有没有接受的时钟校正线索、发送层是否活跃、客户端是否因 BDS/client 2.49 格不一致而进入防护暂停。保持生产 BDS/MCSManager 不动，原 Alice 不进行额外强行脉冲；后续只有可区分的单一变量、白天自然 SCOUT、同实例独立起点和前后 BDS 位移才可构成下一轮验收。

## 2026-10-22 — transport audit narrows to PlayerInputTick source (controlled A/B only)

Operator's two read-only snapshots 10s apart from an already-running new Alice:
- `serialized` 31870→32070, `serializationErrors` 0; `transportHookState=attached`, `transportCalls` 31430→31625, `transportThrows` 0, `pendingPacketBuffers` 1→0; this establishes serialization success and transport method invocation, **not** BDS acceptance.
- `loginTickShape=array`, `loginTickPresent=true`; `tickAdvance` 32060→32260 (200 ticks / 10 seconds); `tickVsExpectedWallTick=-6` both times; `lastTickStep=1`, `repeatedTicks=regressedTicks=0`. No evidence of accumulating scheduling/tick drift, but **no confirmation absolute tick origin is valid**.
- `corrections=0`, `correctionTickPresent=false`; server-origin position `received=0`, `serverTick=null`, `authority=null`, `rewindHistory=40`. Zero corrections by itself does not prove movement packets were dropped: Mojang movement guide says BDS may send no correction when satisfied.
- `movingQueued=17` remains unchanged, `movingLast10s=0`, `lastMovingAgeMs` ~1201s→1211s, `maxConsecutiveMovingTicks=17`. Autonomous mode **enabled** (`agentMode=autonomous`, `autonomyEnabled=true`), `state=IDLE`, `decisionAction=SCOUT`, but physical start refused `idleHoldReason=scout_client_server_position_diverged`; BDS witness samples 578→581 with 0 verified movement. `worldPhase=day`. Snapshot's `safeToExplore=null` is potentially missing due to bounded status compaction; do not label conditions unsafe from that field alone.

**Strongest hypothesis requiring ONE controlled variable test:** Current Bedrock input plugin `src/bedrock_client_input_sync.cjs` defaults to `world_anchor` and uses `start_game.current_tick` as `PlayerAuthInput.tick` origin. Official Mojang 1.26.51 docs distinguish `StartGame.Level Current Time` from the **per-client simulated input frame** `PlayerAuthInput.Client Tick`: https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/start-game-packet/ and https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/player-auth-input-packet/. Official movement sequence: https://mojang.github.io/bedrock-protocol-docs/guides/player-movement-overview/. A stable delta to wall clock (-6) does **not** establish correct player-frame epoch. Root cause **unconfirmed** without BDS A/B and no recent move input after drift guard.

Existing guarded `ALICE_BEDROCK_INPUT_TICK_MODE=client_local_1` is already supported as an opt-in A/B mode by `main.cjs` and the pinned plugin: on a **fresh spawn** initializes input frame to 1 and increases each physics tick. Do NOT hot-change this in an existing process and do NOT reset coordinates, weaken `scoutStartProof`, rewrite server/world, or start second login. Prepare a single fresh autonomous A/B session only if original owner can safely stop Alice with SIGINT / BDS Player disconnected independently witnessed / login lock released, keeping BDS and querytarget running. Preserve all prior production environment variables including backup manifest, same verified profile and BDS session strict guard; change **only** `ALICE_BEDROCK_INPUT_TICK_MODE=client_local_1`. Run `npm run production:check` with original strict guard, then `npm run production`. Existing `settings.agentMode=autonomous` & `autonomyEnabled=true` mean no human player/follow instruction needed. Observe a single naturally selected safe daylight scout; stop the client promptly after first bounded attempt or safety anomaly; compare fresh session `movingQueued/maxConsecutiveMovingTicks/corrections/tickAdvance/BDS querytarget`. If no autonomous action, report explicit hold reason and do not inject fake input. A/B succeeds only if independent fresh BDS actual displacement ≥0.25 blocks. Roll back tick experiment simply by removing `ALICE_BEDROCK_INPUT_TICK_MODE` at the **next** verified clean Alice restart, not by modifying source or resetting Git.

## 2026-10-23 — Tick A/B 实机仍失败；优先检查初始碰撞与预测落地

在被要求切换 `ALICE_BEDROCK_INPUT_TICK_MODE=client_local_1` 的后续进程中，用户报告 `MOVEMENT_NOT_CONFIRMED`：新登录/BDS 权威 feet 始终 (0.5,69,0.5)，客户端预测 feet (-0.54,68,0.6)，差 1.45 格；625 次新鲜独立 querytarget、BDS 累计移动 0。`inputPackets=34785`，`movementInputs=21`、`analogCorrections=21`，**1 次连续 burst / 最长 21 帧**，最后移动输入距报告 `1464874ms`（24m24.874s）；`syncFrames=34785`、`syncCatchupFrames=513`、`syncMaxBatchFrames=22`、overrun/skippedTick 均为 0，callback position/velocity 恢复计数均为 1。**A 与 B 的实体服务端位移均为零；更换 Tick 起点没有验出成功。** 报告本身未包括进程的 `tickMode` 字段，需要读取当前 Alice PID 的 `ALICE_BEDROCK_INPUT_TICK_MODE` 确认 B 确实被使用；不能假定只凭用户执行了命令就证明已切换。

新增公开对照：锁定的 **Pix3lPirat3/mineflayer @ b24015a** 上游 `lib/bedrock_plugins/client_input.js` 也使用 `start_game.current_tick` 做锚点，并被其作者在官方 BDS 1.26.51 实机验证移动/Pathfinder 成功（PrismarineJS/mineflayer issue #4145，https://github.com/PrismarineJS/mineflayer/issues/4145）。Mojang schema 分别命名 `StartGame.Level Current Time`、`PlayerAuthInput.Client Tick`，但不能单凭字面不同推断当前 world-anchor 必然无效；上一轮将 tick-anchor 当作首要失效点的说法**证据不足**，现已下调优先级。对照上游和专用 `src/bedrock_client_input_sync.cjs`：`movementInput`、`move_vector {x,z}`、`analogue_move_vector {x,z}`、相机朝向、位置 eye-height、输入 flag 和 player_auth_input 包主体保持同类语义；主要差异是分帧补发、物理回调状态保护、可选本地 tick 起点，因此不要无依据反复改一组互相牵连的 flags。

更强的新线索：两次生产会话 BDS feet y=69，但客户端未经服务端证实的物理预测持续改变，B 组 y=68，客户端还横向离开；**需确认客户端区块缓存中 BDS 初始点 (x=0,y=68,z=0) 的支撑块及头部通道是否真实已加载，及本地碰撞世界是否误把未知块当作空气**。现有 `~/.alice-bedrock-control/world-view.json` 每秒产出 `origin`、`palette`、`voxels`、`unknownCells`，支持只读读取 BDS feet 下方和本地脚下方的相对方块；不需要更改生产进程、注入方块读取、重启 Alice 或修改世界。注意这里的客户端缓存是独立观察，不是 BDS 服务端块权威；缺失/unknown 不能当作空气。

执行顺序：**先只读**确认进程 tick 模式、`world-view.json` 当前 origin 和年龄、BDS 初始 feet 下方及本地 feet 下方 block 类型与 unknown；再由可复现事实决定下一处根因，不允许传送纠偏、禁用导航 guard 或进行第三次无解释的实验性重启。验收始终以外部新鲜 BDS 两点位移 ≥0.25 格为准。

## 2026-10-23 — B组已核实 + 双落脚点都存在支撑方块（排除缓存空洞假设）

用户在 Mint PID **2798181** 只读 `/proc/PID/environ` 确认 `ALICE_BEDROCK_INPUT_TICK_MODE=client_local_1`，所以本次真实 B 组确实切换。私有 3D 世界只读缓存 `world-view.json` 新鲜（view age ~0s / terrain age ~3s），已扫描 **968** 个方块，其中 **0 unknown**。**BDS** feet (0.5,69,0.5) 正下方坐标 (0,68,0)=`grass_block`、脚部 (0,69,0)=`air`、头部 (0,70,0)=`air`。**客户端预测** feet (-0.54,68,0.6) 正下方 (-1,67,0)=`grass_block`、脚部 (-1,68,0)=`air`、头部 (-1,69,0)=`air`。`decision=SCOUT`、`idleHoldReason=scout_client_server_position_diverged`、`voxelNavigation.status=route_candidate`、`reason=observed_collision_route`。

结论：B 组确实运行 `client_local_1`；**无法再把根因归于该测试未生效**。已实测采样范围内没有未知区块，原始站位及预测落脚点均有草方块支撑，**不能把局部预测位移/下降归咎于“脚下空气、区块未加载”**；但这不能证明中间整个移动轨迹碰撞完全正确，更不能证明每帧序列化后被 BDS 接受。BDS 同实例外部 querytarget 625 次始终同一坐标、没有见证到持续位移，但采样间隔大于一次 ~1.05s 移动 burst，**不能排除未被采样到的短暂往返**。对于原来的 A 组，也已经拿到零持续位移实机结果，两个方案均尚未通过 P0。

外部交叉核对：BDS 1.26.52.3 与客户端 1.26.51 均使用 protocol **2193**，见 https://minecraft.wiki/w/Bedrock_Edition_26.52 及官方 https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/player-auth-input-data/ 。现有 `src/input_flag_compat.cjs` 使用官方 63 个 InputData 标志，且 `src/analog_move_compat.cjs` 启用后恰好 21 次定向修正，不能无证据指控协议版本错位或 Flag 表越界。上游 Pix3lPirat3 Mineflayer 的同版客户端插件使用 world/currentTick 锚点并有官方 BDS 行走成功报告（PrismarineJS/mineflayer#4145），故不应继续无差别更改 Tick、flags、BDS anti-cheat 和碰撞代码。

**下一步集中读取无需重启的两个信息**：(1) 当前实例 `server.properties` 中 `server-authoritative-movement-strict`、`player-position-acceptance-threshold`、`default-player-permission-level` 等只读值（不调整）；(2) 真实运行进程启用的 `ALICE_BEDROCK_INPUT_FLAG_COMPAT`、`ALICE_BEDROCK_INPUT_ANALOG_COMPAT`（只检查两项存在/固定非敏感值，绝不读取其他环境凭据）。随后应设计“受控单次自然探索、服务端见证时间与输入同频”与“敏感信息过滤的 **post-serialization** 入队/发送标志摘要”，而不是重复同一失效场景或将 `serialized`/generic `sendReliable` 当成 BDS 确认。不关闭保护、不重启 BDS，不更换游戏模式、不通过传送消除客户端漂移。

## 2026-10-23 — 实测 BDS 配置正常，下一步回放首次移动时序

用户只读实测 MCSManager bedrock-default `~/minecraft-bedrock/server.properties`：
`gamemode=survival`、`force-gamemode=false`、`default-player-permission-level=member`、`server-authoritative-movement-strict=false`、`player-position-acceptance-threshold=0.5`。后两项符合微软默认值，严格模式=false 不意味着关掉服务端权威移动；官方资料 https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties 和 https://mojang.github.io/bedrock-protocol-docs/guides/player-movement-overview/ 。现无证据显示 BDS 权限/移动阈值导致 Alice 不走路；不得通过提高 threshold/改变权限/关闭严格校验修复。

PID 2798181 运行时从安全白名单环境读取：
`ALICE_BEDROCK_CLIENT_MODE=legacy-native-injected`、
`ALICE_BEDROCK_INPUT_ANALOG_COMPAT=official_2193_analog`、
`ALICE_BEDROCK_INPUT_FLAG_COMPAT=official_2193`、
`ALICE_BEDROCK_INPUT_TICK_MODE=client_local_1`。客户端 Bedrock 1.26.51 与服务端 1.26.52.3 均为 protocol 2193；不必单凭 patch 版本差异升级或重写协议。两种 tick 模式本轮均无 BDS 可见持续位移；`world_anchor` 是上游 Pix3lPirat3 Mineflayer 确实用于成功行走的原逻辑（https://github.com/PrismarineJS/mineflayer/issues/4145 2026-09-20~21）。**A/B 未证明 client_local_1 有益**，之后生产实验不应把它默认化。

排查重点转为**真实移动 burst 对齐的 BDS 见证**，并通过稳定协议 2193 PlayerAuthInput 的移动 flags/position/delta/tick 对照上游。现有 `~/.alice-bedrock-control/acceptance/events*.jsonl` 为账号安全清洗后的约每 10 秒样本 + 允许事件，生产 `outbound-input-audit.json` 的 `updatedAt - lastMovingAgeMs` 可还原当前会话最后一次移动时间（在当前 PID 未切换、`movingQueued` 未增加前）。无须重启、无需玩家、无需变更源码，即可只读抽取约该时间前后 30s 的 `EXPLORE`、`scout`、`start rejected` 等事件、见证样本、地方预测轨迹，看位置分离发生在安全门禁前还是完成最初 burst 后；但 10s 采样并不足以排除 ~1s 的短暂 BDS 位移。若旧 acceptance journal 已滚动则明确表明缺乏证据，不得伪造本轮结论。下一次可设计隐私安全、时间对齐的 post-serialization summary + 服务端见证，而不是继续无解释地换 Tick 或给 BDS 放松设置。

## 2026-10-23 — 23:57:27 首次真实 SCOUT 尝试时间线证据

用户在 Mint 用 `lastMovingAt≈audit.updatedAt-lastMovingAgeMs` 找到 **2026-10-22 23:57:29.015** 的最后一个移动输入，并从原有安全过滤的 `~/.alice-bedrock-control/acceptance/events*.jsonl` 提取前后 45 秒实机行为：
- `23:56:54.855` 与 `23:57:06.853` status sample `clientFeet=serverFeet=(0.5,69,0.5)`，`state=IDLE`、`decision=WORK`、`idleHold=daylight_required`。
- `23:57:14.873` 发现 `verified_natural_tree_nearby`；`23:57:15.683` GATHER 遇到 `navigation_bds_position_unavailable`，转为 tool_exception + 资源地点 cooldown。这个 BDS 见证新鲜性门禁在当时没有通过，**不能据此认定树木或 GATHER 逻辑导致移动失败**。
- `23:57:24.842` 观察到无已知敌对生物的安全平路，`23:57:24.860` 决策 `SCOUT`；`23:57:27.707` sample 仍有 **clientFeet=serverFeet=(0.5,69,0.5)**，BDS samples=97，说明**首次 SCOUT 没有被旧位移漂移预先阻断**。
- `23:57:27.923` 探索 endpoint attempt；在之后约 1.1 秒内发生一个 `21` 连续 `PlayerAuthInput` 移动 burst（队列计数、非服务器接受证明），`23:57:29.015` `[Alice movement] A* first waypoint observation` 报 `navigation_scout_client_server_position_diverged` / `localMovedBlocks=0`；`23:57:29.018` 整条 SCOUT 标记 rejected、`29.019` job result denied。
- `23:57:39.705` 本地预测变 `(-0.54,68,0.6)`，BDS 仍 `(0.5,69,0.5)`，独立见证 sample=101；`23:58:09.863` 后续 SCOUT 在 `startJob` 门禁被拒绝 `scout_client_server_position_diverged`（`attempted=false`）。故行为自主决策与安全保护**都在工作**，P0 的未证实位移发生在**第一次 A* 物理执行阶段**，不是 idleTick 不触发或模型不规划。

**精确的日志实现局限**：`runtime.cjs:boundedScout()` 会在每个 waypoint 更新 `lastAttemptStart`，失败 catch 的 `localMovedBlocks` 仅计算 **最后正在尝试的 waypoint 前后**的局部差，不是整个 SCOUT 从 `start` 算的总位移。这里的 `localMovedBlocks=0` 和之后 1.45 格的 client/BDS 差距不矛盾；推断“可能第一点已被本地 A* 判到达，然后第二点的共享 position guard 拒绝”还需要从已保存的 `firstWaypoint`、`failedWaypoint`、`before`、`lastAfter` 等白名单字段确认。不能把 log 的 `A* first waypoint observation` 文字标签当作第一 waypoint 必然失败。

**A/B 解释修正**：Pix3lPirat3 upstream issue PrismarineJS/mineflayer#4145 实机记录 `PlayerAuthInput.tick` 应基于 `StartGame.current_tick` + wall time，依赖 server rewind history (~40)；该上游提供成功行走的 world-anchor 案例。用户 B 组 `client_local_1` 以 1 开始，失败**完全不能排除 tick epoch 不匹配**；因此 B 组不是正常协议的有效对照，不推荐保留在下一次生产启动。A 组 world-anchor 仍未完成 BDS 行走，是尚待找出协议/物理输入一致性或实时服务端处理问题的主线。Mojang 官方输入语义：https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-auth-input-packet/ 和 https://mojang.github.io/bedrock-protocol-docs/guides/player-movement-overview/ 。

**下一项零干扰调查**：只读 dump **已过滤 acceptance journal 中** `23:57:27.923..23:57:29.032` 的首次 waypoint/失败 waypoint/局部坐标/最后任务反馈。不要再从用户索取大段未经过滤的原始日志或账号详情；若无法区分 A* 第一段与第二段，下轮应做只保留匿名数据的单次首 burst 观测，而不是重启 BDS、更改反作弊/Flags、恢复本地预测状态来假造移动。要在 live 下加 passive instrumentation 时，先有真实被测数据契约和 Node24 测试，再经原终端安全地仅重启 Alice，一次试验得出验证结果。

## 2026-10-23 — 已证实是第一 waypoint 本地到达后第二 waypoint admission 失败

用户从原有私有白名单 acceptance journal 取回完整结构化失败事件。最后移动输入时间 **2026-10-22T23:57:29.015+08:00**（Mint 本地时间）。`[Alice movement] A* first waypoint observation`:
- `reason=navigation_scout_client_server_position_diverged`;
- **firstWaypoint=(-1,68,0)**；
- **failedWaypoint=(-2,69,0)**，与 firstWaypoint 不同；
- `before=(-0.5721529919768715,68,0.7542104647128753)`；
- `lastAfter=(-0.57,68,0.75)`；
- `localMovedBlocks=0` 是本次第二 waypoint 的 `before→lastAfter`，不是最初 SCOUT 起点到当前位置的距离；
- `distanceToWaypoint=1.39`，`withinWaypoint=false` 也指**当前被拒绝的第二 waypoint**；
- `serverPositionSamples=0` 来自 `movementEvidence.get().received`（Bedrock 自身收到的 `correct_player_move_prediction/self move_player`），**不是**同实例独立 BDS `querytarget` 数据；后者以 `independentSamples` 计数。

同一 `runtime.cjs:boundedScout()` 路径的 for-of 每个 waypoint：
(1) 将 `lastAttemptedWaypoint=waypoint`、`lastAttemptStart=bot.entity.position`；
(2) `await pathfinder.goto(new GoalNear(...,0))`；
(3) 检查**本地**到 waypoint 中心距离不超过 1.15；
(4) 才进入下一个 waypoint。
结合 `failedWaypoint` 是**第二点**可确定第一点 `pathfinder.goto` 已 resolve 且本地阈值通过，**但没有 BDS 服务器走到 firstWaypoint 的证明**；在第二点的 `navigation_position_guard` 入口因本地与 BDS 相差>0.75m 而拒绝。源码当前误导性的文字常量 `A* first waypoint observation` 与 `localMovedBlocks=0` 不能据此宣称首次移动未发生。客户端约 (-0.57,68,0.75) vs BDS 原始 (0.5,69,0.5) 约 **1.49m**。

**实机事实与因果边界**：第一个 waypoint 是从 (0.5,69,0.5) 向 (-1,68,0) 的一步低一格的局部路线，而第二点升回 69；先前局部区块证明两站点附近有完整已加载草方块支撑，因此不属于缺失地面。21 连续包是否到达 BDS、是否曾短暂改变位置后退回尚无时间对齐的 witness；BDS 在随后采样仍保持原位置，故 P0 明确未通过。Mojang 官方运动行为 https://mojang.github.io/bedrock-protocol-docs/guides/player-movement-overview/ 说明服务器仅在需要矫正时下发 `CorrectPlayerMovePrediction`，`received=0` 不足以判定服务端未接收。

**官方之外上游验证范围校正**：PrismarineJS/mineflayer#4145 2026-09-20 作者写明其共享物理与行走的 BDS **现场验证是 1.26.45**，数据包捕捉样本来自 1.26.51 客户端；不可把它错误描述为已在正式 BDS 1.26.51 完整现场通过。上游强调 `PlayerAuthInput.tick` 应基于 `start_game.current_tick` + wall time，`client_local_1` 非上游确认的兼容模式，B 组失败不能独立证实哪一移动字段被拒绝。

**下一项应当执行的工程工作（尚未实现）**：从已验证的 `world_anchor` 单会话（不是当前 `client_local_1`）开始；在**已加载且全程等高、短直线**的自然自主 SCOUT 候选上做一次最小输入 burst，避免首次试验先下后上混入复杂碰撞变量；输出匿名、短寿命、owner-only 的输入时间与 server tick 相对值、移动方向与位移增量、真实 post-serialization/sendQ 路径证据，以及更高频且带时间戳的 BDS 外部 querytarget 见证。同一时间窗核对真正的服务器接受与同步。禁止扩大 0.75m guard、重置/传送本地位置来伪造成功，禁止服务端重启/改反作弊；在未准备好观测前不要求再次重启或盲试。
