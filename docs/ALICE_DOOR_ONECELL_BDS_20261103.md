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

## 夜间按需 BDS 需求死锁修复（2026-11-03 rev71 第二阶段）

- 复现的现场组合：`alice_r71_newlife_gate_13`、`alice_r71_newlife_demand_14` 证实新客户端 PID4070986 夜间 `worldRoutineIdleGate=work_cooldown`，`nightSurvivalReason=scout_bds_position_unavailable`，独立见证已过期，同时旧 `demand_now=false`（即使系统d timer active）。旧 `alice-bds-demand-timer.py` 仅认 `position_witness_unverified/eligible_for_work`，使夜间生存任务急需的 BDS 起点被原木采集的普通 work cooldown 阻断。
- 改进 Mint 脚本 `games/minecraft-ai/scripts/alice-bds-demand-timer.py`：新增 `safe_night_witness_need()`，只能在夜/黄昏、`work_cooldown`、真实 `nightSurvival.reason=scout_bds_position_unavailable`、autonomous/IDLE/health>=16、无工作/无跟随目标、已知非 PAUSED 的连续目标、且 `witnessDemand` 自身仍报告缺少新鲜独立 BDS 样本时开启需求。白天、STOP/人类覆盖、FOLLOW、已有任务、无目标、其他夜间原因、已有新鲜 BDS pair 全部禁止。**不修改 BDS 40/h、180 秒持续节流和 stalledPairs 冷却，也不提交任何游戏控制输入或查询命令。**
- 固定纯 Python 测试 `alice_r71_night_gate_selftest_16` **PASSED**；非重启 Mint 部署 `alice_r71_night_gate_mint_sync_17` **PASSED**、Node24 **932/932**，无客户端重启/BDS重启/世界修改；Mac 回归 `alice_r71_night_gate_mac_20` **PASSED** Python 321、skip3。代码版本 `131d5c7fa62a2e05a2b0bc06eca40b6173bd2a44`，Python systemd timer 下一次启动直接读取新脚本，不需要重新登录。
- 现场 `alice_r71_night_gate_live_18`：owner/timer/opt-in均有效，**demandNow=true**（原来 false），`lastServiceResult=position_pair_verified`，独立 BDS 样本 **4**、budget 6/40、stalledPairs2、当前新生命 serverTravel **0**；`alice_r71_night_gate_post_19` 确认仍夜间 WAIT defer_nonurgent_raw_materials_at_night、无活动job、HP20、独立 pair 快照时已过期。真实移动仍未确认，不能说已出门或已睡床。
- **后续严守**：不手动高频触发见证，不能为了追样本跳过240秒的单格 BDS 终点验收或关闭安全门禁。当前下一步针对夜间有真实 pair 但仍无 movingQueued 的决策顺序/障碍做诊断；白天重新扫描当前门并尝试每次仅一格的合法入口。原世界不变。

## 2026-11-03 rev72：恢复封闭房间出口优先级（实机诊断、回归、发布）

### 实机只读证据（发布前 PID 4070986）

- `alice_r72_live_gate_01`：当前登录会话 Alice 在线、自动生存模式、HP20/food20、核心 IDLE、已取得 **52 个独立 BDS 样本**、`movingQueued=77`，读取时旧样本超过原4秒新鲜门禁。
- `alice_r72_demand_02`：有效定时器、owner/opt-in 正常、独立源累计 `serverTravel=10.54` 格，本小时 BDS 服务预算 `22/40`；**非门口到达证据**。
- `alice_r72_model_nav_03`：同一生命内 acceptance journal **11 次服务器验证的 partial_endpoint，0 次 confirmed_endpoint，0 waypointFailure**，模型已建议 scout_safe，合计20次proposal；该数据证实真实局部行走，不代表整条路线或 HOME 完成。
- `alice_r72_home_status_04`：白天，记忆 2 张床但现时没有加载的可用床，`homeStatus=not_established`，`personalBedStatus=not_verified`；不可把记忆床当作当前可睡的床。
- `alice_r72_collision_05`：只读 client-chunk-cache、1350 records/unknown0，闭合云杉门位于相对 (-2,-3)，名义 0.6x1.8 角色扫掠安全中心路线 **4 格**；这是候选，不是服务器认定的坐标或动作。

