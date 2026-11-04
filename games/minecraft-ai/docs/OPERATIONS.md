## 2026-11-04 — 本轮预算收尾：版本10全量通过，尚未加载

92在源码0c7f4e17b11ac297db200a690171de5c65f9aaac通过Mint1012/1012、0skip，Mac337项（3skip，其余通过）；只做非重启sync。生产仍原批准87加载的PID1826633/version9（运行源码8c2e7ef），版本10未加载，typed新验收入口要求10，不得对版本9误发。90确认当前最后89命令3c219128a38e487c9ee94cf0352ab3b8已经rejected/bed_needs_verified_approach，不是进行中。没有新的床请求或在途MCP任务，下一新编号93。

真实开门63、独立BDS穿门72、台阶跳跃终点86已确认；床到达、个人重生点、睡眠仍未通过。版本10新增已观察床目标的有界意图保存，原始动作/墙体/未知/危险/STOP/FOLLOW/BDS门禁不变，后续需要原批准客户端正常加载及独立实机验收。本轮约70%预算已到，仅收取已启动测试和交接，不再开发部署。自动接续继续PAUSED。

## 2026-11-04 — 版本10准入测试语义更新，生产暂保持版本9

91完整Mint为1012项、1011通过、1失败：旧实心墙测试期待连目标也拒绝保存。现改为有界目标意图可保存，随后注入真实chooseAdjacentMovement验证新鲜证据到达后墙体仍拒绝动作，steps/interactions均0，未用假成功覆盖旧安全断言。全量复验待下一回执；版本10未加载，生产仍PID1826633/version9，90最后89请求已明确rejected，无新床命令。用户本轮70%额度预算接近收尾，不为部署强行消耗保留额度。

## 2026-11-04 — 已观察床目标与行动准入分离（版本10待验收）

90确认版本9的89请求3c219128a38e487c9ee94cf0352ab3b8已rejected/bed_needs_verified_approach，未行动、不得重放。初始接近规划可能在新鲜BDS原点到达前没有可执行路线，过去因此连目标意图都不保存。版本10只允许为已加载、未占用、16格内床保存有界目标；没有路线不等于获准行动。resumeBed仍必须等待原4s/.75当前生命BDS双样本，再重算路线、逐格检查和独立终点；实体墙、未知形状、安全/STOP/FOLLOW仍拒绝。新增完整墙体场景验证只保存意图、0动作；没有创造路径或放开门禁。当前PID1826633仍版本9，完整测试和加载待回执。

## 2026-11-04 — 版本9已加载，89为当前唯一新验收请求

85通过Mint1011/1011、Mac337（3skip）；原批准87完成PID1818511→1826633，88读回版本9。86此前已独立确认一格跳跃终点，不是只发输入。89仅提交一次set_spawnpoint，commandId=3c219128a38e487c9ee94cf0352ab3b8，运行时结果待查；旧bcb…已failed，不重放。后续只查当前请求与逐格终点，当前床/个人重生点/睡眠仍未完整验收。检查点已重写，旧额度自动恢复与旧PID说明不再适用。

## 2026-11-04 — 实机复现床阶段丢失；按新鲜BDS原点重算阶段（版本9待测）

76通过Mint1007/1007、Mac337（3 skip），原批准77加载PID1818511/version8。新79 set_spawnpoint commandId=bcb05070d9e74de69e778d94c6c09288在84明确failed/bed_door_route_no_longer_observed；不重发。84同时显示原自主流程已发出一格跳跃、pending独立终点（bed_jump_waiting_for_new_independent_endpoint），尚未确认跳跃成功，不能重载来冒充其成功。

测试先复现：已过门后仍固定stage=door，即使当前床前有合法下一步、无门需要打开，也直接拒绝旧门不可见。现在先结算旧床步独立终点，再在同一新鲜BDS原点为同一床重算interact/approach/door；任何pending床/门终点都先等待。目标、owner/session/life、15分钟意图/240秒物理终点、24阶段/90分钟、STOP/FOLLOW/危险与BDS门禁均不变。新增穿门后接续、pending禁止额外移动、已验证步先结算、缺证据不重算测试，未增加输入或查询。当前进程仍版本8。

## 2026-11-04 — 顶棚轨迹真实物理测试通过，修正回归拒绝原因兼容

sync75实际执行Mint1007项，1006通过、1失败；新增真实固定Physics三项全部通过，失败为旧adjacent_motion_decision夹具（无速度/registry）期待原headroom拒绝原因。该夹具仍未获跳跃许可，只是错误分类变成no_observed_landing。现保留原headroom未验证原因，不修改旧断言或扩大许可；需新完整sync验证。未加载版本8，生产仍PID1804956/version7。

## 2026-11-04 — 穿门已获BDS确认；带顶棚单格跳跃轨迹预检（版本8待测）

版本7的只读72实证door_crossing_new_independent_bds_confirmed/serverMovementVerified=true；不是本地路径结果。原10597…请求73明确rejected/bed_route_requires_door，未重发；实际穿门由原自主门流程完成。74当前地形显示门在身后、床约7.8格且高1格，近侧屋顶在脚下+3，向床一侧有完整方块台阶。

跳跃代码原注释三格净空、实现却读取0..3四格；真实Vec3在执行器对象展开后还丢失offset/clone。版本8保留原开放净空路径，只有第四格是已知完整顶棚时，额外用当前固定Physics/PlayerState在克隆状态上做20tick/最多120方块的离线碰撞预检，必须预测单格落地且不越窄走廊；未知/危险/低顶/半块顶仍拒绝。不apply、不事件、不改活体属性/控制、不发包或更改世界，不替代BDS新终点。位置与初始速度用clone保留，避免空中复查丢Vec3或借用当前空中速度。

10项本地跳跃通过；真实固定Physics的顶棚/低顶/Vec3三项必须Mint执行，尚未加载。仍需逐项床到达、个人床服务端确认、真实睡眠验收。当前PID1804956仍版本7。物理源码依据固定依赖：https://github.com/Pix3lPirat3/prismarine-physics/blob/e6181bf79c19db3eafc8a589e984f7ba623556f6/index.js 。

## 2026-11-04 — 版本7已加载，保留独立床确认与睡眠布尔回执

火把通行源码e94d283经sync66通过Mint1003/1003（含真实库torch空碰撞验证）、Mac336；原批准restart68完成PID1797241→1804956，只读69确认版本7，原ac288…请求已failed/bed_request_expired，未重发。新版本一次性set_spawnpoint验收70的commandId=10597f8f1f894d558a01895f901789e1，仅发一次，后续只读。71为有界210秒观察，不发BDS查询。

原只读床日志汇总补充spawnConfirmed/sleepEntered/woke三个严格布尔字段，不输出床坐标、原始消息或身份；避免短暂入睡后醒来无法读到历史事实。这是Mac读回增强，不改运行时代码、不需要重载。4项匿名/伪造/长度回归通过。床与睡眠尚待当前真实回执。

## 2026-11-04 — 真实开门已通过；火把碰撞通行修复待加载（版本7）

sync57通过Mint1002/1002（0 skip，含真实注册表/Chunk往返）、Mac336；原批准restart58完成PID1513191→1797241，只读59确认版本6。新sleep请求60的commandId=ac28889a8cc5430f8c3e9d1daa0804ee，61/65仍started，禁止重发。只读63实证一次交易runtimeId4142737989/localStateId7871，随后door_open_observed_exit_unverified；哈希交互修复已取得真实开门证据，但跨门返回crossing_opposite_side_blocked_or_unknown，尚未到床/设置重生点/睡眠。

只读64在当前近侧格头部观察到torch，knownAir白名单此前明确拒绝torch，因此即使门已开仍会否决近侧净空。版本7只允许已知安全火把且boundingBox=empty、shapes=[]；未知/缺形状/实心/危险仍拒绝，不改方块或几何。新增本格火把通过、未知/实心/火焰拒绝和实际Mint库torch空碰撞验证。完整回归与原批准必要加载后待独立跨门/床验收，先核对原60终态。

## 2026-11-04 — 原生门/床交互哈希ID兼容（版本6，待实机）

实际源码56确认：区块解码将哈希runtimeId转换为顺序stateId；注册表通过Block.getHash建立哈希→stateId映射，而interact.js把本地stateId直接写入交易block_runtime_id。只读55已有实际交易7871，构成发送标识错误的证据链。新增公开activateBlock边界适配，仅限已观察木门/床，复用实际安装prismarine-block的getHash，必须在在线registry.blocksByRuntimeId精确反查同一stateId；未知模式/不匹配即拒绝。网络使用uint32位模式，不改世界Block、包结构、registry、背包或安全规则，不增加一次调用的发送次数。非哈希模式与其他交互保持原API。

bedLogicVersion=6、typed验收入口要求6；现PID1513191仍版本5。新增伪造/缺映射、this/返回/目标不变、关闭恢复和实际Mint库+Chunk往返测试。源码/测试不是开门或睡觉成功；全量sync与原批准加载后须重新独立验收。

## 2026-11-04 — 恢复本轮床修复，额度预算70%

用户确认尚未交接其他AI，授权继续使用本轮约70%额度，剩余约30%前收尾。只读55确认PID1513191仍在线/HP20；日志已有bed_step_new_independent_endpoint_confirmed，但个人床仍not_verified。已有click_block的blockRuntimeId/localStateId=7871，服务器哈希模式开启；仍需核对在线映射，不能由此断定根因。扩展原只读依赖审计覆盖包根JS与大小写Hashed helper；仅读公共源码，无点击/游戏查询/模型。

## 2026-11-04 — 额度交接：仍未完成，在线方块映射待核实

运行PID1513191/version5，最后加载638e31f；sync50为Mint996/996、Mac334（3 skip）。床、个人重生点、睡眠均未通过实机验收。代码/只读审计已推送a891c26，接手详见BED_REPAIR_CHECKPOINT_20261104.md，该文已替换过期运行状态与额度自动恢复规则。

只读54发现在线注册表handleStartGame会按哈希模式调用loadHashedRuntimeIds，故53离线顺序stateId不能证明交易ID错误。下一步有界检查helper、初始化调用和world/chunk/blockAt转换链；禁止猜哈希或反复点击。54已passed，无已知在途任务，下一新后缀55。旧typed睡眠1bb…已在46明确expired，不重发。用户将交给其他AI，交接后暂停alice-2，不在下轮额度自动争抢开发；旧网页监督继续暂停。

## 2026-11-04 — 已安装注册表使用顺序stateId，继续核对映射

只读53成功加载实际bedrock_1.26.51注册表：spruce_door状态范围7870～7901，blockStates条目仅name/states/version，无network_id字段。结合52的真实blockNetworkIdsHashed=true与实际interact.js直接写referenceBlock.stateId，构成网络ID语义不一致的强线索，尚未证明实际bot.blockAt返回ID或某个中间层没有转换。因此禁止直接猜哈希算法或声称根因已经解决。

现将同一只读源码审计限缩至已安装prismarine-chunk/block/registry的映射函数片段（最多7文件/14KB，拒绝外链及大文件），供核对已有运行时映射，不读取账号/世界/玩家资料，也不点击门或更改协议。

## 2026-11-04 — 实际自身角色member，服务端启用哈希方块ID

源码638e31f经sync50通过Mint996/996、Mac334 skip3，原批准restart51完成PID1507358→1513191。只读52确认source=start_game_self、role=member、blockNetworkIdsHashed=true、authoritativeInventory=true，sneaking=false/usingItem=false；door单独权限位仍未知，不推断为允许或拒绝。当前没有新点击（blockClicksSerialized=0），个人床仍not_verified；没有为采集数据重发旧床请求。

接下来先只读离线安装注册表spruce_door的顺序状态ID/可能network_id字段和注册表API键，比较真实服务器的哈希模式与原生activateBlock使用stateId的逻辑。离线结果只证明库的数据结构，不是当前游戏方块状态或交互成功。该检查不创建游戏客户端、不查询BDS、不读玩家/身份文件、不改注册表、包或权限。

## 2026-11-04 — 自身权限来源继续分辨

只读49确认观察器已加载在PID1507358（原批准restart48成功），但未取得匹配自身ID的update_abilities；其role=unknown是缺证据，不是权限被拒。对照公开协议，start_game.permission_level本身就是该登录玩家角色。补充读取此初始自身字段（source=start_game_self）及原始block_network_ids_are_hashes/server_authoritative_inventory布尔标志；对实际已有click_block仅记录公开方块ID、客户端状态ID与注册表network_id，避免猜测新版本网络ID映射是否一致。仍只观察，不改包/不申请权限/不增加点击。Node30项通过，完整测试与加载待回执。原1bb…命令在46已明确failed/bed_request_expired，不重做。

协议参考：https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/latest/proto.yml （只用于字段语义；实际使用已安装协议编解码，不升级服务端或依赖）。

## 2026-11-04 — 原服默认member；增加只读自身交互诊断

固定只读45确认原17879/Bedrock level的默认角色member、gamemode=survival。这不能证明Alice当前实际角色；实际安装abilities.js接受update_abilities且未按玩家ID筛选，不能直接把bot.abilities认作自身权限。新增被动interaction_audit：仅接受与自己start_game唯一ID精确匹配的权限包，输出匿名角色和门/容器布尔权限；未知不冒充允许。记录已有click_block成功序列化计数、错误计数及面/槽位匹配/空手/堆栈标记/本地眼睛位置一致性等有限诊断。queue包装保持原this、参数、返回值和异常，不增加发送或修改包；明确queueOnlyNotNetworkProof，不把序列化当服务器执行。只读床回执保留这些诊断，日志仅识别真实行首标记。

此提交只增加观测，不改变门、床、权限或安全策略，不发送测试指令。Node29项观察器/4KiB回归通过；完整Mac/Mint与必要加载待回执。此前1bb226cf…睡眠验收只发一次，后续只查该回执，不为采集诊断反复点击。

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

## 2026-11-04 — 待加载：压缩心跳保留显式床意图

已复核真实回执20：work_cooldown、needs_two_fresh_samples、positionGateSatisfied=false；床指令仍为原f482…且已expired。源码确认pendingBedRequest会提前暂停普通自主准入，而定时器没有专门的显式床需求分支；4KiB压缩还会丢掉bedRequest，导致无法从只读状态判断等待阶段。先修复诊断：每一层压缩均保留有界action/stage/steps/expiresAt及serverMovementVerified=false，不带目标坐标、原始消息或移动权限。本地心跳27/27通过；尚未在Mint全量验收或加载，运行PID1380268仍旧诊断实现。下一步在保留40/h、180秒、10分钟退避、STOP/FOLLOW/危险/生命owner检查的前提下，设计独立明确的床取证需求；不能直接开放work_cooldown或延长BDS样本有效期。

## 2026-11-04 — 床版本3实机结果与未完成阻塞

源码 `384b444` 已通过 Mint Node24 984/984、Mac Python326项（3 skip、其余通过）。已通过原批准的 Alice-only lifecycle 加载：PID1380268，bedLogicVersion=3，owner/心跳/游戏连接/会话确认；未重启BDS或修改世界。

版本2请求被 `bed_route_requires_door` 明确拒绝。版本3真实请求 commandId `f4827b1e503b48c4a20da8b5be2346a9` 曾 started/awaiting_bds_bed_approach，但只读回执17确认已 failed/bed_request_expired。有限观察16（210秒/835读）没有新鲜独立BDS窗口；床步骤最近原因是 jump_origin_support_or_headroom_unverified，该字段可能是旧尝试，不能替代当前门阶段回执。个人床仍not_verified，isSleeping=false。**床到达、重生点和睡眠均未通过实机验收，禁止重发该请求或宣布已修复。**

只读回执19确认定时器active/enabled、owner有效、预算22/40、无退避、lastBatchAge168.4秒、lastServiceResult=cooldown_or_budget、检查时demandNow=false（床请求此时已过期，不能反推它当时的需求）。待查：显式床意图被普通自主准入暂停后，是否仍能进入取证定时器；bedRequest在4KiB压缩中缺失；初始240秒意图期限与自然冷却/退避是否冲突。以上仍是待核实路径，不是已证实根因。

本次仅增强既有只读bed_state输出：idleGate、witnessDemandState、positionGateSatisfied及门/穿越原因，匿名枚举过滤保留；不提交命令、不触发BDS查询、不修改运行时策略。5项专项测试通过。最新MCP任务历史达到500，经现有Web控制台正式归档399条已结束回执、保留100条近期记录，历史/报告保留，无执行任务、无服务重启。

## 2026-11-04 — 有限床指令与实际回执

固定动作使用已有 localhost 控制台和运行时 typed bed reader：`alice_bed_set_spawnpoint_once.json`、`alice_bed_sleep_once.json`，要求已加载bedLogicVersion3、原世界17879和健康IDLE。不发送BDS OP命令、不重载。`alice_bed_command_status_readonly.json`只读取现有commandId/status/reason和当前床状态。提交超时只能查询原commandId，不换operation_id重发；queued/started不是设置重生点或入睡成功。每步独立BDS证明、STOP/危险抢占不变；床请求总限90分钟/24格，每次实际输入重计240秒终点期限。

## 2026-11-04 — 床流程版本与实机验收

`alice-17879-bed-readonly.py --inspect OUTPUT_DIR` / `.openclaw/tasks/alice_17879_bed_readonly.json` 只读取原17879当前owner和新鲜心跳，不触发querytarget、输入、重载或世界写入。检查 `bedLogicVersion=1` 后，仍要分别读取个人床服务器确认、睡眠状态和接近的独立BDS终点；只有文件mtime不证明加载。原`alice-mac.sh sync`和`.openclaw/tasks/alice_mint_nonrestart_sync.json`不重启客户端，完整Mint Node24通过后才可在明确用户授权和平台审核下使用原已批准`alice_17879_client_restart.json`，不得换名重放历史被拒操作。

## 2026-11-02 — Diagnose the accepted-witness handoff without another reload

The existing alice_model_navigation_log_readonly_20261101 task now reports fixed witness idle-handoff outcomes, mirror-deferral reasons and prepared-route start counts from the current owner’s bounded existing log tail, plus up to five private acceptance journal segments filtered after the verified process/login/life start. Run once at its exact committed SHA through MCP/current and read model_nav; no model, BDS query, remote script install or client/BDS restart. Last logged outcomes are historical within that process tail, not instantaneous state. Keep4s/.75 navigation and1000ms diagnostic criteria distinct; see [review and commands](COORDINATE_EVIDENCE_REVIEW_20261102.md).

## 2026-11-02 — Activity-qualified mirror rollout and observer clock

The new stationary activity guard is runtime code and needs an authorized normal Alice-only lifecycle after sync/tests. Read `activityGuardVersion`:1 identifies the new input timeline marker; older replay counters with a null marker do not establish this patch loaded. The version marker is feature telemetry, not a cryptographic source hash or independent BDS acceptance. Do not replay a prior platform-rejected reload or consume an old intent again.

Both samples used for idle/respawn mirroring must now be later than queued motion inputs and applied authoritative position updates. No query, sample renewal, navigation bypass, BDS restart or world change was added. Fresh witness callbacks publish status before any newly authorized activity; original witness timestamps/4s TTL remain intact. The read-only observer validates file freshness against its post-read clock, preserving strict rejection of genuinely future-dated files. Its fixed `snapshotFailure` distinguishes failed provenance/freshness reads without printing paths or raw error text. The earlier observation12 remains inconclusive, never a pass.

## 2026-11-02 — Finite current-owner synchronization observation

After a normal client lifecycle, use `.openclaw/tasks/alice_reconcile_finite_observation.json` with the exact full committed SHA, `repository_task`, `workspace_mode=current` and a fresh observation operation ID. It calls maintained `scripts/alice-reconcile-watch-readonly.py` and Node `bedrock-native/experiment/scripts/watch_reconciliation_runtime.cjs`. It observes EXISTING files for at most210s at250ms intervals; no BDS query, timer change, gameplay input, process signal or model. Poll the same operation receipt; fetch its declared `finite_observation` artifact when finished. Do not resubmit an uncertain job.

The observer pins one owner PID/birth-token for the entire observation, requires a connected17879 session and the existing strict private-file provenance, and stops on owner/session/snapshot failure. It records at most six qualified sample windows with relative min/max distances, BDS pair displacement, idle/input flags and first/last replay counters. `fresh_relative_samples_observed` only means such samples were captured; inspect their distances and scope, never treat outer task pass as synchronization or navigation success. No fresh sample means unknown. Respect the original180s cadence,40/h budget and stationary backoff; do not manually force an extra pair to make this collector pass.

## 2026-11-02 — Read coordinate evidence before judging drift

The existing `alice_reconcile_live_runtime_readonly_20261102.json` task remains read-only. `clientBdsDistance=null` now means no qualified current comparison; read `coordinateComparison`, `bdsSampleAgeMs` and `comparisonSkewMs`. Both BDS samples must be current-life/fresh and the current position timestamp must be fresh and within1000ms of the latest sample. `fresh_relative_sample` is still not exact input-tick equality. Never substitute a historical subtraction (including1.503 or2.78) for fresh acceptance. The4s/0.75 navigation gate is unchanged.

Read-only normal-lifecycle preflight was checked successfully, but it does not grant a platform exception. Keep all original owner/logout/health/world checks. Do not replay the previously platform-rejected reload through a different tool/task/ID; obtain normal client lifecycle loading through the permitted operator process before asserting live acceptance. BDS, world and query budget remain untouched.

## 2026-11-02 — Movement reconciliation deployment boundary

The input plugin now retains bounded historical physics states; see [MOVEMENT_RECONCILIATION](MOVEMENT_RECONCILIATION.md). Reuse the maintained `alice-mac.sh sync` for tracked source copy with backups and full Mint Node24 tests. This does **not** restart Alice, open another Xbox client, query MCSManager, or change BDS/world state. A successful sync is not proof that the running process loaded the module.

Do not replay a previously blocked or consumed client reload. Use only an authorized normal lifecycle through the maintained operator path. After that lifecycle, the existing owner-verified `bedrock-native/experiment/scripts/inspect_movement_sync.cjs` includes replay/fallback/rejection counters from the optional private outbound audit (when input audit is enabled). Counters alone do not establish server movement; fresh independent BDS evidence and current-session provenance remain mandatory. No new query timer, budget increase, forced movement or BDS restart is needed for source regression.

## 2026-11-02 — 原17879 BDS有限见证节奏：MCP实机恢复长期预算可持续性

- 问题复现：`alice_timer_live_budget_20261102_s02` 读原Mint真实user systemd + 0600 budget：timer active/enabled，Alice owner/心跳有效、需求true，`used=40/40`，`stalledPairs=0`、`pauseRemaining=0`、最后`cooldown_or_budget`。**根因是原1分钟两条查询很快耗尽整小时40条预算**，不是停止运行或10分钟空转退避。不能删除账本或绕过预算。
- 已提交`535ce9771414bb3fc62da9ef7c7322880cacfeb0`：每批真实querytarget双样本必须间隔至少180秒，继续保持每批≤2、每小时≤40、原健康心跳、私有ACK、owner/port/world绑定和危险STOP/FOLLOW检查。每小时跨界仅重置本小时`used`，保留previous `lastBatch`与同生命`stalledPairs/pauseUntil`，不允许重置休眠保护来索取更多命令。
- 新固定只读任务 `.openclaw/tasks/alice_bds_demand_state_readonly_20261102.json`/脚本`alice-bds-demand-state-readonly-20261102.py` 可经 OpenClaw `repository_task` 在现有Mac `workspace_mode=current` 下执行，输出`demand_state`报告（固定布尔、有限计数、没有坐标或秘密，不查询BDS，不重启）。MCP现场 `alice_timer_live_budget_20261102_s02`、同步后`alice_timer_after_sync_live_20261102_s05` 均 PASS。
- Mac完整 `alice_timer_budget_regression_mac_20261102_s03` Python299（3skip）PASS，Mint非重启 `alice_timer_budget_mint_sync_20261102_s04` Node24 754/754及Mac299 PASS；源已同步到Mint，不重启BDS/Alice，不改世界，不发console命令。
- 此刻原配额仍`40/40`，**不能立刻获新的合法见证**。等待原系统小时自然重置后新timer自动按180秒间隔运行，再读相同现场报告确认`budgetUsed`合理增长、`stalledPairs`是否出现、4秒双样本是否被Alice ACK、是否产生BDS真实位移。这一方案只解决长期预算断流，**不等于床/任务目标/物理移动已经成功**。不得强制调闹钟、手工清空ledger、手工重试`--once`，更不得复用已被平台安全拦截的client-only reload方案。

## 2026-11-02 — 已验收的模型SCOUT入场假成功修复（不触发重启）

- 修复 `src/runtime.cjs` 中 Ollama `scout_safe` 提案与 `startJob('EXPLORE')` 不同步：新提交 `44ce213fe976ff824d2fef5c73c0519892cf8727` 在同步拒绝BDS起点时不再将无真实job的提案记录成`model_handled`，而是固定`model_blocked`及`scout_start_position_unverified`或`scout_job_not_admitted`。无额外模型发问/查询/路径/服务器命令；仍遵守4秒双样本和0.75格入场限制。
- 真实回归 `alice_p0_model_admission_mac_20261102_q05` Mac Python296（3skip），`alice_p0_model_admission_mint_20261102_q06` Mint Node24 **754/754**，新独立Node用例在`test/runtime.test.cjs`，所有测试通过。使用原维护脚本的`sync`只同步/测试，不重启Alice或BDS，不修改世界，不发送控制台指令。
- 最新独立非重启只读 `alice_p0_after_model_sync_readonly_20261102_q07` Alice仍在线，健康IDLE，样本155，4秒双样本目前expired，当时夜间策略WAIT，未证明客户端动态加载新源码。当前代码热加载未经证实，不能用Git HEAD、mtime、外层task PASS替代实机生效证据；禁止重做此前被工具安全检查拒绝的client-only重载。
- 操作员只读复核可在 Mac 现有 `~/Documents/workspace/ioant-AI-Minecraft-Alice` 运行 `bash games/minecraft-ai/scripts/alice-mac.sh status` 和 `bash games/minecraft-ai/scripts/alice-mac.sh diagnose`；此轮实际上已使用OpenClaw MCP完成，不要求用户执行。后续应在允许的自然生命周期更新后，读取原`model_nav`固定字段和服务端独立双样本，明确区分`model_blocked`/真实job创建/真正BDS位移。
- 原正式世界17879 BDS不停止、不更换，不恢复旧无限MCSManager轮询，不放宽坐标及危险保护，测试与控制台命令分离。

## 2026-11-02 — Witness idle wake canceled-event cooldown: code synced, no live restart

- 源码提交 `d8086dcee6acaa3fef1a6194bfea3620280dcdf2`：当独立 BDS 双样本请求已排队、但回调开始前过期或被现有安全工作抢占，原5秒冷却不再被一个未执行的自主决策消耗。只在重新验证4秒双样本与全部既有安全条件后、实际调用 `idleTick()` 前计入冷却。私有有限日志 `[Alice autonomy] BDS witness idle handoff:` 仅含固定 outcome 名称，不含坐标/玩家身份；不会触发额外查询或移动。
- 原有入口实测回执：Mac `alice_witness_handoff_mac_regression_20261102_m01` Python296 (3 skip)/0 fail；Mint `alice_witness_handoff_mint_node_20261102_n01` Node24 753/753 + Mac296 PASS。同步任务只调用已维护 `alice-mac.sh sync`，`aliceRestarted=false`, `bdsRestarted=false`, `worldModifiedByTask=false`, `consoleCommandSent=false`。新增针对性测试文件写入遭平台安全拦截，未落库、未计入测试数。
- 若需复核，Mac 原有工作目录执行 `bash games/minecraft-ai/scripts/alice-mac.sh status`、`bash games/minecraft-ai/scripts/alice-mac.sh diagnose`；只读审计不等于实时 Alice 加载新模块。不得用 `runtimeSourceLoadedAfterSync` 的文件时间推测作为动态加载证据。
- 真实17879世界不停止、不重启、不切换。此前安全重载操作被执行平台安全检查阻断；不可更换工具/脚本/ID绕过。只能等待标准安全的自然客户端更新或另行获准的正常部署流程，再只读检查本次新 outcome 日志、有效独立双样本和服务器真实位移。原无限 querytarget loop 继续禁用；4秒/0.75格和所有生存防护不变。

## 2026-11-02 — 继续执行：安全窗口核查与平台重载阻断（本轮实际回执）

