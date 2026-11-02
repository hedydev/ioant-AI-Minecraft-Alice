# Alice 17879：实机碰撞门路径与 BDS 验收（2026-11-03）

## 前置条件

原生产世界 `Bedrock level`、Mint `192.168.0.104`、BDS UDP `17879`；不创建世界、不重启 BDS。原 Alice 进程在 MCP revision 69 被确认恢复为 PID `3923865`。本次只读任务均通过当前 owner、世界、端口、连接与心跳门禁，未发 BDS 命令、未执行移动或客户端重启。任务编号与原回执可用 `openclaw_project_result/report` 核查。

## 本次真实原世界读数

1. `alice_r69_collision_realworld_read_01`：客户端方块缓存的实际碰撞盒和 `getProperties().open_bit/upper_block_bit`；周围 7 格、上下 6 层共 1,350 条记录，未知 0。最初门在相对 `(-2,-2)`，云杉木门**关闭**，下半 `upper=false`、上半 `upper=true`，头部火把 `boundingBox=empty` 且 `shapes=[]`，石墙为真实完整碰撞盒。
2. `alice_r69_doorbed_view_audit_07`：随后只读名称扫描，门约在相对 `(-2,-3)`、床两张在 `(-8,-9)` 与 `(-9,-9)` 附近、均较远。相对坐标变化**不是** BDS 运动确认；可能是客户端位置变化或服务端校正。
3. `alice_r69_swept_door_live_fix_13`：增加 avatar 0.6 格宽、1.8 格高、每一步 9 个扫掠中心采样、每中心 9 个脚底支撑探针和两层真实碰撞盒重叠检查的**纯只读**诊断；每层方块未知、危险、门或形状不可验证均拒绝，绝不将“过了诊断”视为移动授权。最新一轮木门位于相对 `(-3,-3)`、依然关闭；扫掠验证在客户端名义格中心找到 17 个可达格。最短门前候选是 **5 次逐格 WALK**：`[-1,0] → [-1,-1] → [-1,-2] → [-2,-2] → [-3,-2]`，门 `[-3,-3]`。首次候选格 `[-1,0]` 或 `[0,1]`。该路径仅为**客户端缓存的中心线候选**，不保证从 Alice 当时的真实脚位置可执行，未确认门前 BDS 坐标，也未开门。
4. 运行状态 `alice_r69_home_current_read_02`/`alice_r69_gate_read_03`/`alice_r69_reconcile_read_04` 及后续 `alice_r69_gate_followup_08`/`alice_r69_home_after_witness_09`：Alice connected/session true、HP20、autonomous/IDLE；私有记忆有床两张，但个人重生点 `not_verified`、HOME `not_established`、doorKnown/exitVerified/returnVerified false。床单格动作 `attempted=true`，仍 `bed_step_waiting_for_new_independent_endpoint`，BDS 验证 false；夜间等待 `scout_step_awaiting_new_bds_pair`。这不能算床前到达或完成睡眠。
5. 移动权威证据：当前生命 `independentSamples` 从 78 增至 80，`movingQueued` 从 161 到 168；**freshPair=false、independentPairTravelBlocks=0**，并且后续权威采样已过期。因此只能证明输入和采样存在，不能证明该单格被 BDS 接受。`alice_r69_bds_demand_audit_05` 显示 demand timer active/enabled、optedIn、每小时上限40、当时使用2，`lastServiceResult=cooldown_or_budget`；其 `serverTravel=22.05` 不能替代对应床动作的前后新鲜配对位移，禁止混淆累计里程和单次验收。
6. `alice_r69_model_nav_audit_06`：当前生命 model scout 24 提议、23 次 endpoint feedback 其中 partial 22、confirmed 0；本地估计 0.74 格、`pathfinder_no_path` 记录 1；不能作为服务器走路通过的证据。

## 源码、测试和部署边界

- 新读数处理器：`games/minecraft-ai/scripts/alice-collision-shape-readonly.py`；碰撞缓存生产者保持先前受测的 `src/world_view.cjs`。新版本增加真碰撞 **扫掠中心线 BFS**（只读，不是 pathfinder 或 movement executor），新增合成直通门/四面墙拒绝的自测。
- 早期自测 `alice_r69_swept_door_live_11` 失败：夹具只挡两侧，仍允许从另外两侧绕行；未运行远端读取。修正后 `alice_r69_swept_door_live_fix_13` 的自测与 Mint 实机只读报告均 passed。
- 精确源码提交 `e9bf8d1d4461979850e07f9baf5ea3741e81bef1`，`alice_r69_swept_fixture_sync_12` 已快进到现有 Mac checkout；`alice_r69_swept_mac_regression_14` Python **321 项（跳过 3，0失败）**。Mint Node24 930/930 是既有 Node 生产代码前一轮验收；这次只改 Mac Python 只读诊断脚本，**没有重启当前客户端或声称部署新移动行为**。

## 下一步实机验收顺序

先等待现有按需见证系统对**当前生命和本次动作**生成独立、单调、新鲜的双 BDS 坐标与动作时间相关性证据；每一步必须重查碰撞、头顶高度、怪物、玩家、任务状态和出生点，**只有该单格服务器确认后**才考虑下一格，绝不能从五格候选图连续执行。到达门前后按原 `escape_door_action` 的门开关复查与一次 bounded activation，只有上下半状态证明 open 才继续，穿越门还要单独验证另一侧 BDS 落点。最后才推进床设置重生点/夜间睡眠/HOME 回程，不将“记得床”当作重生点。

所有旧 `inconclusive` 回执与受控审阅恢复记录仍应保留。若网络再次 `ECONNRESET`，先独立调查，不重放启动或清理凭据。