### 源码定位与修复

- 原 `runIdleDecision` 只有 `woodFailure` 后才 `observeBlockedRoom()`，导致有真木门但尚未采集失败时，普通 SCOUT 优先，可能在室内反复探索。现在在**白天、资源尚不可直接取得、无运动失败、确切发现封闭房间木门且扫描结果仍与当前位置相符**时，优先非破坏性门口技能；若木材确实可采、可做紧急生存任务、已有任务或人为STOP/FOLLOW，则保留原优先级。所有实体移动仍须独立 BDS 双样本起点、0.6 宽扫掠及新双BDS终点验收。模型仍负责长期策略，不能发明坐标或代替几何/服务器证明。
- 原 `escape_approach.validateApproach` 使用 `knownAir`，错误把碰撞形状为空的火把拒绝为不通行；复用 `escape_survey.knownWalkingClear` 只接受经过状态验证的**空碰撞盒火把**，有形状/未知碰撞仍然拒绝，`verifyFlatFirstStep` 不变。
- 回归发现原先对短距离开门 / 只读房间观察限制过严，已恢复老规则：有旧 woodFailure 时即使夜间或因 BDS 冷却不准移动，仍能纯只读扫描；最多2格观察距离、实际3格交互范围内的木门仍使用原 `planDoorOpen` 安全门禁；更远路线才需逐格行走。不会自动穿过未证实可通行的门或挖掘。
- 回归由 `alice_r72_indoor_door_mint_07` 的 928/935（7 fail）→ `alice_r72_door_fix_mint_09` 的 934/935（1 fail）→ 最终 `alice_r72_early_survey_mint_11` **935/935, fail=0, skipped=0**。最后一项仅修正旧测试对“不能提前只读观察”的过时断言，仍验证绝不打开门、挖掘或输入未经授权的运动。Mac `alice_r72_early_survey_mac_12` **321项, skip3, 0 fail**。
- 功能合并测试 Git `48aae29dece564343e45a4a1330c02038a3f86eb`，`alice_r72_early_survey_sync_10` PASS，`alice_r72_early_survey_mint_11` 非重启同步 PASS，BDS/世界无改动。
- 固定、用户之前批准的一次 Alice-only 审批生命周期任务 `alice_r72_enclosed_door_reload_13` **completed**：旧PID **4070986** → 新PID **4147538**，进程存活、新鲜心跳、游戏连接、会话、owner、世界名和端口全部 true；`replacementCount=1`，`bdsRestarted=false`、`worldChanged=false`，不使用旧不确定任务重放。
- 新PID首检 `alice_r72_post_reload_gate_14`：HP20/food20、autonomous IDLE、独立 BDS 样本0（此前52属于旧登录，不可继承），`prior_login_witness` 是预期的生命隔离。`alice_r72_post_reload_demand_15`：BDS定时器 active/enabled、optedIn、`demandNow=true`，小时预算30/40、`lastServiceResult=position_pair_verified`（该结果可以来自上一次服务，不证明新PID已移动），当前新生命serverTravel0。

### 下一轮

在 PID4147538 上只读核验新的双 BDS 见证、当前门前首次一格尝试、端点复核与房间 `escapeSurvey`；不要借旧PID的(-2,-3)坐标实施导航。严格不放宽原4秒 BDS 新鲜度、180秒采样节流、40/h预算、不重复重启/BDS/世界。新代码部署成功，但**正式世界到门、开门、出门、床重生点及 HOME 返回仍待真实验收**。

### 补充：当前 PID4147538 的只读门前执行事件审计

