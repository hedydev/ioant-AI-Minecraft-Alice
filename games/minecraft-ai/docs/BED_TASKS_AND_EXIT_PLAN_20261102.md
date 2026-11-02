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


## 2026-11-02 第三轮：木门外完整方块阶梯的识别与受控跳跃（仅源码）

用户补充真实环境：原世界 Alice 的房间有**两格高木门**，打开后外面是由完整方块逐级搭建的台阶。普通平地路线不能作为上楼的唯一逻辑。

- 新增`src/one_block_jump.cjs`：识别相邻**完整实心方块上升整整1格**的落脚点，检查当前和目标支撑、头顶至第3格净空、场景已加载、无危险/复杂碰撞/实体占位、不越过STOP/FOLLOW/威胁。仅一次`jump`起跳和最多4个有限时间前进脉冲；离地不再误判为需要重新开始跳跃，沿一格有限走廊监测位置，输入总在`finally`释放。**本地跳跃成功≠服务器确认落点**。不穿门、不破坏、不造桥、不越两格、不支持楼梯方块的复杂碰撞形状。
- 在`bed_task_service.cjs`和`runtime.resumeBedApproachOnWitness`中接入：玩家明确“去睡觉”且床的道路出现已观测一格上升时，可候选`JUMP_UP`，复用原`scoutStartProof`最新4秒BDS双证据和当前会话生命代次/危险/安全状态。一次物理跳跃后写入`pendingBedStep`，下一轮**全新独立BDS双样本**验证x/y/z升高1格后，才能允许继续下一级或点床。失败或不确定不得自动连跳。
- `escape_survey.cjs`增加`doorCandidates[].beyondDoorTerrain='observed_one_full_block_rise'`：可以只读观察两格木门**正对面紧接**完整方块上升1格。`escape_crossing.cjs`在门外第一格抬高时返回`crossing_raised_full_block_landing_requires_jump`，不再将它一概当未知墙，也**不会尝试原本仅适合平地的两格穿门动作**。床任务反馈可明确为`bed_route_requires_door_then_jump`。真实门侧、门槛及楼梯需分别验收；门开不等于已穿门、门外有阶梯不等于已爬上去。
- `src/door_crossing_witness.cjs`要求整个穿门输入结束后重新取得同生命/会话的新独立BDS双样本，验证目标在门另一侧，且不将“门另一侧”视为室外。旧`escape_crossing`基于本地`movementEvidence.progress`和位置包的确认降级为诊断，不再宣称独立服务器成功。`runtime.crossObservedDoor`拒绝未通过新鲜BDS门禁、需要额外接近门的未验证A*路径；普通SCOUT门穿越入口也统一走此安全入口。
- 修正`runtime.resumeBedApproachOnWitness`原来用`const accepted=startJob()`判断成功的关键bug：正式`startJob`成功时返回**undefined**（任务对象已创建），此前被误判失败。现在查`this.job`和`this.action.source`实际任务身份，专项测试用真实void返回接口覆盖。
- 控制台`worldRoutine.bedRequest.nextMovementKind`展示WALK/JUMP_UP，标注`awaiting_step`时正在等服务器跳跃落点而不是已成功。
- 直接装载当前GitHub模块并执行独立V8验证：`one_block_jump.test.cjs`7/7；`bed_jump_runtime.test.cjs`3/3（含companion模式、真实运行时方法摘取、输入后180秒新独立BDS落点）；`door_stair_survey.test.cjs`3/3；实际`validatePassageGeometry`与`crossDoor`在门外立即升高1格时2项拒绝移动检查通过；独立穿门BDS策略`door_crossing_witness.test.cjs`8/8（较早本轮）。**这些不是Mint Node24全量回归，也不是17879实际跳跃记录。**
- 仍未完成：两格门外第一个台阶恰在门边时，需要先在已打开的门内/门口取得独立BDS站立证据，再单步起跳，不能一次性强行“穿门并跳上台阶”；真实楼梯可能有不同类型方块、宽度、碰撞形状，保留失败诊断，不硬编码现场坐标或降低原证据阈值；后续新版本必须先解决OpenClaw每项目500历史容量，合法同步并完整Node24测试，然后在原17879世界单步验收。

## 2026-11-02 第四轮：木门门槛单格动作与独立BDS见证（仅源码）
- 新增 `raised_door_threshold.cjs`：在木门已打开、自己站在近侧、门格地面与门外抬升整格完整方块均已观察、通行碰撞带可通行且实体未占位时，最多4个限时物理前进脉冲**只进入门内单格**；不穿越门外台阶，不破坏或修改方块。
- `crossObservedDoor` 在已观察“木门外立即抬升一格”时采用该单格入口，保留原来的4秒独立BDS双样本与0.75格起步门禁；动作结束后新的独立BDS双样本必须确认**门所在格**，才报告 `threshold_only_bds_verified`，明确不代表穿门/户外成功。
- `one_block_jump` 增加门格作为已知一格跳跃起点的严格候选：门两半状态必须打开且碰撞形状通行，跳到前方完整方块高一格仍由独立起步与跳后BDS落点证明管控。不能从未验收的门槛直接跳。
- 新增断言覆盖关闭门、无碰撞形状、屋顶低矮、实体占位、起点不在门近侧、STOP、旧样本/不同生命会话、错误门格等。此时仍**没有**连续的门槛验收后自动上台阶协调器、Mint Node24全量回归或17879原世界真实移动证据。

### 第四轮几何回归补充
- 修正 `escape_crossing.clearDoorway` 判断次序：门外高一格的完整方块已经是可检查的落脚支撑，不能先强制要求其下方一格也存在完整地板。对普通平地穿门的下方支撑检查仍然严格保留；高台仍只能先走门槛再分别验收跳跃。
- 新增“门外完整高台下方为空气”的只读几何测试；不放松未知落脚方块或玩家身体碰撞验证。

## 第五轮：走或跳由地形自动决策（源码/全量Node24验收）
- 原先床靠近动作先选完整平地路线、再选正向邻格、最后试一格完整方块起跳；现在正式抽为共享候选选择器 `adjacent_motion_decision.cjs`，供逐格床导航复用。优先走平地，遇高一格再检查跳跃轨迹中的顶棚净空、完整落脚支撑和实体占位；走得过去但顶棚低，不能多余跳跃。
- 这次不会声称支持复杂半砖/台阶、直角绕路、一般 FOLLOW/EXPLORE 的统一控制，更不会替代BDS服务端逐格起点和落点验证。这些留待后续导航整合。
- 实际OpenClaw原Mac工作区同步与原Mint非重启同步已成功，Node24 `902/902` PASS；只读/脚本完成≠当前已在线的Alice进程已换新代码，更≠实机跨门、跳上高台。