- GitHub main 已从上一会话的 `d55bfd2e...` 正常前进12个提交至 `767836ed8f14acb5745e7a5a9b00d177d539904c`（当前本轮再添加只读diagnostic）；涵盖 **4秒内已有双样本晚到250ms客户端漂移修正**、本地镜像拒绝原因匿名日志、MCSManager成功ACK但BDS不动时10分钟退避等，保留原BDS 17879，不创建测试世界、不降低0.75格门禁/4秒TTL。第一次旧HEAD回归 `alice_idle_mirror_mac_regression_20261102_a01` 被 `remote_commit_mismatch` 安全阻止，未运行错版本。
- 最新HEAD实际 `alice_idle_mirror_latest_mac_regression_20261102_b01` Mac全量PASS；`alice_idle_mirror_latest_mint_regression_20261102_c01` PASS **Mint Node24 753/753, Mac Python296项（3 skip）**，非重启同步，`aliceRestarted=false,bdsRestarted=false,worldModifiedByTask=false,consoleCommandSent=false`。
- 实际原服只读 `alice_idle_mirror_pre_reload_reasons_20261102_d01`：同登录Alice在线fresh、独立BDS位置样本74、**本地镜像成功20次**、模型规划建议21次，最后匿名拒绝 `already_aligned`，不能将本地镜像次数当成真正服务器位移。最新`alice_idle_mirror_reload_block_gate_20261102_f01`：Alice IDLE HP20 food20、无job、autonomous、样本76、上一对BDS `independentPairTravelBlocks=0`、`movingQueued=226`、`idleHoldReason=scout_bds_position_unavailable`、当前样本expired。**未证明真正独立BDS自主位移完成**。
- 第一次尝试用户授权、原安全保护的client-only reload `alice_idle_late_drift_safe_reload_20261102_e01` 外层PASS但**内层** `preflight_blocked,unsafe_live_state,clientRestartAttempted=false`；没有重启任何进程。新增只读 predicate task `.openclaw/tasks/alice_idle_mirror_safe_window_diagnose_20261102.json` 与 `alice_idle_mirror_guard_flags_20261102_g01`：checkPassed/useRestart/PID一致/heartBeat/原世界/IDLE/HP>=16/noJob/autonomous/idleGate/mtime全部true，证明已有一个满足条件的瞬时窗口。但第二次实际尝试`alice_idle_late_drift_safe_reload_after_audit_20261102_h01`被**工具执行平台安全审核直接阻止**，无执行回执，严禁通过更换工具/脚本/operation_id绕过审核。
- 最后仅只读`alice_idle_after_block_readonly_20261102_i01` PASS：Alice仍在线、heartbeatFresh=true、原世界匹配、独立样本76，`aliceRestartedByTask=false,bdsRestarted=false`；`runtimeSourceLoadedAfterSync=true`是文件修改时间相对PID的**间接判断**，不等于证明新的250ms晚到修正实际已触发。当前不声称晚到补救功能已实际验证或Alice走到目标。
- 下一步：在获准的执行/部署流程内确认新版本运行中的真实镜像触发情况，或自然安全生命周期更新后重新验收（不重试已被平台拒绝的执行路径）；继续使用既有MCSManager只读BDS后验，要求独立服务器位置位移>0再确认真实移动。旧无限loop仍禁用，原17879 BDS不停止、不改世界。

## 2026-11-01 — 同一BDS双样本延迟本地对齐：重新核对实际加载

- `alice_idle_late_drift_client_reload_20261101_s10` 外层task PASS但**内层** `preflight_blocked,unsafe_live_state,clientRestartAttempted=false`，绝非实际加载。紧接只读`alice_idle_late_drift_block_reason_20261101_s11`：Alice原17879在线、IDLE、HP20、food20、无job，旧BDS 4个样本已expired；`alice_idle_late_drift_health_readonly_20261101_s12`：当前PID heartbeatFresh=true、但`runtimeSourceLoadedAfterSync=false`，运行中尚未加载最新250ms延迟漂移补救代码。
- 唯一新`.openclaw/tasks/alice_idle_late_drift_safe_window_20261101.json`使用全新私有`alice-idle-late-drift-safe-window-20261101.intent`，仍必须Operator check通过 +唯一当前PID +heartbeat新鲜 +相同原17879世界、自治健康IDLE无任务/安全idleGate，才允许一次Alice-client-only restart；任何COMBAT、健康下降、主体变更即阻断，不重启BDS、不改世界、不复用s10已消费操作。事后必须读**内层**结果和新PID/heartbeat，不凭外层pass自称上线。
- 此前Mac Python296(3skip)、Mint Node24 753/753零失败，镜像候选仍只在当前生命独立两份BDS<4秒且静止时做≤3格本地镜像；0.75格及全部安全门禁没有更改。

## 2026-11-01 — 同一4秒BDS双样本内迟到客户端偏差：安全重载新代码

- `main.cjs`和`verified_idle_position_mirror.test.cjs`已修改：保留完全相同4秒/0.75格双BDS见证、当前生命/静止/安全IDLE/HP>=16等门禁；每250ms被动观察器若没有读到新独立sample，只对**已有尚在4秒内的独立双样本**复核有无迟到的客户端物理预测漂移。仅调用原`reconcileVerifiedIdleMirror`，不创建sample/ACK、不执行MCSManager `querytarget`、不发送Minecraft包/服务端命令、不续期证据；成功原来日志字段不变，失败不在250ms日志刷屏。
- 实机契机：`alice_idle_mirror_reason_live_audit_20261101_s06`：原17879当前Alice在线且当前登录独立样本4，`deferredEvents=4,lastDeferredReason=already_aligned,lastDeferredState=IDLE`，说明首次样本到达时对齐，但随后离开原0.75格容差；原事件驱动回调不会检查到达之后的漂移。
- 真实测试 `alice_idle_late_drift_mac_regression_20261101_s07` Mac Python296（skip3）PASS。第一次Mint Node24 750/753失败：三个静态回归断言期待旧版逐字`if(poll())onFresh()`、以及镜像直接写在onFresh函数内部；已更正断言为验证新共享函数且镜像检查发生在ACK、探测、床动作之前，不放松原门禁。第二次`alice_idle_late_drift_mint_fixed_20261101_s09` **Node24 753/753**，Mac296 PASS、原BDS/Alice均未重启。
- 唯一新私有一次性intent `alice-idle-late-drift-client-reload-20261101.intent` 只在现有`alice-mint.py check` preflight通过且当前客户端为健康`IDLE`、同PID同世界、无任务和COMBAT时进行**唯一Alice客户端**更换。真实BDS不操作，旧重启intent不重放。加载后必须再验证真实镜像次数和BDS后验位移，不能宣称本地修正等于真实行走。

## 2026-11-01 — 本地mirror有限拒绝原因诊断：只更换健康IDLE Alice客户端

- 原Alice最新代码 `main.cjs` 增加只有真正被BDS独立见证读取器接纳才触发的mirror拒绝固定原因/有限状态日志，reason变化或>=15秒才写，完全不携带玩家坐标/身份/凭证、不发送BDS命令、不放松门禁。Mac `alice_idle_mirror_reason_mac_regression_20261101_s02` PASS Python296（skip3）；Mint `alice_idle_mirror_reason_mint_regression_20261101_s03` PASS Node24 **751/751**、Mac296，非重启同步PASS（BDS/Alice未重启，世界未修改）。
- 新唯一`alice-idle-mirror-reason-client-reload-20261101.py` + `.openclaw/tasks/alice_idle_mirror_reason_client_reload_20261101.json` 仅原17879 Alice进程、`alice-mint.py check`明确preflight passed +唯一旧PID、当前原世界同PID fresh状态 `IDLE` HP>=16、autonomous、无工作、安全idleGate时才使用**全新单次私有intent**执行`alice-mint.py restart`。不重启BDS、不改世界、不重放原`alice_verified_idle_mirror_client_reload`旧intent，不在战斗/睡眠/低血量中操作。
- 日志实际验收需后续自然MCSManager 250ms真实样本，再只读统计固定拒绝原因（至少有两份当前生命4秒内BDS证据时）；若安全预检不允许则放弃此次reload而不强制进程替换。

## 2026-11-01 — 本地镜像上线后验、MCSManager零进展退避与可观测性

- 原17879 Alice客户端**已真实受控重载新镜像代码**：最早尝试`alice_idle_mirror_guarded_client_reload_20261101_rc01`因Alice处于COMBAT/threat_nearby，内层明确`preflight_blocked,clientRestartAttempted=false`；后续只读`alice_idle_mirror_safety_window_readonly_20261101_re01`确认恢复健康IDLE HP20、food20、无当前任务，`alice_idle_mirror_client_reload_safe_20261101_rf01`内层`state=client_reconnected_17879`、新进程身份心跳/登录全验证，BDS未重启、其它服务器与世界完全未触碰。后续读`alice_idle_mirror_postrestart_gate_20261101_rg01` IDLE HP20、零独立BDS新登录样本；`alice_idle_mirror_postrestart_log_20261101_ri01` 现登录未记录mirror或位移。
- 新版本地`verified_idle_position_mirror.cjs`已加载；只用当期生命周期4秒内两份静止BDS见证、客户端偏差(0.75,3]格、生命值>=16、无威胁/FOLLOW/STOP/任务/冷却的IDLE状态；本地坐标修正**绝不修改BDS**，且不降低导航起点0.75格检查。当前**尚无新登录样本触发镜像的实机证据**，不能写“已走到目标”。
- `alice_idle_mirror_timer_live_audit_20261101_rj01`真实检查：原MCSM用户timer`active=true/enabled=true`、旧loop未启用、当前需求needs_two_fresh_samples，但该小时预算**39/40**，新批次固定需要至少2次，因此`cooldown_or_budget`，不合法绕过总量；下一整点小时重新开始有额度时由timer自然处理，**不强制补发querytarget**。
- 针对该小时前40次仍无真实位移的空转，新增MCSManager按需查询`refresh_stall_state/record_verified_stationary_pair`：同一登录连续3批次已有**Alice真正ACK的对齐证明**而原BDS累计里程始终差<0.25格，则自动暂停请求10分钟；观察到BDS累计位移增加>=0.25格或新登录就解除；仍<=2条/批、<=40条/小时、每批>=55秒，原脚本每分钟只检查真实需求，旧无穷`--loop`禁止；任何无效模型/HTTP查询应答不作为BDS认可移动。
- 为便于后续**真实**验收，扩充`scripts/alice-model-navigation-log-readonly.py`匿名审计：`idleMirrorCount`、`respawnMirrorCount`、`lastIdleMirrorDistance`，只从本进程私有operator日志取有限计数与上限3格的镜像量，不读取/导出真实坐标、模型内容或认证。后续需确认`idleMirrorCount>0`及同生命周期BDS`independentPairTravelBlocks>0`，二者属于不同验证：镜像不是服务器真实行走证据。
- 本轮新增回归 `alice_idle_mirror_stall_guard_mac_20261101_rk01` Mac Python **296项、3 skip、0 fail**，`alice_idle_mirror_stall_guard_mint_20261101_rl01` Node24 **750/750**、Mac296，通过且不重启BDS/Alice；`alice_idle_mirror_observability_mac_20261101_rm01`同样Python296通过，`alice_idle_mirror_observability_mint_20261101_rn01` Mint Node24 **750/750**，Mac296，已同步原Mint新脚本，不启动新世界。自动timer下次运行读取更新Python脚本，无需重启任何MC进程。

## 2026-11-01 — Alice Ollama 模型服务恢复（原17879/不动BDS）

- 项目OpenClaw上一次handoff revision33，仓库原HEAD `94fb4b61...`；用户要求继续`model_unavailable`和真实自主移动。最先只读`alice_model_preflight_gate_20261101_ca01`：原Alice在线，但当前HP**2**、SURVIVE、独立BDS位置为`prior_life_witness`，安全低血量门禁阻止探索是正确行为，不能降低HP与移动保护。
- `alice_model_endpoint_live_readonly_20261101_cb01` 实际只读：Alice配置`ALICE_OLLAMA_MODEL=granite4:3b`、`ALICE_OLLAMA_JSON_MODE=strict`、`ALICE_OLLAMA_TIMEOUT_MS=12000`，endpoint是**Mint本机loopback**，GET /api/tags 无法连接；已有私有当前进程日志 **9次 Ollama plan unavailable、0成功**，根因之一为Mac模型没有网络桥接，不是必须升级Minecraft/BDS。
- `alice_model_bridge_preflight_20261101_cc01`：Mac本机Ollama `127.0.0.1:11435` HTTP GET成功且确认`granite4:3b`与`gemma4:26b-a4b`都在（9个已安装模型）；Mint的127.0.0.1:11435端口空闲。安装代码`scripts/alice-ollama-ssh-bridge.py`仅创建 Mac 用户LaunchAgent `com.ioant.alice.ollama-reverse-ssh`，通过私有现有SSH认证执行`ssh -N -T -R 127.0.0.1:11435:127.0.0.1:11435 tedz@192.168.0.104`；本机两端loopback、不把Ollama开放到LAN或Tailnet、不在仓库存储API密钥；LaunchAgent KeepAlive，SSH断线后节流重连，远端端口冲突/模型未就绪则回滚仅该新增服务，绝不改已有Gateway/ClashX/BDS/MCSM。
- **真实安装** `alice_model_ssh_bridge_install_20261101_cd01` PASS `installed_verified,macOllamaReady=true,mintBridgeVerified=true,launchAgentInstalled=true,launchAgentEnabled=true,bdsRestarted=false,aliceRestarted=false,worldModified=false`；Mint直接从自己的127.0.0.1:11435 GET /api/tags确认了原配置模型存在。
- **单次真实模型推理** `alice_model_real_goal_smoke_20261101_ce01`：Mint通过桥向Mac Ollama发一次等效配置的`granite4:3b`严格JSON高层建议（无游戏命令），`status=valid_json_goal,httpCode=200,elapsedMs=1795,completedUnderConfiguredTimeout=true`，证明12秒内可调用且JSON格式兼容。
- 原世界后续被动只读`alice_model_home_survival_20261101_cf01` Alice HP5/night/有threat，`alice_model_lowhealth_gate_20261101_cg01` HP15、food20、COMBAT/post_threat_window，证明正有生存行为和安全拦截，**并未证明已成功逃离、移动到目标或实际BDS位移**。模型接通不能强行覆盖SURVIVE/COMBAT、STOP、低血量门禁。最新 `alice_model_postbridge_runtime_20261101_ch01` Alice存活、loopback模型GET通、但战斗状态下未记录新的主动模型规划成功；等安全条件成立才调用高层目标模型。
- Mac受控SSH隧道关闭：`launchctl bootout gui/$(id -u)/com.ioant.alice.ollama-reverse-ssh`，永久停用需再删除`~/Library/LaunchAgents/com.ioant.alice.ollama-reverse-ssh.plist`（先bootout再由用户决定）；不能动原OpenClaw Gateway LaunchAgent。原BDS17879/其它世界未重启。
- 当前目标仍是用户要求的真实后验：在Alice安全恢复至HP>=16、无威胁、能进入IDLE后，检查真实model proposals / guarded SCOUT，以及BDS独立位移。任何模型单次smoke或控制台移动输入计数不能冒充路径成功。

## 2026-11-01 — 最终实机验收：新鲜MCSManager自动位置见证已恢复，自主路径仍待单独修复

- `alice_mcsm_timer_resume_after_heartbeat_20261101_bt01` PASS 原17879 owner + 5s内心跳、MCSManager绑定、timer active/enabled、legacy loop inactive；没有重启BDS/世界或向控制台直接下命令。
- **真实自动调度效果**：`alice_mcsm_timer_final_live_consistency_20261101_bv01` PASS：`clientConnected=true`、`statusAgeBand=within4s`、`statusSampleCount=2`与`ackSampleCount=2`一致，`ackSameSession=true`、`ackGateAtWrite=true`、`ackAgeBand=within90s`、`budgetUsedHour=14`、`budgetLastBatchAgeBand=within90s`，最近`journalctl --user -u alice-bds-demand.service` 结果`position_pair_verified`。在同一个实际新登录里，实时BDS独立采样与心跳已一致。
- **导航后验** `alice_mcsm_timer_final_movement_readonly_20261101_bw01`：Alice仍连原服、autonomous、IDLE、HP20 food16、独立样本增至**4**，`movingQueued=6`，`independentPairTravelBlocks=0`、当前样本过4秒后`expired_witness`，`idleHoldReason=model_unavailable`、`worldRoutineIdleGate=work_cooldown`、`lastDecisionAction=WORK`、`lastDecisionReason=site_not_rejected`。**证明位置见证链路恢复，不证明自主路径、床设置或真正BDS位移完成**。继续应从实际`model_unavailable`、模型连接/任务队列与原导航冷却/实体保护分析，勿再重复建设新BDS/观察者。
- 当前有效安全策略：用户级`alice-bds-demand.timer`启用，每约60秒**检查**是否存在安全的自主导航需求；每次<=2个`querytarget`、每小时<=40、批间隔>=55秒，只有本进程`status.json` mtime+updatedAt<=10秒且心跳新鲜、owner/世界/实例确认才可能查询，过期直接拒绝；原`--loop`永久禁用，不降低双样本4秒与0.75m对齐、不强制移动。关闭：`systemctl --user disable --now alice-bds-demand.timer`。本轮原BDS17879未停止/重启，其它服务器与世界未触碰。
- 最终代码/文档以本提交为准，GitHub `hedydev/ioant-AI-Minecraft-Alice` main。OpenClaw上一条handoff revision32，后续保存新revision并在新会话resume；不要重放已完成的one-shot现场任务或Alice客户端重启。

## 2026-11-01 — 原17879 MCSManager自动位置见证恢复：真实验收回执

- **根因已确证**：`status.json`久未更新（>5min，旧`independentSamples=6`），同一进程最新250ms private ACK 已`independentSamples=12`且有<90秒的独立BDS样本和`positionGateSatisfied=true`。原用户级按需timer以owner PID但陈旧status作为需求输入，预算曾计入10次，无法证明运动。已先实际**停用新timer**：`alice_mcsm_timer_pause_due_stale_status_20261101_bm01` `timerStopped=true,timerDisabled=true`，BDS/Alice未重启。
- 修复commit `a0bf78d64b028eb4666f2f926a7ce219d64b3b32`：`LiveStatus.compactStatus`有界最终4KiB essential fallback，保留唯一进程身份、在线、HP、settings、真实独立样本、实时`witnessDemand`及idleGate；超大world诊断不得继续冻结Heartbeat。同时`alice-bds-demand-timer.py.active_owner`必须有`heartbeatFresh=true`且年龄<=10秒，status.json mtime+updatedAt均<=10秒，所有过期状态无条件禁止任何MCSManager查询。没有降低2样本4秒/0.75格和危险/路径门禁。
- **实际回归**：`alice_mcsm_stale_heartbeat_mac_fixed_20261101_bo01` PASS Mac Python290项（skip3）；`alice_mcsm_stale_heartbeat_mint_fixed_20261101_bp01` PASS Mint Node24 **746/746**，Mac Python290，文件已同步原Mint，测试没有重启原BDS/世界。
- **实际Alice客户端-only更换**：`alice_mcsm_heartbeat_client_reload_20261101_bq01` wrapper内部`observation=null`不能单凭外层PASS判成功；随后独立`alice_mcsm_heartbeat_postreload_audit_20261101_br01`当前Alice已在线、当前进程、心跳新鲜、源码已加载；`alice_mcsm_heartbeat_continuity_actual_20261101_bs01` 连续**8秒两次真读** `state=continuous`、`ownerSame=true`、`initialFresh=true`、`finalFresh=true`、`mtimeAdvanced=true`、`updatedAtAdvanced=true`、`statusBelow4KiB=true`、`clientOnline=true`，未向BDS发命令。此次未触发极端minimal fallback (`minimalFallbackUsed=false`)，但极端负载回归已覆盖。
- **实际重新启用有界timer**：`alice_mcsm_timer_resume_after_heartbeat_20261101_bt01` PASS `state=resumed,heartbeatFresh=true,worldVerified=true,timerActive=true,timerEnabled=true,oldLoopInactive=true,bdsRestarted=false,aliceRestarted=false,serverCommandSent=false`；仅操作新`alice-bds-demand.timer`，按需批次<=2、40/h、55秒批间隔及用户timer约60s检查不变。旧`--loop`仍禁用。**必须另查新版本自发查询/ACK/服务器位移；定时器已启用不能冒充Alice已完成自主路径**。
- 运维停止入口：`systemctl --user disable --now alice-bds-demand.timer`。任何新的后验如发现心跳停滞，定时器必须因新10秒门禁拒绝查询；禁止强制移动/注入BDS坐标或重启正式BDS。

## 2026-11-01 — 大型诊断数据造成status.json心跳停止：新受控Alice client-only重载

- 修复 `compactStatus` 增设真实安全4KiB minimal fallback，及按需timer拒绝超过10秒状态；Mac `alice_mcsm_stale_heartbeat_mac_fixed_20261101_bo01` PASS Python **290（skip3）**；Mint `alice_mcsm_stale_heartbeat_mint_fixed_20261101_bp01` PASS Node24 **746/746**、Mac290；旧BDS和Alice没有被同步任务重启。新timer已暂停禁用，不允许在旧状态时恢复。
- 新`alice-mcsm-heartbeat-client-reload-20261101.py` + task 仅针对运行中的原Alice 17879 Node客户端：必须先调用现有`alice-mint.py check`检验用户环境、唯一PID、可restart，再用一次性私有intent调用`alice-mint.py restart`一次。绝不重启BDS/MCSM/其它服务器、不改世界。事后需以独立新进程当前心跳年龄<15秒、status.json mtime/updatedAt <10秒实机只读证明，不能靠外层task passed就宣称。
- 如果预检被拒或重启结果无法确认，禁止重复提交相同intent或增加第二客户端；只读取原结果与当前进程状态排错。只有心跳证明恢复之后才允许按需timer重新启用。

## 2026-11-01 — 定时器安装后真实现场状态及需求门禁修复

- 安装`alice_mcsm_timer_install_apply_20261101_bc01` PASS `timerActive=true,timerEnabled=true`，未修改世界/重启BDS/发送安装命令。只读`alice_mcsm_timer_live_audit_20261101_bd01`发现新opt-in=true、旧服务inactive、当小时额度已记录**4次**查询预算、当前Alice同PID已验证、`witnessNeed=needs_two_fresh_samples`，但`idleGate=eligible_for_work`、`demandFlag=false`，最近一次timer结果`no_navigation_demand`。`timerTriggered=false`来自systemd LastTriggerUSecMonotonic属性读取，不应据此否认已经有budget/journal证明的服务活动。
- `alice_mcsm_timer_gate_postinstall_20261101_be01` 只读实机：Alice在线autonomous IDLE、HP20 food16、独立BDS样本累计**6**（重登后先2；随后4增量），`movingQueued=28`，样本expired、无当期freshPair、`independentPairTravelBlocks=0`，**不能称本次自主物理移动已完成**。
- 根因是5秒`idleTick`在4秒见证窗口中清除了`navigationHold`，从而`idleGate`变为`eligible_for_work`，但`witnessDemand`仍明确需新证据。修复`demand_now`接受`position_witness_unverified` **或** `eligible_for_work`（只在 IDLE+自主+安全+有确切缺证据状态+当前登录/有效身份时）。`human_stop/follow_intent/threat_nearby/job_active/work_cooldown`仍返回false，不提高2条/批次、40条/小时、55秒间隔的频率，不改4秒/0.75m门禁。新增纯测试覆盖真实出现的状态组合。
- 修改后需Mac/Mint完整回归同步到原Mint，当前运行的Python oneshot会在下一次启动时读取更新源码，无需重启BDS或Alice。实际新自动查询结果仍须进一步只读观测。

## 2026-11-01 — Alice低频自动MCSManager导航见证安装任务

- 用户已明确授权直接修复。新`.openclaw/tasks/alice_bds_demand_timer_install_20261101.json`通过原Mac→Mint固定SSH，仅在`alice-bds-demand-timer.py --self-test`真实通过后调用Mint`--install`，安装并启用**新**用户systemd timer，不启动或重启任何BDS服务、世界、Alice客户端、不运行`--once`；仅用户级`alice-bds-demand.timer`每分钟检查是否有原自主导航缺BDS见证需求，单次最多2个查询，总额40/h、单批次55秒间隔，原旧`alice-bds-position-witness.service`保持disabled。
- 如需停用新机制：`systemctl --user disable --now alice-bds-demand.timer`；旧querytarget --loop仍显式被禁止。任何自动查询只有系统定时器在后续真实需求触发时才执行，安装完成回执**不能**冒充已经观察到自动查询或持续物理移动。
- 新installer在源回归及Mint同步后才允许提交实际工具任务；若用户级systemd不可用/单位冲突则安全阻止，不越权清理旧服务。

## 2026-11-01 — MCSManager private ACK与按需双样本上线准备

- `witness_ack.cjs` 在原Alice真实接收某一独立BDS样本时同步原子写入private 0600 ACK，提供`writerPid`、`producerStartToken`、`independentSamples/At`、`loginAt`、`positionGateSatisfied`，无实际坐标/用户名/API key；只读外部消费者可0.1秒检查此回执，避免等待2秒心跳。配置不修改旧4秒/0.75格门禁，也不生成游戏命令。
- 新`alice-mcsm-ack-coordinated-pair-20261101.py`独立用户授权的最多2次原17879 `--once`，逐次确认同一Alice会话和私有ACK已消费才尝试第二次，工具权限另行审查。每次2s等ACK最多，无无限循环/自动重复，实际输出匿名计数；比旧脚本增加正确PID/进程出生token绑定。
- 新`alice-mcsm-ack-client-reload-20261101.py`和`.openclaw/tasks/alice_mcsm_ack_client_reload_20261101.json`仅经原`alice-mint.py check`成功、唯一进程可安全替换时单次Alice-client restart，绝不触碰BDS/世界，不使用此前已消费的restart intent。
- 截至本记录只准备源码和安全任务，**不能宣称ACK已上线**；需先Mac/Mint全量测试和新Alice-only重载回执，再实测少量BDS查询与ACK配对。

## 2026-11-01 — MCSManager双见证触发原自主决策：客户端-only上线准备

- 修复后的`src/witness_idle_resume.cjs` + `main.cjs` 被动消费当前登录后的4秒双样本，优先床检查完成后按正常安全保护调用一次`idleTick`，不自动查询MCSManager、不绕过危险/STOP/Pathfinder或行动冷却。真实Mint`alice_mcsm_idle_resume_mint_fixed_20261101_u01` PASS Node24 **740/740**、Mac Python285（skip3），源码已同步但运行中Node进程尚需单次安全reload。
- 新`.openclaw/tasks/alice_mcsm_idle_resume_client_reload_20261101.json`只在已有`alice-mint.py check`给出`preflight=passed,action=use_restart`和已验证唯一旧Alice PID后，使用新私有一次性intent调用原`alice-mint.py restart`一次，检查新PID和心跳、登录。**不是BDS/MCSManager重启**，无其他世界操作、无第二Xbox会话。若工具拒绝或预检失败，停在原运行进程，不强制替换。
- 重载验收还不等于后续真实动作成功；必须再次取得新鲜合法BDS双位置与后验独立真实位移。禁止重放任何既有reload task/intent，避免多重客户端。

## 2026-11-01 — MCSManager按需见证状态字段最终回归

- 语义审查发现`navigationAuthorized:true`会错误暗示全部安全与导航条件已获授权；最终源码commit `21ed6d307450226c58b3f9de4f65afb2c4336f11`将其更名为`positionGateSatisfied:true`，且该字段只在已有`scoutStartProof`通过时为true；全局导航仍由原FOLLOW/停止/危险/路径门禁单独控制，绝不能把只读状态视为操作授权。
- 实际 `alice_mcsm_position_gate_mac_20261101_j01` Mac Python **285项，skip 3，0 fail**；实际 `alice_mcsm_position_gate_mint_20261101_k01` Mint Node24 **734/734**、Mac Python285 PASS，`aliceRestarted=false`、`bdsRestarted=false`、`worldModifiedByTask=false`、`consoleCommandSent=false`。最终源码在Mint磁盘已安全同步，**正在运行的Alice Node进程不热更新**。旧持续见证被禁用，当前尚没有自动按需生产新BDS独立样本。
- 后续应仅在授权允许的原MCSManager接口恢复**有界的、正确实例绑定的按需BDS查询**，验证2份4秒/0.75格、后验真实BDS位移；历史被工具安全审查阻止的生产查询操作不能通过换任务/SSH绕行；不必升级BDS或新建世界才能理解当前缺样本原因。

## 2026-11-01 — MCSManager按需坐标见证阶段1实际验收（真实只读，未恢复自动供给）