- 新增 `games/minecraft-ai/scripts/alice-door-lifecycle-readonly.py` 和固定任务 `.openclaw/tasks/alice_door_autonomy_readonly.json`，只通过 owner/PID/world/17879/600权限检查的 `status.json` 与当前 `/proc/PID/fd/1` 读取已存在的有限日志；输出脱敏枚举/次数，不读取玩家隐私、原始日志、账号数据，不发BDS命令或运动输入。登记提交 `abf2939c490c96bad03564b813a5d46c9fcec214`，固定Mac sync任务 `alice_r72_door_audit_sync_17` PASS。
- `alice_r72_door_audit_live_18` selftest和真实 owner 检查均 PASS：`PID4147538` 连接正常，独立 BDS 样本2，当前还没有封闭木门优先/门口第一格/开门的日志事件（各计数0）。该诊断**不会自动读取未来**，每次观察必须用新的只读 operation ID。
- `alice_r72_door_audit_gate_19`：同 PID 自主 IDLE、HP20、`movingQueued=6`，`nightSurvivalReason=scout_step_awaiting_new_bds_pair`，表示夜间短距离 SCOUT 已经发送输入但缺少独立 BDS 终点证明；不能宣称走动成功，也不能重复启动另一个短程动作。
- `alice_r72_post_probe_demand_20`：service owner/timer/opt-in 有效，`demandNow=true`，budget32/40，距上次批次151.2秒，stalledPairs1，当前独立 BDS 样本仍2、serverTravel0。必须由原带冷却/配额/固定见证的服务自行完成后续样本，**不强行延长单格240秒截止或补发手动querytarget**。

### PID4147538 后续真实BDS认证首格（rev72 2026-11-03 09:50新加坡时间）

- 定时器自动服务后的只读 `alice_r72_next_pair_demand_22`：独立 BDS 样本由 **2→4**，本登录会话 `serverTravel=0.82` 格（原0），`lastServiceResult=position_pair_verified`、`budgetUsed=34/40`、timerEnabled=true、stalledPairs0，**不是客户端自报预测**。
- `alice_r72_next_pair_model_23` 的同生命 acceptance journal：`endpointFeedbackCount=1`，`partialEndpointCount=1`、`confirmedEndpointCount=0`、`unverifiedEndpointCount=0`，确认**一段真实局部探索已由BDS验证**，但未到达任何整条路线/木门/床的最终目标。原报告的 `clientServerAxisDelta x=0.684` 是该时点客户端位置差，不可替代下一次新鲜双BDS见证。
- `alice_r72_next_pair_door_24`：可重用纯只读诊断 PASS；尚无 `enclosed-door priority`、door approach、door opening或对应门口BDS端点事件。这不是门逻辑本身失败；当前游戏夜间，新增门优先级**明确只在日间安全资源探索阶段触发**，不能夜间强行带 Alice 离开庇护所。
- `alice_r72_next_pair_home_25`：game phase=night，记忆两床，但 `sleepOpportunity=bed_blocks_unverified`、`lastSpawnpointReason=bed_needs_verified_approach`、`bedStepReason=jump_origin_support_or_headroom_unverified`，`bedStepAttempted=false`，HOME/respawn/return均未验证。**不能为了睡床跳过头顶空间和起跳地面支撑检查**。
- 下一轮应重点处理床附近真实空间/门口方位的形状验证，在**白天**读取新 `alice-door-lifecycle-readonly.py` 事件，验证优先级是否被触发及第一格是否BDS成功。此前真实移动不用重复制造；原系统d 40/h预算不应手动耗尽。上线客户端PID4147538健康，原BDS17879与存档未操作。

## 2026-11-03 rev73：狭窄空间的扫描边缘与木门目标（18:00+ Asia/Singapore）

### 现场验收（原客户端 PID4147538）

