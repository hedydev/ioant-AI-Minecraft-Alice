# Alice 17879 — 单格门前导航、独立 BDS 复核与实机交付（2026-11-03）

## 已执行的业务代码修复

**原问题**：`src/escape_approach.cjs` 在 `approachDoor` 遍历最多 6 个 `GoalNear` 路点，上一格只做客户端本地位置判断、末尾才看非独立服务器位置证据。此方式可能让 Alice 在多格连续前进后仍无法证明每一格得到 BDS 认可。

**现行实现**（精确源头 `e7c54789a450521eacec25990e7e4c34ab168aea`）：

- `src/escape_approach.cjs`：`validateApproach` 仍只是完整观察候选；真正运动前要求 `scoutStartProof` 的独立、新鲜、同登录 BDS 双样本，并以 `verifyFlatFirstStep` 扫掠玩家宽度、检查完整支撑/高度和门/危险/未知形状。一次 `approachDoor` **仅执行第一个**相邻平坦路点，即使原提议有 4~6 格。只返回 `approach_first_cell_awaits_independent_bds_pair`、`serverMovementVerified=false` 和私有同生命起点；本地 A* 完成永不当作成功。
- `src/runtime.cjs`：保存唯一 `pendingDoorApproachStep`，其间禁止自动链式移动。新的独立 BDS 双样本到来时调用原有 `verifyScoutStep` 验证目标格/前后差值/客户端偏差/登录与生命 epoch；成功才清除等待、重新扫描后考虑下一格；失败、逾期、STOP、安全中断都不得继续。目标门开关及门后 BDS 穿越属于另外的验收，不把接近门当作通过门。
- `src/main.cjs`：仅在一个真正新鲜、被独立见证文件消费的采样回调里解决 `pendingDoorApproachStep`，不从本地物理预测/状态心跳触发。这不发送 BDS 命令，不增配额。
- `test/escape_approach.test.cjs` 和 `test/runtime.test.cjs`：新增/更新“一次最多一个门前路点”“无 BDS 起点或几何有障碍时 0 输入”“第二组独立 BDS 样本才确认”“危险后中止不继续”测试。两项旧黄昏测试被真实新鲜 BDS 见证触发夜间安全转移、未进入门前动作；重构为白天隔离用例，**没有调低安全/睡眠/时间门禁**。
- `scripts/alice-mint-sync-task.py`：仅在 Mac 固定测试报告中增加脱敏失败用例名与 `runtime.test.cjs` 行号，以便回归失败时定位，不输出原始 stdout、凭据、世界坐标或模型文本，不改变 Mint 服务。

## 实际回执

- 初次 Mint 回归 `alice_r70_door_single_mint_test_04`、后续 `_06`、`_08`、`_10`、`_12` 为有记录的 **failed / 929 passed, 2 failed, 931 total**；定位于两项原黄昏门前场景。旧失败回执不删、不覆盖；失败任务不重启任何客户端。
- 修复测试后，`alice_r70_daytime_fixture_mint_14` 状态 **passed**、`mint_sync` 产物证明 Mint Node24 **931/931, fail=0, skipped=0**，Mac Python 321 项，`aliceRestarted=false`、`bdsRestarted=false`、`worldModifiedByTask=false`。
- Mac 固定回归 `alice_r70_door_mac_regression_15` **passed**，321 Python tests、3 skipped，0 fail。
- 用户既有授权的**单次受控客户端重启** `alice_r70_onecell_reload_16`：已由固定生命周期审批执行，真实旧 PID **3923865** → 新 PID **4054628**，`lifecycle.state=completed`，`processAlive/heartbeatFresh/connected/sessionEstablished/ownerVerified/worldVerified/portVerified=true`，`replacementCount=1`，`bdsRestarted=false`、`worldChanged=false`，未使用强制 kill 或第二会话。
- 重启后独立 `alice_r70_postrestart_status_17` **passed**：`autonomyEnabled=true`、`agentMode=autonomous`、`coreState=IDLE`、HP20、food20、`hasCurrentJob=false`。**新登录的独立样本=0、`prior_login_witness`，不可复用旧 PID 的样本**。
- `alice_r70_new_life_demand_18` 只读状态 **passed**：owner有效、timer启用/运行、opt-in=true、`demandNow=true`、40/h、当时 budgetUsed23、`lastServiceResult=safe_failure`、独立样本0；服务尚未给当前会话提供有效双坐标，应复查安全失败的准确原因，**不可借旧见证启动新移动或绕过冷却**。
- 重启前 `alice_r70_runtime_gate_read_01`、`alice_r70_demand_state_02`：原PID生命 independentSamples90、BDS采样 age expired、累计 serverTravel25.76、部分验证路线22段。实际 `exploration_progress.cjs` 只有在 `serverMovementVerified=true` 才记录 `partial_verified`，所以已经存在 BDS 权威确认的局部移动，但绝非已经抵达木门的证明。