- 代码 `7374a47f29cce93efcc5b7f1bdaecdd72ce04c88` 在Mac源验收 `alice_mcsm_demand_mac_regression_20261101_a01` Python280项（skip3）、Mint非重启 `alice_mcsm_demand_mint_regression_20261101_c01` Node24 **734/734** PASS；增设`witness_demand.cjs`仅检测两份当前会话4秒新鲜BDS样本缺口/对齐，不执行命令；`BdsWitnessReader`原子文件重复读取状态改为`already_consumed`，不虚增样本。
- 后续 `50aaef422d23920be0d883be38443d470ecbbfa0` `alice_mcsm_loop_retire_mac_20261101_d01` Mac Python **282（skip3）**，`alice_mcsm_loop_retire_mint_20261101_e01` Node24 **734/734** PASS：原`--loop`明确不可启用（读取凭证/API前拒绝）、旧服务安装器仅`--check`；`--once`显式单次接口保留，但**本轮没有调用**。
- 另新增原MCSManager provider仅只读 `--check`/HTTP `--diagnose` 验收脚本，`d8d3cc975b32b8d39aa8265a3a41677f7572308e`；实际 `alice_mcsm_readiness_mac_20261101_f01` PASS Mac Python **285（skip3）**，`alice_mcsm_readiness_mint_20261101_g01` PASS 返回：`config=valid`、`outputlog=readable`、`legacyLoopService=not_active`、`bdsCommandSent=false`、`instanceIdentityProven=false`、`sourceActiveProven=false`。这证明MCSManager配置可读且日志接口正常，**不能单凭此证明身份绑定原17879或当期独立样本已产生**。
- `alice_mcsm_readiness_sync_20261101_h01` 完整非重启同步结果：Mac Python **285**（3 skip），Mint Node24 **734/734**，`aliceRestarted=false`、`bdsRestarted=false`、`worldModifiedByTask=false`、`consoleCommandSent=false`。
- 后续仍需合规获授权、明确target实例identity的MCSManager实际单次BDS坐标供给以及两份4秒样本/0.75格对齐和行动后独立后验。此前涉及真实`querytarget`的任务被工具安全评估阻止，不能改用别的接口或脚本绕过。**本轮未让Alice真实移动、未自动向MCSManager发送坐标查询、未重启运行中的Alice加载新Node模块**。仓库源码同步和全量单测不等于生产进程热加载。

## 2026-11-01 — 原MCSManager坐标服务只读核查，不调用querytarget

- 新一次性任务 `.openclaw/tasks/alice_mcsm_readiness_readonly_20261101.json` 与 `scripts/alice-mcsm-readiness-readonly.py` 通过原固定SSH主机仅执行已存在的 `bds_position_witness.py --check`（私有配置合法性）、`--diagnose`（仅GET /api/protected_instance/outputlog）、`systemctl --user is-active`（旧服务是否误激活）。脚本只返回固定枚举，屏蔽原始凭证、实例UUID、输出日志及真实坐标，故无玩家位置外泄。绝不执行`--once`、`--loop`、`/command`、重启或世界操作。
- 即使`--diagnose`可读，也只能证明 **MCSManager日志读取接口有效**；不等于指定实例映射17879已二次核实，或BDS能接收`querytarget`、Alice当前登录获得两份4秒独立样本。结果字段`instanceIdentityProven=false`、`sourceActiveProven=false`严格保留。任何命令执行仍需合法授权，不能绕过旧安全拦截。

## 2026-11-01 — 旧持续querytarget服务入口彻底拒绝（源码，未在原世界查询）

- 旧`bds_position_witness.py --loop`本身每2秒不断发送BDS控制台`querytarget`，与用户明确要求的仅有业务需要才查询冲突。现将`--loop`保留为**显式禁用的兼容参数**，在读取operator机密配置及任意HTTP请求**之前**退出、固定安全提示、零命令；`--check`、`--diagnose`只读原有行为，`--once`仍保留为**需另行审批的operator单次查询**（不自动重试，不扩展授权）。
- `install-bds-witness-service.sh`更改为仅接受明确`--check`，退出前不写unit、不daemon-reload、不systemctl enable；原系统里已停用的旧service没有被本轮脚本接触。测试覆盖`--loop`被拒时连配置也不读取、不会请求API，以及安装脚本无开机激活入口。
- 如用户之后想要按需自动采样，还需建立经用户和实际工具权限允许的独立operator查询授权/限频方式，当前只提供状态诊断和历史`--once`明确指令；不借改名任务或另一个工具绕过已被拦截的MCSManager执行。Alice安全门禁和正式服不变。

## 2026-11-01 — MCSManager 已有位置见证链路：按需诊断与250ms重复采样修复（仅源码）

- **路线纠正**：BDS 17879 的 `MCSManager /api/protected_instance/command` + `querytarget @a[name=...]` 已实机证明有效（10/23 BDS 3.02格、10/31 4.65格），无需先新增观察者、行为包或BDS实例。当前坐标阻塞是旧连续见证服务因刷屏主动停用，当前登录无新鲜独立样本、之前私有文件来自旧登录；不是已经证明客户端移动算法再次失效。
- 新 `src/witness_demand.cjs` 仅根据原 `scoutStartProof`、登录/重生epoch、样本4秒年龄、客户端坐标输出分类：`session_not_connected` / `login_not_verified` / `respawn_not_verified` / `client_position_unavailable` / `needs_two_fresh_samples` / `needs_second_fresh_sample` / `fresh_pair_aligned` / `client_server_diverged`。结果为operator-on-demand**只读诊断**，明确`querySent=false`、`permissionGranted=false`，不下发MCSM命令、不自动授权运动；`positionGateSatisfied`只有原`scoutStartProof`通过时才true。运行时 `movementEvidence.witnessDemand` 发布状态。
- `BdsWitnessReader` 250ms轮询同一owner-only原子文件的完全相同快照，现报告`already_consumed`而非误记`duplicate_or_rejected`；保留单调serial/时间、唯一身份、4秒、旧登录/旧生命、权限与文件大小校验。新serial或任何篡改不因dedupe获得通过。保留旧系统配置与已停用的服务，**绝不启用 `--loop`**。
- MCSManager官方HTTP文档区分 `/api/protected_instance/outputlog`（读日志）与`/api/protected_instance/command`（真正向控制台下命令）。此前操作工具安全拦截了某些生产`querytarget`任务，不得借新脚本/工具绕行。实际生成新样本需要**另行获准的执行通道**。本轮只能声明源码和单元测试通过，不得宣称恢复了生产BDS位置源、Alice移动、床spawn、开门或正式服变更。
- 后续审批前可用只读现有`witness-diagnose`与status来排查身份/服务和状态，不发送任何服务器命令。正式BDS/其它服务器/世界不改不重启，安全2样本/4秒/0.75格门禁不变。

## 2026-11-01 — 另建隔离稳定版BDS测试服：Mac代码修复与Mint资源只读验收

- 用户拒绝生产17879 BDS短停和原世界行为包修改，改为**优先独立BDS测试**，已确认现有17878/17879/17880、历史v2/v3等实验目录须保持原状。隔离方案：Mint新目录 `~/minecraft-bedrock-alice-stable-lab`（尚未创建）、新生成独立世界，候选IPv4 UDP 17882、IPv6 UDP 27882；行为包仅安装到新世界；不允许复制正在运行的生产LevelDB，不允许同时登录第二个Alice Xbox进程。
- 新只读脚本和任务在提交 `6733b64`，首次Mac全量回归因新增源码多行条件语法错误失败，修复提交 `6bd7e045dda2ce91022cd9501f0f4f8ef46a9110`。实际OpenClaw `alice_isolated_bds_capacity_mac_fixed_20261101_c01` PASS Mac Python **280 tests (3 skipped, 0 failed)**；先前失败回执 `alice_isolated_bds_capacity_mac_20261101_b01` 保留，不重放。
- 只读Mint检查 `alice_isolated_bds_capacity_mint_20261101_d01` PASS：`MemTotal=15901 MiB`、`MemAvailable=10461 MiB`、`SwapFree=0`、`load1=1.23`、`cpuLogical=4`、`diskFree=106.54 GiB`；仅观察到候选 `17882/27882` 内核UDP表`not_observed`（非保证可绑定），v2/v3实验目录已存在、v4/新stable实验目录不存在。原先v2主机能力只读 `alice_other_server_host_readonly_20261101_a01` 证明 `userNetnsAvailable=true`。
- **没有启动任何新BDS，没有创建世界、绑定端口、修改生产配置或重启服务**。下一步需按独立新目录/端口设计有界部署与真实启动前二次校验；首次用独立测试玩家验收BDS行为包加载和私人Actionbar→客户端`set_title`，真正Alice端到端物理移动需要另一测试Xbox账号或之后单独同意Alice客户端从正式服暂时断开（BDS本身永不停止），绝不使用原账号并发登录，保留两样本4秒/0.75格门禁。

## 2026-11-01 — 独立BDS服务器替代正式服测试：容量只读检查（待运行）

- 用户明确拒绝短停/改动正式17879，要求尝试另一台/另一实例BDS测试。采用**独立新测试目录+独立生成的世界**作为候选方案；旧17878/17880/17879和已有v1/v2/v3/v4实验目录不触碰、不覆盖。新服务器拟专用UDP IPv4 17882、IPv6 27882，须实机先确认未被占用。
- 新脚本 `scripts/alice-isolated-bds-readiness.py` 和 `.openclaw/tasks/alice_isolated_bds_readiness.json` 只读取Mint /proc/meminfo、/proc/loadavg、/proc/net/udp{,6}和指定已有实验目录是否存在，**不bind端口、不访问世界内容、不启动/停止BDS、不修改任何文件**；网络端口 `not_observed` 只表示采样时内核表未看到，不保证启动时可绑定。结果还需结合当前剩余内存及负载决策。
- 当前仅代码检查计划。先在全量Python回归及OpenClaw只读检查验证以后再考虑独立新BDS实际创建/启动；不复制在线LevelDB、不启用生产pack、不使用同Xbox Alice账户并发登录。端到端Alice移动测试还需要独立测试Xbox身份，或以后单独批准Alice客户端暂离正式服（绝不重启BDS）。

## 2026-11-01 — BDS离线备份进程识别已完成Mac+Mint回归（未做正式服备份）

- 修复提交 `3036f405469b09e200550b9dda425b9e3f75dfb9` 已通过实际OpenClaw `alice_backup_proc_guard_mac_regression_20261101_a01`：定向9/9、Mac全量Python 277 (skip 3, fail 0)，安全fast-forward同一源码。
- `alice_backup_proc_guard_mint_sync_20261101_b01` 实际报告 `ALICE_MINT_NONRESTART_SYNC` PASS：Mint Node24 **726/726**、Mac Python277，`aliceRestarted=false`、`bdsRestarted=false`、`worldModifiedByTask=false`、`consoleCommandSent=false`。这是备份逻辑测试与源码同步通过，**并非真实世界停服、离线备份、隔离恢复、稳定行为包安装或Alice真实走动通过**。
- 在正式17879短停/行为包上线明确授权前，仍只允许非破坏性代码/只读检查。未来离线备份前必须独立证明服务停机且能读到其他疑似游戏进程的cwd，否则fail-closed；不能拿原来的只读PID列表为空当停服凭据。

## 2026-11-01 — 正式17879离线备份进程证明 fail-closed（源代码待回归）

- 对照现有 `backup-world.py` 发现：旧版直接读取 `/proc/<pid>/cwd`，但该字段在 root 启动的 BDS 上可能不可读；原实现遇 `PermissionError` 直接 continue，随后错误把“无可见 BDS 进程”当作“已停止”，可能对运行中的 LevelDB 打包。改为先读取 Linux `/proc/<pid>/comm` 识别 `bedrock_server` / `java`，再核对其 cwd；游戏进程 cwd 无法确认时直接阻止离线备份。只有被确认属于其它目录的进程才可略过。保留对真实进程退出竞态的处理。新增目标/异实例/权限拒绝/缺失 cwd 回归用例。
- 此修复仅涉及备份脚本、回归测试和说明，**不是正式17879离线备份已完成的证据**；当前不停止 BDS、不修改世界、不产出实际备份，不授权安装行为包。下次维护须确保生产 BDS 实际停服且使用足够的 /proc 可见权限，随后调用原离线备份及隔离恢复校验，不能以空 PID 列表代替停服证明。
- 代码初次提交阶段待 Mac 全量 Python 回归和 Mint 非重启同步结果；未有测试回执前不得把本修复标为已验收。

## 2026-11-01 — 稳定BDS见证部署前只读检查，禁止自动上线

- GitHub/Mac/Mint代码已安全同步新模块，op `alice_stable_witness_regression_fixed_20261101_d01` Node24 726/726、Mac Python273 PASS，原BDS/Alice客户端均未在本任务重启。
- 仅metadata核查任务`.openclaw/tasks/alice_stable_witness_preflight_20261101.json`、op `alice_stable_preflight_prod_20261101_f01` PASS：生产世界17879正确，stable源唯一依赖`@minecraft/server`，但**正式世界未安装/注册包**，owner-only opt-in不存在，Beta实验未声明，世界pack list尚不存在。不得把仓库源代码在场当作运行时已经加载。
- 另行经明确授权前不得修改正式世界行为包清单、附加配置、BDS进程或实验标记。若后续上线，必须先具备验证可恢复的原世界备份、协调BDS短停、私有Alice目标名替换及正式服新包载入日志证明、真实新鲜两个Actionbar样本，再单格试走与后验；安全门禁/旧querytarget受限保持原样。
## 2026-11-01 — 真实一次性目标坐标动作回执

- `alice_target_probe_actual_17879_20261101_e01` 已完成一次原17879封闭指令`安全试走`：目标`(-6,58,1)`，客户端起/终`(-6.62,58,1.52)`，`commandQueued=true`、最终`failed/probe_arm_expired`，独立BDS前/后各0样本，移动输入0，BDS真实位移**未验证**。只读路径选择不是行走；不许宣称成功。
- 测试`alice_target_probe_mint_regression_20261101_c01` Mint720/720、Mac269 PASS，受控Alice客户端重载`alice_target_probe_client_reload_20261101_d01` PASS 17879 online，BDS未重启、世界未改。试走和重载两个owner-only intents均已消费，任何新真实动作都须重新计划并验证环境，不可重放旧任务。
- 最新代码`aaca332`的probe_armed只在有实际安全路径时报告第一格目标并固定；没有独立BDS双样本时不发移动输入，12秒自动失效。此安全门禁不应放宽。原世界Script API包未装；禁止绕过旧安全阻止的querytarget命令。

## 2026-11-01 — phase5单次Alice客户端reload及原世界BDS见证只读preflight

- 编译/回归`alice_witness_life_mint_regression_20261101_b01`：MintNode24 718/718、Mac269 PASS；运维`alice_witness_life_ops_regression_20261101_c01`Mac269/9定向通过。
- 客户端only唯一受控重载`alice_witness_life_client_reload_20261101_d01` PASS owner/current Bedrock session `client_reconnected_17879`；私有intent`alice-witness-life-epoch-phase5-20261101.intent`已消耗**不得重放**，BDS和其它世界未动。
- 只读现态`alice_witness_life_postlive_gate_20261101_e01`：prior_login_witness/independentSamples=0/IDLE/no movingQueued；新Reader诊断实机已生效。
- 官方见证部署条件严格由`.openclaw/tasks/alice_bds_script_metadata_readonly_20261101.json`已验证 `alice_script_preflight_prod_readonly_20261101_f01` 输出：原世界未有`world_behavior_packs.json`、未装行为包、Beta API实验未声明、专属权限未就绪、离线world备份恢复未证明。**禁止就地添加实验/行为包/重启生产BDS、默认授予全局网络权限。** 接收器配置存在不代表脚本产生位置证据；normal-user无BDS PID不是进程确实已停。
- 后续只能合法批准服务端独立见证来源时测试4秒双样本/0.75格对齐、已部署的单格床接近、行动后的独立BDS位移及personal spawn；不改安全阈值、不旁路被安全评估阻止的querytarget。

## 2026-11-01 — 一次性Alice重载阶段5：死亡见证epoch

- `alice_witness_life_mint_regression_20261101_b01`通过Mint718/718及Mac269，不涉及服务器重启、世界修改和控制台命令。新`.openclaw/tasks/alice_witness_life_epoch_client_reload.json`用于独立的一次性Alice客户端only安全替换，intent `alice-witness-life-epoch-phase5-20261101.intent`，先检查运行中唯一owner和老PID，重载后必须出具`client_reconnected_17879`回执。标记使用后不可重试或删除，原有任务均已使用。
- 更新`alice_17879_runtime_gate_diag.json`只读报告本轮`lifeEpochAwaiting`及`bdsWitnessStatus`新枚举；不暴露坐标或凭据，也不查询BDS。如果只是旧会话文件，预期`prior_login_witness`，仍无独立双4秒样本、新床重生点及实际行走证据。

## 2026-11-01 — 原世界床位单步BDS见证：已上线/证据与风险

- `alice_bed_witness_mint_final_20261101_d01` MAC269/Mint Node24 713/713 PASS，源同步无BDS/世界操作；`alice_bed_witness_mac_ops_tests_20261101_e01` Mac269通过。
- `alice_bed_witness_client_reload_20261101_f01` 通过单次owner/PID、进程心跳、Bedrock会话验证；只替换Alice client，原世界和其它BDS不停；私有`alice-bed-witness-first-step-phase4-20261101.intent`已使用不得重放。
- `alice_bed_witness_postlive_20261101_g01`：床路线5步只读、单步未执行、重生点未确认；后续`alice_bed_witness_provider_readonly_20261101_h01`与`alice_bed_witness_age_readonly_20261101_j01`固定root/producerPid/17879所有者，只读确认`stale_or_invalid_witness`来自**旧登录**，非文件丢失/权限/JSON结构坏。当前独立样本0/移动0。
- 后续只能在独立合法获批的服务端见证源产生**当前登录后**的两份4秒新鲜样本时自动触发安全单步，随后必须有至少2份真实后验BDS证据才能标记成功。先完成权限/实现审查，不能复用已经被工具安全评估拒绝的querytarget任务、更不能借其它执行接口绕行。无需用户反复运行脚本；禁止清锁、重复重载、强制Git重置。

## 2026-11-01 — BED fresh witness 4秒事件 + 1格安全首步上线

- 完成`alice_bed_witness_mint_final_20261101_d01` Mint Node24 713/713及Mac269，全量测试无生产重启。
- 使用新的`.openclaw/tasks/alice_bed_witness_step_client_reload.json`一次性客户端only任务（旧intent不能重放），先验证owner oldPid再替换Alice，只有真实`client_reconnected_17879`才能验收。
- 之后用原`alice_home_base_status_readonly.json`读取`bedStepStatus`/`bedStepBdsVerified`；当前没有当期BDS样本时`lastPositionGate=scout_bds_position_unavailable`正确阻止行动。新路径执行器从不产生BDS查询，不可用其他工具绕过被拒的单次querytarget任务。

## 2026-11-01 — BED只读路径 phase3 生产回执及后续验收条件

- `alice_bed_plan_mint_nonrestart_20261101_v02`: 确认`90d2082` Mint Node24 710/710 + Mac Python269，运行时未重启。
- `alice_bed_plan_ops_mac_regression_20261101_v01`: 操作脚本`c7ec9b4` Mac Python269通过。
- `alice_bed_plan_client_only_reload_20261101_v01`: 只替换原17879 Alice客户端并获得原Bedrock会话和owner新进程证明；BDS未重启、其他世界没动；一次性标记`alice-bed-observed-route-phase3-20261101.intent` 已消耗，不得重放。
- `alice_bed_plan_postlive_readonly_20261101_v01`: 从当期owner status确认 BED 5步只读候选、homeAgenda进入床计划、无BDS移动证据、个人spawn未确认。当前实际服务器移动 **不准标记成功**。
- 首要下阶段是可信且被工具权限允许的BDS独立见证入口（script_api需当前生产世界配置资格/授权，之前明确没有实验Beta标志；MCSManager两次 querytarget操作此前因工具安全阻止，严禁改走绕行路径）。任何见证源不得利用客户端自身预测坐标模拟。独立BDS样本达标后才开始受控、可证实的一段一段移动、床spawn和出门返程验收。

## 2026-11-01 — BED路径候选安全上线流程

- 修复重复import后`alice_bed_plan_mint_nonrestart_20261101_v02` PASS 710 Node24 / 269 Mac Python，不重启BDS、不中断其他世界。后续唯一受控任务`.openclaw/tasks/alice_bed_plan_client_reload.json`只允许单次客户端进程替换；任何私有intent存在即停止，不能删锁、重试不明结果或使用已消耗旧任务。
- `alice_home_base_status_readonly.json`现在输出`bedApproachStatus`、`bedApproachSteps`和`homeAgenda`，只读，不查询BDS、不生成Minecraft输入。客户端路线候选仍`permitted=false`、`serverVerified=false`。

## 2026-11-01 — 只读候选床路线与HOME agenda 部署测试

- 利用已有安全`.openclaw/tasks/alice_mint_nonrestart_sync.json`完成 Mac/Mint 全量测试+源码无重启同步，随后若需新运行时字段，需独立新的一次性身份验证client-only重载任务，不得重放旧操作。无需启动任何额外BDS实例，不修改世界。实机`bedApproach`仅为可见加载方块候选，实际走动仍必须首先合法取得双份新鲜BDS独立样本。
- 不允许改变 Bedrock位置安全门禁、自动轮询MCSManager或者改用其他途径绕开之前工具阻止的querytarget任务；目标是先做好合法位置证据到来前的规划层，不报告虚假“已移动”。

## 2026-11-01 — HOME phase2 生产只读验收回执及不可重放记录

- 已完成正式17879源代码安全同步（`035445c`, 268 Mac tests, 705 Mint Node24 tests）、`30caf3c` 新运维代码Mac268回归、专用Alice client-only reload `alice_home_phase2_client_only_reload_20261101_c01` PASS。私有once-only marker已使用，**禁止重放**，无需用户手动操作。
- 生产只读：`alice_home_phase2_postlive_status_20261101_d01` 的`homeCandidateFresh=true`、22秒扫描、`lastBedReach=bed_needs_verified_approach`及`lastPositionGate=scout_bds_position_unavailable`；`alice_home_phase2_gate_readonly_20261101_e01` 的`independentSamples=0`、`movingQueued=0`。已定位安全静止的硬阻塞。无MCSManager/BDS command，未修改任何世界。
- 当前Mac Nginx 8788静态根目录指向Alice项目`dashboard/`，刷新网页才会加载新HTML/JS；若服务本身没有启动应先用维护入口`scripts/alice-mac.sh`及现有受控流程检查，不能为观察状态而重新启动BDS或另起同账号Alice客户端。
- 正式自动移动需重新设计**授权的真实BDS位置见证**（不是打开被安全阻止的一次性querytarget任务的后门），并经用户/工具权限审查；新代码保持不可移动的fail-closed行为，不自动轮询MCSManager。

## 2026-11-01 — HOME/bedReach 705-pass runtime acceptance and single client reload

- `alice_home_phase2_mint_nonrestart_20261101_a01` PASS: Mac Python **268**, Mint Node24 **705/705**, original Alice NOT restarted during sync and BDS/world unchanged. Tracked one-shot gated client-only task `.openclaw/tasks/alice_home_phase2_client_reload.json` and maintained `scripts/alice-home-phase2-client-reload-20261101.py` apply the tested source by verifying operator identity and replacing ONLY Alice client, never the BDS process. Execute only once; after receipt `client_reconnected_17879` read `alice_home_base_status_readonly.json` with fresh operation ID. The read-only report includes `homeCandidateFresh` (<=45 seconds), `homeLastAgeSeconds`, `lastBedReach`, `lastPositionGate` without coordinates or BDS command.
- **At commit:** stage only; client activation and field verification not yet done. Do not replay any existing private restart marker or call a blocked BDS query by another tool.

## 2026-11-01 — HOME分层控制台与床诊断上线流程

- 新只读`lastObservedAt`与`bedReach`/`positionGate`不提供新游戏操作；等待完整Mac/Mint测试后才能加载至当前Alice客户端。沿用有据的`.openclaw/tasks/alice_mint_nonrestart_sync.json`执行非重启同步和测试；网页静态更新可刷新（受具体Nginx文件映射影响）。Mint Alice客户端若要加载新runtime，必须建立新的一次性受控client-only任务；旧重载标记已消耗不可重用。
- Bedrock BDS 17879、其他世界不重启；不运行或绕开先前被阻止的BDS双querytarget任务；无独立2份4秒0.75格坐标证据不移动、不激活床。

## 2026-11-01 — Raised-door fix accepted in original 17879 world (read-only candidate only)

- Tested source `04e87e6` via `alice_raised_door_mint_nonrestart_20261101_v01`: Mac Python 267, Mint Node24 702/702; non-restart sync passed. Guarded client reload `alice_raised_door_client_reload_20261101_v01` had `client_reconnected_17879` with current owner PID/heartbeat/game session verified; BDS and other worlds NOT restarted. **Once-only task is consumed; never replay or remove the private intent marker.**
- Read-only HOME follow-up `alice_raised_door_postlive_readonly_20261101_v01`: `homeLastSurvey=observed_indoor_home_candidate`, bed/roof/door geometry observed, health20, beds2, night. The persistent HOME door remains unverified (`personalBedStatus=not_verified`), no physical exit/return/BDS movement claimed. `idleGate=position_witness_unverified`; do not use alternative execution methods to bypass previous BDS query denial. Source and live status require **no further manual commands for this completed acceptance**. For a future new change, use canonical maintained `games/minecraft-ai/scripts/alice-mac.sh` sync/test and a fresh guarded client-only task; do not restart BDS.

## 2026-11-01 — Raised-door HOME patch validation and optional original-client-only activation

Read-only raised-door source change in `src/escape_survey.cjs` requires **non-restart** `scripts/alice-mac.sh sync` with Mac Python + Mint Node24 full tests before activation. It records a verified adjacent approach to an elevated observed wooden door without claiming passage or allowing movement. Only after tests PASS, one unique pinned OpenClaw repository task `.openclaw/tasks/alice_raised_door_client_reload.json` may run `scripts/alice-raised-door-client-reload-20261101.py` selftest and identity-checked Alice-client-only restart on original 17879. This does NOT restart BDS, touch other worlds, request BDS witness, move Alice or alter the 2×/4s/0.75m safety gate. It must produce an owned reconnect receipt and a subsequent separate read-only HOME status before game claims. One-shot token is not reusable. **At commit time: task staged, not executed.**

## 2026-11-01 — HOME door visibility, read-only voxel evidence

Pinned task `.openclaw/tasks/alice_home_door_voxels_readonly.json` runs maintained `scripts/alice-home-door-voxels-readonly.py --self-test` then `--inspect @output_dir` through OpenClaw `repository_task`. It reads only current owner-verified 17879 status and private bounded `world-view.json` that Alice already publishes; returns counts and relative rounded distances for loaded wooden door/bed voxels (no absolute coordinates or entities). Absence of a voxel does not prove no physical door; presence does not prove reachable passage, BDS movement or server state. No querytarget, restart, world modification or new world; do not substitute for the previously blocked BDS pair. The previous frontier-only Alice client reload has already succeeded; never replay its O_EXCL marker.

## 2026-11-01 — Alice HOME frontier client-only reload, strict one-shot

Source sync and tests (no restart) already accepted on main b491257 with 267 Mac Python and 699/699 Mint Node24 tests. For a newly committed one-shot task, the operator entrypoint is `games/minecraft-ai/scripts/alice-home-frontier-client-reload-20261101.py`, task `.openclaw/tasks/alice_home_frontier_client_reload.json`; run through the pinned OpenClaw `repository_task` only. Script self-tests the guard and then calls existing `alice-mint.py check` / one identity-verified client `restart` on the original 17879 **Alice client**; BDS remains running, other worlds untouched. The unique private `.intent` file must never be removed/replayed. Require `client_reconnected_17879` receipt plus subsequent read-only status before describing effect. **At source commit: staged, not yet executed.** A tool-blocked BDS query must stay blocked, never bypassed by alternative command paths. Direct manual commands are not recommended for the one-shot operation because they bypass the durable MCP result.

## 2026-10-31 — HOME candidate recognition and pre-dusk agenda (read-only first; server return NOT accepted)

- User requests that Alice recognize the existing room with bed and wooden door as a potential shelter, know the entrance, leave by door in daytime, and return before dark when in autonomous survival mode. Existing `escape_survey`, `escape_door_action`, `escape_crossing` and `night_shelter` already contain individually bounded door, passage and natural-ground one-block construction primitives, but never proved a safe round-trip route.
- New `home_base.cjs` is a READ-ONLY bounded scan: recomputes actual loaded bed, ground-connected accessible cells and observed wooden-door approach from `surveyEscape`, rejects unknown chunks/open frontier, samples roof at room, bed and door approach (height 2–5). Results are `observed_indoor_home_candidate` vs `unverified`. Even a passed geometry scan is NOT monster-proof shelter nor evidence a door opens or an exit/return path succeeds. A 0600 `home-base.json` candidate is saved ONLY when that same bed already has server-confirmed PERSONAL spawn via `HomeBedMemory`. Without a confirmed spawn, an observed room is kept as transient survey rather than fabricated HOME.
- Runtime observes room on ordinary safe maintenance (read-only and paced 30s), publishes `worldRoutine.homeBase` and `homeAgenda` to dashboard. For `agentMode=autonomous`, a late-day threshold tick>=8500 can set objective `return_home` if Alice is away from an observed candidate and has no overriding human order/danger; it prevents STARTING ANOTHER distant resource excursion if no safe return route exists. During night, existing emergency shelter/retreat behavior remains, bed/sleep retains priority. In companion mode no autonomous return overrides the player's commands. `returnRouteVerified:false` is ALWAYS explicit: the planner does not fabricate navigation, request BDS teleports or bypass the independent 2 samples/4s/0.75m gate.
- Existing door action can open a verified nearby wooden door and independently observe its bit changing; independently verified traversal and reverse traversal require real BDS movement evidence before home route may be promoted to `verified`. Future incremental implementation: record separately confirmed door passage, reproduce reverse route using independently observed, currently loaded waypoints and BDS segment acknowledgements, and *only then* enable actual autonomous long-distance return. Do not prematurely assert home return completed or shelter construction verified.
- No hardcoded coordinate, house block editing, extra world, BDS restart, continuous MCSManager polling, lower safety gate, or inferred BDS displacement. Source tests and real Mint sync/field observation are still required at this commit.

