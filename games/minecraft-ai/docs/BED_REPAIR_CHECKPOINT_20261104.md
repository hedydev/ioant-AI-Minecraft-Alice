# Alice床流程交接 — 2026-11-04

**未完成：床到达、个人重生点、真实睡眠均未通过实机验收。**
用户最新要求本轮额度不足交给其他AI，本Chat交接后暂停alice-2，不再下一窗口自动恢复；旧网页监督alice也保持PAUSED。本文取代此前过期PID/恢复额度自动继续的检查点。

## 当前事实

- 已推送源码/诊断 a891c266710bd9f801b566fded7b7f013e805d51；本交接文档提交会更新HEAD，接手须读实际Git。
- 当前运行最近核实PID1513191，bedLogicVersion=5，owner/心跳/游戏连接/会话有效。最后加载运行时代码638e31fda7e6991300fe9be4a1f9044dd68df7ca；后续1be833e/a891c26仅Mac只读依赖审计，无须因此重载。
- sync50完整验收Mint Node24 996/996、Mac Python334项（3跳过，其余通过）。测试不是游戏验收。
- 门日志35/44仍door_state_change_not_observed；侧面点击、已开门先接近的源码改进尚未解决真实门交互。
- 观察43有5个新鲜静止对齐样本/偏差0.00，但BDS位移0，不是到床证据。
- 只读52：自身start_game角色member，blockNetworkIdsHashed=true、authoritativeInventory=true；sneaking=false、usingItem=false；door单项权限未知，不能认作允许或拒绝。当前PID已有交易计数0，未为诊断再发显式床指令；自主床步骤曾等待独立终点，接手先读最新状态。
- BDS仍原17879/Bedrock level；无BDS重启/世界或身份数据修改/预算清零/第二客户端/无界查询。

## 本轮代码

1. 显式床意图/终点进入原有界BDS取证定时器，穿过无关work_cooldown；首次生命lifeEpochAt=null精确匹配。31 demandNow=true、34 position_pair_verified已实证接通。
2. 初始意图15分钟以兼容10分钟退避和180秒槽；实际物理步骤独立终点仍240秒，总24阶段/90分钟不变。
3. 全部4KiB心跳压缩保留bedRequest/bedWitness；床复用原木门分阶段执行器。
4. 公开activateBlock(block,horizontalFace)与有界已加载碰撞形状视线检查；已开门仍距1～2格先原逐格接近，不直接跨门。
5. 被动interaction_audit精确匹配自身权限，只观察已有交易序列化与匿名方块ID，保持原queue this/参数/返回/异常，不修改/增加包。
6. 固定只读脚本读取实际安装原生插件、匿名server.properties默认策略、离线注册表与有界映射源码。
详见BED_INTERACTION_REPAIR_20261104.md、CURRENT_STATE.md、OPERATIONS.md。早期自身实体阻挡床步、床机会和服务端确认分离等修复也已提交。

## 下一步关键：在线映射链，不要猜哈希

实际interact.js的_genericPlace写block_runtime_id=referenceBlock.stateId。
53离线注册表1.26.51的spruce_door顺序stateId为7870～7901，条目无network_id。
**但54实际源码显示prismarine-registry/lib/bedrock/index.js的handleStartGame，在supportFeature('blockHashes')且服务端哈希标志时调用loadHashedRuntimeIds(this)。离线顺序ID不能证明在线映射错误。**
54源码hash=d0d7a10d5611125c8809f08bfaa94085bb1be9a247ac32da3fd336aedec70d83。

下一步有界扩展同一只读审计，核对完整loadHashedRuntimeIds实现、handleStartGame实际调用、world/chunk/blockAt的stateId/runtimeId转换。当前筛选正则未匹配大写Hashed，且包根JS仅index.js，故漏helper；这是诊断覆盖局限，不是运行库失败。
如果映射正常，再考虑被动目标方块update_block观察以区分服务器未接受和本地缓存未更新（尚未实现）。不得猜协议包、任意替换ID或为了取证反复点击。真开门须open_bit变化，跨门/到床须独立BDS位置。

## 原回执，不得重做

typed命令均明确失败：
- 4c1ecaf627f74174b78b2d3ea338efea：v2 bed_route_requires_door。
- f4827b1e503b48c4a20da8b5be2346a9：v3 bed_request_expired。
- 60fa201b1a6e4ab7b63cd49716f6bd83：v4，33确认expired。
- 1bb226cfeb5d45b6a528a4ad55c44041：v5，46确认expired。

关键execution_id（project_key=alice-ai）：
- alice_bed_repair_start_policy_mint_20261104_k4n8v2cs_50：passed，638e31f完整回归。
- alice_bed_repair_start_policy_restart_20261104_k4n8v2cs_51：passed，PID1507358→1513191，原批准单替换。
- alice_bed_repair_actual_start_policy_20261104_k4n8v2cs_52：passed，bed_now自身角色/模式。
- alice_bed_repair_registry_audit_20261104_k4n8v2cs_53：passed，native_source离线注册表。
- alice_bed_repair_mapping_audit_20261104_k4n8v2cs_54：passed，native_source映射片段，只读无游戏命令。
截至54无已知在途MCP任务；下一新后缀55。状态不明只查原回执，不重新执行。

## 接手及边界

新Chat生成全新conversation_key后project_resume(alice-ai)，读取最新revision（交接更新前85，不能固定旧版）。本轮AI-Session=k4n8v2cs，旧conversation_key=alice_prediction_20261102_k4n8v2cs仅作溯源；新AI用自己的会话标识。当前main工作区，不创建分支/worktree，不reset/clean/stash/强制覆盖。

固定执行器repository_task/current/精确HEAD：
- .openclaw/tasks/alice_bed_dependency_readonly.json → native_source
- .openclaw/tasks/alice_17879_bed_readonly.json → bed_now
- .openclaw/tasks/alice_bed_command_status_readonly.json → bed_state
- .openclaw/tasks/alice_bds_demand_state_readonly_20261102.json → demand_state
- .openclaw/tasks/alice_reconcile_finite_observation.json → finite_observation，最多210秒，不查询BDS
- .openclaw/tasks/alice_mint_nonrestart_sync.json → mint_sync
- 必要加载测试过的运行时代码时，先project_actions确认alice_client_restart enabled，再用原.openclaw/tasks/alice_17879_client_restart.json，保留正式审核/owner/原世界/健康IDLE/无job/登出/单替换门禁。不得重放旧拒绝h01或不明重启。

云端MCP偶发初始化409/连接失败；同服务已有scripts/direct-openclaw-project-execution.mjs及SDK stdio仍执行相同正式固定任务，并非任意终端/Gemma或绕审通道。不要因此重启Web/Tunnel或恢复密钥。
保留40/h、180秒批次、10分钟退避、4秒双样本/.75格、STOP/FOLLOW/危险/owner/session/life、逐格独立终点。不清预算/删锁/无限查询/OP命令/改世界或玩家资料/身份重建/重启BDS/第二会话。
分开验收：到床独立位置→个人床服务端确认→真实sleep事件。源码/测试/复制/queued/交易包不替代游戏成功。
历史已通过正式控制台归档399条，保留报告和历史，不是删除/预算重置，无须重复归档。不要向网页Alice/NetScale发消息。