- `alice_r73_live_gate_01`：正式现有 Alice connected/sessionEstablished/autonomous/IDLE、HP20、食物20、`movingQueued=549`、独立 BDS 样本259，读取瞬间坐标配对过期。
- `alice_r73_live_demand_02`：服务器记录**本登录生命累计真实位移75.24格**、独立样本261，BDS demand timer启用并受40/h限制（该小时2/40），不是预测位置。
- `alice_r73_live_nav_05`：当前生命 acceptance journal 的 `partialEndpointCount=30`、`confirmedEndpointCount=0`，已经有30次独立BDS验证的部分路线进展；但没有确认的完整目标终点/穿门/床。
- `alice_r73_live_door_03`：门优先、门接近、开门、木门端点的当前进程日志计数均为0。Home `alice_r73_live_home_04` 黄昏、记忆2张床，当前没有加载的可用床，个人重生点、HOME、出门和返回均未确认。
- `alice_r73_collision_06` 只读客户端地形缓存：碰撞检查半径7，1350条记录unknown0，木门两半是关闭的云杉门、相对当前客户端格点(-3,-4)，当前中心到门前名义安全中心线约6格，只有17个可到达中心，且路径到扫描半径边缘。**这些相对坐标仅用于当次只读诊断，不能跨PID沿用、不能替代BDS实测。**

### 发现的决策错误与修正

- `self_drive.sceneFromSurvey`：此前只要观察到`openFrontier`就不把候选木门作为狭小区域目标；但小房间或走廊可能碰到**客户端扫描半径边界**，边界不是“真正走到室外”的服务器证明。在 `reachableCells<32` 时、看见木门（并且不是宽阔已探索区域）将场景保留为 `door_limited_area`，且理由标明`small_loaded_area_frontier_not_outdoor_proof`。宽阔区域达到32个可达格心仍优先正常探索，不因旧门返回屋内。
- `runtime.runIdleDecision` 原本的白天无木材失败提前观察，还要求 `survey.status='door_interaction_candidate'` 且`openFrontier=false`。现将范围严格限制为：白天可安全探索、当前无自然资源可采、无movementFailure、真实木门位于当前25秒新鲜观察且少于32个可达格心。只改变候选分类与决策，**不**允许凭本地预测作任何运动完成、拆方块或绕过STOP/FOLLOW/碰撞/BDS双坐标门禁。
- 新测试`self_drive.test.cjs` 验证17个可达格心与边缘frontier仍选择木门、32及以上的开阔区域仍保持探索。新`runtime.test.cjs` 在6格走廊末端可碰扫描边缘、但木门在扫描半径内的侧面，只准**第一个单格goto**，需新的独立BDS坐标确认；绝不允许开门/挖掘或声称目标到达。
- 初始测试`alice_r73_frontier_mint_08` 936/937，失败仅因新测试将门误放在半径6之外的第7格，被合理拒绝；已将木门调至半径内走廊侧面，真实算法不放宽；最终非重启Mint `alice_r73_frontier_fix_mint_10` **937/937, fail0, skipped0**，Mac `alice_r73_frontier_mac_11` Python321，skip3，0失败。源码功能 commit `7fe1c8f0789110e10e4d7c47673232693c850196`、固定仓库sync与Mint同步PASSED。

### 正式上线

- 固定审批的仅Alice客户端 `alice_r73_frontier_client_reload_12` **completed**：旧PID **4147538 → 新PID 701816**，单次受控重启；新进程alive、connected、sessionEstablished、心跳、owner/world/port全部验证true；BDS没有重启、世界没有修改。
- `alice_r73_postrestart_gate_13` 和 `alice_r73_postrestart_demand_14` 证实新会话独立样本**从0重新开始**，timerActive/optedIn/ownerValid/`demandNow` true。本小时预算6/40，不继承上次 PID 的75.24格作为当前会话成功。
- 后续`alice_r73_post_bds_gate_16`：样本2、`movingQueued=6`、当前night survival等待 `scout_step_awaiting_new_bds_pair`；`alice_r73_post_bds_demand_17`：timer已取到当前2个新BDS样本、`serverTravel=0`、预算8/40、最近批次28.5s前、stalledPairs1。`alice_r73_post_bds_door_18` 门事件仍0。**没有实机门前到达证明**，不得误报打开/穿过木门、HOME、重生点成功。
- 下一步先按当前新PID、**白天**读取现有`alice_door_autonomy_readonly.json`，检查`enclosed-door priority`是否发生，之后每走一格只认新的独立BDS双样本。夜间继续安全生存，床必须重新确认loaded_free_bed、地面和头顶空间；不重启BDS或人为补发手动querytarget、不可复制旧PID的位置/成果。