## 2026-10-31 — Bed and short-rest first-phase execution receipts

- User clarified that *regardless of day/night* Alice should set an unset respawn if a nearby bed can be verified, while at eligible night she should **enter bed briefly and wake if other players remain online** to reset the three-day Phantom/insomnia clock; when alone, sleep normally to skip night. The separate sleep cooldown must not block setting personal respawn. See earlier entry for code and safety.
- Source `4eeb9c1d99cfe1019ac64444d05ef81457480586` added separate personal-spawn packet verified bed activation, 0600 bed landmark, short multiplayer rest with confirmed wake, unit tests, and status fields. `alice_bed_rest_regression_20261031_a01` passed: Mac Python267, Mint Node24 **693/693**, no BDS restart, no world modification.
- Ops source `718e46904478e35dce77bdf4b4842ca94a714cea` includes unique guarded client-only reload task; `alice_bed_rest_ops_sync_20261031_b01` PASS no restart by sync. `alice_bed_rest_client_reload_20261031_c01` PASS `client_reconnected_17879`: operator-owned fresh new PID heartbeat, game session established, original BDS unchanged, other worlds untouched.
- **Do not claim successful actual bed respawn or insomnia reset yet**: an attempted read-only live bed inspection `alice_bed_rest_postlive_20261031_d01` was blocked BEFORE execution by a tool safety assessment; subsequent project_result was `not_found`. No actual server personal-spawn receipt or slept/woke packet has been obtained this turn. Do not replay consumed reload tasks. Next owner-authorized safe read-only status, then if no server personal spawn and bed in verified use range, limited independent on-demand BDS pair to enable safe activation. If bed is 2..12 blocks away, current source explicitly reports `bed_needs_verified_approach`, not yet safe autonomous navigation. Do not override BDS alignment or run continuous querytarget, don't touch BDS worlds.
- Building shelter and door/home returning are still future phases, not included in this commit.

## 2026-10-31 — Bed: independent personal respawn and short night rest (pending live verification)

- User clarified TWO separate purposes: 1) if there is no confirmed personal spawn and a BED is observed within 12 blocks, use it in either daytime or nighttime to set spawn; 2) at legal night sleep, ENTER BED, and if another player is online, WAKE instead of remaining asleep waiting for all players to skip the night. Minecraft phantoms track time since entering bed; merely activating bed or failed sleep is not valid proof.
- New `bed_spawnpoint.cjs` uses ObservedBeds positions, reloads bed block and unoccupied metadata and requires nearby distance <=1.95 blocks (Bedrock use reach); no guessed movement, no teleport, no /spawnpoint, no world alteration. It requires independent 2x BDS samples within 4s and <=0.75m aligned, safe autonomous state, and handles PERSONAL `set_spawn_position` packet during actual bed activation. A click/chat text alone is NOT accepted. If bed is farther, status `bed_needs_verified_approach` and work is held for later verified navigation. This does not use the nighttime SLEEP failure-cooldown.
- `HomeBedMemory` persists a 0600 verified bed coordinate only after personal server spawn packet and matching bed; it explicitly distinguishes bed landmark from **UNVERIFIED shelter, entrance and return route**. If current server LifeObserver already reported a personal player spawn, skip redundant setup. Passive witness file reader (only) may open a short opportunity; no MCSManager background query loop.
- `life_actions.cjs`: if night `bot.sleep(bed)` returns and `bot.isSleeping` confirms entry, when other players are online, call `bot.wake()` and require the sleeping flag to clear. If alone, remain in bed for normal skipping. `insomniaResetInferred` means game-mechanic inference from confirmed bed entry, NOT a direct server insomnia-stat witness. Failure/unknown bed or wake state is not success; STOP remains higher priority.
- Existing original 17879 state: 2 remembered beds, last sleep opportunity all_candidate_beds_in_cooldown, mode companion. Current implementation does NOT bypass active FOLLOW, human STOP, threat, dimension or BDS movement gate. No self building, automatic door/home return or BDS restart in this phase.
- Source tests and Mint guarded client deployment required before claiming bed actually set/entered/woken. Single confirmed current-session personal spawn packet is the live success criterion.

## 2026-10-31 — Post-death coordinate repair deployed, independent alignment PASS, FOLLOW not yet game-verified

- Last core fix commit c278101b7856e66272919bcf28414e65ba9c1779 (initial fc273c... + corrected test regex); final one-shot ops commit 6e9faae50782c15b5bdd1735a20d587bc6faf84a. Mint Node24 **682/682**, Mac Python **267**, both passing; synced via MCP `alice_respawn_fix_tests_20261031_c01` and `alice_respawn_ops_sync_20261031_d01`. New code pauses dead client physics/input and discards old-life BDS witness data; independently confirmed two-point short-lived stationary BDS evidence permits bounded local-only post-respawn pose mirroring. No weakening of 2x/4s/0.75m gate, no server teleport or continuous query loop.
- One guarded Alice CLIENT-only reload `alice_respawn_client_reload_20261031_e01` accepted as `client_reconnected_17879`: verified owner PID, fresh heartbeat and Bedrock session; BDS 17879 and unrelated servers untouched. One FOLLOW restoration `alice_respawn_follow_reissue_20261031_f01` returned **player_not_online**, `ownerOnline=false`, `followIssued=false` and `followIntentNow=false` because player MolarParsley191 is absent from current online roster. This is a valid safe refusal, not proof of a functioning follow.
- Finite independent BDS witness `alice_respawn_bds_pair_20261031_g01`: exactly **2/2 queries accepted and ingested**, fresh pair true, **alignedWithin075=true**, pair BDS travel 0, Alice connected; no restart or world mutation. Later no-query `alice_respawn_live_status_20261031_h01` confirmed local-to-LAST trusted BDS feet **0.0 blocks**, last sample ~48s old; Alice still connected, core IDLE, current session respawnCycles0, health20/food20, independentSamples2; previous-life deathsSinceTracking4621. Alignment at query time passed, but a later age means fresh Pathfinder admission is not ongoing indefinitely.
- **Outstanding**: no actual FOLLOW movement has been witnessed in this new session because the named owner was OFFLINE. Do not claim real travel, jumping, 3-block follow maintenance, eating, armor or post-death live mirror correction from these receipts. To verify when owner is online, explicitly reissue typed FOLLOW, coordinate a new *separate* operator-bounded two-query BDS witness while owner remains in world, then compare independent BDS travel. Do not replay any consumed one-shot IDs or disable the safety gates. UI follow target refresh issue already separately fixed in 9c1e301, but Alice client restart does not preserve transient FOLLOW intent. A longer-term improvement is an authorized, rate-limited, operator-triggered witness handshake for new FOLLOW sessions; do not create periodic MCSManager polling.

## 2026-10-31 — Death → respawn FOLLOW position-mirror repair (source commit, pending guarded live validation)

- Original 17879 evidence: 7 verified same-session respawns, 858 denied Pathfinder starts, latest reason scout_bds_position_unavailable, two new independent BDS samples valid but local/server alignment >0.75m and actual BDS travel0. User requested actual repair. Web target refresh is already separately fixed.
- On Bedrock death suspend the native 20Hz local-physics/input timer; clear old control/velocity; on verified spawn resume at current frame without simulating dead-body missed ticks. Reset all independent previous-life BDS witness pair state at death, without clearing start_game login provenance. No second auth session.
- New `respawn_position_mirror.cjs` verifies current in-session respawn, two fresh independent samples from SAME server-pinned player, each within 4s, pair stationary <=0.1 block, living nonmounted Alice and local-vs-server delta in (0.75,16]. It corrects ONLY the local player-physics mirror and clears obsolete local controls/path/velocity once per death cycle. Does NOT send teleport, console command, BDS write, or bypass the unchanged `scoutStartProof` 2x independent BDS/4s/0.75m gate. Existing 250ms file reader is passive; operator-controlled one-shot querytarget remains the only source. No continuous BDS polling. Source regression covers denial and allowed local correction.
- Important: source passing tests does NOT mean game movement succeeded. Deploy with Mint regression and client-only gated restart, then a fresh, bounded two-query BDS witness in existing original world 17879. Verify correction through local-vs-BDS <=0.75m before follow path, and actual independent server travel after follow inputs. If no safe witness or Alice immediately dies, remain fail closed and report blocker. Other BDS worlds untouched.

## 2026-10-31 — FOLLOW no movement: confirmed in-session repeated death, UI refresh selector fixed, independent BDS gate still blocks (NOT ACCEPTED)

- User reports explicit FOLLOW not producing physical walking; user also reports refreshed Web 3D player selector cleared. Verified latter **is browser DOM bug**, not erased Alice intent: old `world.js` repopulates player selector and preserves only in-page selected value. Fixed to repopulate selection from live `runtime.followTarget` when target is online, while respecting a deliberate in-page selection. Added visible follow-intent/status text, explicitly distinguishing BDS-aligned evidence. Commit `9c1e301dd450d104bc91e669b798f89499679110`; `alice_web_follow_refresh_sync_20261031_p01` passed Mac 267 Python and Mint Node24 678/678 with no Alice or BDS restart. Browser refresh should show stored current FOLLOW when Alice online; do NOT automatically issue a command.
- `alice_nofollow_live_20261031_n01` read-only: Alice connected true, `followingOwner=true`, `coreState=FOLLOW`, health20, no active job, `escortAllowed=true`, 2 prior BDS samples, travel0; no completed movement evidence. `alice_death_position_live_20261031_q01`: `deathRecoveryPhase=respawn_verified`, **7 current-session respawn cycles**, lifetime-since-tracking death count 4616, `followIntent=true`, client-to-LAST BDS delta ≈2.997 blocks but BDS sample age 585sec (not current position proof). `alice_nofollow_fresh_pair_20261031_r01` two new independent on-demand BDS samples accepted/ingested, fresh pair true, alignedWithin075 FALSE, pair server travel0; no BDS restarts. Followup `alice_nofollow_postpair_delta_20261031_s01` (19sec after sample) showed latest remembered delta 6.763 blocks, components client-minus-BDS x=-3.34,y=-3,z=+5.057; sample already stale and is NOT an exact current displacement.
- `alice_nofollow_transport_read_20261031_t01` verified 7 death logs and 7 `respawn_verified` logs, **858 navigation start rejections** in current operator log window, latest reason `scout_bds_position_unavailable`, 2 FOLLOW target setup log events, 0 non-destructive repaths. Outbound audit: movingQueued301 lifetime of this process, movingLast10s0, queued/serialized20243, serialized errors0, transportCalls19384, corrections74, tickVsExpectedWallTick=-102 and max contiguous moving ticks147. Queue/wire counts are NOT server movement. These facts confirm physical FOLLOW is blocked by fresh BDS admission and ongoing local/BDS misalignment after repeated respawn—not by lost Web FOLLOW selection.
- **Safety/unfinished**: navigation_position_guard for FOLLOW uses scoutStartProof requiring two independent BDS observations both within 4 sec and current client/server <=0.75 blocks; witness service is purposely ON-DEMAND, no continuous MCSManager poll. Never bypass this admission, force movement, silently reset client pose, or claim walking success on input count. The correct next development task is to inspect pinned Bedrock fork's death→spawn→physics input/correction lifecycle and how a fresh validated BDS sample safely updates the local mirror, then design an event-driven, bounded, operator-authorized way to renew authoritative position evidence without nonstop BDS querying. Current 17879 Alice online and still FOLLOW, other BDS untouched; no further reload performed for UI-only fix. Dashboard page reload should now show selected online target from backend.

## 2026-10-31 — Browser refresh FOLLOW selector is UI-only; BDS position still blocked

- User observed that refreshing the 3D Web page loses the selected player. Confirmed code cause: `world.js` always rebuilds `world-command-target` from online players and only remembers the old in-page DOM selection; a full page reload resets it. Fixed to restore from **current live backend `run.followTarget` only when that player is online**, retaining deliberate manual selection if still online. Added `world-current-follow` status to separate an active FOLLOW intent from actual BDS-aligned movement; never persist obsolete player IDs in browser or automatically issue an order on reload. Mac UI tests added. No Alice gameplay changes or BDS restart.
- Current original-world FOLLOW was still acknowledged in two read-only observations, but no new independent BDS travel, and previous fresh pair failed <=0.75-m alignment. Newly added read-only `.openclaw/tasks/alice_follow_death_position_diag.json` captures current death/respawn phase and client-vs-BDS coordinate *differences only*, without revealing player positions, issuing BDS queries, rebooting or changing game. Separate between UI state bug and physical positioning/respawn issue; do NOT bypass navigation guard.

## 2026-10-31 — FOLLOW3 live acceptance and current blocker

- Follow distance 3 blocks is exposed in Web Control Center at `http://127.0.0.1:8788` under 2..12 normal follow and separately occluded distance. New code exits active FOLLOW path within configured same-floor range and optionally looks at verified visible owner, no forced action. A 1-block vertical separation is no longer a completed Follow goal; still requires legal Pathfinder movement, no blind jump/dig.
- Mac/Mint tests `alice_follow_food_stair_sync_20261031_e01` 266 Python / 678 Node24, 0 Node failures; safe Alice-only reload and FOLLOW reissue operation IDs `alice_follow_food_client_reload_20261031_e01`, `alice_follow_food_reissue_20261031_f01`. New running client connected; do not replay one-shot restart/follow tasks or consume old markers. Neither script touches BDS.
- **Important** new independent BDS pair `alice_follow_food_new_alignment_20261031_j01`: two new accepted samples, fresh pair true, alignedWithin075=false, travel 0. Do NOT interpret code tests or movingQueued=52 as real BDS walking. Keep current 0.75m and 4s gate; do not forcibly set positions, enable witness loops or restart the BDS.
- Current follow/collision and food confirmations need better fresh evidence; on last diagnosis health=20/food=20 means no actual consumption can be expected until hungry with safe food. Weapon heldItem was null in an earlier SURVIVE snapshot, so do not say armor was equipped. Preserve life/inventory and owner login; no repeat restart for a measurement.

## 2026-10-31 — Postreload 2-query independent BDS pair verification

- Historical `alice_17879_follow_alignment2.json` task was safely blocked BEFORE any console request because its prior one-shot intent already exists (queriesSent=0, `one_shot_already_claimed`). Do not delete its marker or replay the same operation. New distinct, explicitly bounded `.openclaw/tasks/alice_follow3_food_alignment2.json` uses a unique marker and checks original MCSManager instance working directory, active operator session, two sequential on-demand queries, 4s freshness, and <=0.75m client alignment. It does not move/teleport Alice, mutate the world, or enable continuous polling.

## 2026-10-31 — Stair root-cause fix: GoalFollow must NOT finish a floor below target

- Follow arrival now requires both configured 3D radius AND same-floor vertical tolerance (|target feet Y - node feet Y| <=0.65); the old goal was willing to succeed one full block below the owner when within 3 horizontal blocks. This false success explained a plausible step-stall and now has a dedicated regression. Normal safe Pathfinder can seek a loaded valid one-block step-up route; no blind jumps, block breaking, unsafe parkour, or floor spoofing added. The user's observed hand swing is NOT independently attributed until real input/path logs.
- Continue to require actual BDS evidence before claiming stairs worked in game. Keep current world 17879 and other BDS intact.

## 2026-10-31 — Deploy-only one-shot entrypoints for FOLLOW3/food (do not replay)

- Gated client-only restart task `.openclaw/tasks/alice_follow3_food_client_reload.json` uses an exclusive new Mint intent marker, existing canonical `alice-mint.py check/restart/status`, verified current owner/PID, graceful logout, and waits for a fresh post-restart established game session. Never touch BDS/world, launch a second simultaneous bot, or reuse older restart intent markers.
- A separate one-shot Web API FOLLOW reissue task `.openclaw/tasks/alice_follow3_food_reissue.json` operates only if current Bedrock level UDP17879 and named player are online; it has its own new Mac intent lock, captures typed command receipt; no console or forced movement. New job IDs are required and must not repeat ambiguous outcomes. They do not prove path movement/jump/food consumption until independent live evidence exists.

## 2026-10-31 — Food and equipment survival refinement (source only; pending field check)

- Existing automatic best weapon/armor system checks about every 20 seconds; success is only logged after held-item or armor-slot confirmation. On eating, food occupies the hand; new logic forces an early next equipment review after confirmed food recovery. No automatic fabrication or duplication of gear.
- Existing food maintenance triggered at food<18 but was categorically prevented by any nearby hostile, including a verified wall-separated mob in the original 17879 enclosure. Now auto-eat may proceed with inventory food only when no danger OR an observed solid barrier is explicitly admitted by escort threat logic, health>8, and no self-damage within 6.5 seconds. If target is close, exposed, unknown or a recent hit occurs, eating remains barred. Adds food names already supported by the Bedrock food executor; confirms food rose rather than assuming success. Tests cover sheltered, open threat, recent hit and preservation of FOLLOW intent.
- No movement/witness/safety-recovery fallback relaxed and no BDS mutation. Requires Mint Node24 and live verification; new code not yet activated in running Alice.

## 2026-10-31 — FOLLOW 3-block proximity + visible owner facing (awaiting live validation)

- The existing Dashboard followDistance has default 3, supports integer 2..12 with live applied-revision acknowledgement. New pure followProximity uses real-foot 3D distance; inside radius releases existing FOLLOW path; a one-block vertical gap still needs safe Pathfinder ascent. Goal no longer subtracts 0.55 from configured range. Facing a verified visible owner is rate-limited lookAt only, with no movement or attack.
- Existing canDig=false, allowParkour=false, Bedrock BDS safety/navigation gates, non-FOLLOW autonomous behaviors, and other servers are unchanged. Stair hand-swing cause remains unknown pending live observation of jumpEdges, forwardPressedTicks, pathUpdate and BDS vertical delta. Do not claim a successful staircase ascent from this source change.
- Mac/Mint regression, source sync, and CLIENT-only guarded restart are required to activate source changes; Alice restart loses live FOLLOW intent. Do not restart BDS 17879 or unrelated 17880.

## 2026-10-31 — ORIGINAL 17879 verified FOLLOW movement RESTORED (do not regress)

**This is live original `Bedrock level` on Mint UDP 17879**, NOT simulated movement or any v1–v4 lab. The user requested continued work in the current world, no new world, and allowed project-controlled local tasks. Existing 17880 Zombie world and other BDS unchanged. Existing 8788 Mac web console and Alice client are operating; do not casually restart them now that real movement works.

1. Initial live read-only status `alice_live_current_20261031_98220c_6f28e1ae`: Alice connected, `SURVIVE`, independently stale BDS witness, current-session samples 0. Current player verified online. Verified old console FOLLOW bug fix by sending exactly **one** typed named online follow command through existing Mac Web API `alice_named_follow_once_20261031_560d01_c923b47e`: receipt `started/follow_intent_set`. Later reader `alice_follow_after_receipt_20261031_560d01_819fc2ea` confirmed persistent `followTarget=MolarParsley191`. Before the next code reload, live telemetry `alice_active_follow_20261031_07b517_b46ce19b` showed `SURVIVE`, health13, no moving input and `threat_nearby`. A typed command success is not physical movement.
2. **Root-cause candidate for enclosure misclassification fixed:** `escort_threat.cjs` passed a plain `{x,y,z}` to Bedrock Mineflayer `bot.blockAt()`, which requires Vec3; a thrown exception was swallowed and barriers reported `unknown`. Replaced with an actual `bot.entity.position.offset(...)` Vec3; unknown/read-failing world blocks still refuse to invent safety. Added strict real-Vec3 regression in `escort_threat.test.cjs`. Added compact `escort` and `equipment` diagnostics to 4KiB live status; optional fields are dropped before heartbeat failure. Synced without BDS restart `alice_17879_vec3_escort_sync_20261031_1250d6_6ee738d1`: Mint Node24 **671/671**, Mac Python266 with 3 skipped; one guarded Alice-CLIENT-only restart `alice_vec3_escort_live_reload_20261031_4b47f4_39a8c25f` returned `client_reconnected_17879`, healthy current owner and established session, NO BDS restart.
3. New live diagnosis `alice_vec3_escort_live_status_20261031_b06c2a_1494d2d8`: the wall is now actually observed `barrier=blocked`, held weapon `stone_sword`, but earlier FOLLOW intent did not persist **across client restart**. Then single deliberate follow command `alice_17879_vec3_follow_retry_20261031_40e109_1bcef26e` returned `started/follow_intent_set`; `alice_17879_vec3_follow_after_20261031_40e109_efd6ac21` showed **`coreState=FOLLOW`, `followingOwner=true`, `escortReason=hostile_behind_observed_barrier`, `escortBarrier=blocked`, `escortAllowed=true`, `ownerMoving=true`**, health13 and actual held stone_sword. The stale idleGate `threat_nearby` labels autonomy work, NOT a reliable indicator that FOLLOW was denied; use actual `coreState` and `escort` telemetry.
4. **MAJOR REAL BDS-AUTHORITATIVE MOVEMENT ACCEPTANCE** `alice_real_follow_bds_witness_20261031_ca589b_132ed4b9`: finite capped independent `mcsm_querytarget`, accepted **3/3**, stopped early once server displacement threshold 0.25m passed. Actual per-session **independent BDS cumulative travel=4.65 blocks**, **movingQueued=56**; last state `FOLLOW`, Alice still connected. No teleport, no forced motion, no legacy query loop, no separate world, no other BDS process operations. Initial task `maxAlignedObserved=false` and `maxFreshPairObserved=false` meant its periodic snapshots did not establish both conditions *in that window*; not proof of divergence.
5. Followup tightly capped separate 2-query check `alice_17879_follow_alignment2_20261031_bb2f5e_9f0d2c6e`: **2/2 BDS independent samples accepted and ingested**, ledger 3→5, **two fresh independent samples within 4s** and **client↔BDS error ≤0.75 blocks** confirmed, Alice still connected. This last pair travel=0 (Alice stood still then); DO NOT misrepresent it as 2 fresh MOVING frames. Combined evidence validates actual BDS displacement and independently fresh/aligned current position; continuous navigation reliability over a long path or reach-target still needs longer acceptance.
6. New owner-verified nighttime status `alice_sleep_current_after_movement_20261031_bb2f5e_e541832a`: Alice alive/connected, health13, night, two loaded remembered beds, `sleepOpportunity=nearby_hostile_bed_unavailable`, no active sleep job, has follow target. **Bed discovery works; actual sleep is correctly blocked by Bedrock's monster-near-bed rule even if hostile lies behind a wall.** Do not change difficulty, force sleeping or spawn commands to fake success. Next test should use an actually safe bed at another site/after mobs naturally leave, preserving low-health close-bed admission. Bed sleeping itself is still unverified.
7. Preserve 66-ID official Bedrock input mapping, 2-fresh-independent-BDS-sample requirement, 4s age, 0.75m alignment, safe Pathfinder, close-hostile/recent-hit preemption. The old continuous MCSManager witness service remains disabled to avoid console spam. No extra lab server should be created or started. Follow intent not surviving a process restart is a separate future persistence design question; no automatic restart should be done simply to address diagnostics. Current FOLLOW is active and movement proven.
## 2026-10-31 — EXISTING 17879: safer owner escort, gifted equipment, nearby bed

User confirmed Alice was in a closed room, could not follow the selected online player because Web console immediately returned `safety_preempted`, did not equip gifted weapons, and did not sleep with beds beside her. **No new lab worlds; production BDS UDP 17879 and Zombie UDP 17880 remain untouched.**

- Root causes verified in code: `console_commands.cjs` always rejected FOLLOW when any remote hostile was within range or health<14, even behind verified solid walls. `runtime.safetyTick/followTick` likewise suppressed follow while `SURVIVE`; equipment maintenance previously skipped all threats and handled potentially unacknowledged armor before held weapon. Bed observation skipped whenever `threat()` was set; sleep was gated by health>=16 (Alice had 13 HP) and could be preempted by optional crafting/shelter, so there was no attempt.
- Added `escort_threat.cjs` verified block barriers, bounded real owner movement, and escort admission: distant hostile while owner moving or physically blocked by verified solid barrier can allow FOLLOW; close monster (<=3.5), recent self damage, health<=8, unknown block/position and active `safetyBusy` retain emergency priority. 4.5 second stability delay after a hostile disappears is preserved. Web console now *accepts* explicit online target intents during survival but does not force physical movement/override ongoing emergency. Server-authoritative movement witness and cautious pathfinder are unchanged.
- Equipment maintenance now allows bounded inventory-only equip when no emergency job is active despite low health/ambient threats; hand weapon **before** armor. Equipment result confirms held item, never assumes successful ACK. Read-only `equipmentSnapshot` and bounded `lastEquipObservation` diagnostic added.
- Bedrock bed safety: bed survey passive at night even in danger; observed safe nearby bed evaluated **before** optional crafts/shelter and without arbitrary 16HP requirement. At <=2.4 block range interaction no longer requires Pathfinder; low-HP remote bed still cannot trigger unsafe walk. Actual Bedrock sleeping veto from monsters within 8 horizontal/5 vertical persists **even behind walls**; bed status explicitly reports `nearby_hostile_bed_unavailable` rather than claiming the bot slept. Never fake server sleeping acknowledgement.
- Independent read-only Mint before deploy `alice_17879_bed_live_20261031_386c7d_9f637a1d`: Alice connected, night, health13, 2 remembered beds, `sleepOpportunity=none`, `idleGate=low_health`. This proved omitted attempts rather than failed server sleep.
- Test failures caught and fixed: original adjacent-bed test expected unnecessary Pathfinder goto, changed to expect 0; old 4.5s threat-loss FOLLOW cooldown restored while allowing verified walled/distant ongoing threat. Mint nonrestart sync operation `alice_follow_bed_mint_fix_reg_20261031_667802_71609bbd`: **Node24 670/670 pass, 0 fail; Mac Python266, 3 skipped**. Previous Mac Python full regression `alice_follow_equipment_bed_regression_20261031_523678_5d78a9c4` passed.
- One client-only guarded restart `alice_live_escort_bed_client_reload_20261031_e486e9_754c2b18` returned `client_reconnected_17879`, fresh owner/heartbeat, game connected and session established, BDS never restarted and world not changed. No second restart needed.
- Postrestart daytime read-only observation `alice_17879_postfeature_bed_observation_20261031_e486e9_32c5de84`: health13, phase=day, 2 remembered beds, `sleepOpportunity=outside_sleep_window`; so cannot claim actual sleep success until the next in-game night with a safe bed and no BDS-blocking monsters.
- Independently read actual new owner's sanitized log `alice_live_equipment_check_20261031_17f34e_695b3f2d`: `state=observed`, `lastAction=equipped`, `lastItem=stone_sword`. Weapon equip worked in the CURRENT world, not merely a unit test; armor equipment and combat hit not independently verified.
- Remaining real-world acceptance: user clicks Web **Follow selected player** on `http://127.0.0.1:8788` while MolarParsley191 online, then verify waypoint safety and **server-confirmed** moving input and BDS displacement. At next night, inspect `sleepOpportunity` and actual `bot.isSleeping`/bed rejection; player-provided bed may still be invalid under Bedrock monster-radius rules. Never enable continuous MCSManager querytarget spam, force teleport or movement, or alter the three live BDS.

## 2026-10-31 — REAL existing world 17879 acceptance; lab projects paused

**User explicitly requested using Alice's CURRENT real `Bedrock level` at UDP 17879, not new worlds; any labs should be stopped. Do not prepare/start v1-v4 or another experimental BDS; do not stop/restart/kill Zombie UDP 17880, fight-alwasys or production BDS.** Read-only Mint `alice_existing17879_preflight_20261031_58088d_d4318acf` identified NO active v1/v2/v3/v4 lab BDS processes in the unprivileged view (not absolute proof for inaccessible root processes); ports 17879 and 17880 are both bound, and the existing MCSManager witness instance configuration was independently matched to the exact `~/minecraft-bedrock` production working directory. No lab process was signaled or lab world data deleted. Historical v1-v3 first-start one-shot markers and artifacts MUST remain unchanged.

