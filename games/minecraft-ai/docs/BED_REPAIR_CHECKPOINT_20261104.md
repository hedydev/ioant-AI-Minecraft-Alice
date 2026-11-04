# Alice床流程检查点 — 2026-11-04 本轮继续

## 目标与额度
用户确认尚未交其他AI，授权本Chat再使用恢复后五小时额度约70%，剩余约30%前提交推送与交接。本Chat AI-Session=k4n8v2cs，conversation_key=alice_prediction_20261102_k4n8v2cs。alice-2与旧网页监督alice均保持PAUSED，不向网页Chat发消息；本轮在当前Chat执行，不自动争抢下一额度窗口。

**仍未完成：床到达、个人重生点、真实睡眠没有通过完整实机验收。**

## 已有真实进展
- 63：木门只激活一次，发送runtimeId4142737989，而本地stateId7871；观察到door_open_observed_exit_unverified。
- 72：door_crossing_new_independent_bds_confirmed / serverMovementVerified=true。独立BDS确认穿门，不是本地预测。
- 86：bed_jump_waiting_for_new_independent_endpoint之后，真实bed_step_new_independent_endpoint_confirmed / serverMovementVerified=true。一格台阶跳跃已有独立终点；不代表到床。
- 未重启BDS、改世界或身份资料、清预算、删锁、开第二游戏客户端或无界查询。

## 当前部署
- 运行代码8c2e7ef6a437b8ea15f156932dafb12fcb5329bf，bedLogicVersion=9。
- 原批准87客户端正常单替换完成：PID1818511→1826633；进程/心跳/连接/会话/owner/world/17879均验证。88独立读回版本9，健康20/IDLE。
- 85完整非重启sync通过：Mint1011/1011、0skip；Mac337项、3skip其余通过。
- 后续文档提交会更新HEAD，接手必须读取Git实际值，不把上述运行源码SHA写死为当前HEAD。

## 源码修复
1. typed床意图/终点需求接入原40/h、180秒、10分钟退避定时器；首次生命null边界和4KiB压缩保留；初始意图15分钟、物理终点240秒，总24阶段/90分钟。
2. 实际安装Chunk将hash runtimeId变为本地stateId，原生interact却直接发送本地ID。block_interaction_compat在公开activateBlock入口仅适配木门/床，复用实际Block.getHash并精确反查在线blocksByRuntimeId；不改世界Block/registry/包形状或次数。开门已实证。
3. 已知火把要求boundingBox=empty与shapes=[]才能算净空；未知/实心/危险不放行。穿门已独立确认。
4. 一格跳跃保留真实Vec3与初始速度clone，修复对象展开丢原型；已知完整顶棚第四格只有在独立克隆PlayerState/同固定Physics完成20tick/最多120块有界预检并证明目标格落地时才允许。未知、危险、低顶、半块顶仍拒绝；不apply、不事件、不触碰活体状态或控制。真实Physics三项通过，实机单格终点86确认。
5. 版本9：旧阶段一直固定door，穿过门后因门不再可见而丢床目标。现在先结算旧步独立终点，再按当前新鲜BDS原点重算同一床的interact/approach/door；pending床/门终点一律先等待。四项接续/缺证据/pending回归先红后绿，原安全门禁不变。
6. 被动interaction_audit与固定只读脚本区分自身权限、已有交易序列化、spawnConfirmed/sleepEntered/woke，不把发送当成功，不输出身份/原始日志/坐标。

## 当前一次性请求：只能查，不重发
89 alice_bed_repair_v9_spawn_accept_20261104_k4n8v2cs_89 已提交一次set_spawnpoint：commandId=3c219128a38e487c9ee94cf0352ab3b8。MCP提交回执passed/queued，仅证明入队；运行时最终结果仍待只读核对。不能声称已到床，也不能换ID重发。

旧命令均已结束，禁止重放：
- 4c1ecaf627f74174b78b2d3ea338efea：v2拒绝bed_route_requires_door。
- f4827b1e503b48c4a20da8b5be2346a9、60fa201b1a6e4ab7b63cd49716f6bd83、1bb226cfeb5d45b6a528a4ad55c44041：expired。
- ac28889a8cc5430f8c3e9d1daa0804ee：v6 sleep，69确认failed/expired。
- 10597f8f1f894d558a01895f901789e1：v7 spawn，73确认rejected/bed_route_requires_door；该进程随后原自主流程完成穿门。
- bcb05070d9e74de69e778d94c6c09288：v8 spawn，84确认failed/bed_door_route_no_longer_observed；随后原自主流程完成已确认台阶跳跃。
75完整回归失败为旧错误分类兼容，76已修正后1007/1007；不重跑旧75。87正常客户端生命周期已完成，不重做。此前旧h01被拒不得换工具/名称重放。

## 下一步
先读最新project_resume和89运行时commandId回执。当前版本9已经加载，以同一目标观察阶段接续、逐格BDS终点和到床交互。保留40/h、180秒、10分钟退避、4s/.75、STOP/FOLLOW/危险/owner/session/life；未知或在途结果只查，不反复发命令、不为了收集证据反复点击。

若需要新增修复，先实际定位再测试、提交推送、非重启sync；只有必要加载运行时代码且原获准生命周期enabled时才用原alice_17879_client_restart任务，预检原world/17879/owner/健康IDLE/no-job/登出/单替换，平台审核保留。不要重启Web/Tunnel或恢复密钥。云端MCP初始化409时现有同服务SDK stdio仍执行相同固定任务，不绕审核，不用Gemma跑确定命令。

固定任务artifact：alice_17879_bed_readonly→bed_now；alice_bed_command_status_readonly→bed_state；alice_bds_demand_state_readonly_20261102→demand_state；alice_home_door_voxels_readonly→door_voxels；alice_mint_nonrestart_sync→mint_sync。有限观察最多210秒，不触发BDS查询。
所有任务project_key=alice-ai、repository_task/current/精确完整HEAD。当前main，不创建分支/worktree或reset/clean/stash。源码提交保留AI-Agent/AI-Session。新Chat要新conversation_key并先resume；摘要不是权限或回执。详细进展见CURRENT_STATE、BED_INTERACTION_REPAIR_20261104、OPERATIONS。

截至89无已知在途MCP执行任务，但89游戏请求待核对。下一新后缀90。持久交接最新已知revision87，保存前读最新CAS。最终交付前更新这里的当前请求状态/后缀，不恢复旧网页监督。