## 2026-11-03 rev74：床位一格跳跃火把碰撞净空与实机回执（21:29+ Asia/Singapore）

### 当前客户端在这一轮接手时的真实 BDS 状态

- 接手 revision74 后，固定只读 `alice_r74_check_gate_1`、`alice_r74_check_demand_2`：旧本次客户端 PID701816（未重复重启以前）在线、自主、HP20/食物20、独立坐标 **120** 次、本登录 BDS `serverTravel=36.29` 格、`movingQueued=265`。只证明累计真实移动，不证明门/床任务完成。
- `alice_r74_check_nav_5`：当前生命验收日志 `partialEndpointCount=25`、`confirmedEndpointCount=0`、模型提出20个建议；无完整目标端点。
- `alice_r74_check_door_3` 门前优先/approach/开门均0；`alice_r74_check_home_4` 游戏夜晚、记忆两张床、个人重生点和 HOME均未证明，最新床接近拒绝 `jump_origin_support_or_headroom_unverified`。

### 找到并修复净空误判（必须与实机 BDS 成功分开）

- `src/escape_survey.cjs` 和之前 `escape_approach.cjs` 已定义严格的 `knownWalkingClear`：天然空气，或者**确知有空碰撞盒的火把**才视为身体净空。此前 `one_block_jump.cjs` 仍要求 `knownAir` 覆盖起跳和落点的完整 3格垂直空间；在真实 client-chunk-cache 曾观察到脚上方是 `torch`、`boundingBox:'empty'`、`shapes:[]`，从而出现“可走但不能跳”的假阴性。
- 修改 `src/one_block_jump.cjs` 起跳和落点三格净空检查，统一复用已验证的 `knownWalkingClear`，并添加严格测试：起跳/落点各种高度的真空碰撞火把均允许**候选**，但假空盒、有实体碰撞、未知装饰仍不允许；每次物理操作最多一个 JUMP_UP，不宣称客户端预测是BDS位移。原有支撑完整立方体、最大1格高度、实体占位、安全STOP/危险、头顶真实石墙/未知方块和后续独立BDS起终点证明不变。
- Git 功能提交 `7684021689a39c8f99d3ad831f7ce9486221a692`；平台 `alice_r74_torch_jump_sync_06` 已 fast-forward PASS；`alice_r74_torch_jump_mint_07` 非重启部署 Node24 **939/939、0 fail/skip**；`alice_r74_torch_jump_mac_08` Mac Python **321 项、skip3、0fail**。
- 已使用用户以前批准、platform reviewed 的固定任务 `alice_r74_torch_jump_reload_09` **completed**，仅重启 Alice 客户端 **PID701816→1008401**。processAlive/connected/sessionEstablished/heartbeatFresh/ownerVerified/worldVerified/portVerified 均true，replacementCount=1，`bdsRestarted=false`、`worldChanged=false`。
- 新登录后固定只读 `alice_r74_post_gate_10`：HP20、在线、自主、独立 BDS 样本0（上个PID历史全部不可继承）、`bdsWitnessStatus=prior_login_witness`，`idleGate=vertical_hold`；`alice_r74_post_demand_11` 定时器仍active/enabled/optedIn，但是 `demandNow=false`、`stalledPairs=3`、原始保护暂停剩余223.7秒、小时预算20/40，`lastServiceResult=no_navigation_demand`。`alice_r74_post_home_12` 昼间、床仍 `bed_needs_verified_approach`、没有新一格动作。**这不是新代码被证实无效，亦非重生点已经设置。**
- `vertical_hold` 来源为 `src/vertical_motion_watch.cjs` 原有90秒急剧下坠/垂直异常抑制；没有新的 BDS 起点或真实床端点时必须保持阻断。不能重启客户端清除保护，不得关闭3 stalledPairs 保护或180秒/40次BDS限制。安全观察恢复后才对比新的跳跃候选及后续真实 BDS 端点。