The 2026-10-23 historic real Mint acceptance in `BEDROCK_INITIALIZATION_20261023.md` established actual BDS-authoritative travel 3.02 blocks, 80 independent `querytarget` samples, 20 matched wire moving inputs, and `server_verified_scout_endpoint`; not merely client prediction. The later continuous witness service was deliberately disabled for flooding the MCManager console, which explains why current Alice frequently has zero fresh independent samples, but does not by itself prove a movement-protocol regression. The historical success depended on native injection initialization and stable 66-entry protocol 2193 input IDs; do not renumber them.

Real 2026-10-31 live checks on production, **without restarting BDS or making an experimental world**:

- First capped two-`querytarget` operation `alice_17879_realworld_witness_20261031_0a002f_c6e34718`: both BDS queries accepted, Alice status initially sampled one due 2-second file poll/heartbeat; second coordinated `alice_17879_coord_witness_20261031_42ddc2_a18d3f4c`: both accepted/consumed, current-session sample ledger rose 2→4, pair travel 0 and client/BDS within 0.75m, although 4s pair freshness was not present at final snapshot. The old 2s single status/witness polling could miss overwritten one-shot JSON samples.
- Changed ONLY `bedrock-native/experiment/src/main.cjs` to poll **private local witness file at 250ms** on a separate timer while keeping status heartbeat 2s, clearing the timer on each shutdown; no MCS commands/console loop added. Added witness JS regression. Mac Python `alice_17879_fast_witness_reg_20261031_04bc90_29b1e73c` passed 266 tests/3 skipped; Mint nonrestart sync `alice_17879_fast_witness_mint_sync_20261031_04bc90_6cf29e71` passed Node24 **660/660**/Mac266. Only current Alice client then safely restarted once via existing operator check/pidfd/graceful logout/new client, operation `alice_17879_client_only_restart_20261031_264997_34f18ab2` returned `client_reconnected_17879`, current owner and heartbeat valid. BDS/other servers never restarted.
- Post-reader paired `alice_17879_after_fast_reader_20261031_8bc7f3_26d09e14` sent 2 fixed queries, both accepted, initial status saw 1 due 2-second publication lag; read-only later `alice_17879_postfast_readonly_20261031_8bc7f3_94e31cb2` confirmed **2** independent BDS samples for fresh login. Therefore input receiver **does consume** new samples.
- Final hard-capped **8** querytarget requests, operation `alice_17879_finite8_20261031_7acdb6_81f2ae39`: **8/8 accepted**, independent samples 2→9 at task snapshot (later 10), independent server travel **0→0**, outgoing moving inputs **0→0**, aligned observations yes, fresh pair never observed in periodic status, still connected and `SURVIVE`. The legacy continuous query loop remained disabled. NEVER confuse `queriesAccepted` with actual movement.
- Actual runtime gate `alice_17879_runtime_gate_20261031_668a75_18ff6c2e`: original connected session, agentMode `autonomous`, autonomyEnabled `true`, state `SURVIVE`, health **13/20**, food **16/20**, no active job, `worldRoutineIdleGate=threat_nearby`, movingQueued **0**, independentSamples **10**, pairTravel **0**. This is concrete evidence why ordinary SCOUT did not start in this window: active threat/low health safety state, rather than lack of any accepted BDS query or unconfigured autonomy. Not proof that no accepted movement could ever occur.
- Next focus on **existing world only**, read-only danger/retreat telemetry (`worldRoutine.escapeSurvey`, retreat failure classes, entity-ground collision safety), and bounded safe defense/escape regression. Keep server-authoritative independent coordinate proof, 0.75m alignment and two fresh under-4s samples. No forced teleport/motion and no unsafe lowering of gates. Avoid new BDS clones, endless querytarget polling, or autonomous spawn restarting.

## 2026-10-31 — v2 BDS first startup FAILED; new distinct v3 control is READY (not started)

- The user ran one authorized v2 first BDS probe in a child user+network namespace. Exact receipt verified by OpenClaw `alice_v2_firstprobe_after_exit_20261031_43c1298d`: `state=lab_exited_with_error`, `isolatedBdsExited=true`, `serverReadyObserved=false`, `verifiedScriptModuleLoaded=false`, `networkNamespacePreflightPassed=true`. This **consumed** the v2 first-start marker. Never clear the lock, delete its report or run the v2 BDS startup again. No production world/BDS/Alice restart was involved. Original `probe()` wrote console output to an ephemeral TemporaryFile and discarded it on exit, so the exact v2 error cannot be recovered. No guessed cause should be presented as fact.
- Deterministic *read-only* static postmortem on Mint `alice_v2_elf_needed_static_20261031_af141_1596ca73`: v2 BDS ELF64 x86_64, executable, 244.3MiB; PT_INTERP loader present and in trusted system directory, 7 direct needed libraries all found in lab/system common dirs, safe controlled `online-mode=true` and 17880/17881, level.dat present, 3 original probe backups and marker present, no `noexec`, no persisted startup stdout. These eliminate obvious executable/config issues but do not determine the nonzero-exit cause.
- Created an intentionally DIFFERENT experiment: `minecraft-bedrock-alice-lab-v3` is a fresh, separately named archived-world **BDS-only control**, without Script API pack, Beta NBT changes, allowlist entries or private player/permission records. Its only goal is discriminating baseline BDS boot/network environment failure from v2 Script API instrumentation failure. It uses the same isolated netns with child `lo` initialized, does NOT touch host UDP 17880/Zombie BDS or production 17879, and has its OWN never-reusable one-shot lock. The new `alice-v3-control-first-start.py` waits up to 55 seconds for ready/early exit and never retains raw stdout, only safe failure enum, exit kind, time, bounded log size and SHA. Root-owned BDS process identity is still checked through interactive sudo readlink; no unsafe bypass.
- All reviewed source through `0c9440e4cf803de7a7cf4d54132c2dc5696db043` passed Mac Python 266 (3 skipped) and Mint Node24 658/658 with `alice_v3_complete_sync_20261031_0c9440_82a16db9` (nonrestart). The archive prepare task `alice_v3_control_archive_prepare_20261031_0c9440_f2b1938e` `passed` with `state=prepared`, verified archive SHA+isolated restore, v1/v2 and production unchanged, no BDS start. The new read-only audit `alice_v3_first_start_readonly_audit_20261031_450ed9_3b6a841f` confirms `ready_for_privileged_preflight`; read-only `alice_v3_first_start_receipt_before_20261031_450ed9_06f8ab31` confirms `prepared_not_started`. Script `.openclaw/tasks/alice_v3_control_receipt.json` reads later outcomes without repeated command or log uploading.
- Only remaining user action before NEW v3 FIRST BDS-only control startup is in their Mac Terminal:
  ```bash
  ssh -tt tedz@192.168.0.104 '/usr/bin/python3 ~/minecraft-ai/scripts/alice-v3-control-first-start.py first-start'
  ```
  The Mint sudo credential must be entered locally in that TTY, never into ChatGPT or a tool argument. It is only cached for read-only root BDS cwd disambiguation; all BDS runs as Mint's ordinary user within a new isolated child user/net namespace. Do not repeat on an unclear result. Afterward read a NEW pinned `alice_v3_control_receipt.json` task via OpenClaw and diagnose whether baseline BDS reached ready.
- Alice remains connected but `IDLE` with 0 independent BDS witness samples. Neither v2 failure nor v3 readiness proves real movement; keep 2-fresh-independent BDS samples and 0.75m server alignment mandatory.

## 2026-10-31 — v2 Script API lab continuation (one-shot first probe, not a retry)

- User previously ran `alice-v2-interactive-activation.py activate` as the ordinary Mint user through an interactive SSH terminal. Verified persisted receipt: Script API pack staged, Beta NBT checked and enabled with original byte-preserving backup; `netns-check` blocked. The **activation is consumed** and must never be run again, nor may its once-only intent/result be deleted or reset.
- Read-only Mint diagnostic `alice_v2_netns_diagnostic_83881_20261031_d53e7a49` proved `/usr/bin/python3` is a root-owned symlink to a non-writable /usr/bin executable, exact child netns/lo setup exits 0; old preflight incorrectly refused all Python symlinks. Fixed by only trusting a validated root-managed `/usr/bin/python3 -> /usr/bin/python3.N` target, rejecting external and writable targets. After syncing, independent diagnostic `alice_v2_netns_verified_after_sync_20261031_33af7e21` proves `v2LoopbackPreflight=true`; no BDS or host network mutation.
- New `scripts/alice-v2-resume-first-probe.py` offers read-only `audit` and one interactive `resume-probe`. It checks the exact four-stage previous receipt, original private once-only marker, and absence of **every** probe lock/backup/instrumented script marker. It never re-stages Script API files or edits Beta NBT. Its `netns-check` verifies BDS process identity and child loopback first, then creates a fresh exclusive first-probe intent and invokes `netns-probe` **at most once**, recording a private sanitized result. If the BDS probe is interrupted or the result is ambiguous, never repeat; inspect the receipt.
- Real read-only eligibility task `alice_v2_firstprobe_eligibility_20261031_28ac8b_26e42c71` returned `eligible_for_privileged_preflight`. Its companion `.openclaw/tasks/alice_v2_first_probe_status.json` reads the same status/receipt without re-running the probe. All source verified: Mac Python 255 tests (3 skipped), Mint Node24 658/658, nonrestart sync `alice_mint_sync_28ac8b_20261031_b9a17de4`, zero failures.
- **Only remaining operator action:** on Mac Terminal run:
  ```bash
  ssh -tt tedz@192.168.0.104 '/usr/bin/python3 ~/minecraft-ai/scripts/alice-v2-resume-first-probe.py resume-probe'
  ```
  Enter Mint sudo password only in your terminal. Cached sudo permits **read-only** `sudo -n /usr/bin/readlink -e /proc/PID/cwd` to distinguish existing root-owned BDS processes; it is invalidated afterward. All pack/BDS operations remain under ordinary Mint user. The probe exclusively targets the disposable v2 Bedrock clone, with its own fresh user+network namespace (lo enabled) and a bounded ~12s BDS run, followed by stop. It does **not** touch host 17880 Zombie server, production 17879, third BDS, old v1 lab, Alice client, host network or production witness; it sends no console querytarget polling or Xbox login.
- User needs only to report that command finished. Agent will call a **new** pinned `repository_task` using `.openclaw/tasks/alice_v2_first_probe_status.json` to retrieve the result; no manual log uploads or repeated command. Script import marker is **not** independent BDS position, accepted walking or navigation validation.

## 2026-10-31 — Alice v2 compatibility next-step after isolated netns loopback verification

- Real deterministic diagnostic `alice_netns_lo_check_b49470_20261031_c2e58a19`: a new unprivileged user+net namespace has `lo` DOWN, but SIOCSIFFLAGS can set it UP without touching the host. A v2-only preflight now verifies loopback setup before consuming the single BDS startup attempt; v2 startup enables child lo then execs cloned BDS, while consumed v1 behavior stays unchanged. First Mac regression on 1fa141 failed one v1 test due v2 detection using the returned lab pointer; fixed by remembering whether caller explicitly passed v2 in `9860308b652bad14fd4177f11e0e7a84814e0a9b`.
- Fixed Mac regression `alice_regression_9860308_20261031_e26a53c1` passed: 247 Python tests, 3 skipped, target v2 7/7. Nonrestart Mint sync `alice_mint_sync_9860308_20261031_4e5b2a73` passed, cached true, Mac Python247, Mint Node24 658/658, exit0, no Alice/BDS restart/world edit. So v2 toolchain source is on Mint and verified, but no v2 pack stage/Beta/probe run; real Script API import/untrusted position remains unknown.
- Next ONLY user step: in Mac Terminal, issue `ssh -tt tedz@192.168.0.104 '/usr/bin/python3 ~/minecraft-ai/scripts/alice-v2-interactive-activation.py activate'`, and enter Mint sudo password in their own TTY (never ChatGPT). This is explicitly NOT read-only: it authorizes read-only sudo-cached process cwd disambiguation, and as normal Mint account creates package files / toggles Beta on the NEW disposable v2 world with byte-for-byte original backup, then starts and stops the v2 BDS ONCE for ~12s in child network namespace. Production 17879/Zombie17880/third BDS and worlds, v1 consumed lab, Alice client and host networking untouched. Script creates a persistent one-shot intent file; no automatic retries if interrupted/unknown. No credentials logged.
- Added fixed read-only OpenClaw `repository_task` `.openclaw/tasks/alice_v2_activation_receipt_read.json` to inspect only the owner-only v2 result JSON and one-shot intent afterwards, with an allowlisted summary. This avoids asking user to upload sensitive logs. A passed module import only establishes BDS Script API import compatibility, NOT player-position transmission or independent walking.

## 2026-10-31 — Alice P0 witness gate + deterministic Mac/Mint verification ACCEPTED (source, not gameplay)

- The OpenClaw Mac `alice-ai` project was connected to enrolled generic `repository_task` without changing Agent permissions or restarting Tunnel. Two bounded read-only report tasks succeeded: `alice_mint_parity_20261031_800cdc_72b5a4c1` verified Mint Node24 v24.22.0 and then-current Mac/Mint nav code parity; `alice_v2_existing_report_20261031_26f0b79_6ce3a1d2` found one historical v2 `check` report (`archive_sha256_isolated_restore_verified`, `absent`, `ready_for_explicit_lab_prepare`). Historical operation attribution remains unverified, so never replay its old started ID or claim the v2 BDS launched.
- Tightened `scout_start_proof.cjs` to accept ONLY explicit `independentSource/independentLatestFeet/independentAt/independentPreviousAt` from BDS witness evidence; ordinary position corrections cannot fill missing fields. Prior two-fresh-sample/4-second/0.75m checks remain. Repaired six outdated positive-path Node fixtures rather than weakening production checks.
- Initial nonrestart sync failed before Mint source delivery: deterministic Mac-only diagnostic proved `/usr/bin/python3` 3.9.6 errored loading `test_acceptance_export`. Fixed `alice-mac.sh sync` to choose supported Python >=3.11 (prefer reviewed Homebrew). The next sync reached Mint Node24 but revealed six old-schema fixture failures (658 total, 652 pass). Updated fixtures and retested.
- FINAL accepted source release: GitHub main `554f5e8f2e2e3cdabbf71df83d824521abc0cf3f`. `alice_mac_regression_554f5e8_20261031_b3d9f418` passed: v2 targeted Python 7/7, Mac Python 228 with 3 skipped; `alice_mint_sync_554f5e8_20261031_a82e5d74` passed/cached:true, Mac Python 228, Mint Node24 658/658 pass, 0 fail/skipped, `syncExitCode=0`. Its `mint_sync` artifact was read successfully. After sync, independent `alice_postsync_parity_554f5e8_20261031_7c4a90e1` passed with `state=verified`, `sourceMatch=true`, `testMatch=true`, Node v24.22.0.
- All failed/uncertain operation IDs remain unchanged and doNotRepeat. This was SOURCE SYNC ONLY: no Alice client restart, no BDS restart or querytarget, no v2 prepare/start, no world mutation. The running Alice process may still be on an older code version. Independent BDS position witness is still absent/stale; real walking, collecting, and gameplay acceptance have NOT been established. Next phase requires separately scoped live-witness/Script-API verification, not disabling guard or interpreting Mac/Mint source tests as real movement success.

## 2026-10-31 — Mint Node24 failure diagnosis after first real updated sync

- After compatible Mac Python selection, pinned nonrestart sync `alice_mint_sync_dcf3e742_20261031_7f0ab19d` reached Mint Node24, reporting 658 tests, 652 pass, 6 fail. This is **failed** acceptance; do not deploy or restart Alice/BDS. Existing sync runner captures child output but cannot read its declared artifact when the test step exits nonzero. The new repository task `alice_mint_node_failure_diag` runs only the maintained Mint `alice-mac.sh test` action, **not sync**, with a bounded fixed-target SSH call. It records only fixed Node summary and sanitized failing test names via artifact `mint_node_diag`; no world, console, Git update or service operation.

## 2026-10-31 — Nonrestart sync blocked by macOS system Python 3.9.6

- The deterministic sync operation `alice_mint_sync_f283c965_20261031_c59d2fa7` returned `failed_or_unverified` with no Mint Node24 summary; later read-only source-hash parity showed the latest navigation files were NOT delivered to Mint. Separate deterministic Mac-only preflight `alice_mac_python_preflight_fb83_20261031_a517d82b` reported Python 3.9.6, `tests_failed`, 225 discovered, with `ERROR: test_acceptance_export (unittest.loader._FailedTest)`. In contrast, fixed `alice_mac_regression` used a compatible Homebrew interpreter and passed 227 tests (3 skipped).
- `alice-mac.sh sync` now selects `/opt/homebrew/bin/python3` when present, otherwise finds `python3`, and requires Python >=3.11 before running Mac tests or rsync. This explicitly rejects unsupported system 3.9 without syncing files, preserving the existing sync/backup/Mint Node/restart restrictions. Added an offline Python contract asserting the interpreter check precedes rsync. A new exact-commit regression and new-version sync are required; the previously failed operation remains doNotRepeat.

## 2026-10-31 — Mac Python preflight diagnosis after failed nonrestart sync

- The deterministic nonrestart sync `alice_mint_sync_f283c965_20261031_c59d2fa7` failed at its task step, yielding `failed_or_unverified`, no reliable Mint Node24 summary and no accessible declared artifact on failure. A NEW read-only source parity audit showed Mint Node24 v24.22.0 is present, but the latest navigation source and unit test hashes differ between Mac/Mint. Do not mark source delivered or retry the failed sync under a new ID. A separate pinned task `.openclaw/tasks/alice_mac_python_preflight.json` runs only the Mac Python `unittest discover` preflight and emits a sanitized `mac_preflight` JSON report naming the failing test(s). No SSH, rsync, BDS, server console or world mutation.

## 2026-10-31 — Deterministic pinned Mint nonrestart sync task

- Added `.openclaw/tasks/alice_mint_nonrestart_sync.json` and `scripts/alice-mint-sync-task.py` for the existing repository-maintained `alice-mac.sh sync` command, avoiding the 120-second local-model budget for lengthy Mint regressions. This newly enrolled generic `repository_task` is pinned to a reviewed Git commit, checks clean main, passes only the explicit approved Mint SSH destination, runs Mac Python, Git-tracked rsync with backups, and Mint Node24 test. Does NOT deploy, start/restart Alice or BDS, issue MCSManager commands, enable v2 or alter worlds. It emits only a bounded JSON test summary (`mint_sync` artifact). If sync times out or returns an unexpected summary, preserve inconclusive state and never resubmit the operation under another ID.
- The previously inconclusive older sync operation `alice_mint_sync_pair_20261031_e18b9f64` remains historical doNotRepeat; this workflow is for a NEW version with the independent-witness fallback fix. Read receipts/artifact rather than inferring Mint success from Mac tests.

## 2026-10-31 — Reconcile stuck v2 check from existing reports, never rerun