## 后续顺序与边界

1. **先观察当前 PID 4054628 的正常系统d需求采样和原安全门禁**：仅在 180 秒批次节流、40/h 配额、单次 BDS 双样本通过的前提下激活第一格；如果 `safe_failure` 持续，使用已登记只读诊断核实原 Mint 服务 preflight/owner/绑定，不绕过配额/不任意重启。
2. 在当前场景重新扫描地形（原先候选五格是基于旧 PID 的相对坐标，**新 PID 必须重算**）。每格走后由 **新的**双 BDS 样本单独认可，不得从名义中心线连走五格。
3. 到达门口后，仅一次木门打开动作，独立查看上下半 `open_bit`；跨门验证 BDS 落点后，再推进已知两床的重生点设置、夜间睡眠与 HOME 回程。

正式BDS仍为 Mint `192.168.0.104` UDP `17879` 世界 `Bedrock level`；没有改动世界/BDS/玩家档案/认证。原不明重启回执及已有恢复审阅链均保留。

## 继续验收：真实移动与 7 格门前路线（rev71，2026-11-03）

本节是在单格 BDS 验收之后的独立更新；历史失败/状态不可覆盖。

- 真实上线客户端 PID `4054628`，只读 `alice_r71_live_gate_01` 和 `alice_r71_demand_audit_02` 确认独立 BDS 样本 **14**、真实本生命服务器累计行走 **3.42 格**、movingQueued=25、owner/heartbeat/connectivity 正常；注意 `independentFreshPair=false` 只意味着报告读取瞬间旧样本超过4秒。
- `alice_r71_model_navigation_03` 从**当前生命 acceptance journal**验证 `partialEndpointCount=4`、`confirmedEndpointCount=0`；这是 BDS 认证的真实部分位移，不是任何整条目标路线成功，更不是木门/床成功。模型本生命三次 tool proposal（last=observe），无证据表明模型本身直接证明任何动作。
- `alice_r71_home_status_04`：白天，记忆 2 张床，HOME not_established、个人重生点 not_verified、doorKnown=false、exitVerified=false；最近床动作 `jump_origin_support_or_headroom_unverified`，没有可确认的床位运动。
- `alice_r71_door_collision_05` 用 **client_chunk_cache_not_bds** 读取 1350 碰撞记录、unknown0、实际云杉门两半均 closed，读到从名义 Alice 网格中心到门前的 **7 段**安全、平坦、0.6宽×1.8高扫掠中心线（名义相对位置门(-3,-5)，邻格(-3,-4)），有 17 个可达名义中心；不证明 Alice 真位于格心或能真实执行。
- 根因：`src/escape_approach.cjs` 的 `MAX_WAYPOINTS=6` 会在执行前拒绝门前完整观察路线长度7，即使身体检验和执行器仍然只驱动1格。已将**观察上限**扩大为12（与 `escape_survey.cjs` 12格输出上限对齐），仍严格只输入第一格、每格独立 BDS endpoint 验证。绝无一口气行走12格或任何门/世界操作。新增 `test/escape_approach.test.cjs` 的7格观察但仅1个 goto 用例，并保留13格拒绝。
- Git 功能提交 `2e98685c10e4c621e0ade10527cd609543094076`，Mac固定 `repository_sync`=`alice_r71_sevenstep_sync_06` PASS；非重启Mint部署回归 `alice_r71_sevenstep_mint_07` **Node24 932/932，0 fail、0 skipped**，且 BDS/world 均未改；Mac `alice_r71_sevenstep_mac_08` PASS Python 321 项（skip3，0 fail）。
- 正式客户端按既有用户审批一次受控重启 `alice_r71_sevenstep_reload_09` PASS：旧PID4054628→**新PID4070986**，新进程 alive/fresh/connected/session/owner/world/port 全true，`replacementCount=1`、`bdsRestarted=false`、`worldChanged=false`。
- 新登录状态 `alice_r71_sevenstep_post_status_10`：IDLE、autonomous、HP20/food20，新生命 independentSamples0（先前旧 PID 的14个样本失效），`prior_login_witness` 正常。需求服务 `alice_r71_sevenstep_post_demand_11` 只读：timer active/enabled, optedIn/ownerValid/demandNow=true, budgetUsed2/40、lastBatchAge约179秒、independentSamples0、serverTravel0，`lastServiceResult=no_navigation_demand` 是最近一次历史系统服务结果，不代表 timer 关闭。新的一轮双 BDS 见证**尚未完成**，不可以宣称已到木门。下一步应读取新生命原生 BDS witness 与逃生诊断，不重放一次性操作或人为消耗预算。

所有读操作遵守固定 OpenClaw 域、执行器和原正式世界限制。新PID的前进目标必须重新扫描，不能重用旧PID(-3,-5)相对坐标。