### 后续目标

在 **PID1008401** 的当前生命等待原有安全护栏自然释放，重新只读取得2个新鲜独立 BDS 坐标和任何有界床接近/木门事件；床方向需要优先正常 WALK，仅当不存在平路且真正满足完全净空时才使用一格 JUMP_UP。完整 HOME/个人重生点需 Bedrock `set_spawn_position` 确认；仅逻辑测试、模型预测或局部距离都不算成功。不要创建新世界/重启BDS/强制reset/补发手动querytarget。

### rev74 第二阶段：白天木门任务的 BDS 按需见证死锁（21:40~21:48 Asia/Singapore）

- torch-safe jump 已加载 PID1008401。系统原本 `vertical_hold` 和3次无位移BDS pair触发10分钟短暂停顿；此处是**安全保护**，不可删除。只读 `alice_r74_safe_recheck_14` 后发现垂直保护自然结束，`worldRoutine.idleGate=work_cooldown` 且 `lastDecisionAction=WAIT`、`lastDecisionReason=observed_indoor_wooden_door_first`，独立 BDS样本2。下一轮 `alice_r74_safe_recheck_15` 显示**demandNow=false**，正常预算22/40、stalledPairs1、pause0。
- 明确根因：`alice-bds-demand-timer.py` 只接收 `position_witness_unverified/eligible_for_work` 或已修复的夜间生存缺证据，但 **白天真正观察到合法室内木门的 WAIT 任务在原料`work_cooldown`期间无法补充 BDS坐标**。这会使已规划的门前单格动作无法从缺少新鲜起点中恢复。
- 修复 `safe_daytime_door_witness_need(d)`：仅 `wr.phase=day`、`idleGate=work_cooldown`、最新决策 `action=WAIT, goal=FIND_ROOM_EXIT, reason=observed_indoor_wooden_door_first, phase=day` 且决策时间 **最多90秒**，并且无job、无FOLLOW、连续目标非PAUSED、没有user_STOP时，才为原定时器提供证据需求。实际查询仍由原 `demand_now` 过滤 `IDLE/autonomous/HP>=16/currentSession/needs_two_fresh_samples`，再由既有 180 秒节流、40次/小时和stalledPairs暂停执行；绝不执行步行、跳跃、开门或手动querytarget。对白天过时决策、夜间、vertical_hold、正在工作、人类STOP、FOLLOW及已有新鲜样本新增自测禁止。
- Git `503bf98569a0354807fe607461725621d69e7744`，`alice_r74_day_door_sync_16` PASS；固定 `alice_r74_day_door_selftest_17` PASS；`alice_r74_day_door_mint_18` 非重启部署 PASS Mint Node24 **939/939** 和 Mac local Python321、0失败。此为Mint用户定时器脚本，不需要重复重启 Alice；上一轮客户端 PID1008401 保持运行。
- 后续只读 `alice_r74_day_door_live_19`：timerActive/optedIn/ownerVerified 和 **demandNow=true**，budget26/40、stalledPairs0、pause0，新PID独立BDS样本 **6**、真实 `serverTravel=1.8` 格（原0）。注意：此次 `demandNow=true` 也可能由当时 `eligible_for_work` 常规门禁触发，**不能仅凭这个读数证明新增白天分支是唯一原因**。
- `alice_r74_check_after_door_21` 本生命 acceptance journal `partialEndpointCount=1`、`confirmedEndpointCount=0`，这1.8格是 BDS证实的部分探索，**不是已经到门或床**。`alice_r74_check_after_door_20` 当前日志木门/approach/open/BDS door端点计数均0。`alice_r74_check_after_door_22` 最近决策仍显示`observed_indoor_wooden_door_first`、movingQueued19，但读取瞬间已过期；`alice_r74_check_after_door_23`游戏night、床仍 `jump_origin_support_or_headroom_unverified`，个人重生点/HOME/出门均未验证。因此 torch-safe jump 只是修复一般几何假阴性，没有证实当前床位真的可跳；不得关闭实体碰撞/实际屋顶检查。
- **下次**：resume revision75，并用全新的conversation_key在当前PID1008401上只读检查下一次白天门优先/已验证首格/门位开关状态；床位从WALK优先、完整净空候选转到 Bedrock `set_spawn_position` 确认。保持现有正式世界、BDS保护、查询节流；无必要不得重复重启。


