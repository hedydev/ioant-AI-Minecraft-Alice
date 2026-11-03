# Alice 17879 实机只读验收 — 2026-11-04

> 范围：原正式世界 `Bedrock level` / 原 Alice 客户端，2026-11-04 00:43–00:51（新加坡时间）多次被动读取。**没有重启、移动输入、世界修改、游戏控制台命令、手工 querytarget、创建测试世界或克隆/reset**。此报告仅支持列明的观察，不能把源码自动化回归解释为实机功能通过。

## 1. 运行与代码装载边界

- 交接：OpenClaw `alice-ai` Revision 80；GitHub `main` 与 Mac 本地均为 `6a96cef4c8ff2c3a3e35846d62484849fe1c90e4`，Mac 工作区干净。第五批代码自动化验收：Mint Node24 **970/970**，Mac Python321（skip3/0fail），上次非重启同步完成。
- 原进程仍为 **PID 1008401**（`alice_r80_door_live_readonly_03`）；进程存活、心跳新鲜、已连接、会话已建立，`IDLE`、HP20、自主生存已开启、无活动 job。原生产端口 17879 UDP 在监听、MCSManager 原实例目录映射为 `production_verified`。
- `alice_r80_loaded_source_readonly_10` 报 `runtimeSourceLoadedAfterSync=true`，但其实现**只比较 `src/main.cjs` 的修改时间与进程启动时间**，并不检查新 `src/features/` 子模块的加载/缓存；进程年龄已超过一小时，而此前所有源码同步回执均无重启。因此**本回执不证明新模块已经被加载，不能用于第五批重构的生产行为等价宣称**。
- `alice_r80_production_preflight_09` 的旧式 /proc BDS 目录进程检测结果 `productionBdsObserved=false`，不等于生产服务器停止：17879端口实际监听、Alice会话正常、BDS独立位置成对确认持续发生。预检中 `alice-bds-position-witness.service` 非 active；单独的 **demand timer** 仍启用。旧系统服务状态不能代替对按需调度器的判定。

## 2. BDS 独立位置与移动实机后验

| 项目 | 现场证据 | 结论 |
|---|---|---|
| 独立位置按需调度 | `alice_r80_bds_demand_readonly_02`：`ownerValid=true`、`optedIn=true`、`timerActive=true`、`timerEnabled=true`、`lastServiceResult=position_pair_verified` | 按需验证路径可工作 |
| 查询预算 | 最近 `budgetUsed=20` / `hourlyLimit=40`，`lastBatchAgeSeconds=2.7`、`stalledPairs=1`、`pauseRemainingSeconds=0` | 有预算和冷却，不能无限要求新 BDS 见证 |
| 历史真实服务器位移 | 按需调度报告 `serverTravel=33.59` 格、独立样本 111 个 | 累计服务器移动存在；非本次只读工具造成 |
| 逐格输入后验 | `alice_r80_scout_live_readonly_07`：本地逐格输入27、等待BDS 27、BDS终点确认25、结算25、超时1、route feedback25、path failure0 | **部分真实逐格移动通过服务器确认**，不能认定整条路径全部完成 |
| 最近确认一步 | `scout_step_server_verified_partial_route`、独立服务器位移 **0.82格** | 这一步已确认；只属于一小段路径 |
| 最新未决一步 | 本地预测约0.8格、`scout_step_awaiting_new_bds_pair`；当前`currentScoutVerified=false` | **禁止**把本地预测作为成功或继续跨格许可 |
| 坐标校正 | `alice_r80_reconciliation_readonly_08`：回放12次/24帧、fallback2、reject0，但采样年龄约47秒、比较时间差约46秒 | 有运行中的校正，但**当前帧坐标对齐未被独立验证** |

首份读数的 `idleHoldReason=scout_bds_position_unavailable`、证据年龄约150秒，只是当时的证据准入状态；后续按需 BDS 又产生新的经验证位移，不能把它误读成整个通道永久失效。

## 3. 木门、床、HOME

| 能力 | 观察 | 当前结论 |
|---|---|---|
| 木门前接近 | `alice_r80_door_live_readonly_03`：door priority12次、approach outcome9次、其中BDS验证8次、拒绝0次 | **部分接近动作已验证** |
| 木门打开/穿越 | 同一记录：`doorOpenOutcomeCount=0`；最近房间扫描 `no_non_destructive_exit_observed`，`lastSurveyLogDoor=false` | **未通过**，不能声称开门或离开房间 |
| 当前门几何 | `alice_r80_voxels_live_readonly_06`：本地 chunk cache 内有木门，最近云杉门水平距离约**4.2格**；视图半径7格内2处门方块 | 只有客户端区块缓存证据，未证明路径连通/门状态及可交互 |
| 床 | `alice_r80_bed_live_readonly_05` 和 home：记忆床2张，`sleepOpportunity=none`，HP20，夜间；chunk cache 最近床约**12.7格**，12格内没有床 | 当前普通近床范围内无可用目标证据，不应直接宣称“明明就在旁边但无故不睡” |
| 个人重生点 | `personalBedStatus=not_verified`，`lastSpawnpointReason=bed_needs_verified_approach`；床一步跨越判断 `jump_origin_support_or_headroom_unverified` 且未执行 | **未设置成功/未获独立证明**，不能跳过头顶净空或脚下支撑 |
| HOME | `homeStatus=not_established`，door/exit/return 均未验证，`homeAgenda=unknown` | **未通过** |

客户端缓存几何还显示 Alice 周围有石头、圆石、局部危险块与不满足净空的相邻格。这些数据只是 `source=client_chunk_cache_not_bds` 的结构观察；不能把局部格子的符号图当成可安全行走的独立 BDS 地图。

## 4. 约束、阻塞与下一阶段

- 本批共使用已提交、固定入参、OpenClaw MCP 的**只读**现场任务：`alice_r80_live_runtime_audit_01`、`alice_r80_bds_demand_readonly_02`、`alice_r80_door_live_readonly_03`、`alice_r80_home_live_readonly_04`、`alice_r80_bed_live_readonly_05`、`alice_r80_voxels_live_readonly_06`、`alice_r80_scout_live_readonly_07`、`alice_r80_reconciliation_readonly_08`、`alice_r80_production_preflight_09`、`alice_r80_loaded_source_readonly_10`、`alice_r80_mcsm_provider_readonly_11`。每项都取得真实完成回执并读取其原有报告，未重复旧执行或手工索取 BDS 见证。
- 问题边界：**当前正在运行的 Alice 并未获得“已加载重构后全部功能模块”的充分证明**；局部移动可以继续自然见证，但新代码下的木门、睡觉、个人重生点、HOME 和自主走出屋子，均需新的进程装载和独立服务器证据才能最终验收。
- 后续安全流程应**先单独取得 Alice-only 受控重载的明确授权并完成平台 review**，只针对经 owner/出生token/世界/17879/健康无job核验的一个 Alice 客户端；必须用仓库中获批准的 `.openclaw/tasks/alice_17879_client_restart.json`，不得重启 BDS、修改世界、换地图、清空锁或重试未知执行；随后再检查新进程心跳/登录和 BDS 证据，并用已有保守入口进行逐格、门、床和 HOME 真正后验。
- 在授权前**不触发 Alice/BDS 重启或额外游戏行为**。保留查询40/h、180秒批间隔、4s/0.75m独立双样本及单格240秒超时，保持 STOP/FOLLOW、威胁、低血量、碰撞准入。
