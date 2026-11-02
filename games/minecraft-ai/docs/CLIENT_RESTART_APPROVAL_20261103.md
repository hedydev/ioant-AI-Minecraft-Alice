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

新专项 9/9 和完整 Mac Python 320 项（跳过 3 项）通过；正式批准和实机结果待补记。
这不是坐标或自主行为的验收。
