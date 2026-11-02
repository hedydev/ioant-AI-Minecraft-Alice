# Alice AI — 床、睡眠、重生点与出口闭环（2026-11-02）

## 用户确认的规则

- 没有已验证的个人重生点时，安全可达的现成床应可在白天或夜间设置重生点。
- “睡觉”“去睡觉”和“设置重生点”来自游戏聊天或控制台，均应该有可追踪的任务与明确结果。控制台没有游戏玩家身份，不允许隐式跟随“我”。
- 入睡与设置个人重生点是独立的 BDS 服务端事实；服务器跳过夜晚更是第三个事实。不能把床被点击、Client 同步位置、收到本地睡觉 API 的成功回调当作服务器三者都确认。
- 已有其他玩家在线时，短暂入睡后可以起床，而不是为了达到夜晚跳过人数比例无限等候。怪物在床附近可能导致 Minecraft 拒绝睡觉，**不会自动把这只怪物当作攻击目标**；战斗威胁基于实际攻击意图。
- 优先使用现成床；找不到床、暂未加载、床被占用、床不可达、BDS 位置门禁过期、怪物干扰，必须给出不同失败/等待原因。制作床、放置床、挖墙、强制移动均不由一次睡觉指令隐式授权。
- Alice 的 HOME（屋顶/床/门/室内）记忆与到门口、开门、穿过门、再次关门、天黑前安全返回，需要分段路线及独立 BDS 终点验收；仅观察木门、客户端附近方块不是完成通行。

## 本轮已提交的源码改进（GitHub main，未部署）

1. **游戏聊天**：`runtime.cjs` 中的 `recognize/parseTask/onChat` 新增中文睡觉和设置重生点专用分支。不再依赖 Ollama 猜测任务或将指令误解析为普通聊天。STOP/FOLLOW 仍保持原优先级。
2. **安全控制台**：`console_commands.cjs` 仅新增两个有限白名单动作 `sleep`、`set_spawnpoint`；`dashboard/remote_control.py` 映射中文指令；`dashboard/index.html` 与 `world.js` 添加相应按钮。仍由 `localhost:8788` 的同源与写权限检查处理，不引入任意命令/玩家身份伪造/远程开关。
3. **共享执行入口**：`src/bed_task_service.cjs` 在收到显式命令时做一次 `maxDistance:16/count:24` 的只读 Bedrock 已加载床扫描，并与过去床记忆合并重新读方块；被动床记忆的观察范围也从12扩展到16格，**只增加发现范围，不增加与床交互或移动的权限**；床不在可触及范围，只调用现有 `surveyEscape` 做只读诊断并反馈`bed_needs_verified_approach`，不会宣称可达或移动。
4. **等待真实BDS位置证据**：只有确认同次登录/生命阶段、4秒内的两次独立BDS样本、客户端与BDS误差不大于0.75格的原`scoutStartProof`后，才允许当前床旁动作；没证据则一次性保存最多240秒的意图，等待`onFreshIndependentBdsWitness`事件；不主动查询BDS、不续签样本、不提高40次/小时和180秒原限制，超时/STOP/重登/死亡/危险/FOLLOW/任务代次变化时取消。
5. **真实结果判定**：`bed_request_outcome.cjs` 将个人重生点`set_spawn_position`协议确认、实际`isSleeping/entered`观察与服务端时间跳夜严格分离。可分别报告：只设重生点/真正入睡/睡后起床/失败或未确认。历史会话确认不假装是本会话重生点ACK。
6. **修复睡眠绕过风险**：`life_actions.sleepNearby` 支持`requireBdsProof`与`forbidNavigation`；当前正式世界自主睡眠和显式床指令都采取先证据、**仅相邻床交互**策略，不允许旧版`sleepNearby`自己调用无验证`pathfinder.goto`去远处睡觉。正式世界远床路径尚未打通前，应明确阻断。
7. **生存优先级**：等待床的4分钟窗口中保留装备保养与安全进食，停止其它可选探索/睡眠；新鲜见证来临时先履行玩家已授权的床任务，随后才考虑常规自主床/探索任务。

## 源码检查与已知限制

