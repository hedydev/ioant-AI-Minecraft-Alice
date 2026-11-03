## 2026-11-04 — 床版本3实机结果与未完成阻塞

源码 `384b444` 已通过 Mint Node24 984/984、Mac Python326项（3 skip、其余通过）。已通过原批准的 Alice-only lifecycle 加载：PID1380268，bedLogicVersion=3，owner/心跳/游戏连接/会话确认；未重启BDS或修改世界。

版本2请求被 `bed_route_requires_door` 明确拒绝。版本3真实请求 commandId `f4827b1e503b48c4a20da8b5be2346a9` 曾 started/awaiting_bds_bed_approach，但只读回执17确认已 failed/bed_request_expired。有限观察16（210秒/835读）没有新鲜独立BDS窗口；床步骤最近原因是 jump_origin_support_or_headroom_unverified，该字段可能是旧尝试，不能替代当前门阶段回执。个人床仍not_verified，isSleeping=false。**床到达、重生点和睡眠均未通过实机验收，禁止重发该请求或宣布已修复。**

只读回执19确认定时器active/enabled、owner有效、预算22/40、无退避、lastBatchAge168.4秒、lastServiceResult=cooldown_or_budget、检查时demandNow=false（床请求此时已过期，不能反推它当时的需求）。待查：显式床意图被普通自主准入暂停后，是否仍能进入取证定时器；bedRequest在4KiB压缩中缺失；初始240秒意图期限与自然冷却/退避是否冲突。以上仍是待核实路径，不是已证实根因。

本次仅增强既有只读bed_state输出：idleGate、witnessDemandState、positionGateSatisfied及门/穿越原因，匿名枚举过滤保留；不提交命令、不触发BDS查询、不修改运行时策略。5项专项测试通过。最新MCP任务历史达到500，经现有Web控制台正式归档399条已结束回执、保留100条近期记录，历史/报告保留，无执行任务、无服务重启。

Continue only this bed task. AI-Session k4n8v2cs; conversation_key alice_prediction_20261102_k4n8v2cs. Latest handoff revision82 at initial checkpoint; read latest resume before CAS update. Exact current HEAD must be read, do not pin 384b after this documentation commit. No in-flight task known after19. Do not repeat command f4827b1e503b48c4a20da8b5be2346a9 or restarts13/8/4. Next suffix20 for readonly status using enhanced script. Audit fields are observations, not new permissions. Current production PID1380268/version3. Do not restart BDS/client, edit world, reset40/h budget, relax4s/.75 or180s pacing, or send webpage Chat messages. Preserve existing explicit approved lifecycle for genuinely needed later tested code loading only. No force Git/branches/worktrees. Latest operations16 finite observation passed,17 bed state failed request,18 blocked history full (no script),19 demand read passed. Official archive alice_bed_history_archive_20261104_k4n8v2cs_01 archived399, retains receipts/logs.

Quota: stop at actual five-hour remaining<=5%, no purchase/reset/API. At recovery continue tests/source fixes and factual real bed/respawn/sleep evidence; do not treat tests as gameplay. User requested automatic continuation. No monitoring other Chats. Keep a bounded quiet heartbeat only for this task if quota pause becomes necessary.
