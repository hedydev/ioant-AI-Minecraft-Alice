## 2026-11-04 — 版本5实机仍未开门；额度交接规则更新

c1488eb已经实际通过sync39（Mint993/993，Mac332 skip3），原批准restart40完成PID1475661→1495260；读回41确认版本5/在线。新版本独立sleep验收42的commandId为1bb226cfeb5d45b6a528a4ad55c44041；仅发一次，后续只查回执。有限观察43捕捉到独立新鲜静止窗口，偏差0.00（5个合格样本），但BDS位移0。只读日志44仍返回door_state_change_not_observed，attempted=true；**侧面修复没有解决本次原服门交互，床/重生点/睡觉仍未成功**。不继续重复点击，先审计实际安装的交互上下文及服务器默认交互权限。

现有只读dependency审计补充interact.js的实际send/pos/heldItem上下文和player_permission/update_abilities实现；仅额外读取原17879/Bedrock level的server.properties默认角色和游戏模式枚举，不读permissions.json或身份资料，不修改权限。默认角色不能等同Alice当前角色。4项路径/重复配置/隐私/尺寸测试通过。

用户最新要求：若本轮5h用完仍未解决，提前提交代码交给其他AI。约10%完成文档与提交推送，最迟5%持久交接并PAUSE alice-2，不再在下一窗口自行恢复，避免与接手AI冲突。旧网页巡检仍PAUSED。

## 2026-11-04 — 已开门仍须先到近侧格

源码审查发现另一个确定性衔接缺口：门已打开且路线仅1～2格时，策略直接请求crossObservedDoor，但该执行器明确要求approach.steps===0，于是永远停在门外。现让任何仍有路线的已开木门走原逐格approachDoor/BDS终点路径，到近侧后才尝试穿门；不放宽crossObservedDoor或跳过位置证明。新增远门/已到近侧两种行为断言，33项定向Node通过。此前侧面点击源码2185d15已通过真实sync38：Mint992/992、Mac332 skip3；此补充尚待完整Mint复验，当前PID1475661仍版本4，无新点击或重启。

## 2026-11-04 — 木门点击可见侧面（版本5，待实机加载）

实际安装的interact.js审计37（SHA256 de5acbaf…a62603）确认：activateBlock默认上表面，_genericPlace会覆盖调用者lookAt并按faceVector计算click_pos，先等待120ms再发已有click_block交易。现有门动作点击下半门时默认命中被上半门遮挡的上面；真实当前PID日志只观测到door_state_change_not_observed，尚不能从源码断言服务器拒绝的唯一原因。

修复通过同一公开activateBlock(block,faceVector) API传入朝玩家的水平侧面，瞄准同一面中心；保留所有门状态/BDS/safety/一次调用/800ms观察与10分钟重复保护。新增眼睛到点击点的有界已加载碰撞形状检查（最多90点），墙、玻璃、未知块拒绝，不允许隔墙操作。没有改Bedrock包格式、世界、门的实际状态或查询预算；结果仍必须观察open_bit改变，随后另用独立BDS证明通过门。bedLogicVersion=5、typed测试要求5，当前进程仍版本4。32项门策略/床请求/面向测试通过；Mint完整回归和原批准生命周期加载待验收。

## 2026-11-04 — 原生交互API现场源码证据

固定只读36已取得Mint实际安装bed.js/interact.js公开源码：activateBlock默认faceVector=(0,1,0)，委托_genericPlace；sleep只等待服务器sleep事件，不能把调用当成功。当前门执行器点击下半门时未传faceVector，故默认点击上表面，且lookAt指向方块整数角。是否导致BDS拒绝仍须核对_genericPlace实际包构造，先将原只读源码审计补充该函数，禁止直接猜包或反复点击。

## 2026-11-04 — 门交互失败已有当前进程证据

原固定只读bed任务35成功读当前PID1475661日志：床door阶段确实被接纳，随后一次door interaction返回door_state_change_not_observed，attempted=true；任务结果ok=false、serverMovementVerified=false。当前HP20、无跟随/工作、夜间、床未确认。这解释了为何不能把BDS取证成功当成到床成功；后续不重发sleep命令或反复点击门。

新增固定只读alice_bed_dependency_readonly：仅检查实际Mint安装的mineflayer/lib/bedrock_plugins公开JS交互实现（activateBlock/sleep），最多6个文件/24KB片段，拒绝symlink和超大文件；不读取配置、世界或账号文件、不调用游戏/模型。需要先核对真实适配器后再修正门或床交互。新增2项限定路径、内容和尺寸测试通过。

## 2026-11-04 — 取证准入已接通，继续审计门阶段