- 新增`test/bed_task_service.test.cjs` 10个逻辑断言已通过独立真实JS源码/V8沙箱校验（模拟外部BDS/bed接口）；`runtime`的中文`recognize/parseTask` 8个指令解析测试通过；直接执行真实`life_actions.sleepNearby`守卫逻辑2/2，证实远床以及缺少独立见证均不会调用寻路或睡觉；控制台`runCommand`两个新类型已在JS沙箱以实际源码调用2/2验证。变更JS文件通过语法解析。新增仓库Node及Python回归断言文件，但**没有执行Mint Node24全量测试或Mac Python全量测试**。
- 当前 Mac 注册工作区仍为旧提交`9189d2b`，之前`repository_sync`在MCP返回`execution_history_full`，本轮没有强制部署、重启Alice、触碰BDS 17879/其他世界、删除OpenClaw历史记录。源码改动尚未通过真实游戏验证。
- 尚未解决：真实床超过交互范围后分段走到床旁、前往门口开门/跨门/关门/返回的完整BDS验收；睡眠人数比例或服务端状态是否造成世界跳夜的**独立验收**；多人床抢占、白天试设重生点后的长期HOME记忆；床制作/放置需独立授权与材料规划。这些不能冒充本次已经交付。
- 后续应先修OpenClaw已查明的每项目500历史记录上限（禁止直接删执行证据，必须归档保留operation IDs）。在获得正式工作区同步/测试/安全客户端加载以后，仅在原17879世界进行指定床坐标及新鲜BDS终点验收，再接入一格一步的到床/通门动作。


## 2026-11-02 第二轮：床的逐格引导与跨 BDS 查询间隔验收（源码级）

- 发现原`resumeBedApproachOnWitness`在4.5秒移动超时后马上要求后续两份独立BDS样本；正常MCSManager见证间隔约180秒，造成物理动作与独立终点验收窗口错位。本轮新增`src/bed_step_witness.cjs`：在当前新鲜双样本通过4秒/0.75格起步门禁后，启动**一格**旧版受控`GoalNear`，仅记录`pendingBedStep`。路径执行本身的`ok=false`，不声称到达；后续全新BDS双样本必须在输入发生后生成、同login/life且误差与目标位置吻合，才能单独记录`bed_step_new_independent_endpoint_confirmed`。4分钟截止，STOP/FOLLOW/危险/死亡/新任务改变epoch清零，绝不使用packet级`movementEvidence.progress`取代独立BDS。
- 显式聊天/控制台床任务现可保留`approach / awaiting_step / interact`状态；本地路径扫描`surveyEscape`若提供完整平坦路线，严查首步相邻、连续同层、终点可从床边触及，等待BDS真实起步和逐格终点。移动过一格**必须再收到下一轮独立BDS证明**，不重复压移动输入。
- 如果床在已加载16格内、超出7格局部搜寻，但正向水平一格的站立方块和上下空间是确定完整平地，可由`src/bed_directional_step.cjs`选择**仅一格**更接近床的已观察候选；无完整路线保证，不宣称床可达，不穿墙、不绕过门、不上下台阶。下一次见证后再重新观察。若墙、门、未知地面、实体占据下一步，返回受阻而非直接移动。
- 原有床步进逻辑对12格内**任何怪物**一律拒绝，已改为只以真正`threat()`作危险抢占，同时阻止怪物实际占据下一个格子的移动；**Minecraft睡觉时的床周围怪物限制是另一种服务器判定**，不会强制攻击无攻击意图的怪物。
- 显式玩家/控制台指令在`companion`模式也可通过所有原始安全门禁执行，修正旧`autonomyEnabled`条件将手动床动作误拒的bug。等待显式床任务期间`runIdleDecision`不再启动普通自主采集抢占位置，`maintenanceTick`仍允许紧急安全食物/装备保养。
- 新增纯策略`test/bed_step_witness.test.cjs`7例，`test/bed_directional_step.test.cjs`5例，`test/bed_approach_workflow.test.cjs`5例，`test/bed_runtime_step_contract.test.cjs`4例；改进原`test/bed_task_service.test.cjs`使用真实block/pos和BDS字段而不靠`ready:true`冒充服务端证明。已直接在JS V8装载真实模块（部分外部服务用模拟fixture）检查bed_task10/10、逐格工作流5/5、方向候选5/5、独立终点7/7；额外提取`runtime.cjs`实际步进入口与延迟验收方法，以关闭自主模式的显式控制台指令走完**输入后等待 → 180秒后新BDS双样本终点验收**，结果通过。**不等于在Mint Node24或真实服务器通过**。
- 出口/门已经有`escape_survey/escape_door_action/escape_crossing`组件，但`crossDoor`现有服务端判定仍依赖包级移动证据，不足以代替独立BDS终点。因此本阶段不把「观察到门打开」自动标记成「已穿门到达床」，下一步需要把真实门侧碰撞和穿门的终点也接入相同的独立BDS多周期验收。
- OpenClaw Mac源代码同步仍被每项目500份`execution_history_full`挡住，当前GitHub改动**仅源码，没有部署到Alice**。保留原17879世界与原BDS查询预算，不更改玩家当前世界。要做实际验收，先修历史容量并完成合法同步、Node24全回归、客户端加载，再用定向安全格和独立BDS结果逐项验证。
