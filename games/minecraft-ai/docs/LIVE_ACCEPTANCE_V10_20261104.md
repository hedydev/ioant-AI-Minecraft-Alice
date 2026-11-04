# Alice 17879 版本 10 实机验收与床通行阻塞 — 2026-11-04

> 现场范围：原 `Bedrock level` / UDP 17879，2026-11-04 17:58–18:09（新加坡时间）；使用 OpenClaw Mac `alice-ai` 已批准固定任务。之前源码 v10=`0c7f4e17b11ac297db200a690171de5c65f9aaac` 已由 92 回执证明 Mint Node24 1012/1012、Mac Python337（skip3，0失败），非重启同步完成；本文不把源码测试、客户端预测或只读缓存当作游戏成功。

## 1. 原批准客户端加载

接手前 latest durable handoff Revision88；GitHub main/Mac HEAD 基线 `623916f1a2d4e20db198947b36658060fc581ae6`，工作区干净；此前 PID1826633 运行 bedLogicVersion9，最后旧床请求已 rejected，无待复用请求。
- `alice_r89_preload_bed_readonly_20261104_93`：原 PID1826633/version9 在线，HP20、无活动 job；床2张，个人重生点 not_verified。
- `alice_r89_preload_bed_command_state_20261104_94`：旧 commandId `3c219128a38e487c9ee94cf0352ab3b8` 是 rejected/bed_needs_verified_approach，不在途，不重发。
- `alice_r89_v10_approved_client_restart_20261104_95`：原批准 `.openclaw/tasks/alice_17879_client_restart.json`、current/精确HEAD，审核/预检通过，单替换旧PID1826633→新PID1971786。进程、心跳、游戏连接/会话、owner、世界、17879 验证通过，`bdsRestarted=false`、`worldChanged=false`。
- `alice_r89_v10_postload_bed_readonly_20261104_96`：**新 PID1971786、bedLogicVersion=10 实机读回**，HP20、记忆床2张、无job、重生点尚未确认。重启成功不是床移动成功。

## 2. 一次性重生点指令及独立后验

- `alice_r89_v10_bds_demand_preflight_20261104_97`：按需 BDS timer enabled/active、ownerValid，最新 position_pair_verified；查询预算2/40，独立样本2，历史 serverTravel=0。不是人为加速查询。
- `alice_r89_v10_spawnpoint_once_20261104_98`：通过已提交的 typed `alice_bed_set_spawnpoint_once.json` **仅提交一次** `set_spawnpoint`，commandId=`4e68d700e949453d8e19161d84bfbdb9`。受理 queued 不表示成功；`doNotRepeat=true`。
- `alice_r89_v10_spawnpoint_status_20261104_99`：新命令 started，`bedRequestStage=approach`，`bedWitnessKind=intent`、`bedWitnessState=needs_evidence`，`witnessDemandState=needs_two_fresh_samples`、`positionGateSatisfied=false`；v10 已保留有界床目标，不再像 v9 初次直接 rejected，但没有任何新单格许可。
- `alice_r89_v10_finite_bds_observation_20261104_100`：严格只读 210209ms、835次状态，PID1971786 未改变。仅2次 fresh_relative_sample、7次 sample_time_skew、826次 bds_pair_unverified；合格窗口最小/最大客户端-BDS位置差 **0.00格**、BDS位移0、idleOnly=true、movementInputsObserved=false、坐标校正拒绝0。**这只证明静止短窗口相对一致，完全不能证明床前动作、连续运动或终点。**
- `alice_r89_v10_postobserve_bed_state_20261104_101`：**上述唯一新命令明确 finished=`failed`，reason=`jump_origin_support_or_headroom_unverified`**；仍 IDLE、无睡眠，`personalBedStatus=not_verified`，`bedStepStatus=held`，当时游戏已可睡但 `sleepOpportunity=bed_needs_verified_approach`。禁止重发同一命令以制造更多点击。

## 3. 当前缓存地形与碰撞阻塞

- `alice_r89_v10_terrain_bed_voxels_20261104_102`：`source=client_chunk_cache_not_bds`，床区块2张、客户端名义平面距离约7.8格；地图有名义平地和实心墙/危险/门，**网格符号不是可行走路径许可**。
- `alice_r89_v10_collision_shape_20261104_103`：只读1350条碰撞记录、未知0，`sweptDoorSurvey.reachableCenters=1`、`firstCellCandidates=[]`、`actualFootPositionUnverified=true`、`movementPermitted=false`。Alice 所在格的缓存样本未给出脚下 `dy=-1` 完整支撑，只有较低层 `dy=-2` stone、上方 `dy=2` cobblestone；相邻左侧/朝前的若干格有已观察到的 `dy=-1` stone 支撑和 `dy=2` 顶棚。原地精确脚底 XZ 边界、所在高度与足迹跨格承托未在此匿名摘要中证明。
- 源码 `adjacent_motion_decision.cjs` 先试 `flatSurveyRoute` 与 `selectDirectionalBedStep`，再仅以 `candidateOneBlockJump` 作后备；`direct_flat_step.cjs::verifyFlatFirstStep` 检查全路径的足底采样支撑和头部碰撞；`one_block_jump.cjs` 要求原点完整支撑、完整起跳净空/落点，当前明确给出 `jump_origin_support_or_headroom_unverified`。因此**原因已定位到几何准入，而非仍等待的床请求**；但尚不能断言是错误拒绝还是客户端足迹/地形确实危险，不可据缓存简图直接修改许可。

## 4. 验收边界与下一次正确动作

保留历史 **63 木门激活观察、72 独立 BDS 穿门、86 一格台阶独立 BDS 终点**；这些是旧生命期已确认事件，不能当作当前 PID 到床成功。**床到达、个人重生点服务端确认、真实睡眠均未通过。**

后续先实现/使用受约束的只读足迹诊断：在不输出隐私/原始坐标的前提下核对当前同 owner/生命的 BDS feet 与客户端脚底格 y 分数、`onGround`、实际 0.6m AABB、`dy=-1/-2` 支撑与相邻扫掠碰撞；按实际 Minecraft 物理验证是不是“边缘站立、但中心格无全地板”的保守误判。先复现定向/跳跃两个候选被拒的**各自**原因，写正反夹具和真实固定物理测试；只在能够证明全路径已观察、无碰撞危险、支撑连续、满足原安全限制时才允许新一格，绝不可简单删除 `fullSupport`/9点足迹/头顶条件。任何代码修复都需 Mac/Mint 全量回归、非重启同步后才可考虑原批准客户端加载，并重新独立验收 BDS 终点。

保留双独立BDS样本、4s/0.75格起步门禁、单格240s、180秒查询间隔/每小时40次、10分钟退避及 STOP/FOLLOW/战斗/碰撞/owner/session/life 保护。不得重启 BDS、修改世界、克隆/reset、清预算或锁、第二客户端、重复旧请求、绕审核；无需再重启 Alice，除非后续源码确实有新加载需求。网页监督及 alice-2 继续 PAUSED。

本文仅是**本轮实机证据/文档更新**，没有功能源码修改；此前 v10 1012/1012 与 Mac337(skip3) 回归仍有效，未因此文档重复运行测试。