首次生命兼容源码8ce3cd3实际通过非重启sync26：Mint990/990、Mac327 skip3；批准restart27完成PID1471802→1475661，owner/连接/会话正常。新的一次性sleep验收29（与旧set_spawnpoint不同的新版本测试）commandId60fa201b1a6e4ab7b63cd49716f6bd83曾started，读回30已出现door阶段、bedWitness=intent/needs_evidence；只读31实际demandNow=true，说明床取证需求已进入原定时器。

后续只读33确认新sleep请求也已bed_request_expired，不重发。只读34确认position_pair_verified、独立样本4、预算4/40、无退避、BDS位移0；说明取证确实成功，但不能证明门前输入或到床。有限观察32的210秒未捕捉到合格坐标窗口，仅是该观察器结果，不能推断定时器没查询。下一步必须读取当前PID真实门阶段结果，不能继续猜测。

扩展原alice_17879_bed_readonly固定任务：只读当前owner日志最后120KB，仅输出最近12个床/门/任务原因枚举与布尔结果，不输出坐标、玩家名、原始日志、凭证；bedLogRead明确区分未读日志。没有运行时变更、重启、游戏指令或BDS查询。新增3项解析/隐私/长度测试，完整Mac回归待记录。

## 2026-11-04 — 首次生命的取证边界兼容修正

版本4源码8fffbeb已经实际通过非重启sync23（Mint989/989，Mac327 skip3），原批准restart24完成PID1380268→1471802，加载读回25确认bedLogicVersion=4/连接正常。只读bedWitness仍为空。审查真实movement_evidence.cjs确认首次登录的lifeEpochAt=null，仅死亡重生后才有数字；初版bed需求只接受整数，错误地拒绝首次生命。修正为明确null或整数，并要求描述和当前observer精确相等；缺字段、换生命/登录/epoch、STOP/危险仍拒绝。压缩心跳和Python定时器同步遵循相同语义，不增加查询量或放宽门禁。Node31项及Python取证12项专项通过，完整Mint/加载待新回执；这是实现缺陷修正，仍未证明床实机成功。没有发送新的床指令。

## 2026-11-04 — 床取证需求与等待期限解耦（版本4，待实机加载）

源码确认两条独立路径存在循环等待：显式pendingBedRequest提前暂停普通自主准入，但取证定时器只识别普通自主/夜间/白天门需求；自动床单格输入后的独立终点也可能被work_cooldown屏蔽。新增只读features/bed/witness_demand.cjs，由同一运行实例生成有界、当前epoch/login/life的intent或endpoint描述。只有原健康IDLE、无任务/STOP/FOLLOW/危险/垂直hold、autonomy开启时输出。既有opt-in定时器验证精确描述、时限与生命身份后允许证据采样；不开放任意work_cooldown，不改变查询40/h、180秒间隔、10分钟停滞退避、4秒/.75格双样本、逐格碰撞/终点验证，描述本身permissionGranted=false/querySent=false。

初始等待证据的意图期限改为15分钟，覆盖10分钟退避与下一个180秒采样槽；总任务仍90分钟/24阶段，实际输入后的240秒终点期限不延长。所有压缩层保留匿名有界bedWitness。bedLogicVersion=4仅作加载诊断，typed一次性床脚本要求版本4。旧f482…已failed，不重放；新代码仍须原批准的Alice-only生命周期加载后分别实证床到达、重生点和睡眠。定向Node44项、Mac Python327项（3 skip）源码验证；Mint完整回归和真实加载待记录。恢复只读22确认PID1380268/version3仍在线，bed not_verified，原命令仍expired。

## 2026-11-04 — 额度暂停前最终回执

源码de5b6eb已推送，固定任务alice_bed_repair_heartbeat_mint_20261104_k4n8v2cs_21实际非重启sync通过：Mint Node24 984/984，Mac Python326（3 skip），未重启Alice/BDS、未发游戏控制命令、未改世界。压缩心跳补丁已同步但运行PID1380268未加载；床实机仍未通过。当前无已知在途任务。下一编号22；先读最新handoff与Git，不重复旧床请求f482…或原重启。实际五小时used95%/remaining5%，按用户要求暂停；额度真实恢复后由bed-only接续alice-2继续，旧网页巡检alice保持PAUSED。下一重点是有界显式床取证需求与初始240秒意图期限；保留全部查询预算与安全审核。

## 2026-11-04 — 待加载：压缩心跳保留显式床意图

