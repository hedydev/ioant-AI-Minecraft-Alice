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