The old v2-check computer operation remained \`started\`. A new pinned \`repository_task\` audits ONLY existing, owner-only Mac Desktop \`AliceAI-BDS-Lab-v2-check-YYYYMMDD-HHMMSS.json\` reports within a bounded historical time window; it does not call the check, SSH, Mint, BDS, an Agent or any model. Validated fields and flags are allowlisted. A found report is only a **candidate** and cannot prove which operation created it. No report means execution remains unknown, not failed. The JSON artifact \`v2_report_audit\` can be read via \`openclaw_project_report\`. Preserve the old operation ID and never retry uncertain operations under a new ID.

## 2026-10-31 — Deterministic Alice Mint read-only parity audit

The enrolled \`repository_task\` runner replaces 120-second model-driven Terminal steps for this narrow diagnostic. \`.openclaw/tasks/alice_mint_readonly_audit.json\` declares an offline parser self-test and a single SSH read-only verification against the operator's existing Mint target. \`games/minecraft-ai/scripts/alice-mint-readonly-audit.py\` compares the exact Git-tracked navigation source and regression test SHA-256 between Mac and Mint and checks that Mint's owned \`~/.local/share/alice-bedrock/node24/current/bin/node\` resolves within its own Node24 root and reports a version beginning with v24. It emits only fixed booleans/version/enum to the runner-owned \`mint_readonly_audit.json\` artifact; \`openclaw_project_report\` can read this by artifact_id \`mint_parity\`.

The task DOES NOT rerun previously inconclusive Mint Node tests or synchronize files. It does not call MCSManager, querytarget, BDS, Alice start/restart, v2-check/prepare, or read player/world data. A matching source is not proof that the prior sync completed or Node24 tests ran. The earlier uncertain operation IDs remain doNotRepeat and must be reconciled only by independent observations. The task itself must be executed once with a new pinned commit and its own operation ID, then read via project_result and project_report. No gameplay acceptance is implied.

## 2026-10-30 — P0 querytarget delayed witness freshness fix (source-only)

- Read-only Alice status reported stale_or_invalid_witness / sample_predates_current_login. This reports an old sample, not a new BDS query. The opt-in querytarget parser previously assigned observedAt at delayed HTTP/log read time and could mislabel old server coordinates as fresh. Now it uses the time the single fixed querytarget was issued and rejects target data parsed >4 seconds later using a monotonic clock; it reports only a sanitized querytarget_response_too_late enum and never publishes stale coordinates. Offline delayed and prompt tests were added. This does not enable the disabled console polling loop or change BDS commands. No Mint sync, new querytarget, server restart, world changes or movement acceptance was executed for this source change. Run Mac Python/Mint Node24 regressions before any separately authorized deployment; real independent position evidence is still missing.

## 2026-10-25 — Bedrock stationary self-defense P0, source staged

- User approved Phase 1 combat survival repair. Last 3-hour acceptance evidence (2026-10-25 23:31 +08): 6,236 entries, 232 death observations, 496 failed retreat results split 212 `retreat_pathfinder_error`, 174 `retreat_flat_geometry_not_verified`, 110 `retreat_no_verified_away_corridor`; 132 cornered melee attempts and 132 unattributed target-hurt events. No verified independent BDS positions or autonomous walking. The old runaway client was started before current source sync; disk changes are NOT live process proof.
- New pure `defensive_melee.cjs` now admits a **single rate-limited stationary** counterattack after failed emergency pathfinder ONLY IF `retreatFrom` explicitly requested stop and no movement is reported when `isMoving` exists, target remains a loaded hostile, melee-reachable within 2.75 blocks, living and ready; known impassable corridor still permits the existing 3.5-block last-ditch defense. A stale independent BDS witness DOES NOT permit walking; a static melee hit may be attempted after `retreat_bds_position_unavailable` ONLY with independent recent server packet correction aligned <=0.75 blocks to client, within 4s, and enemy <=2.75; diverged/unobserved coords categorically rejected. Creepers are never engaged by stationary fallback; no charging, teleport, digging, forced path, or BDS writes.
- Emergency melee backoff caps 2.5s when health <=13 and mob <=2.75 blocks, retains >=1.75s minimum; healthy or out-of-reach fallbacks preserve up-to-12s exponential backoff. `entityHurt` packet has no attacker attribution; do NOT reset the unverified attack backoff or log a verified hit based only on target hurt. A narrow post-attempt time correlation is logged only as `target_hurt_attacker_unverified`.
- Added pure and integrated Node24 regressions for no-route, stopped/un-stopped Pathfinder, stale/diverged packet proof, close target and creeper, duration/cooldown, and anonymous damage. No new dependency or mineflayer-pvp (Java plugin incompatibility not established), no Mint/live test executed yet, no Alice or BDS restart or MCSManager calls. Live confirmation still requires later approved single-client restart and independent BDS evidence.

## 2026-10-25 — Read-only witness-diagnose and respawn stage labels

After verified Mint 644/644, `alice-mac.sh status` showed PID3895891 alive and current, `bdsWitnessStatus=stale_or_invalid_witness`, 0 independent BDS samples, 0 movement inputs, and `scout_bds_position_unavailable`. `diagnose` showed only this one Alice process and repeated `death_observed` and `spawn_confirmed` events, but not the per-event recovery phase.

Use maintained new read-only Mac action:
```bash
ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-diagnose
```
Or Mint `python3 ~/minecraft-ai/scripts/alice-mint.py witness-diagnose`. It checks **only** current owner PID/start-token status plus the private `~/.alice-bedrock-control/bds-position-witness.json`, reports bounded classification and timestamp age, never returns identity, coordinates or any raw JSON. `recent_candidate_not_acceptance_proof` merely means file shape/time could qualify; it does NOT confirm MCSManager instance, Alice gamertag/session or actual movement. `sample_predates_current_login` and `sample_expired_over_4s` confirm stale evidence without issuing a console request. MCSManager `--check` and `--diagnose` remain configuration/log checks only; neither renews coordinates.

The regular read-only `alice-mac.sh diagnose` additionally reports fixed respawn `phase` and `reason` for recent lifecycle lines when recognized. No new network, console, BDS/world or authentication action. Sync via the existing `alice-mac.sh sync` (Mac Python/Mint Node24 suites, backups, no restarts), then run `witness-diagnose` and `diagnose`. Full updated suites and live report pending.

## 2026-10-25 — Live operator witness rejection reason (source-only, no client restart)

- Operator ran Mint Node24 **644/644 pass** after passive evidence separation; PID **3895891** was the same identity, fresh heartbeat (1.5s), `connected=true`, established 17879 session, health 20, goal `LEARN_WEAPON` but `IDLE` with `scout_bds_position_unavailable`. The wire audit recorded **3,428,282** input frames, **0 moving inputs**; `bdsAcceptedSamples=0`, `bdsFeet=null`, `bdsVerifiedTravel=null`, inspection exit **2 / BDS_POSITION_NOT_FRESH**. `mixedObservedTravelUnverified=28428.01` is explicitly not BDS-confirmed travel. Tests passed, movement has not.
- The currently running status heartbeat already includes `movementEvidence.witnessStatus` from `BdsWitnessReader.poll`, but the maintained Mint `alice-mint.py status` masked that reason. The operator's **read-only** status output now includes a fixed-enum `bdsWitnessStatus`, sanitized `bdsIndependentSource`, and age `bdsLastIndependentAgeSeconds` from that SAME PID/birth-token-matched status file, plus alias `mixedObservedTravelUnverified` to prevent confusion with genuine BDS travel. An older or wrong-process heartbeat exposes no witness detail. An `accepted` historical status is not automatically called fresh: age is shown explicitly. No private config, API key, gamertag, unique ID, full console logs, world data or arbitrary status strings are emitted.
- No Alice/BDS restart, no console commands, no background poller. After Mac Python / Mint Node regression, `alice-mac.sh status` immediately reveals the existing running process's witness rejection reason without a game restart. A `not_configured` reason may mean missing position output even when `bds_position_witness.py --check` validates config. `stale_or_invalid_witness` may mean old or mismatched witness; it does not authorize bypassing the guard. Do not run `--once` / `--loop` or alter the three servers without separate permission.

## 2026-10-25 — After 638/638 tests, passive BDS movement evidence remains unavailable

Operator reports PID 3895891, current-process fresh status/connected established, IDLE holding LEARN_WEAPON on `scout_bds_position_unavailable`, 0 independent witness samples, 0 moving inputs, 3,399,081 queued input frames. `bds_position_witness.py --check` confirmed private config, and `--diagnose` read 8 KB MCSManager outputlog **without** sending BDS console commands. Inspector exit 2 `BDS_POSITION_NOT_FRESH` is expected; `serverTravelBlocks=27886.34` came from mixed server-origin packet corrections, not independent displacement.

The legacy `travelBlocks` counter mixes server packet observations and external samples; the report correctly labels it `mixedObservedTravelUnverified`, not packet-only distance. Source-only hardening separates `independentTravelBlocks` and most-recent consecutive `independentPairTravelBlocks` from `travelBlocks`, and the inspector requires fresh consecutive BDS samples plus time-related moving input. `bdsVerifiedTravel` is null when no independently comparable samples exist. There is **no** new source of witness sampling: neither `sync` nor `status` nor `--check` nor `--diagnose` sends `querytarget`. Run the existing `alice-mac.sh sync` for Mac/Mint regression only and use `alice-mac.sh status` plus `inspect_movement_sync.cjs` for passive state. The running PID won't reflect new runtime fields without separately approved Alice restart; do not infer missing fields are a service failure. No BDS action or automatic witness loop allowed.

## 2026-10-25 — Node24 movement-audit fixture freshness correction

Latest Mint Node24 suite on `d27f3e3`: 633/634 pass; the positive `inspect_movement_sync.test.cjs` case failed with `movement_report_stale` because mocked status/wire files were written after the injected `now` and acquired future mtimes. Test fixtures now pin both synthetic mtimes to `now-1000ms` and verify fail-closed cases for stale/future mtimes. The production 15-second freshness/identity guards are unchanged. Run the documented `alice-mac.sh sync` again; only after the suite passes proceed to passive `status` and existing independent witness checks. No Alice/BDS restart or MCSManager console command is authorized by this test repair.

## 2026-10-25 — Back to existing 17879 production world, no extra BDS

Operator clarified three pre-existing MCSManager Bedrock services: `bedrock-default` at 17879 (Alice's actual world), `zombie-apocalypse` at UDP 17880/27880 (world `zombie-apocalypse`), and `fight-alwasys` (port not yet verified). The disposable Alice beta lab previously assigned 17880 was a **fourth, separate, not-started** BDS clone. The observed `lab_udp_ports_busy` is explained by the long-running `zombie-apocalypse` BDS: PID 1712655, working directory `~/minecraft-bedrock-zombie-apocalypse`, independently confirmed by operator with read-only `sudo ss`, `fuser` and proc cwd; port 17879 is occupied by production PID 2875730. These are historical observations only, not live guarantees. **No existing BDS should be killed, stopped, restarted, modified or have ports moved.** Do not run 17880 startup probe or create a fourth BDS unless the operator explicitly reauthorizes a separate lab test.

Main task returns to reliable Alice autonomous movement on existing `bedrock-default:17879`. The repo already implements a separately operator-controlled, fixed-`querytarget` MCSManager witness via `scripts/bds_position_witness.py` and private `~/.alice-bedrock-control/bds-position-witness.json`. It is **not** proof that a fresh service is running. A historical witness became stale; previous BDS queries showed unchanged Alice feet and zero server-travel despite client-predicted displacement. The Mint operator Python process documentation says the former automatic `mcsm_querytarget` unit was disabled because it flooded the console. **Do not re-enable `--loop` or issue any console command as part of a passive status check.** A future single fixed `querytarget` requires its own separate opt-in and confirmation that MCSManager instance ID maps to bedrock-default, not zombie/fight instances.

Read-only inspector `bedrock-native/experiment/scripts/inspect_movement_sync.cjs` now fails closed if the private active Alice owner lock PID, expected Node24 executable / entrypoint / cwd, live `/proc/PID/stat` process birth token, and `status.json` producerPid/producerStartToken don't match. The 0600 owner-only `status.json` and `outbound-input-audit.json` must both be fresh (<=15s) with a properly typed audit record. A current-session movement verdict additionally requires `connected===true`, `sessionEstablished===true`, exact 17879/Bedrock level and >=2 fresh independent querytarget samples plus >=0.25 actual recorded server motion. If any provenance or freshness condition fails, the inspector reports unavailable or unconfirmed; it never manufactures online status from an old session. The script neither queries MCSManager nor reads credentials or world files, nor alters game state. New offline Node fixtures exercise matching session, PID reuse, stale wire, wrong executable/cwd and unsafe permissions. Tests are **source only until Mac/Mint suites run**.

Safe verification order: use the existing operator `alice-mac.sh status` (read-only, already checks PID/start token), optionally `python3 ~/minecraft-ai/scripts/bds_position_witness.py --check` and `--diagnose` for private config + MCSManager outputlog availability **without console command**, and the strengthened Node inspector only when audit files exist. Do not automatically launch/stop Alice or BDS or install behavior packs. Reassess movement protocol only after fresh server-origin position evidence establishes lack of BDS progress.

## 2026-10-24 — Successor handoff / current owner-audit checkpoint

Read [HANDOFF_2026-10-24_UDP17880_OPENCLAW.md](HANDOFF_2026-10-24_UDP17880_OPENCLAW.md) before the next AliceAI 17880 task. Last user-run `witness-lab-port-check` after **628/628** Mint Node tests: UDP IPv4 17880 is in use, IPv6 17881 is available, socket row exists but PID/process name is **not visible** to unprivileged `ss`; lab clone backup/lock presence booleans are false. Do **not** rerun the one-shot startup or stop a guessed process. Current maintained entrypoint `alice-mac.sh witness-lab-port-owner` performs an explicitly operator-authenticated, read-only fixed UDP 17880/17881 owner audit and has no live result yet. Use the exact operator commands and interpret evidence as documented in the handoff. No modification to 17879 production BDS/world.

## 2026-10-24 07:45 — read-only privileged owner audit for UDP 17880 (explicit manual action)

Live Mint JSON after 628/628 tests: `ipv4_17880=in_use`, `ipv6_17881=available`; one 17880 socket row in `socketOwners`, but `ownerVisible=false` and `owners=[]`. This proves no visible PID from the ordinary Mint account, NOT that there is no socket owner. Isolated lab directory exists; configuration/script backups and probe lock all absent. Never kill a service or rerun the one-shot BDS probe on these facts.

New **separate**, explicitly requested and human-authenticated read-only action: `alice-mac.sh witness-lab-port-owner`. It requires a local interactive Mac Terminal and an already configured `ALICE_SSH_TARGET`; through the fixed SSH target it requests `sudo -v` on Mint only to authenticate, then runs **unprivileged** `alice-bds-lab-ports.py --owner-audit`, which executes exactly `sudo -n /usr/bin/ss -H -u -a -n -p ( sport = :17880 or sport = :17881 )` under Mint's cached sudo authorization. The command only reads UDP socket tables. Only bounded JSON with fixed target ports, address family and if visible the process name/PID is returned, not the raw socket addresses, user IDs, command lines, process arguments, secrets or other ports. If sudo or ss fails, `socketOwners.status=unavailable`; the existing independent UDP binding checks still reflect available/in_use. `ownerAuditRequested=true` proves only that the audit was requested; it does not prove PID visibility, service ownership, or authorization to stop processes.

**Mac operator commands:** after `git fetch origin main && git pull --ff-only origin main`, run `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync` (Mac Python and Mint Node suites), then `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-lab-port-owner`. When prompted, enter Mint sudo credential only in the remote sudo prompt on Mac Terminal; no credential in script, argv, env or Git. Owner result is read-only and is NOT authorization to kill, change firewall, shift ports, remove lab locks/backups or restart production BDS 17879. Review full sanitized JSON and only then decide how to handle the conflicting process. No unattended credential bridge was added.

## 2026-10-24 07:xx — UDP 17880 definitely unavailable; identify owner without stopping service

After tests (Mint Node 628/628 passed), read-only `witness-lab-port-check` gave `ipv4_17880=in_use`, `ipv6_17881=available`, with config backup, instrumented script backup and lab probe lock all absent. Thus the experimental BDS startup remains blocked on the first availability check; do not infer the owner or remove any socket, restart any service, or repeat the one-shot lab probe.

The maintained diagnostic has been extended to include `socketOwners`, using only fixed Linux `ss -H -u -a -n -p ( sport = :17880 or sport = :17881 )` against the known lab UDP ports. Returned data retains only socket family, numeric target port, and bounded process name/PID when visible to the Mint user. `ownerVisible=false` is not evidence of no owner. The filtered Linux `ss` output itself, other ports, addresses, shell commands, credentials and process command lines are never returned. If `ss` is unavailable or fails, the prior UDP bind data remains authoritative as a point-in-time snapshot; show `socketOwners.status=unavailable`.

Safe Mac operator steps: fast-forward Alice main, run existing `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync` (Mac Python + Mint Node tests), then `... witness-lab-port-check` only; review the JSON `socketOwners` alongside `ipv4_17880`. If owner is not visible, request a separate bounded read-only process-inspection action before changing ports or stopping processes. Never rerun `witness-lab-startup-probe`, remove clone one-shot markers, or alter the running 17879 world.

## 2026-10-24 07:xx — Python test blocked sync before new 17880 UDP diagnostics

Operator's Mac Python suite: `Ran 175 tests`, `FAILED (failures=1, skipped=3)` in new `test_marker_presence_only_no_world_content_or_mutation`: temp root had marker files, but `marks['probeLockPresent']` was false. Root cause in source: `preparation_markers(home=Path.home)` bound the default function before the test patched `Path.home`, so the code resolved the Mac's real home instead of the isolated temporary fixture. Fixed to late-bind `Path.home()` only when no explicit home argument was supplied; added a test proving post-import monkeypatch and explicit-home injection agree. This is strictly a fixture/testability correction: no UDP port availability finding has yet been collected; the prior `lab_udp_ports_busy` remains unexplained. Mac `sync` aborted at Python tests, so no Mint deployment or lab re-probe should be claimed. Source-level review and a local isolated behavior check passed; rerun Mac test suite, then existing maintained `sync`/read-only `witness-lab-port-check`. Do not reset existing lab backup/lock or start 17880 again.

## 2026-10-24 07:20 — 17880 startup blocked by UDP bind check, no server-ready evidence

After Mac/Mint regression 628/628 passed, operator executed the one-shot `witness-lab-startup-probe`. The fresh 20261024-072050 schema-1 report had `state=blocked`, `reason=lab_udp_ports_busy`, `serverReadyObserved=false`, `verifiedScriptModuleLoaded=false`, `isolatedBdsExited=false`, and all production mutation flags false. No experimental BDS launch was observed. The report alone **does not distinguish** IPv4/UDP 17880 conflict from IPv6/UDP 17881 conflict or unsupported socket family; no process owner is established.

Source root cause of ambiguous failure classification: `ports_free()` catches **all** Python `OSError` from both wildcard UDP binds and collapses them to `False` → `lab_udp_ports_busy`. It checks both before the one-shot guard and immediately before launch. Never weaken this guard or assume a port is available. Added read-only `alice-mac.sh witness-lab-port-check`: after normal approved `sync`, runs the Mint `alice-bds-lab-ports.py` with ordinary SSH `-T`; produces one bounded JSON object identifying each port as `available`, `in_use`, `family_unsupported`, `permission_denied` or `socket_error`. It also checks **presence only** of the cloned lab's config backup, instrumented script backup and advisory-lock file to distinguish whether one-shot staging may already have occurred. This reads metadata only, neither starts/stops BDS nor resets markers, touches worlds or credentials. Bind probes are point-in-time only, not evidence of process ownership; an `in_use` result requires separate read-only listener identity diagnostics before any collision remediation.

A second real issue: `output('probe','blocked')` used to default `isolationConfigReady=true` simply from `mode=probe`. That was **not** evidence of successful lab hardening. It now defaults false for blocked/unverified evidence, and a `run_action('probe')` returning from the successful preflight/instrumentation path explicitly sets it true. Reports created before the fix remain historically unverified, even if they say true. No BDS script/world was changed to achieve the new report.

Operator procedure: update Alice `main` ff-only; run `ALICE_SSH_TARGET=user@Mint bash games/minecraft-ai/scripts/alice-mac.sh sync` (tests); run `... witness-lab-port-check` **once as a read-only diagnostic** and share the generated JSON terminal output. DO NOT rerun `witness-lab-startup-probe`, erase `.alice-lab-probe.lock`, overwrite backup markers, start another BDS, or kill an unknown listener; the previous probe may have consumed one-shot clone instrumentation even though server readiness was not observed. After diagnosis, handle a real port owner/IPv6 limitation with a separately reviewed repair and explicit authorization.

## 2026-10-24 05:26 — 17880 startup probe AttributeError before world write or launch

- Actual user Mac/Mint command ran Mac Python suite then Mint Node tests (output showed `duration_ms 7476.219556`) and attempted the controlled `witness-lab-startup-probe`. Mint traceback from `/home/tedz/minecraft-ai/scripts/alice-bds-lab-probe.py:260` `run_action` `gate.require_lab_stopped()`: `AttributeError: module 'alice_lab_beta_for_probe' has no attribute 'require_lab_stopped'`.
- Root cause: `beta_gate()` imported `alice-bds-lab-beta.py`, called `module.pack_guard()`, discarded its first return (the *lab pack module*, which owns `require_lab_stopped`) and returned the beta tool module instead. This is a return-contract bug, not an actual BDS server script-load error. `run_action()` failed on its first guard before any `secure_config`, `instrument_lab_script` or `probe` launch; no lab BDS started by the attempt, and no lab world configuration change from the failed action.
- Fix: unpack `lab_pack, world = module.pack_guard()`, require callable `lab_pack.require_lab_stopped` and return `(lab_pack, lab)`. If the guard is unexpectedly absent, use sanitized `lab_process_guard_unavailable` instead of traceback. Keep all guarded checks and only-sandbox writes.
- Added integration-flavored unit tests that load a real temporary beta module via importlib with a real pack_guard tuple, then invoke the saved (unmocked) beta_gate and read-only `run_action('check')`. Also assert that a returned object lacking require_lab_stopped is rejected before any launch. Other tests still use the existing isolated mocked fixture.
- Mac wrapper allowlist now accepts lab_process_guard_unavailable. Existing controlled Mac action remains `witness-lab-startup-probe` after fetch/fast-forward-only pull and `alice-mac.sh sync`. The previous failed attempt never created the `.alice-lab-probe-original-properties` or lab JS marker since it failed before those operations. Do not remove or overwrite lab files or restart production.
- Full Mac Python / Mint Node test rerun and actual 17880 BDS startup remain to be verified on operator hardware; no Script API imports or world movement have been verified.

## 2026-10-24 05:00 — Beta NBT on disposable 17880 lab confirmed; guarded startup probe staged

- User AliceAI-BDS-Lab-Beta-enable-20261024-050050.json: mode=enable, state=lab_beta_nbt_enabled_backup_preserved_not_started, reason=none. Real report confirms exact disposable 17880 `experiments.gametest` flag inserted with preserved pre-edit level.dat, 17879 production BDS/world unmodified, lab server not started, witness network disabled, modules not verified. No need to re-enable NBT.
- Current official Microsoft BDS docs: Linux start from dedicated BDS root with LD_LIBRARY_PATH=. ./bedrock_server; config/default API permission specifics; console.warn is logged for script diagnostics; IMPORTANT `enable-lan-visibility=true` may ALSO bind ports 19132/19133 even when 17880/17881 explicitly configured. Lab launch must set this false in clone only, allow-list=true with empty allowlist.json, prevent 19132/19133 collisions and unauthorized entrants. Sources: https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/getting-started and https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties and https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/debugging-scripts.
- New opt-in `alice-mac.sh witness-lab-startup-check` read-only, and `witness-lab-startup-probe` which for the FIRST run only snapshots and hardens lab server.properties and allowlist; verifies exact cloned world and pack, world beta enabled, no lab BDS running via current guarded `/proc` + sudo-readlink-only fallback, non-root user, TCP debug disabled and UDP ports 17880/17881 initially free. Saves owner-only originals of lab config/allowlist, disables LAN visibility and enables empty allowlist plus content log; no production settings/ports touched.
- A lab-only copy of the script is backed up to `.alice-lab-probe-original-main.js`, then a single `console.warn(ALICE_LAB_IMPORTS_READY_17880)` is inserted immediately after three static imports in the cloned script only. This marker is isolated and prints at most once when all three BDS Script API imports actually execute; it never reveals player data or touches production pack source, and the cloned lab has no secrets/token or 18782 receiver. The explicit startup probe spawns JUST the BDS executable copied into the disposable lab (not Alice bot), with scrubbed subprocess env, sends a graceful `stop` after ~12 seconds, bounded wait and scoped SIGINT fallback to the just-created process only, never kills/restarts production. Raw output is ephemeral; only fixed enum and boolean status reaches Mac Desktop `AliceAI-BDS-Lab-Startup-probe-TIMESTAMP.json`.
- Client booleans: serverReadyObserved is derived only from BDS startup log text; verifiedScriptModuleLoaded is true only if unique one-time lab import marker was seen, and `lab_module_imports_observed` means imports resolved, NOT that a real player ever joined, network witness emitted coordinates, or AI movement verified. `isolatedBdsExited` confirms subprocess exited; `lab_shutdown_unverified` requires human inspection without automated re-run. Script error flag comes from anonymized matching; no raw console logs, coordinates, credentials or authentication cache exported.
- World under 17880 is a disposable archived snapshot, NOT a current production backup. Startup WILL write to cloned Lab LevelDB and configuration, so it is a new, explicit operator-controlled test. `witness-lab-startup-probe` is single-attempt and refuses repeat after `.alice-lab-probe-original-properties` exists; do not delete markers/locks to force re-run. It uses file advisory lock and refuses detected active/unverifiable BDS PID. No production BDS/world, Xbox auth, MCSManager, firewalls, scripts on 17879, 18781 receiver, or Tailscale changes.
- Full Mac Python suite and Mint Node24 tests still need user execution before lab BDS probe; next action after a valid report is to distinguish BDS ready vs script import errors, then only after proven safe module compatibility design a separate 18782 lab token and client in a future controlled workflow. Do not label server-side witness as live until an independent BDS-published player sample is received.

## 2026-10-24 04:47 — 17880 lab witness pack staging confirmed; opt-in lab-only Beta NBT toggle

- Uploaded AliceAI-BDS-Lab-Pack-stage-20261024-044711.json observedAtUnix=1792788439: state=lab_pack_staged_without_beta_or_network, reason=none, labOnly=true, productionModified=false, productionBdsRestarted=false, labBdsStartedByThisAction=false, serverModuleRuntimeVerified=false, secretsInstalled=false, networkEnabled=false, betaApisExperiment=not_declared_in_level_dat. Therefore pack **files and registration installed** into 17880 disposable copy only; NO Beta API switch, BDS module runtime, HTTP witness or actual movement verified.
- Current Microsoft docs say @minecraft/server-net and @minecraft/server-admin are Bedrock Dedicated Server beta modules requiring the world Beta APIs experiment. 1.0.0-beta track should be checked against the installed BDS version when launched; changing production 17879 world Beta flags risks irreversible experiment/achievement changes, prohibited until separate approval and current backup. Official: https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting ; https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/versioning and community reference https://wiki.bedrock.dev/nbt/enabling-experiments.html .
- New **explicit** actions alice-mac.sh witness-lab-beta-check (read-only NBT patch simulation) and witness-lab-beta-enable (writes only the cloned 17880 lab level.dat). The opt-in enable requires positively identified stopped lab BDS via the current guarded /proc plus only sudo readlink fallback; verified clone marker, 17880/17881 properties, staged exact pack UUID/permissions, no lab secret token; preserves original level.dat as owner-only file in lab, validates complete bounded LE NBT tree and inserts only experiments.gametest TAG_Byte=1 (or new experiments compound if absent), byte-for-byte reversible insertion, updates 8-byte payload length. Refuses an existing flag, malformed NBT, duplicate experiments compound, preexisting backup, symlinks, changed file or running/unidentifiable lab process. Uses exclusive original backup, same-directory atomic replacement, no DB writes and no world commands. BDS itself may add experiments_ever_used/saved_with_toggled_experiments flags on future load; no guarantee of runtime compatibility until startup acceptance.
- New Mac wrapper uses interactive operator sudo -v only for read-only BDS /proc cwd disambiguation. Python interpreter and cloned world file writes stay as ordinary Mint account. Report AliceAI-BDS-Lab-Beta-enable-TIMESTAMP.json uses fixed sanitized schema and explicitly says productionWorldModified=false, productionBdsRestarted=false, labBdsStarted=false, labWitnessNetworkEnabled=false, serverModuleRuntimeVerified=false. This action NEVER starts the 17880 BDS or 17879 production BDS and NEVER reuses production receiver at 18781.
- New isolated unit regressions test NBT insertion preserving unknown byte tags, malformed input and preexisting flags refusal, check-only no file writes, exclusive backup and idempotence rejection, process-gate failure and symlink protections. After Mac ff-only pull run maintained sync to execute Mac Python and Mint Node24 suite; then explicitly run witness-lab-beta-enable if desired. Do not call the experiment enabled until the actual Desktop result says lab_beta_nbt_enabled_backup_preserved_not_started. Next stage after that must safely launch the 17880 sandbox ONLY, with port-collision and MCSManager process checks and server-log-derived import verification; never claim witnessed world motion based solely on this action.

## 2026-10-24 04:xx — 147-test Mac run: one test double masked the real process audit

- User Mac Python 3.15 regression: Ran 147 tests, failures=1, skipped=3. The only failing test was `test_process_guard_disambiguates_only_positively_identified_instances` with `reader.call_count=0` vs 1. No Alice BDS or lab operation was attempted since `alice-mac.sh sync` aborts at Python test failure.
- Root cause VERIFIED in source: `LabPackTests.setUp()` universally patches `PACK.require_lab_stopped` to a no-op (essential to avoid scanning real /proc during ordinary unit tests). The new dedicated test also called that same mocked module attribute, so the real process-check function never executed, and no mocked `privileged_read_cwd` call could occur. This is NOT evidence that `sudo readlink` or real process classification failed in Mint.
- Test-only fix: save original `PACK.require_lab_stopped` function in `self.real_process_guard` BEFORE fixture patch starts; invoke it in all three dedicated process identity branches and add assertion that it is not the fixture mock. Other tests continue to use mocked guard, production safety and privileged readlink logic remain unchanged. Re-run full Mac Python + Mint Node24 suites via safe sync before interactive witness-lab-pack-stage-verified action.

## 2026-10-24 04:19 — isolated 17880 lab stage process identity gate

04:19 Mac JSON: state=preconditions_failed; reason=bds_cwd_unverified; Beta APIs flag not declared. No pack load, network sender, or production world change was proved. A Bedrock process may belong to MCSManager; Linux normal-user proc cwd access can be denied. Do not bypass ambiguous BDS detection. Explicit Mac witness-lab-pack-stage-verified action allows an operator-authorized read-only Linux cwd query through system readlink, while Python staging and any lab-only file writes run as the original Mint user. Any unresolved cwd or running 17880 BDS still aborts. The Mac wrapper sanitizes only one valid JSON result after the interactive check. After Mac ff-only pull and safe sync, run witness-lab-pack-stage-verified. Beta NBT, lab service startup and production 17879 witness remain out of scope.

## 2026-10-24 03:55 — Stopped experimental 17880 pack staging returned preconditions_failed

- User uploaded AliceAI-BDS-Lab-Pack-stage-20261024-035539(1).json: schema 1, mode stage, state preconditions_failed, betaApisExperiment=not_declared_in_level_dat, serverModuleRuntimeVerified=false, secretsInstalled=false, networkEnabled=false. The lab-only tool reports productionModified=false and productionBdsRestarted=false. This is NOT proof of pack registration or compatibility. Do not repeat the previous binary-success claim.
- Prior prepare JSON proved verified archive restore and NEW stopped lab directory, but the clone copies non-world directories only when present in original BDS installation. The stage's require_eligible() incorrectly REQUIRED existing lab behavior_packs and config directories, which are legitimately absent in a stock server. This is a *plausible* root cause, not uniquely proven by the generic report; the process guard and other conditions may also block.
- Fixed staged-lab-only code: accepts missing optional behavior_packs/ and config/ in the established disposable lab; stage (NOT read-only check) creates them with restrictive permissions if absent, refuses symlink or existing non-directory, never touches production, never overwrites installed target or world_behavior_packs.json, never changes Beta level.dat, never writes secrets or starts lab BDS. Checks the exact marker, 17880/17881 and lab process state before staging.
- Fixed diagnostic: no more ambiguous naked preconditions_failed. The Mint stage returns a separate fixed allowlisted reason value for known fail-closed cases (e.g. lab_parent_directory_invalid, bds_cwd_unverified, lab_bds_is_running, lab_marker_mismatch); Mac Desktop sanitizes that reason and does not export raw exceptions, private paths or tokens. Added fixture regressions for absent optional dirs, read-only check, lab-only creation, symlink refusal and sanitized reason reporting. Full Mac and Mint tests required, not yet executed on user's machines for this patch.
- Operator action after Mac git fetch + ff-only pull + controlled sync: ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-lab-pack-stage. Upload NEW AliceAI-BDS-Lab-Pack-stage-* JSON. If state still fails, reason will identify next corrective action. Do NOT run 17880 BDS, change NBT, launch a second bot or use production 18781 witness until lab stage and next safety gate are satisfied.

## 2026-10-24 — guard disposable lab pack staging against a running BDS (not yet live-tested)

- This followup prevents world_behavior_packs.json edits while the cloned 17880 BDS is running: iterate Linux /proc bedrock_server process names and resolve their cwd; if a lab match, uninspectable BDS cwd or /proc unavailable, refuse to stage. The Mac unit tests mock the process guard; actual Mint state is checked only when the user invokes lab staging.
- Report field labBdsStartedByThisAction=false means the operator action does not start BDS; it NEVER claims current BDS process state was verified by the report. No Beta API flag, token, HTTP service or live 17879 world is changed by staging.
- The currently committed code is a candidate for Mac Python and Mint Node24 suite acceptance via maintained alice-mac.sh sync. Do not claim end-to-end success before the user's actual lab stage JSON.

## 2026-10-24 03:32 — Verified archived restore, disposable 17880 lab created; lab-only pack stage (not activated)

- User Mac JSON AliceAI-BDS-Lab-prepare-20261024-033251.json: backupRestore=archive_sha256_isolated_restore_verified, labState=new_disposable_copy_created_not_started, reason=lab_ready_for_future_beta_test. World archive hash and temporary restore verified, new isolated lab directory created from prior backup. Production 17879 world and BDS process remained untouched, experimental server is not started. Historic backup may be stale relative to live BDS.
- New operator actions witness-lab-pack-check and witness-lab-pack-stage: only dedicated ~/minecraft-bedrock-alice-lab with exact marker source and 17880/17881/Bedrock level settings. The stage copies reviewed pack manifest and script into lab/behavior_packs/alice-silent-bds-witness and creates NEW lab-specific config/<script-module-UUID> permissions/variables plus world_behavior_packs.json, refusing any existing path. Never modify config/default or any production folder. All output sanitized to Mac Desktop AliceAI-BDS-Lab-Pack-stage-<timestamp>.json.
- CRITICAL WITNESS TRUST BOUNDARY: production receiver uses 127.0.0.1:18781 and publishes the trusted independent BDS position file. The lab stage uses isolated, initially inactive 127.0.0.1:18782 with AliceLabWitness as a dummy name. NO secrets.json or lab receiver is created, therefore script sends NO HTTP requests even if loaded. No production token or witness file is read or used. Beta APIs level.dat remains unchanged. No BDS instance is launched or restarted, and this stage cannot prove Script API/module compatibility.
- Offline tests test_alice_bds_lab_pack.py cover safe lab staging, pack-only registration, rejection of existing targets, invalid marker, wrong port, absent secrets, production world unchanged, Mac sanitizer. Full Mac Python and Mint Node24 regression must still pass; no claims of live tests before operator command.
- Next: enable Beta APIs ONLY on a cloned lab level.dat after separate explicit approval and backup-bytes validation, then controlled lab BDS startup and module load inspection. If network witness is tested later, create a distinct lab token+receiver+output on 18782 and never contaminate the production 18781 witness chain.
- Docs: https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting ; https://wiki.bedrock.dev/nbt/enabling-experiments.html .

## 2026-10-24 — Mac Python 3.15 archived lab tests failed at production_target_valid (root cause fixed)

- User ran maintained Mac sync after `613c7e8`. `python3 -m unittest discover` reported **133 tests, failures=7, skipped=3**. All seven fail with `production_target_mismatch` in `test_alice_archived_lab.py`; no Mint sync or 17880 lab prepare was reached because Mac test gate stopped the command.
- Root cause: `scripts/alice-bds-archived-lab.py` compared canonical `PRODUCTION.resolve(strict=True)` with the uncanonicalized Python `Path` original. On macOS the temporary test folder can be under `/var` (alias `/private/var`), so the comparison falsely classified the correct fixture as the wrong server.
- Fix: disallow `PRODUCTION.is_symlink()` (direct symlink at the designated server directory, retaining fail-closed safety) and evaluate the canonical source's directory, BDS executable and fixed online-mode/port/world properties. Allow legitimate **ancestor directory** aliases. Do not compare resolved and unresolved paths for identity.
- Add regression tests for canonical path, alias in parent path, direct server root symlink rejection, and wrong server port refusing all downstream verify/clone work. `verify-world-backup.py` already canonicalizes source paths in its own source verification, so do not weaken it. This is a test/setup bug fix, NOT evidence of real backup restore or BDS world changes. Full Mac Python + Mint Node suites still need operator rerun; previous failed `sync` stopped before Mint and BDS was unchanged.
- User next step: Mac `git fetch origin main && git pull --ff-only origin main`; `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync`; then explicitly `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-lab-prepare`. If prepared, report `AliceAI-BDS-Lab-prepare-*.json` on Mac Desktop. The 17880 disposable lab must never be run or modified in place of 17879 production without subsequent review.
 
## 2026-10-24 03:08 — preflight: archived backup manifest exists; 17880 lab absent; guarded lab preparation added

- User Mac JSON `AliceAI-BDS-Witness-Preflight-20261024-030846.json` (schema 2): 17879 / Bedrock level target correct; witness receiver private config and token exist; `betaApisExperiment=not_declared_in_level_dat`; witness pack and HTTP module permissions not installed; no active witness proven; `operatorBackupManifest=configured_manifest_present_not_restore_verified`; `isolated17880Lab=absent`. Scan's zero exact-cwd BDS PID never proves production offline.
- The repository ALREADY has `verify-world-backup.py` (full tar.gz SHA256 + per-file checksums + isolated temporary restore) and `prepare-bedrock-alice-lab.py` (new sibling world restored from verified offline archive, distinct 17880/17881 ports). Do NOT copy the live world. Freshness of the old configured archive is NOT proven merely by its existence; lab is a historical snapshot for protocol testing, not a substitute for fresh pre-production backup.
- New `scripts/alice-bds-archived-lab.py`: uses private owner-only Mint operator config to locate the configured snapshot without exporting the path; validates *exact* 17879 Bedrock level before touching any lab files; `check` executes the full verifier and reports only sanitized statuses; `prepare` repeats the verification and calls the pre-existing lab preparation helper to create a NEW sibling `~/minecraft-bedrock-alice-lab` only. If archive integrity/isolated restore fails, world mismatch, bad private config or destination exists, fail closed. No BDS restart, Script API activation, world experiment change, Xbox session, production server file change, or lab server launch.
- `prepare-bedrock-alice-lab.py` also now refuses nested symlinks in non-world BDS assets to avoid following unexpected paths. New `test_alice_archived_lab.py` exercises real small archive -> full verify -> new independent lab + no original world change, and all failure conditions; `test_bedrock_lab.py` extends nested symlink coverage. Local Mac/Mint regressions still need operator execution.
- Mac maintained actions `alice-mac.sh witness-lab-check` (no lab creation) and `alice-mac.sh witness-lab-prepare` (explicit new lab dir). Both sanitize remote JSON to fixed enum fields before Mac Desktop `AliceAI-BDS-Lab-{check|prepare}-TIMESTAMP.json`, include schema/time and never disclose paths, Minecraft player info, token or untrusted error details. Standard Mac git fetch/ff-only pull then `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync` (runs Python tests and Mint Node24 suite; no bot/BDS restart), then **to actively build the independent lab** run `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-lab-prepare`. Upload Desktop JSON. This explicitly writes only an *isolated disposable copy* on Mint, and may consume disk resources for two full isolated archive validations; monitor space. No `witness-preflight` re-run required.
- Next stage after a newly created 17880 lab: determine Beta APIs compatibility and run the staged BDS script witness against the disposable copy without modifying 17879 production. World experiment and backup gates remain closed for production. Never claim real BDS witness or independent movement until proved in actual logs.

## 2026-10-24 02:34 production BDS witness preflight v2 — Beta not declared, validate isolated lab first

- Real Mac Desktop v2 file `AliceAI-BDS-Witness-Preflight-20261024-023440.json` observed 2026-10-24 02:34:40 UTC+8: correct BDS root, 17879 + `Bedrock level`, pack sources and loopback constraints valid; receiver private config/token and expected loopback port exist. No installed witness behavior pack, world pack association, or per-module permissions. Process matching exact BDS cwd was 0 but does not prove BDS down.
- World LE NBT result `betaApisExperiment=not_declared_in_level_dat`: exact `experiments.gametest` flag missing in current world, NOT affirmative evidence that Beta APIs are enabled. Microsoft's Script Module Versioning and Scripting BDS docs confirm beta modules need Beta APIs enabled in world; custom script pack `@minecraft/server-net` is pre-release. Do not silently enable experimental mode in a live production world or edit NBT; experiments can alter achievements/upgrade behavior. Use staged **isolated 17880 lab** first.
- Existing `gate.cjs` already defines a disposable `~/minecraft-bedrock-alice-lab` clone, requiring an exact `.alice-sandbox.json` marker, production source, port 17880/17881 and its own world. New read-only preflight fields `isolated17880Lab` (absent/unverified/isolated_metadata_verified) and `operatorBackupManifest` (not_verified/configured_manifest_present_not_restore_verified) check that independently WITHOUT starting lab, modifying worlds or reading/exporting secrets. Metadata-only or an earlier Node verified manifest is **not** proof of a current offline backup or LevelDB integrity. `safeToApplyWorldChanges` stays false until separately verified backup/restore + reviewed lab/production activation.
- Audit / testing: Mac git fast-forward-only pull, `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync` then `witness-preflight`. Updated sanitization exports only strict enum strings for the new two fields. The previous Python unittest import bug was fixed by `64ec14c...`, this build's additional tests still need Mac execution. No BDS, Alice, lab, receiver systemd service, pack, credential, live world database, experimental setting or PID was modified.
- Official sources: https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting ; https://learn.microsoft.com/en-us/minecraft/creator/documents/scriptversioning ; https://wiki.bedrock.dev/nbt/enabling-experiments

## 2026-10-24 — v2 preflight report provenance (duplicate upload, no new BDS evidence)

- The user uploaded `AliceAI-BDS-Witness-Preflight-20261024-020304(1).json` after a previous `...020304.json`; byte-for-byte same SHA-256 `377e06affc82dd61d0ebbffe1aa946683ddd8e26ece0f32d142d6a331df0a968`. The `(1)` filename indicates a duplicate copy, not a new 02:XX inspection. This original old-format JSON has `betaApisExperiment=not_verified_requires_world_level_experiment_audit` and lacks the new level.dat NBT readout. Never infer experiment enabled/disabled from it.
- Mint preflight now identifies `schemaVersion: 2`, `observedAtUnix`, and one of four actual level.dat results (`enabled_in_level_dat`, `disabled_in_level_dat`, `not_declared_in_level_dat`, `unverified`). Mac Desktop collector explicitly REJECTS older schemas, absent beta result/module status, or more than 15 minutes of timestamp skew; preserves the strictly sanitized schema and observation timestamp in the report. No false success when Mint was not synced.
- Required operator workflow: Mac `git fetch origin main && git pull --ff-only origin main`, then `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync`, then `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-preflight`. The newly generated Mac Desktop filename includes the new clock timestamp and its JSON contains `schemaVersion:2`. Upload that exact JSON, not the original `020304(1)` duplicate. Neither sync nor preflight restarts Alice/BDS, installs packs or edits worlds. Real offline backup/restore verification and module compatibility remain pending.
 
## 2026-10-24 02:03 — Real production 17879 witness preflight + bounded level.dat Beta API inspection (staged)

- User Mac JSON: `AliceAI-BDS-Witness-Preflight-20261024-020304.json`. Exact production root, port 17879, online-mode, world `Bedrock level`, world level.dat/db structure and staged pack manifest/loopback HTTP policy all passed. Owner-only receiver config + token exist, receiver loopback port matches. The world has **no** `world_behavior_packs.json`, no active Alice witness pack, no BDS module-specific permissions or target pack directory. Missing world behavior pack list may be normal before any packs are installed; it is not authorization to write a new list. The process-only /proc check saw zero PID matching the exact expected cwd; MCSManager-managed BDS may be elsewhere or inaccessible, so `not_found_not_offline_proof` does not mean server stopped.
- Main blockers: original preflight could not read the active world's Beta APIs/gametest flag, had no verified fresh **offline** backup and had not confirmed server-net modules actually load on installed BDS 1.26.51. BDS Script APIs are experimental; activating Beta APIs can permanently change world experiment/achievement state. Do not modify `level.dat` or choose another world automatically. See Microsoft dedicated-server scripting docs and Bedrock Wiki NBT experiment descriptions.
- New isolated read-only helper `scripts/alice_bds_level_metadata.py` parses only the one approved `worlds/Bedrock level/level.dat` header and strictly bounded little-endian NBT to identify the `experiments.gametest` byte. Emits fixed values `enabled_in_level_dat`, `disabled_in_level_dat`, `not_declared_in_level_dat` or `unverified`. It never writes or edits world NBT, database or settings. A matching flag alone is **not proof** beta module compatibility, successful pack loading, or restart safety. Report now adds `betaModulesLoaded=not_verified_without_bds_log_or_runtime_witness`, and retains `verifiedOfflineWorldBackup=not_verified_requires_backup_and_restore_test` and `safeToApplyWorldChanges=false`.
- Updated Mac Desktop preflight response allowlist, offline safety tests (`test_alice_bds_level_metadata.py` and extended `test_alice_bds_witness_preflight.py`). To run: after Mac `git fetch origin main && git pull --ff-only origin main`, `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync` (tests, no restart), then `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-preflight`. Upload only the Desktop JSON; do not paste private server logs.
- No behavior pack installed, no Bedrock experiment enabled, no receiver service started, no backup created, no BDS/MCSManager restart or world edit, and no Alice restart. Next action requires an independently identified BDS management process, trustworthy quiescent-world backup with isolated restore verification, and confirmation whether Beta APIs was *already* enabled before any write.
 
## 2026-10-24 — 必须先同步预检脚本，且 JSON 在 Mac 二次脱敏

Mac first pulls current main, then invokes maintained alice-mac.sh sync (full tests, no restart) **before** alice-mac.sh witness-preflight. The Mint-side Python preflight does not exist remotely until sync. Mac wrapper validates and rewrites the response with fixed allowlisted enum/boolean/count fields before saving Desktop JSON; no arbitrary Mint strings are ever exported. Neither action restarts Alice, BDS or MCSManager.

## 2026-10-24 — Guarded BDS witness authorization and preflight (NOT yet installed)

- User approved moving forward with production BDS read-only Script API position witness. Permission is scoped to the exact production 17879 / Bedrock level instance with verified backup, API compatibility and planned MCSManager restart; it is not permission to guess world paths, erase secrets, enable legacy querytarget spam or skip experiment checks.
- Microsoft's BDS scripting docs mark server-net pre-release and BDS-only, with Beta APIs/world-backup cautions. Minecraft 26.50 released server 2.10.0; Bedrock 1.26.10 per-module HTTP permissions and 1.26.20 force_tls rename are source-verified. Exact 1.26.51 beta module availability and world experiment state remain unverified.
- New one-command Mac read-only preflight (after fetch/ff-only pull): ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-preflight
- Local output: ~/Desktop/AliceAI-BDS-Witness-Preflight-YYYYMMDD-HHMMSS.json, private 0600. Read-only Mint Python checks the fixed production directory ~/minecraft-bedrock, server port 17879, exact world Bedrock level, relevant pack UUID, 2.10.0/beta module declarations, loopback-only permissions, existing pack attachment, receiver config/token existence, and available process evidence. Never exports raw world files, gamertag, private token, MCSManager output, credentials or process environment.
- Explicit report states betaApisExperiment=not_verified_requires_world_level_experiment_audit, verifiedOfflineWorldBackup=not_verified_requires_backup_and_restore_test, safeToApplyWorldChanges=false. These are NOT pass conditions and cannot authorize pack installation. It performs NO write to BDS/world/MCSManager, no service enablement and no Xbox client/PID restarts.
- Offline regression: python3 -m unittest discover -s games/minecraft-ai/tests -p test_alice_bds_witness_preflight.py -v; then maintained Alice Mac sync for Mint regression if desired. Actual BDS activation requires post-preflight validated world backup and Beta API experiment compatibility, and BDS maintenance via MCSManager.

## 2026-10-24 00:48 — Desktop ZIP evidence, source-vs-process proof fix (staged)

- Received `AliceAI-Acceptance-20261024-004811.zip`, captured 2026-10-24 00:48:12 UTC+8: **2,295 structured entries (997 samples, 1,298 events)** across 21:48:19—00:48:09. Tracked deaths 485→542: **57 new deaths**, **56 verified respawns**, last one (00:48:08) dead at capture (health=0). Compared with the 00:22 previous ZIP (counter 523), +19 further deaths; at least 18 confirmed respawns during 00:22—00:48. Nearly all combat evasion failed.
- Overall 104 retreat results: 47 generic `retreat_pathfinder_error`, 36 `retreat_flat_geometry_not_verified`, 21 `retreat_no_verified_away_corridor`; 0 successes. The new `retreat_bds_position_unavailable` diagnostic was synced on disk at ~00:15 but NOT demonstrably loaded by PID3895891, which has operated since ~23:15; old generic reason and `idleGate=startup_observation_pending` persisted. Do not claim the new code has been live-tested. No independent BDS witness samples after login; the 736.71 `serverTravelBlocks` is from ordinary server-origin corrections (lastSource `correct_player_move_prediction`), **NOT** independent position proof or accepted goal movement. Night `world-view.json` was empty `scanned=0` because bot is dead at capture, not evidence of disabled 31×31 scan.
- The new one-click ZIP bundle itself works: report.json statusSource=current_process, heartbeat 0.6s, sessionEstablished=true, single PID3895891, no duplicated process, respawn phase mistakenly displayed `unknown`. That was a sanitization bug: whitelist omitted `waiting_for_server_respawn` and other **fixed** stages emitted by `src/respawn_recovery.cjs`. Keep only exact source enum, never accept arbitrary phase text.
- **Critical false-positive inference:** old deployment exporter compares runtime.cjs disk mtime to the last `spawn confirmed`, which occurs after **every death** and not when Node starts. In this case runtime.cjs disk mtime 2026-10-24 00:15:25 is newer than the current operator-created log/Node PID from 2026-10-23 23:15:44, but last `spawn` at 00:47:25 produced misleading `source_not_newer_than_last_spawn`. New read-only Mint operator status derives epoch ms from **identity-checked /proc/PID/stat field 22** and kernel `btime` (no new process/session, no credential output). New Mac report compares file mtime with that birth time and labels `source_changed_after_process_start`, `source_not_newer_than_process_start`, or `unknown_process_start`. Never say on-disk equality proves memory module reload.
- Next test: Mac `git pull --ff-only`, then `python3 -m unittest discover -s games/minecraft-ai/tests -p 'test_alice_*' -v` and maintained `alice-mac.sh sync` (which runs all Mint Node24 tests and does **not restart**). Run `alice-mac.sh report` again; verify `deployment.json` reflects process birth provenance and phase is `waiting_for_server_respawn` when dead. No BDS, world, or Xbox actions authorized. Do not restart Alice automatically; evidence and operator consent are required. BDS independent witness enablement remains unapproved.

## 2026-10-24 — Mac 桌面一键验收 ZIP（代码已提交，Mint/实际桌面待验证）

- User request: stop copying long `status`/`diagnose` outputs. Maintained operator entry: `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh report`. The report action invokes the existing Mac collector (defaults to 3 hours), **does not** sync/restart Alice or BDS, change Xbox accounts, world state or login locks. To choose another number of hours (1..24), call `ALICE_MINT_SSH=tedz@192.168.0.104 bash games/minecraft-ai/scripts/collect-alice-acceptance-mac.sh 6`.
- Output automatically saved under Mac `~/Desktop/AliceAI-Acceptance-<timestamp>.zip`, containing existing `events.jsonl`, `manifest.json`, `deployment.json`, passive state/world files, plus `REPORT.md`, `operator-status.json` and `operator-diagnose.json`. The latter two come from the current Mint CLI, strictly redact private paths/fields, and never include raw operator logs, Xbox credential data, chat or process environments.
- Independent owner/heartbeat checks remain unchanged. Failed status/diagnose capture is marked `unavailable` / `unknown`, not guessed. Deployment hash + spawn-age heuristic does **not** prove the running process loaded the synced source.
- Mac Desktop belongs to user's local host; ChatGPT cannot directly write to it through GitHub. After `git fetch origin main && git pull --ff-only origin main`, run the maintained `report` action once and upload the sole resulting ZIP. Added `tests/test_alice_report_bundle.py` for schema redaction, failure states, archive safety and hostile nested values; actual local/Mint tests require subsequent execution. Before this feature the user provided a successful 628/628 Mint Node24 suite.

## 2026-10-24 — 00:22 three-hour BDS acceptance: 38 deaths, 39 masked retreat admissions (code staged)

- Source: privacy-filtered `AliceAI-Acceptance-20261024-002215.zip` captured 2026-10-23 21:22—2026-10-24 00:22 Asia/Shanghai (UTC+8): 1,959 records (995 samples + 964 events). From death counter 485 to 523, **38 actual observed deaths and 38 matching successful in-session respawns**; 14 were ~12-second ReadyToSpawn retry handshakes and 24 respawned in <1s. This verifies recovery against these sessions, NOT survival. 35 deaths came after 23:15:44 operator-controlled restart; the death count is since tracking began, not lifetime.
- Emergency results: 76 failed/unverified retreat results: **39 `retreat_pathfinder_error`**, 26 `retreat_flat_geometry_not_verified`, 11 `retreat_no_verified_away_corridor`; 22 cornered-defense attempts, no proven Alice attack damage. Nearby hostile observations dominated by zombies, but no lethal attacker was independently attributed. Rapid deaths concentrated 23:45—00:15.
- After controlled restart the independent BDS sample count was 0, with `witnessStatus=stale_or_invalid_witness`, all movement `positionTrust=local_prediction_not_server_proof`, ongoing goal `LEARN_WEAPON → ACQUIRE_WOOD` and hold `scout_bds_position_unavailable`. Before that the cumulative 387 samples were old and stale, not new proof. Fresh remote position witness, autonomous walking, wood inventory gain, and safe escape remain unverified. World renderer continued sampling 31×31×12 = 11,532 cached positions; this does not prove navigation.
- `deployment.json` matched Mac/Mint on-disk hashes but marked `runtimeProcessFreshness=source_changed_after_last_spawn` (source mtime newer than last 00:14:59 spawn). This heuristic suggests the 00:15 sync did not reload the live Node process; do not count new diagnostic code as observed and never blindly restart.
- Source-side root cause for generic retreat errors: the shared `installNavigationPositionGuard` wraps **all** Pathfinder goto and throws `navigation_scout_*` **before** the underlying call when independent BDS proof is absent or diverged. `BedrockOperations.retreatFrom` previously caught every such error as generic `retreat_pathfinder_error` and marked `attempted=true`. Change only its sanitized **diagnostic classification** to a fixed `retreat_bds_position_unavailable` / `retreat_bds_client_position_diverged` / `retreat_client_position_unavailable`, with `attempted=false`; genuine noPath and exceptions remain attempted. This does NOT waive the admission guard, grant emergency movement, prove attack damage, or fix the death loop. New `retreat_admission.test.cjs` tests real navigation wrapping, divergence and genuine failure.
- To validate: run `node --test games/minecraft-ai/bedrock-native/experiment/test/retreat_admission.test.cjs` locally, then the standard Mac/Mint `alice-mac.sh sync` after main updates; **sync does not restart**. No BDS pack, console spam, world experiment, Xbox auth reset, manual PID signal, or second client is authorized. Future live test must get independent witness enabled only after separate BDS configuration approval, then verify actual monster evasion and BDS-coordinate delta.

## 2026-10-23 — Startup IDLE diagnostic precedence (source only)

- A read-only browser tab snapshot at 23:36:48 showed Alice alive (17/20), `IDLE`, 31×31×12 real cached block sampling, `independentSamples=0`, witness `stale_or_invalid_witness` and minute-spaced `idleGateReason=startup_observation_pending` since at least 23:26. The same page recorded a 23:25 zombie retreat failure (`retreat_pathfinder_error`); dashboard data is not a fresh independent BDS movement witness or a direct Mint PID check. Dashboard reported 490 persisted deaths since 2026-10-20, which must not be conflated with deathRecovery cycle count.
- Source review: in `runIdleDecision`, `startupObservationPending` stays true while `scoutStartProof` fails, and `holdNavigation` sets the specific safety failure. The read-only `idleGateReason` checked the generic startup flag **before** `navigationHold`, hiding the more precise reason. Reorder only diagnostic precedence (position witness first) and add a regression for the simultaneous flags; neither startup admission nor scout/BDS safety proof is loosened.
- Node test: `node --test games/minecraft-ai/bedrock-native/experiment/test/runtime.test.cjs`, followed by the canonical Mint Node24 regression through `alice-mac.sh sync` after Mac fetch/pull. The code is staged; no Alice restart, BDS restart, world mutation, behavior-pack activation or real movement claimed. The BDS witness remains the primary P0 for autonomous travel.

## 2026-10-23 — BDS 1.26.51 silent witness compatibility and bounded HTTP policy (source-only)

- Static review found the staged `@minecraft/server-net` 1.x manifest paired with `@minecraft/server` 2.0.0; the 26.50 module peer requirement on the 2.x track starts at 2.9.0. Switch the staged behavior-pack manifest to stable `@minecraft/server` 2.10.0, which is available in 26.50/26.51; retain experimental net/admin `1.0.0-beta`. Live BDS beta-module loading and world Beta eligibility are still UNVERIFIED.
- The 1.26.10 BDS HTTP configuration supports `module_permissions`, and 1.26.20 renamed `force_https` to `force_tls`. The witness module's `permissions.json` now explicitly restricts only its net module to `http://127.0.0.1:18781/v1/position`, `force_tls=false`, 512 request bytes and 1 concurrent request; never grant net in `config/default`. A custom receiver port requires a matching private `variables.json` URL and allowlisted URI.
- Source regression: `python3 -m unittest discover -s games/minecraft-ai/tests -p test_bds_script_witness.py -v`. Source changes, contract tests and GitHub commit are NOT Mint Node24, BDS Script API or gameplay proof. Do not activate a pack, edit the world, restart BDS/Alice, start a second Xbox session, enable legacy querytarget, or relax the independent navigation guard.
- References: https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.10 ; https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.20 ; https://www.minecraft.net/en-us/article/minecraft--bedrock-edition-26-50-changelog .