已复核真实回执20：work_cooldown、needs_two_fresh_samples、positionGateSatisfied=false；床指令仍为原f482…且已expired。源码确认pendingBedRequest会提前暂停普通自主准入，而定时器没有专门的显式床需求分支；4KiB压缩还会丢掉bedRequest，导致无法从只读状态判断等待阶段。先修复诊断：每一层压缩均保留有界action/stage/steps/expiresAt及serverMovementVerified=false，不带目标坐标、原始消息或移动权限。本地心跳27/27通过；尚未在Mint全量验收或加载，运行PID1380268仍旧诊断实现。下一步在保留40/h、180秒、10分钟退避、STOP/FOLLOW/危险/生命owner检查的前提下，设计独立明确的床取证需求；不能直接开放work_cooldown或延长BDS样本有效期。

## 2026-11-04 — 床版本3实机结果与未完成阻塞

源码 `384b444` 已通过 Mint Node24 984/984、Mac Python326项（3 skip、其余通过）。已通过原批准的 Alice-only lifecycle 加载：PID1380268，bedLogicVersion=3，owner/心跳/游戏连接/会话确认；未重启BDS或修改世界。

版本2请求被 `bed_route_requires_door` 明确拒绝。版本3真实请求 commandId `f4827b1e503b48c4a20da8b5be2346a9` 曾 started/awaiting_bds_bed_approach，但只读回执17确认已 failed/bed_request_expired。有限观察16（210秒/835读）没有新鲜独立BDS窗口；床步骤最近原因是 jump_origin_support_or_headroom_unverified，该字段可能是旧尝试，不能替代当前门阶段回执。个人床仍not_verified，isSleeping=false。**床到达、重生点和睡眠均未通过实机验收，禁止重发该请求或宣布已修复。**

只读回执19确认定时器active/enabled、owner有效、预算22/40、无退避、lastBatchAge168.4秒、lastServiceResult=cooldown_or_budget、检查时demandNow=false（床请求此时已过期，不能反推它当时的需求）。待查：显式床意图被普通自主准入暂停后，是否仍能进入取证定时器；bedRequest在4KiB压缩中缺失；初始240秒意图期限与自然冷却/退避是否冲突。以上仍是待核实路径，不是已证实根因。

本次仅增强既有只读bed_state输出：idleGate、witnessDemandState、positionGateSatisfied及门/穿越原因，匿名枚举过滤保留；不提交命令、不触发BDS查询、不修改运行时策略。5项专项测试通过。最新MCP任务历史达到500，经现有Web控制台正式归档399条已结束回执、保留100条近期记录，历史/报告保留，无执行任务、无服务重启。

# Bed approach, personal spawn and sleeping repair

AI-Session: k4n8v2cs. Scope: existing Alice / original BDS world only.

## Verified causes

1. The pinned Mineflayer Bedrock `lifecycle.js` stores `bot.entity` inside
   `bot.entities[entityId]`. `selectDirectionalBedStep` checked every entity
   within 1.1 blocks of the next cell. Alice herself is usually one block from
   that cell, so every cardinal flat candidate could be rejected. Jump fallback
   then reported a low-ceiling failure, masking the self-collision rejection.
   Exclude only self by object or runtime ID; other players/entities still block.
2. The maintenance timer and independent BDS proof have different schedules.
   Previously an eligible distant bed or stale proof could still start a sleep
   job, consume the 120-second retry window, then fail before interacting.
   A single shared synchronous sleep admission now checks proximity and fresh
   proof before starting a job and spending cooldown. The genuine accepted
   witness callback also calls it, before optional movement/scouting. No new
   polling, timer, BDS query, relaxed TTL or navigation permission is introduced.
3. A personal spawn packet received at login need not describe the selected bed.
   Bed setup is satisfied only by a current-session interaction-confirmed bed
   matching the selected location, never a generic prior personal spawn.