## 2026-11-03 rev75：新生命只读验收与门优先诊断扩展

- 固定 MCP 回执 `alice_r75_live_gate_01` / `alice_r75_demand_02` 已 PASS：Alice 当前 owner 在线、独立 BDS 样本 12、累计本生命 serverTravel 2.62 格；读取瞬间最新见证约 99 秒，未通过 4 秒运动入场门禁。BDS 系统定时器正常、demandNow=true、小时 budget32/40、stalledPairs2、pauseRemaining0、lastServiceResult=cooldown_or_budget。观察到 `IDLE` 且 `idleHoldReason=null`，不再有旧 vertical_hold 证据；不能以此判定具体一格或开门成功。
- `alice_r75_nav_05`：本生命 acceptance journal `partialEndpointCount=2`、`confirmedEndpointCount=0`、`unverifiedEndpointCount=0`；`alice_r75_door_03` 木门优先/接近/开门/门口 BDS 事件均为 0。`alice_r75_home_04` 白天、记忆两床，但无加载的可用床、个人重生点和 HOME 均未验证；当前床步骤没有真实 BDS 终点。
- `alice_r75_collision_06` 为 **client_chunk_cache_not_bds**：相对(-3,-3)云杉门上下半均关闭；名义中心线 5 格，首格两个候选、并非实际 BDS 可执行路线。`alice_r75_voxels_07`：最近门约4.2格；两床相对(-9,-9)、(-10,-9)，最近约12.7格，不能把床当作当前可立即交互。
- 为区分“实时门优先分支未进入”与“进入后缺少合法 BDS 起点”，本次只扩展既有 `alice-door-lifecycle-readonly.py` 对**现存 owner 进程有限日志和当前 status**的去标识化枚举：当前 PID、昼夜/决策/idleGate、最近已有逃生扫描是否观察到门及路点数、资源机会和 idle gate 的既有事件。绝不输出原始日志或坐标、不追加任何 BDS 查询或游戏输入；此诊断修改**仅为脚本，不要求重启 Alice**，需后续固定 MCP 实测。保留 40/h、180s、240s 和 STOP/FOLLOW 全部原安全条件。

### rev75 日志统计器时间戳修正（只读，无客户端重启）

- `alice_r75_door_diag_live_09` 实际执行了扩展版只读报告，验证PID1008401、当前独立样本16和 night、历史 `WAIT/FIND_ROOM_EXIT/observed_indoor_wooden_door_first`，但发现扫描、资源、idle gate日志全部为0，不能据此得出运行期从未发生这些事件。
- 源码 `src/main.cjs` 的 `--production-start` 在任何业务日志前通过 `timestamped_stdio.cjs` 给每行加上 `[ISO8601 PID=N] ` 前缀。原脚本用 `line.startswith('[Alice ...')` 全部漏计，属于**证据读取器假阴性**。修订为只接受与 owner PID 完全一致的时间戳前缀，在有界250KB已有日志尾内去前缀后再按原枚举事件解析；增加 `scannedLogLines`、`ownerStampedLogLines` 用于识别日志为空与解析失败；自测同时覆盖正确时间戳与无前缀反例。只有后续真实新报告才可确定门事件是否发生，历史0次计数不得作为否定性证据。不读取私有世界、不会请求BDS/走动/重启。
