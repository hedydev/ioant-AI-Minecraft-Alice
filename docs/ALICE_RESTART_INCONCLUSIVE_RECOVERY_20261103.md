# Alice 17879 客户端重启结果不明：受控恢复记录（2026-11-03）

## 维护端实际恢复（北京时间 04:44）

本页下面的“待调查”描述是恢复前记录。现维护端已用原 status/diagnose 和固定
脱敏检查独立确认：原3849498、新3877694都不在 /proc，无owner、无任何Alice候选；
原Mint lifecycle claim已经结束、生命周期锁空闲。新PID启动日志32条带PID记录
及续行出现 TypeError/fetch_failed、ECONNRESET，随后 transport_ended，没有
start_game/spawn成功。不能把它归咎于碰撞修改或认证缓存损坏。

OpenClaw维护代码644ff90加入 openclaw_project_reconcile（inspect/resolve）和同源
维护CLI。两次独立证据一致、旧runner已退出、60秒审阅摘要有效、原回执SHA及
active.lock operationId/digest精确匹配后，先写独立审计再用store.release受控释放。
原回执SHA `78f6e4db6ea7bd13f520d0e7394192b2be97a4f406e63d841f733d57ecd1de28`
保持不变，旧state仍inconclusive，未删除原日志、产物、claim，也未重放原restart。

当前用户要求维护端“解决”明确授权核查后的恢复。确认离线后，另执行一次原
alice-mac.sh start，使用原私有配置、原生产预检/BDS登出门禁，启动PID3923865。
独立status确认current_process、心跳1.7秒、connected/sessionEstablished=true、
start_game_received、HP20/IDLE/nojob。BDS未重启、世界/玩家/认证未清理。

恢复后MCP正常接受 alice_recovery_doc_sync_20261103_k4n8v2cs_01 并passed/cached：
原Mac精确快进e046ae1→f90c666，保留2个维护修改文件的完整校验（verified=true）。
证明项目锁已恢复正常入场，不是仅从UI隐藏busy。同步只更新文档，不部署游戏源码。

为防同类可判定退出继续无限busy，重启回执schema3加入exitVerified：有独立
旧/新PID消失、无owner/候选证明时记failed/client_exited_before_login并正常释放锁，
无自动重试；真正不明仍保留锁。schema2的默认false不作退出证明，历史不改写。
生命周期10项、Mac Python321（跳过3）、MCP1386/1386回归通过。新工具正式
服务加载/目录刷新与最终回执在后续维护记录补记。

## 现场来源和不可更改约束

- 既有正式世界：Mint `192.168.0.104`、BDS UDP `17879`、世界 `Bedrock level`。**不重启 BDS，不改动/重置世界，不更换为实验世界。**
- 原 MCP 项目：`alice-ai`，固定执行器 `mcp_fixed_project_runner`；仓库原有 main 在最后已验收的 HEAD 为 `e046ae16017b1f1152bbc8b3620be5c5ec3e466a`，Mac 工作区当时干净，Mint 非重启同步已通过。
- 原测试：Mac Python **320 passed / 3 skipped**；Mint Node24 **930/930 passed**。这些不是游戏登录或实际移动验收。
- 唯一需要调查的重启操作 ID：`alice_r66_collision_restart_04`（切勿重放、改 ID 作为重试或覆盖原回执）。
- 固定回执：`state=inconclusive`，`failureReason=login_not_yet_verified`，`oldPid=3849498`，`newPid=3877694`，`restartAttempted=true`，`replacementCount=1`，`bdsRestarted=false`，`worldChanged=false`。`processAlive=false` 是验证未成功时的缺省结果，**并非可证明进程已退出的独立证据**。
- 原执行脚本 `games/minecraft-ai/scripts/alice-17879-client-restart-gated.py` 在 55 秒内未见通过 PID/birth-token/owner/world/port/心跳/登录复核的新进程，最终没有把重启标记为完成。
- 上述重启后，固定 MCP `repository_task` 只读诊断均被拒绝 `project_execution_busy`，任务没有运行。**不能将重复拒绝当成故障诊断脚本已执行。**
- 浏览器已有 AliceAI 控制台只读页面显示 `Alice 未在线 / 无有效心跳`；本地 Web 服务连接正常。该 UI 只是额外观测，不是独立的 Mint /proc 或 BDS 登录证明。
- 浏览器已有 OpenClaw Console 只读显示 Alice 项目 `执行中 0`，`结果不明 · 保留 1`，`近期回执 269/500`、可接收 231。当前不是历史容量满，也没有在执行新的项目任务。