## 2026-10-23 — 生产重启预检查与位置见证解耦（仅 Alice，未部署）

- **发现的阻塞：** 新仓库 `world_view.cjs` 明确为 `RADIUS=15,BELOW=6,ABOVE=5`，但 Mint 实时 `world-view.json` 仍为 `radius=5,below=3,above=4,scanned=968`。同时 `bds-position-witness.json` 是历史 `mcsm_querytarget` 数据，文件已有约 59,292 秒未更新。测试通过 / 文件同步不会热替换已经运行的 Node 模块，因此旧进程可能继续写入旧半径。不能单凭截图认定旧仓库仍在用，也不能用累计位置样本证明新鲜。
- **发现的运维矛盾：** `scripts/alice_operator/process.py:AliceProcess.check()` 仍用 `systemctl --user is-active alice-bds-position-witness.service` 强制检查过去用户主动停用的**刷屏见证服务**，可能导致合规的 `deploy/restart` 在停止当前进程前被阻止。现移除该**服务依赖预检查**，保留生产备份/区块前置条件、PID+birth-token 检查、单实例锁及 BDS 登出门禁。**绝不**恢复或代替安装任何 querytarget 轮询服务。
- **安全边界不变：** 在 `scout_start_proof.cjs` 中，导航必须拥有同一登录后的至少两条新鲜（≤4秒）独立 BDS 坐标见证，且客户端与 BDS 偏差 ≤0.75 格。缺少独立 BDS 见证时 Alice 可以登录并发布新 3D 只读视图，但自主探索/采集的寻路入口仍 fail-closed；地形修改另由既有 `serverPositionProof` 要求新鲜服务器来源的自身坐标样本和位置一致性，不能声称所有地形入口都要求独立脚本见证。不能视为恢复自治。新 Script API 非刷屏 BDS 包需要单独兼容性检查及明确世界修改授权。
- **验证方法：** Mac 通过 Python 运维回归 + Mint Node24 全量测试后，用只读 SSH 命令核实磁盘上 `world_view.cjs` 常量和当前 `alice-mint.py status/diagnose` 的真实 PID。只有单实例/心跳和生产检查通过时，用户才考虑 `alice-mac.sh deploy` **一次**，只重启 Alice（不是 BDS），再查 live `world-view.json` 的 radius=15、below=6、above=5、scanned=11532。若仍为 radius5，区分“磁盘未同步”与“旧 Node 尚在写入”，不得再次盲重启。

