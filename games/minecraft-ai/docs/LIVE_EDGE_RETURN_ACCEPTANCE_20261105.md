# Alice 17879 单格边缘撤回验收 — 2026-11-05

## 边界和结果

原世界 Bedrock level，UDP17879；只替换已批准的 Alice 客户端进程，不重启 BDS、不修改世界、不克隆/reset。独立 BDS 双样本、同生命周期、4 秒新鲜、客户端偏差不超过0.75格、240秒移动终点、40次/小时和180秒间隔等条件均保持。

**实机结论**：新 EDGE_RETURN 曾真实触发单格短输入。BDS 采样服务后续确认服务器侧发生 **1.2 格位移**，但未核验此位移是否对应西侧一格的终点。一次性设置重生点命令最终 failed/bed_request_expired；重生点与睡眠均未验证。此前失败的命令与本次失败命令都不得重复发送。

## 现场回执

| 操作 | 证据与结论 |
|---|---|
| 122–123 | 固定非重启Mint同步 PASS；Node24 1016/1016，Mac Python337 |
| 124–126 | 预检后 Alice-only PID1971786 → 2503838；连接、心跳、会话、世界、端口、owner通过；BDS/world不动 |
| 127–128 | 客户端 onGround=true；局部脚底X0.11、Z0.60，9点支撑仅西邻石头3点，头顶+2圆石；仍无独立移动许可 |
| 129–132 | 被动0.6m足迹逐点扫掠；130测试因继承假墙失败，修复后132 PASS，唯一西侧[-1,0]候选，10采样点支撑从3/9增至9/9，最低3/9，不授权移动 |
| 133–139 | EDGE_RETURN单格模块与原床任务BDS门禁接合；Node测试和Mac Python337(跳过3) PASS；Mint Node24 1024/1024 PASS |
| 140–142 | 安全预检后 PID2503838 → 2516229，Alice会话/原世界正常，BDS没有重启 |
| 143–144 | 只发一次新的typed set_spawnpoint，commandId bfa5096eb8fe4194b4ce593fbee5de0e；原命令4e68d700e949453d8e19161d84bfbdb9早已failed |
| 145–146 | 新床命令started/door；已有边缘动作等待BDS终点，BDS预算9/40，未有新鲜终点配对 |
| 147–148 | 固定210秒、835次被动观察均无合格的新鲜比较窗口；新命令最终 failed/bed_request_expired |
| 149–151 | BDS服务 position_pair_verified，serverTravel=1.2格，样本6、预算13/40；但独立的单格终点仍 awaiting_bds_endpoint，无法将服务器位移归属特定目标 |
| 152 | Alice日志显示 EDGE_RETURN attempted=true/serverMovementVerified=false，之后床命令进入门任务，又有door_approach尝试及独立终点等待 |
| 153–156 | 修复已发输入但job结束时新床命令抢占独立终点的风险；三组Node定向PASS，Mac Python337(跳过3) PASS，Mint Node24 1026/1026 PASS |
| 157 | PID2516229在线IDLE；bedWitnessKind=endpoint、needs_evidence；命令仍failed，个人床位not_verified，isSleeping=false |

## 代码与安全状态

源代码：games/minecraft-ai/bedrock-native/experiment/src/edge_return.cjs，以及 adjacent_motion_decision.cjs、features/bed/runtime_methods.cjs、bed_task_service.cjs。它们只提供原床执行器显式启用的 EDGE_RETURN 候选；前进方向必须是已知完整支撑，沿途0.6m AABB和9探针逐点复核，不穿过门、危险方块、未知地形或实体。每次只发送有限短脉冲、任何返回都不宣称BDS已验证，必须另等独立终点。

最新互斥保护在 bed_task_service.cjs 的 requestBed 入口：pendingBedStep、pendingScoutStep、pendingDoorCrossing或pendingDoorApproachStep存在时拒绝新床命令，保持原epoch/owner，不清除未验证的动作。此保护经过Mac/Mint测试并非重启同步，但**当前生产PID2516229尚未加载最后这项保护**；因为一个独立端点仍未结算，禁止在没有安全窗口的情况下重启。

## 后续行动

1. 原PID2516229只读查询尚未结算的pendingBedStep，等待服务器确认/明确拒绝/超时；不要新开床命令或新客户端。
2. 不得把BDS 1.2格的非零采样位移误当成特定西侧单格的独立终点。147的无新鲜配对只适用于其210秒观察窗口，149的服务器采样另有时间窗。
3. 仅确认所有在途动作结算、无owner冲突、正常原批准客户端单重启门禁均通过之后，才能加载最新互斥代码；再进行一条可审计的新指令验收，而非重放失败命令。
4. 床到达、个人重生点、夜间真实睡眠均需分别获得服务器确认；当前三者都未通过。