Pinned upstream evidence:
- [Lifecycle self registration](https://github.com/Pix3lPirat3/mineflayer/blob/b24015aeeec68a5c94f54444f104f0e563595a30/lib/bedrock_plugins/lifecycle.js)
- [Server-observed sleep/wake adapter](https://github.com/Pix3lPirat3/mineflayer/blob/b24015aeeec68a5c94f54444f104f0e563595a30/lib/bedrock_plugins/bed.js)

The fresh readonly collision receipt
`alice_bed_repair_collision_20261104_k4n8v2cs_02` found loaded flat centerline
candidates and a four-cell route to a closed spruce door. These are observed
geometry, not movement or a bed arrival. The fresh voxel receipt
`alice_bed_repair_voxels_20261104_k4n8v2cs_01` found two bed halves about 11.3
horizontal blocks away and one block higher. No world coordinates are recorded
here; neither audit sends game commands.

## Validation and rollout boundary

- Targeted self-entry, blocked-other-entity, bed/spawn, stale witness, cooldown,
  STOP/FOLLOW/threat and compressed heartbeat tests pass locally.
- Mac Python baseline: 321 tests, 3 skipped, 0 failures before final telemetry
  changes. Final Mac/Mint validation must be recorded below after it runs.
- Mac Node26 full suite: two test files cannot load the absent `vec3` dependency;
  this is not a passing full suite. Use the existing dependency-complete Mint
  Node24 regression through `.openclaw/tasks/alice_mint_nonrestart_sync.json`.
- `bedLogicVersion=2` in the owner-verified heartbeat identifies this new runtime
  path; it is not a source hash or gameplay acceptance. `isSleeping` reflects the
  adapter's server-observed sleeping flag, not a submitted sleep command.
- No Alice/BDS restart, world edit, movement or bed interaction has been done by
  this patch at the time of its initial commit. A non-restart source sync does
  not load CommonJS modules into the existing process.

After full regression, an explicitly authorized Alice-only lifecycle must use
the existing approved `.openclaw/tasks/alice_17879_client_restart.json` at the
exact current commit after checking `openclaw_project_actions`. Preserve owner,
world, health/no-job preflight and platform review. Never replay the refused
historical restart, clear a lock, alter BDS or start a second client.

## Actual acceptance still required

Observe independently, in this order: new owner and `bedLogicVersion=2`; fresh
independent BDS-confirmed bedward steps; bed within interaction range; a new
personal-spawn acknowledgement from that bed; and server-observed sleep entry
during a natural sleep window. Entry, waking and skipping the night are separate
facts. A wall/door/step must keep its existing collision/action requirements.
Do not report success from test counts, local pathfinding or a task exit code.

## Follow-up: bounded intent lifetime and typed real-game acceptance

The old request deadline included both waiting up to ~180s for admission and
waiting another ~180s for the next independent endpoint. It could expire at
240s before that endpoint arrived. Each actual one-cell input now arms its own
240s endpoint phase, within a strict 90-minute total request lifetime and 24-step
cap (previously 20 minutes / 8 steps, insufficient for a bed observed 16 cells
away). STOP/life/session/task fences, BDS 4s/.75, hourly budget, 180s service
spacing and one-cell-at-a-time execution are unchanged. This is not a continuous
movement permit or an infinite bed search. Live version 2 identifies this change.

New maintained Mac-only acceptance entrypoints:
- `.openclaw/tasks/alice_bed_set_spawnpoint_once.json`
- `.openclaw/tasks/alice_bed_sleep_once.json`
- `.openclaw/tasks/alice_bed_command_status_readonly.json`

They use `scripts/alice-bed-command-once.py`, the existing loopback dashboard
API and its original typed command reader. Only `设置重生点` / `睡觉` can be
submitted, after current world/17879, online healthy IDLE and version2 checks.
Submission intent is persisted before POST. On timeout, do not resend under a
new operation: use the readonly task and match `commandId`. Queued/started is
not gameplay completion. No arbitrary console command, OP/teleport/world edit,
new model, BDS query, reset or restart is exposed. The tests exercise one send,
HTTP ambiguity, repeat refusal, strict live guards and privacy-filtered reads.

First rollout (version1): source 81af5dd, Mac321(skip3), Mint979/979.
Approved lifecycle `alice_bed_repair_client_restart_20261104_k4n8v2cs_04`
completed: old1319142 -> new1367454, current owner/heartbeat/connection/session
all verified, BDS/world unchanged. Version1 readonly receipt05: day, canSleep
false, personalBedStatus not_verified. This is loading acceptance only.
Version2 follow-up full tests and runtime loading are still pending.

## Version3: connect the bed goal to the existing guarded door stages

Version2 actually loaded in PID1373327; Mac326(skip3) and Mint981/981 passed.
A single maintained typed spawnpoint request was queued with commandId
`4c1ecaf627f74174b78b2d3ea338efea` and then explicitly REJECTED by runtime as
`bed_route_requires_door`. No unknown operation was repeated. This identifies a
missing goal transition, not a successful bed arrival.

Version3 adds a bounded door phase to that same bed request. Only an observed,
flat-connected wooden door toward the loaded free bed may be selected. Shared
original door approach/open/cross/raised-landing functions own actions, collisions,
per-step BDS proof and endpoints. Bed intent updates its epoch only for its own
admitted job and blocks unrelated scouting while waiting. Unknown door bits
remain waiting, not activation. Existing short handle-range failure now falls
back to the already validated one-cell approach, instead of stalling permanently
because a non-colliding torch made the handle-only check stricter than WALK.
No door is treated as a verified complete path to the bed. Actual arrival and
server spawn/sleep acknowledgements remain separate required evidence.