> **独立仓库（2026-10-23）**：当前 AliceAI 产品正式代码在 [hedydev/ioant-AI-Minecraft-Alice](https://github.com/hedydev/ioant-AI-Minecraft-Alice)，保留内部 `games/minecraft-ai/` 相对路径以兼容现有 Mac/Mint 运维脚本。历史文档中 `cd ~/Documents/workspace/hero-skills` 必须替换为 `cd ~/Documents/workspace/ioant-AI-Minecraft-Alice`。新工作不要再向 Hero Skills 提交 Alice 代码。

## 2026-10-23 — 可选 BDS Script API 无刷屏坐标见证（staged，未部署）
当前 15:51 匿名验收证据：自主目标采木已选但 `scout_bds_position_unavailable` 阻止真实寻路，`witnessStatus=stale_or_invalid_witness`。旧 querytarget systemd 服务保持 disabled。
源码新增 BDS 侧只读行为包 `bds-witness-pack/`、Mint 私有回环 HTTP `scripts/bds_script_witness.py`、独立证据校验和安全门禁兼容。脚本不执行 Minecraft 命令、不会在 MCSManager 控制台刷屏，拒绝缺少凭据、错误/重放身份、旧会话和过期数据。**BDS 1.26.51 的 server-net Beta 支持尚未验证，世界实验及停机配置均未更改，不能声称 Alice 恢复移动。**
具体设计、隐私、安全边界、回归与部署步骤见 [SILENT_BDS_WITNESS_20261023.md](SILENT_BDS_WITNESS_20261023.md) 和 `bds-witness-pack/README.md`。Mac `alice-mac.sh sync` 只同步运行测试；不得自动 `deploy`、重启 BDS、启用旧刷屏服务或编辑世界存档。

## 2026-10-23 — 3D 有限切片与 IDLE 实证修复

- 14:59（UTC+8）验收 ZIP `AliceAI-Acceptance-2026-10-23T06-59-44-052Z.zip` 的实际运行态 `world-view.json` 报 `radius=5`、`scanned=968`（11×11×8），证明该时间点运行的是旧版 Mint 采样器。Mac 拉取 GitHub 与浏览器刷新**不能**让运行中的 Node 采样器更新。截图里的“427 格”是非空气体素数量，不是采样半径。
- 同一 ZIP 记录 14:53:55 `LEARN_WEAPON→ACQUIRE_WOOD` 目标已选、随即因 `server_position_unconfirmed` 进入 WAITING；14:59:42 最后位置证据已过期约 354 秒，`witnessStatus=stale_or_invalid_witness`，`state=IDLE` 但 `mode=autonomous`、血饥 20/20。此为缺少独立真实 BDS 位置证据的**任务安全阻塞**，不是 Ollama 持续思考。不能用此历史 ZIP 断言 15:49 的当前状态，必须通过新日志验收。
- 为减少有限数据截面造成的“黑色 mask / 地下平板被切断”视觉错觉，Mint 观察体积扩大至 **半径 15，31×31×12（脚下 6 / 上方 5，最多 11,532 个已缓存区块方块读取）**，保留 512 KiB 原子快照/只读 SSH 上限，`remote_world.py` 最大体素项数同步从 8,000 改为 12,000。新渲染器在有限体积底部和横向边缘作透明度渐隐，不伪造未加载区块或绘制不存在的地下无限方块。**Canvas 剩余背景不是遮罩**；人为缩放 2.5 倍可能裁切，重置至 1 倍能完整取景。
- 在 Mac 3D 边栏，明确按**实时快照**显示 `radius`、`side×side×layers`、`scanned`（包含空气）、`voxels.length`（非空气）和 `unknown`；观察半径小于 15 时显示旧采样器警示，而不是假称更新。没有 Mint idleGate 诊断字段的旧部署，会翻译当前新鲜 `idleHold.reason`（如 `scout_bds_position_unavailable`），明确提示不能安全移动。继续不启动已停用的 querytarget 见证服务；不降级移动安全校验，不让模型编造服务端位置。
- Mac 运行 `git status --short; git fetch origin main; git pull --ff-only origin main`，测试 `node --test games/minecraft-ai/bedrock-native/experiment/test/world_view.test.cjs`、`python3 -m unittest discover -s games/minecraft-ai/tests -v`，再使用 `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync`（备份同步并在 Mint 回归，**不会重启**）。全部通过且用户选择部署时，**仅一次** `alice-mac.sh deploy` 更新当前 Alice Node 采样器（该操作重启 Alice 客户端，但绝不重启 BDS）。Mac 独立重启 `run-dashboard.sh` 加载 Python 读取校验并强制刷新浏览器。先以 `ssh ... python3 -c ... world-view.json` 确认实际半径；世界方块范围依靠真实采样证明，不看截图估算。

## 2026-10-23 — 修复新版 3D 鼠标旋转/缩放手感退化

- 证据：半径 15 格更新将 `fitCamera(... angle,pitch,center,zoom)` 放在逐帧渲染内。用户拖动鼠标时 `angle/pitch` 变化使 camera scale 与 offset 同时重新计算，导致画面发生非主动缩放/平移，偏离此前“围绕 Alice 旋转”的体验；密集地形固定 12FPS 同样增加拖动视觉延迟。
- 修改：保留之前的水平拖动增量 `0.008 rad/px`、垂直 `0.005 rad/px`、俯仰限制 `.24–1.3`、滚轮因子 `.88/1.12`，不引入新交互语义。改为 `fitOrbitCamera`：基于 31×31×8 地形的保守解析包围盒，只依赖画布尺寸/观察半径/主动 zoom，不依赖 angle/pitch 和 Alice 坐标，绘制中心固定，旋转不会自动改变缩放/平移；zoom=1 时角度与俯仰全范围均在画布内。鼠标拖动采用 ~30FPS 和 next-frame 即时刷新；停止交互后仍遵循原先密集 12FPS 节流以减少持续 CPU。
- 仍使用被动区块快照，没有改变 BDS 真实移动坐标、AI 寻路或世界状态；该变更**只涉及 Mac 控制台静态前端**，无需重启 Alice/BDS。回归用例覆盖 4 个视口、6 种水平角度、4 种俯仰角度的全部 31×31×8 顶点，以及滚轮缩放不变焦点。
- 验收：`node --test games/minecraft-ai/bedrock-native/experiment/test/world_camera.test.cjs` 和 Mac 控制台回归；Mac 拉取新 main 并强制刷新 `http://127.0.0.1:8788/#world` 即可，不需要 Mint sync/deploy。

## 2026-10-23 — 完整 31×31 视野、复制稳定性与 IDLE 门禁诊断（源码已提交，实机待验收）

- **观察半径：** 半径从 7 改成 15（水平 31×31，Y 仍为脚下 3 层 / 脚上 4 层，总计最多 7,688 个只读采样格）；仅使用 Alice 已接收的区块缓存，不强制加载新区块或更改世界。为避免扩大后空白，生产端原子快照、只读 SSH 读取、Mac API 的上限由 128 KiB 同步增加到 512 KiB，体素验证从 2,000 增至 8,000；超界/过期/断线数据依然拒绝。不调整服务器位置真值的安全判定。
- **相机：** 添加确定性的等距投影边界取景 `world_camera.js`，完整观察体积的 8 个角在默认 zoom=1、不同窗口比例/视角下均落在可见画布内（预留 24px 横边距、顶侧文字空间）；手动放大可主动裁切，点击“重置视角”恢复完整取景。默认关闭“透视屋顶”以完整绘制已观测上层，仍可手动开启剖视。密集地形的 2D Canvas 绘制限速 12fps，稀疏 24fps，减少 CPU。
- **时间线复制：** `world_timeline.js` 通过事件快照签名检测真正改变的列表；未变化不重建 DOM；鼠标按下或用户选中时间线文字时暂缓重建，即使新事件到了也允许复制。恢复正常选择状态后下次轮询同步，不丢失真实行为数据。
- **长期 IDLE：** `runtime.idleGateReason()` 将当前自主任务拒绝原因细分为队友模式/STOP/未就绪/低血量/附近敌怪/缺少 BDS 坐标见证/冷却等，只读呈现在 3D 边栏；连续处于 IDLE 时，首次与变更时即时记录 `[Alice autonomy] idle gate:`，长期无变化时每 60 秒一条。**不强制执行任务、不伪造路径/服务端位移，不解除此前用户关闭的 querytarget 坐标见证服务。** 14:53:55—15:00 的已发生 IDLE 尚无当时状态证据，不能凭一个 state 断言根因。
- **回归：** `node --test games/minecraft-ai/bedrock-native/experiment/test/{world_camera,world_timeline,world_view,runtime}.test.cjs`、Mac `python3 -m unittest discover -s games/minecraft-ai/tests -v`、规范 `alice-mac.sh sync` 所执行的 Mint Node24 全套测试。已单独执行真实模块的隔离 V8 验证：16 种画布/朝向组合全部顶点落在可视范围、7688 实体块的 JSON 快照约 94KB <512KB、事件签名与复制门禁验证成功；不能冒充 Mac/Mint 或 BDS 实机通过。
- **部署分界：** Mac pull +（正在运行的 Mac dashboard 先用 Ctrl+C 正常停止）重新执行 `bash games/minecraft-ai/scripts/run-dashboard.sh` 使 Python API 扩容及网页生效；Linux Mint 通过规范 `bash games/minecraft-ai/scripts/alice-mac.sh sync` 安全拷贝并测试，不会重启客户端；确认通过以后用户可按计划**只执行一次** `alice-mac.sh deploy` 来加载 Node 快照/IDLE 诊断代码（会重启现有 Alice 进程）。MCSManager/BDS、世界存档、Xbox 凭证及已停用的独立 BDS querytarget 见证进程均不得重启/修改。

## 2026-10-23 — 3D 画布遮挡与实体侧栏过长修复（源码已提交，Mac 待刷新）

- 原因：`world-hud` 使用绝对定位，遮挡旋转的体素画布；`world-entities` 没有高度和滚动边界，大量箭矢重复条目将侧栏无限撑长。
- 修正：HUD 移到 canvas 之前的正常布局流，作为紧凑状态栏，画布旋转/缩放时不再被 HUD 覆盖；附近实体固定高度 220px（手机 180px）、容器内部垂直滚动、滚动不传播。
- 同种实体在有限快照中合并为 `arrow ×N`，按最近的已观测坐标展示；掉落物按照真实可见的 itemName 分类，不将未知物品猜成已知物品。数量仅反映本次最多 20 个实体的快照，不代表整个服务器的生物数量。未更改 Minecraft 世界、BDS 见证、Alice 行为或实体原始数据。
- 新增 `world_entities.test.cjs` 覆盖合并、掉落物差异、无效数据与 HUD/滚动结构。Mac 本机运行 `node --test games/minecraft-ai/bedrock-native/experiment/test/world_entities.test.cjs`；控制台刷新 `/#world` 后生效，不需要重启 Alice / BDS / Mint。

## 2026-10-23 — 3D HUD, enlarged passive view and Bedrock ZIP export (STAGED)
- 3D terrain is now sampled within radius 7 (15×15 horizontal, 8 vertical) from *already loaded* chunks; no map loading, BDS console commands or new movement. Unknown terrain is never converted into safe air. Item entities render an actual adapter-observed item name if present; otherwise display “未知掉落物”, with no guessed item ID.
- The camera description overlay is removed. HUD uses real server-synchronized health/food, core state/job and existing Ollama ModelGoalScheduler planning latency; night/weather use server-observed world state with emoji. Offline data clears. Exact Minecraft item texture parity and all item metadata names are not claimed.
- **Mac dashboard** has a Bedrock acceptance ZIP export in both Logs and 3D timeline. It calls `GET /api/acceptance/3` (optionally 1/6/12/24), which runs the existing privacy-filtered Mint exporter over read-only SSH; output is bounded to 6 MiB and validated as ZIP. Nginx permits this path only from Mac loopback; remote LAN viewers cannot export. This is **not** the old Paper raw run-log downloader, and never includes Xbox credentials, raw operator stdout, worlds or chat. The operator script `scripts/run-dashboard.sh` owns that proxy policy.
- To verify on Mac: `python3 -m unittest discover -s games/minecraft-ai/tests -p test_dashboard.py -v`; after dashboard restart on Mac, open `http://127.0.0.1:8788/#logs` and click “导出 Bedrock 近 3 小时日志 ZIP”, checking ZIP members `manifest.json`, `events.jsonl`. To see 15×15 terrain and item names, deploy Node24 code once with canonical `alice-mac.sh deploy` **after full tests**; do not restart BDS or alter the disabled coordinate-witness service.
- Code validation remains staged; no Mac/Mint live test is claimed.

## 2026-10-23 — PID 3125378 新日志：真实复活时序与实机验收

在用户给出的新 PID `3125378` 私有日志中，05:42:04 正常 Xbox 登录，05:42:15 真实复活，随后05:44:19 蜘蛛战斗、05:44:33 再死亡；05:44:45.575 发送旧版完整两包复活重试，05:44:45.657 BDS 才返回 `ReadyToSpawn`（晚82ms），此后没有成功 `spawn`，05:45:03 转为 `respawn_stalled`。故该进程不仅仅是读取了旧的 status，而是有**真实的新死亡复活故障**。05:42:31 采集的 Pathfinder 仍报 `unclassified_job_exception`，探索BDS坐标偏差0.9格；这些是独立P0/P1问题，不得误认为复活故障根因。

新 `respawn_recovery` 修复单会话安全顺序：若12秒仍无Ready，重发一次 `respawn state=2` 并等待 BDS 真正回复 `state=1` 后才发最后一次 `player_action`；若12秒前已经 Ready，则仅补发 `player_action`；同个死亡周期最多一次重试、30秒未完成即 stalled。运行状态 `deathRecovery.readyRetrySent/retrySent/serverReadyObserved/phase` 应与BDS独立服务端日志一起验收。不得在服务器回复前盲目两包连发、无限重试或开启第二个 Xbox 会话。

若要更新：Mac 先 `git fetch origin main && git pull --ff-only origin main`；`export ALICE_SSH_TARGET=tedz@192.168.0.104`，执行 `bash games/minecraft-ai/scripts/alice-mac.sh sync` 仅同步测试，测试通过再执行维护的 `deploy` 以人工确认安全重启。先保存当前诊断与最新完整日志，避免状态证据丢失；不可自行杀 PID、清锁、关 BDS 或修改 Xbox 凭据。部署后真实生成需 `health>0`、`reportedConnected=true`、`respawn_verified`、并持续有新的 BDS witness；单独 `ReadyToSpawn` **不是**成功。

## 2026-10-23 — 重启后心跳必须属于当前 PID

`status.json` 是进程重启时共享的私有文件，曾导致刚启动新 PID 3125378 的 `status` 显示旧 PID 3045722 的 `respawn_stalled/deadSeconds=3032` 及1273个BDS见证。**文件更新时间很新不证明它属于新进程**。新生产版写入 `producerPid` 和 Linux 进程 birth tick；运维 `status` 必须同时比对实例锁 PID 和 `inspect()` 获取的当前进程 birth tick。若尚未收到新进程状态，输出 `statusSource=awaiting_current_process_heartbeat`、`statusFilePid`（若可得）、`heartbeatFresh=false`，并隐藏旧进程生命/复活/位移，不得据此宣称新登录失败。

需要排查**当前** Alice 时，先执行现有 `status` 与 `diagnose`，再核对 `currentOperatorLog` 指向的后台日志的起始/尾部。过去 PID 的 `shutdown_requested → connection_ended → session_closed` 往往是运维重启的正常退出，不代表当前 PID 又断线。不得仅靠旧文件 `deadSeconds`、历史 `bdsSamples`、文件 mtime 推断当前网络状态，也不得盲目进行下一次 restart 或更改 Xbox/BDS。

## 2026-10-23 — Bedrock 复活卡死专项排查和安全恢复

PID 3045722 现场曾出现 `sessionEstablished=true`、`health=0`、`deathRecovery.phase=respawn_stalled`、`serverReadyObserved=false`、`retrySent=true`、累计死亡等待2122秒。**该状态不能简单称为断网/掉线，也不是正常夜间休息；不得删除 Xbox 认证缓存或 BDS 世界、不得关闭 online-mode 或强制启动第二实例。** 仍需要实时 BDS 日志和现有用户会话证据来确认原因。

`src/respawn_recovery.cjs` 新增的单次同会话复活补发：服务端还没回复 ReadyToSpawn 时，按 pinned upstream 顺序补发 `respawn state=2` 再补发 `player_action respawn`；服务器 ready 已到仅重试后者；12秒一次、30秒标记 stalled、不做无限重试。状态 `deathRecovery.readyRetrySent` 提示完整握手补发是否执行。仅代表出站队列调用，**不能证明 BDS 接受或者成功生成**。

旧 `alice-mint.py diagnose` 汇总 recentLifecycle 错误地将旧文件排在当前会话后面，修复后它会显示**最新进程最近事件**，便于检查。旧日志时间戳若确实未有则保留 null，不能编造时间。

本轮同步 `alice-mac.sh sync` 可更新脚本并运行完整测试，但绝不重启仍卡在死亡的旧 Node；只有 Mint 全量测试通过之后，操作员根据 `status`/`diagnose` 确认现有单实例，才可运行 `alice-mac.sh deploy`，它会走已验证的 SIGINT、锁释放和 BDS ONLINE 检查后启动一个新 Alice。生产不允许跳过 `production:check`。

## 2026-10-23 — 当前下线根因只读诊断与生存优先级

Bedrock Alice 的床不再是夜间例行“找床”任务，而是私有 `observed-beds.json` 内最多32条已观察地标，每60秒限频被动采集；睡觉前仍需近期重新验证床方块、占用、附近敌怪、时段与距离。防身装备/武器制作/能实施的庇护所排在可选睡觉前。**观察到床 ≠ 已设置重生点**。

如用户发现控制台显示离线，**先不要重启/清空实例锁/登第二个 Xbox**。使用已维护脚本读取状态及原因（Mac 在当前 repo main 并设定 `ALICE_SSH_TARGET` 后）：
```bash
bash games/minecraft-ai/scripts/alice-mac.sh status
bash games/minecraft-ai/scripts/alice-mac.sh diagnose
```
Mint:
```bash
python3 ~/minecraft-ai/scripts/alice-mint.py status
python3 ~/minecraft-ai/scripts/alice-mint.py diagnose
```
`status.sessionExit`（只有新 Node24 版本启动后才有）是事件时固定分类；`deathRecovery.phase` 用于区别死亡未复活；`sessionEstablished=false` 仅说明本进程不再维持已收到 start_game 的标志，不能证明服务器踢出。 `diagnose.recentLifecycle` 仅返回最近日志的固定事件名、时间和 PID、文件名（不显示原始踢出原因或私密登录文本），而 `diagnose.currentOperatorLog` 是完整日志的私有路径。 `diagnose` 读取日志不改变在线状态，可以在 Mac 已 `sync` 新脚本、但**尚未 restart** 时运行，用于分析现有旧进程历史；此时运行中的 Node 不会自动具备新 `sessionExit` 字段。

确需更深层确认，请以安全方式脱敏后提供 `currentOperatorLog` 与此前最近一份日志（Xbox设备码、token、证书、个人ID不可分享）。在明确观察到 `server_disconnect`/网络 `close`、`respawn_stalled` 或 `operator_shutdown` 之前，不得猜测、清认证缓存、停止BDS或强制再登录。现有进程仍运行时只有 `alice-mac.sh deploy` 或 `alice-mint.py restart` 可以作身份校验后的人工恢复；检查测试失败则不重启。仓库 `scripts/` 中脚本维护约束仍有效。

## 2026-10-23 — 完整日志、真实时间戳和疑似重复 Alice 排查

原生 Bedrock 生产进程 `node src/main.cjs --production-start` 从一开始就为 stdout 和 stderr 的每一行加入**写入时的 Mint 本地 ISO 8601 时间（含明确时区）和 PID**：

```text
[2026-10-23T03:49:04.125+08:00 PID=2992409] [Alice Bedrock] verified world backup ...
[2026-10-23T03:49:04.132+08:00 PID=2992409] [Alice wire] phase=start_game_received ...
```

不改变消息内容、网络数据包、匿名验收格式或日志文件权限。此能力仅对**新启动的生产进程**生效；旧进程旧文件没有事件时间戳，不能通过 `tail` 或查看时刻去伪造。时间戳使用**Mint 主机本地时区**，可由 `date '+%Y-%m-%dT%H:%M:%S%:z'` 检查；Mac 和 Mint 的时区若不同，应以附带的 ISO 偏移为准。

Codex 统一运维仍是唯一入口：

```bash
# Mint：只读诊断，不停止/重启/修改进程
python3 ~/minecraft-ai/scripts/alice-mint.py diagnose
# 返回 lockedPid, aliceProcessCandidates, candidateCount,
# possibleDuplicate, ownerMatchesCandidate, currentOperatorLog,
# recentOperatorLogs (最多8份，含路径、字节数和最后写入 Unix 时间)

python3 ~/minecraft-ai/scripts/alice-mint.py status
python3 ~/minecraft-ai/scripts/alice-mint.py logs
# Ctrl+C 仅退出日志查看
```

Mac 可在设定 `ALICE_SSH_TARGET` 后执行：
```bash
bash games/minecraft-ai/scripts/alice-mac.sh diagnose
bash games/minecraft-ai/scripts/alice-mac.sh logs
```

**后台日志存储**：Mint owner-only `~/.alice-bedrock-control/operator-alice-*.log`；新后台进程的 stdout/stderr 写进它，不会继续写到旧终端。因此旧 PID 的 `session_closed` 与新 PID 的 `spawn_confirmed` 可能同时在用户看到的不同窗口，不构成两个并行登录的证据。诊断仅列出同一用户、Node24、规范 `src/main.cjs --production-start`、已知项目/状态目录的**候选进程**；`candidateCount>1` 才提示疑似重复，但 BDS 同账号服务器会话数仍应以 MCSManager 查询为准。若异常，保留进程和锁，不可手工杀进程、删除锁、猜测账号或强行重启 BDS。

**完整日志排查**：优先提供当前日志 + 前一份最近历史日志。文件可能包含 Xbox 设备码等敏感信息；向其他人分享前请脱敏。还可使用已有 `collect-alice-acceptance-mac.sh` 导出匿名验收日志，减少不必要的认证信息暴露。运维日志不会自动上传 GitHub、控制台或聊天。

`MaxListenersExceededWarning` 指一个 EventEmitter 注册了超过默认 10 个监听器，并不是多个 Node 实例的证据；应在独立回归中核查监听器生命周期，不能只调高上限。

## 2026-10-23 — 死亡/复活与连接状态的判断

`alice-mac.sh status` 与 `alice-mint.py status` 现增加 `sessionEstablished` 和 `deathRecovery`：

- `reportedConnected` 仍是兼容旧 UI 的 **spawn / runtime ready** 指标：死亡会令 `runtime.seenSpawn=false`，因此 **false 不代表底层 RakNet 必然断线**。不能据此自动登录第二个 Xbox 客户端。
- `sessionEstablished=true` 表示当前进程本次收过可信的 `start_game`、且尚未收到 `close`/ `end`，并**不证明每一秒网络都畅通**。
- `health=0`、`state=SURVIVE` 及 `deathRecovery.phase` 共同辨认仍处于死亡/复活窗口；`respawn_verified` 只在新 `spawn` 事件且生命大于零时成立。
- `deathRecovery.phase=respawn_action_retried_once` 表示只在现有连接下，对上游 5 秒失败回退后补发 **一次**相同 `player_action respawn`；`respawn_stalled` 表示 30 秒仍未确认生成，**不会**删除锁、重启 BDS、无限重试或自动发起第二个 Xbox 会话。
- 如用户已拿到 `respawn_stalled`，先使用已有 `status`/`logs` 收集阶段证据；确认进程仍由 Alice 锁拥有后，可通过 `restart` 做一次安全人工恢复，绝不能 `kill -9`、删除登录锁或单独启动第二客户端。
- 若 `reportedConnected=false` 且 `sessionEstablished=false`，区分网络确已关闭和进程已退出：`status` 还需查看 `processAlive`、`heartbeatFresh` 和日志。运维脚本不会偷偷重连。

以上属于生产代码已接入、待 Mint 真实死后复活/网络验收的功能，不能把离线 heartbeat 或人工重启当作“自动复活成功”。

# Alice 运行脚本：唯一维护入口

适用：Mac `hero-skills/games/minecraft-ai` → Linux Mint `~/minecraft-ai` → 原生 Bedrock Alice。
本文及项目 `AGENTS.md` 是后续 AI 的必读操作规范。不要把聊天中的临时脚本、桌面报告或 Codex 会话目录当成正式运行依赖。

## 必须遵守的维护要求

1. **每次新增或修改交付给用户的 Mac / Mint 更新、测试、启动、停止、重启、日志及验收流程，先修改 `scripts/` 中相应入口，再给用户调用命令。** 不能只在回复中粘贴一段新的 `export` / SSH / rsync / kill。
2. 功能变更影响参数、依赖、进程管理或检查条件时，必须在同次提交更新脚本、本文、相关测试和 `CURRENT_STATE.md`；涉及控制台能力时同步 `CAPABILITIES.md` / `dashboard/catalog.json`。其他 AI 不得另起一套启动流程。
3. 实际参数留在用户机器的私有配置中，代码库只维护格式和校验。禁止提交认证令牌、认证缓存、完整进程环境、世界、私有主机配置。禁止执行配置中的任意 shell 内容。
4. 区分 Paper/Mindcraft 与原生 Bedrock。`deploy-and-run.sh`、`install-and-run.sh` 属于旧 Paper 路线；本次原生 BDS 操作使用 `alice-mac.sh` / `alice-mint.py`。不改动 Paper 服务。
5. 记录真实测试范围。脚本通过不等于游戏生存验收通过；进程启动不等于登录完成；`health=0` 和运行心跳必须分别展示。
6. 交付必须给出机器、脚本名和具体子命令，并说明是否已执行。重启只作用于经过身份检查的 Alice，保留 BDS、世界、认证和学习状态；不得删除登录锁绕过在线保护。

## 脚本索引

| 文件 | 运行位置 | 用途 |
|---|---|---|
| `scripts/alice-mac.sh` | Mac | 通过指定 SSH 目标调用 Mint；更新、测试及部署 |
| `scripts/alice-mint.py` | Mint | 启动、重启、预检、状态、日志及保存非敏感配置 |
| `scripts/alice_operator/config.py` | Mint，由入口调用 | 私有数据配置与字段白名单 |
| `scripts/alice_operator/process.py` | Mint，由入口调用 | 进程身份、退出证明及单实例启动 |
| `scripts/install-bds-witness-service.sh` | Mint | 安装或检查既有只读坐标见证服务 |
| `scripts/collect-alice-acceptance-mac.sh` | Mac | 既有验收包导出；参数见该脚本 `--help` |
| `scripts/run-dashboard.sh` | Mac | 既有控制台启动入口 |

## 当前已配置机器的日常命令

### Mint bash

无需重复复制环境变量。当前参数已从经过检查的旧进程保存为私有数据：`~/.alice-bedrock-control/operator-env.json`，权限0600，只保存白名单设置；不保存完整环境或认证令牌。

```bash
# 只读状态：进程、心跳、生命、客户端/服务端坐标
python3 ~/minecraft-ai/scripts/alice-mint.py status

# 不停止进程的预检：Node24、备份/区块检查、见证服务
python3 ~/minecraft-ai/scripts/alice-mint.py check

# 已有 Alice 时重启：自动停止旧进程并等待 BDS 确认退出
python3 ~/minecraft-ai/scripts/alice-mint.py restart

# 没有 Alice 时，从已保存的私有配置启动
python3 ~/minecraft-ai/scripts/alice-mint.py start

# 查看当前后台 Alice 的日志；Ctrl+C 仅停止日志查看
python3 ~/minecraft-ai/scripts/alice-mint.py logs

# 实际安装的 Node24 全量测试
python3 ~/minecraft-ai/scripts/alice-mint.py test
```

**`start` 和 `restart` 选用其一，不要按整段顺序全部执行。** 已有进程执行 `start` 会明确拒绝并提示 `restart`。进程存在不代表角色存活；目前游戏中的避险/死亡/复活问题需另外修复，重复重启不是这些能力的验收。

### Mac zsh / bash

先设置实际 SSH 目标；仓库不硬编码私人地址。可在自己的终端配置中保留此变量。

```bash
export ALICE_SSH_TARGET='你的Mint用户名@你的Mint地址'
cd ~/Documents/workspace/hero-skills
bash games/minecraft-ai/scripts/alice-mac.sh status
bash games/minecraft-ai/scripts/alice-mac.sh check
```

按需选择：

```bash
# 安全重启当前 Alice；与 Mint restart 是同一个入口
bash games/minecraft-ai/scripts/alice-mac.sh restart

# 实时日志
bash games/minecraft-ai/scripts/alice-mac.sh logs

# 预览更新流程：不联网，不写文件，不停止任何进程
bash games/minecraft-ai/scripts/alice-mac.sh deploy --dry-run

# 同步已提交代码、备份被覆盖文件、执行 Mint 测试，不重启
bash games/minecraft-ai/scripts/alice-mac.sh sync

# 同步、测试通过后，安全重启已有 Alice
bash games/minecraft-ai/scripts/alice-mac.sh deploy
```

Mac 更新入口要求当前为 `main` 且已跟踪文件无未提交改动；无关未跟踪文件不上传。使用 `git ls-files` 清单同步已跟踪的项目文件，rsync 无 `--delete`，被覆盖文件带时间戳备份。入口不会自动 pull/reset/stash，也不会安装/更新 Node 依赖。依赖版本变化时先按相应依赖部署文档处理，再跑完整测试。

需要获取远端更新时，先检查本地，再显式快进；若有冲突，保留本地文件并解决，勿强制清理：

```bash
git status --short
git pull --ff-only origin main
```

## 配置迁移与首次启动

已经有正常配置的 Alice 进程时，在停止它之前执行一次：

```bash
python3 ~/minecraft-ai/scripts/alice-mint.py capture-config
```

该命令检查锁所属进程、Node路径、启动参数和工作目录，提取白名单设置并写入0600 JSON。已有相同配置可重复执行；不同配置不会被自动覆盖。修改参数请在 Mint 本地编辑 `operator-env.json` 的 `settings` 对象，不要发到聊天或提交Git。完整白名单由 `alice_operator/config.py` 的 `KEYS` 维护。

必需参数：现有已验证备份清单、生产世界确认值、原 Xbox profile、已配置的 BDS Gamertag 和会话日志路径、连接模式。Ollama 与输入诊断参数也在同一白名单中保留。`ALICE_OLLAMA_URL` 必须为普通URL，不接受 Markdown 链接或包含凭据的URL。

没有旧进程也没有私有配置时，入口明确拒绝猜测配置；按 `BEDROCK_INTEGRATION.md` 完成初始备份与认证设置后，先从原有经过验证的启动环境建立客户端，再用上述命令迁移。配置文件丢失时不得清除认证缓存或世界来“解决”。

## 重启边界与错误解释

- 先做备份/区块/见证服务预检；失败则旧 Alice 保持运行。
- 先创建私有日志，再通过 Linux pidfd 精确向旧 Alice 发 SIGINT，避免 PID 被复用导致误杀。
- 确认旧进程退出、原登录锁已释放，再等待 BDS 退出记录；只对已知的延迟 ONLINE 状态作最多30秒有界复查。没有新的登录尝试。
- 未确认退出时停止操作，不开第二个客户端、不重启BDS、不删除锁、不发传送命令。
- 启动结果给出新PID和日志路径，明确它只是进程启动成功；随后用 `status` 和游戏日志确认登录。
- 重启沿用旧进程的完整环境，但只在内存中使用；冷启动采用私有白名单配置。Ollama若依赖Mac的SSH转发，该转发应独立保持运行；上述脚本不自动创建网络隧道。

## 回滚与验证

部署的备份后缀为 `.before-alice-时间-进程号`。只还原本次涉及的文件；保留私有 `operator-env.json`、认证和世界。不要将旧输入编号覆盖逻辑与 `official_2193` 旧开关一起恢复。回滚代码前确认依赖对应，再执行 `test`、`check`、`restart`。若脚本自身失败，保留原始日志和备份，不使用批量 kill 或删锁绕过。

```bash
# Mac 本地检查
bash -n games/minecraft-ai/scripts/alice-mac.sh
python3 -m unittest discover -s games/minecraft-ai/tests -p test_operator_scripts.py -v
python3 -m unittest discover -s games/minecraft-ai/tests -v
```

初次交付验收记录见 `CURRENT_STATE.md`。该文档与实际脚本是规范来源；旧的日期报告只保留历史证据，不能覆盖这里的最新操作方式。
## Explicit client-only stop (2026-11-02)

When the user asks Alice to leave so they can play, use the committed MCP task `.openclaw/tasks/alice_client_stop_operator.json` at the exact current SHA, workspace_mode=current. It calls the existing Mint AliceProcess.owner/inspect/stop implementation once (pidfd + birth-token checked SIGINT), waits five seconds and checks there is no owner. It never launches a replacement, touches BDS/world/auth, deletes a lock or repeats an uncertain stop. Read client_stop and independently query status afterwards. Already offline is a no-op. A replacement owner or unavailable receipt is a stop-and-inspect condition. This is a new explicit stop request, not replay of an earlier rejected reload.
## 2026-11-03 — Approved MCP Alice-only lifecycle

See [CLIENT_RESTART_APPROVAL_20261103](CLIENT_RESTART_APPROVAL_20261103.md).
Use the explicitly approved original `alice_17879_client_restart.json` through
MCP/current with exact HEAD and original-ID receipt polling. The bridge requires
a separate reviewed task/script hash grant and retains platform review. This is
not permission to replay refused h01 or uncertain operations. Healthy IDLE/no-job,
current owner/birth token/world/17879/fresh session and final pre-stop recheck are
mandatory; original config, one replacement, no BDS/world/auth changes. Read the
actual lifecycle receipt; zero script exit alone is not success.
## 2026-11-03 — Unknown restart is reviewed, not retried

Read root docs/ALICE_RESTART_INCONCLUSIVE_RECOVERY_20261103.md and the OpenClaw
ALICE_LIFECYCLE_RECOVERY_20261103 runbook. Original inconclusive receipts/logs
stay immutable. MCP reconcile inspects while busy, then requires fresh review
digest + rechecked exact lock/runner/settled remote evidence before release.
Resolve never starts Alice. Only after proven offline and current user recovery
authorization may a separate normal start run once using the original private
configuration and BDS release gate. Do not turn offline into another restart.
Schema3's exitVerified is positive evidence, unlike schema2 default false flags;
known exited replacements become failed/client_exited_before_login with no retry.
