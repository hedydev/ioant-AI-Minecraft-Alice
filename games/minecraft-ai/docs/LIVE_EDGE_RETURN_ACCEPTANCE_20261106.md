# Alice 原世界 EDGE_RETURN / 单格端点后续验收 — 2026-11-06（Rev93）

## 安全边界
继续唯一 Bedrock level / UDP 17879，保持 BDS、世界、Xbox 身份、STOP/FOLLOW、战斗、生存、40次/小时与180秒 BDS 查询间隔、4秒双样本/0.75格起点门禁、240秒终点和原 owner/epoch 条件。不重发任何结果明确 failed/uncertain 的旧命令。本文所有结果均来自独立既有 OpenClaw Mac MCP 固定任务及报告；没有凭客户端位置或累计里程认定单格终点。

## 交接与回执（conversation_key: alice_live_bed_20261106_r93）
- Resume Revision 92：任务回执无遗留不明 repository execute；Mac main 初始 HEAD `3deb6f1f975b02455a2bc1c7093fd9d995b2e24a`、工作区干净，上一轮 Mint Node24 1026/1026、Mac Python337（3 skip）。
- 002 当前 PID2516229：online/IDLE；旧命令 `bfa5096eb8fe4194b4ce593fbee5de0e` 仍明确 `failed/bed_request_expired`；`bedWitness=null`、`bedRequest=null`。同一旧进程的 `homeBed.status=server_confirmed_current_session` 是服务器确认状态，不能倒推该已失败显式命令成功，也未证明对应指定床位。
- 003/004 同一旧进程健康20、两张已观察床、当时night/canSleep=true但 `sleepOpportunity=bed_needs_verified_approach`、无活跃Job；BDS timer active，预算22/40、当时累计服务器里程78.71格。里程不能证明西侧EDGE_RETURN特定单格终点。
- 005 SCOUT只读日志：26次local/await，24个有独立BDS的 `scout_step_server_verified_partial_route` 结算、2次expired；后段已有0.68格服务器端点位移，依然不等于所指定床/边缘撤回终点。006 木门只读观察：无活跃Job、此前原世界木门历史验收不冒认本轮新开门。007 原批准重启安全窗口 `allConditions=true`：PID、owner、原世界、17879、心跳、IDLE、HP20、无Job全部符合。
- 本轮一次 OpenClaw 本地模型 read-only 调查 `alice_r93_readonly_endpoint_owner_20261106_001` 最终 `inconclusive/agent_cli_failed`，未取得独立效果回执，绝不换ID重复。关键现场复核改用上述固定、无模型的只读任务完成。
- 008 原已审批 `.openclaw/tasks/alice_17879_client_restart.json` 经平台和原 operator 预检完成唯一 Alice-only 更换，旧PID2516229 → 新PID3155549，内层 `state=completed`；owner、world、port、heartbeat、游戏连接与session均验证，`replacementCount=1`，`bdsRestarted=false`、`worldChanged=false`。此前非重启同步到Mint磁盘的四类 pending endpoint 互斥源码因这次正常客户端生命周期得到重新加载；尚未实机证明新版拒绝分支触发。
- 009–011 新PID3155549在线/IDLE、HP20、2张已观察床，但当前day、`canSleep=false`；上一生命服务器确认转为 `previous_server_confirmation`，不能称新生命已确认。新自主床单格动作出现 `bedWitnessKind=endpoint`、`bedStepStatus=awaiting_bds_endpoint`，任务结果 `serverMovementVerified=false`，不得在等待时发新床命令或重启。新生命定时器active、`demandNow=true`、预算25/40、2个独立样本、serverTravel=0；没有新的单格终点成功证据。
- 012 在固定 Mac 当前 main/HEAD 上重新执行了3组Node离线回归：`bed_task_service.test.cjs`、`bed_step_witness.test.cjs`、`bed_witness_demand.test.cjs` 全部PASS。该结果是代码安全回归，不是实机到达验收。

## 当前未完成与后续优先级
1. **只读**复核新PID3155549的最新独立 BDS 双样本是否在动作发包以后、同生命、4秒新鲜且与指定目标一格匹配；明确标记 verified/rejected/timeout，不能用累计移动代替目标终点。自然timer驱动，禁止重置预算、强制额外querytarget。
2. 在新 pendingBedStep/Scout/DoorCrossing/DoorApproachStep 任何一个在途时，禁止新显式床命令、客户端重启、重试旧失败ID。严格互斥的实机拒绝分支尚未单独触发验证。
3. 完成室内床路、木门跨越、床实际到达、同生命个人重生点服务器确认和夜间真实睡眠，各自独立验收。白天 `canSleep=false` 时不能宣称睡眠成功。
4. 保持独立的读状态与Git/Mint验收，不新开世界、不改BDS/原世界、不克隆/reset，不覆盖本地修改。旧网页监督与alice-2继续PAUSED。
