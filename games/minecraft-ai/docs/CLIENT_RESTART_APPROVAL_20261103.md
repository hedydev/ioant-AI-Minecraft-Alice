# MCP Alice-only restart

用户 2026-11-03 明确授权由 ChatGPT 完成固定客户端重启的权限改进和实机验收。
保留原 `.openclaw/tasks/alice_17879_client_restart.json` 与维护脚本，不重命名历史
拒绝来绕过审核。MCP 桥的独立本机批准固定任务/脚本 SHA256，仅允许原 Alice
客户端生命周期，平台审核始终保留。旧 h01 编号禁止执行；其 MCP 查询为 not_found，
现有历史没有原始平台拒绝规则，不能推测原因或认为本地 full 权限可以覆盖它。

已更新入口 `scripts/alice-17879-client-restart-gated.py`，通过 MCP 的
`project_execute(action=repository_task, workspace_mode=current, task_file=.openclaw/tasks/alice_17879_client_restart.json)`
执行。调用必须固定当前完整 HEAD，并使用本次授权的新 operation_id 和当前 Chat
conversation_key；随后查询原 project_result 和 artifact `alice_restart`。不要求人手动 SSH。

原世界/17879、owner/PID/出生标识、心跳/游戏连接/会话、健康 IDLE/无 job 以及原
idleGate 都要通过；慢预检后在停止瞬间复查。原维护模块字节哈希不匹配即阻止。
通过原 AliceProcess.launch 的身份检查 SIGINT、原配置和 BDS 登出等待启动一个
替代进程。它不重启 BDS、不修改世界/玩家/认证、不删除锁，也不启动并发客户端。

Mint 私有生命周期锁和停机前落盘的 operation claim 防止重复。超时或未知只读核对，
不重做。标准回执含 oldPid/newPid、存活、心跳、连接、sessionEstablished、失败原因；
未确认新会话不能算成功。平台如果仍拒绝，停止并交管理员审核，不能改用别的工具。

新专项 9/9 和完整 Mac Python 320 项（跳过 3 项）通过。MCP 全量1376/1376通过。

## 实际获准重启（北京时间 2026-11-03 00:39）

本机独立批准已登记（批准哈希 `0b0b2ee78a0738b155c0334a00e9fe8292d5b3f60e5254030d0bac813385b99f`），
正式 MCP 动作列表已公布 enabled=true。原任务在本仓库提交
`a7c1a5ef08859b406ff52b654cb785fdc6dd79be` 通过 MCP/current 实际执行一次：
`alice_client_restart_approved_20261103_k4n8v2cs_01`。

结果 passed/cached=true；标准 lifecycle 回执 completed/failureReason=none，
旧PID3521245→新PID3633395，replacementCount=1。新进程存活、心跳、连接、
sessionEstablished、owner/world/port验证均true；无现有游戏job，BDS未重启、
任务未改世界，无本地模型调用。声明产物 alice_restart 实际可读，SHA256
`5a807aa7410caab7630afe79a179e37f3ccb4932a7a7ffa75297eb7cfcac2ae7`。
独立 canonical status 再确认同PID/current_process、心跳0.3秒、在线HP20/IDLE。
无需用户终端命令，旧 h01 未执行或复用。MCP自身平台审核仍保留。

重启仅证明新游戏会话就绪；新生命独立样本重新从0开始。此前旧PID下6次独立
BDS partial-step证明仍是历史证据，不能算当前进程的移动、出门、床或HOME通过。