## 确认的 OpenClaw 上游原因

OpenClaw 仓库的 `integrations/chatgpt-openclaw/project-execution-runner.mjs` 会在已审批 Alice 生命周期任务的回执 `state=inconclusive` 时设置 `retainLock=true`；`finally` 中**仅在 !retainLock 时**调用 `store.release(...)`。对应 `project-execution-store.mjs` 的 `begin()` 对现有 `active.lock` 明确返回 `project_execution_busy`。

**这是对结果不明的有意保护，不是一定会按时间过期的异常任务。** 不应通过删除 lock、更换 project/operation ID、禁用安全检查、直接启动第二个 Xbox Alice 客户端、或以 `computer_task`/临时 shell 绕过固定执行器。

## 建议维护人员使用受控、只读入口执行的调查

1. **首先保留证据**：读取上方固定 `project_result`、`project_report(alice_restart)`、`project_report(execution_log)`；核对操作 ID / 时间 / SHA 与私有 Mint 生命周期 claim。不修改原始记录。
2. **Mint 只读身份核对**：运行原维护工具的 `status` 和 `diagnose` 只读功能，逐一核查旧 PID、新 PID、当前唯一 Alice PID 的 `/proc` 生存/创建 token、锁 owner 与登录状态；仅导出脱敏原因、时间和状态枚举，不读取/传播 Xbox 认证令牌、原始密钥或玩家隐私。
3. **启动日志诊断**：只读检查本次新客户端在原 Mint 用户私有日志目录中的末尾连接/异常事件。重点区分进程已结束、进程仍运行但离线、重新登录尚未完成、状态文件/心跳权限或格式故障、原 BDS 登出未完成。仅凭客户端页面或启动脚本退出码不能得出结论。
4. **确认全局唯一性**：无第二个 Alice Xbox 会话，无在途客户端重启，不存在不明任意 PID 的服务操作。明确记录 `oldPid`、`newPid` 和当前 owner 的匹配结果；不要自动补发 BDS 指令。
5. **人工/维护员审阅后解锁**：如果已有经过审阅的 OpenClaw 受控 uncertain-outcome recovery 入口，用它在当前 active.lock 的完整 operationId/digest 匹配、原回执已终态 `inconclusive`、无运行中的本项目 runner、无未完成 Mint 生命周期操作，且审阅记录持久化后才解除该项目唯一锁。当前 Chat MCP 工具未暴露此类维护动作，**不要直接删除或覆盖 `active.lock`**；也不能伪造 passed。
6. **Alice 若确实离线**：原审批 `alice_17879_client_restart.json` 要求一个已经存活、登录、健康的 owner，故不能用它重启一个已死亡客户端。需要由本地维护人员审阅、另行授权**恰好一个**客户端恢复启动入口，在确认无现存会话且保留现有配置/世界的前提下执行并独立验证身份/心跳/登录。仍不重启 BDS。
7. **恢复后实机验收**：使用已有只读任务 `.openclaw/tasks/alice_collision_shape_readonly.json` 获取 Alice 半径 7 格的 `Block.shapes`、地面和木门上下半块的 `open_bit`，再针对实际关门/高度/台阶找到候选路线；一格移动必须在动作前后经独立新鲜 BDS 样本证明，不能凭客户端预测位置宣布成功。未验证床/重生点/HOME/出门/返家。

## 原则

不要以任何自动化监控、时间流逝、MCP/Web 重启或 Git 成功作为原结果已明确的证明。诊断、审阅、恢复启动均是不同操作，分别获得独立回执；**原结果保留 `inconclusive`** 以保持审计闭环。
