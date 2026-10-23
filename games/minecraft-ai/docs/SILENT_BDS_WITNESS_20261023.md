## 2026-10-24 — 必须先同步预检脚本，且 JSON 在 Mac 二次脱敏

Mac first pulls current main, then invokes maintained alice-mac.sh sync (full tests, no restart) **before** alice-mac.sh witness-preflight. The Mint-side Python preflight does not exist remotely until sync. Mac wrapper validates and rewrites the response with fixed allowlisted enum/boolean/count fields before saving Desktop JSON; no arbitrary Mint strings are ever exported. Neither action restarts Alice, BDS or MCSManager.

## 2026-10-24 — Guarded BDS witness authorization and preflight (NOT yet installed)

- User approved moving forward with production BDS read-only Script API position witness. Permission is scoped to the exact production 17879 / Bedrock level instance with verified backup, API compatibility and planned MCSManager restart; it is not permission to guess world paths, erase secrets, enable legacy querytarget spam or skip experiment checks.
- Microsoft's BDS scripting docs mark server-net pre-release and BDS-only, with Beta APIs/world-backup cautions. Minecraft 26.50 released server 2.10.0; Bedrock 1.26.10 per-module HTTP permissions and 1.26.20 force_tls rename are source-verified. Exact 1.26.51 beta module availability and world experiment state remain unverified.
- New one-command Mac read-only preflight (after fetch/ff-only pull): ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-preflight
- Local output: ~/Desktop/AliceAI-BDS-Witness-Preflight-YYYYMMDD-HHMMSS.json, private 0600. Read-only Mint Python checks the fixed production directory ~/minecraft-bedrock, server port 17879, exact world Bedrock level, relevant pack UUID, 2.10.0/beta module declarations, loopback-only permissions, existing pack attachment, receiver config/token existence, and available process evidence. Never exports raw world files, gamertag, private token, MCSManager output, credentials or process environment.
- Explicit report states betaApisExperiment=not_verified_requires_world_level_experiment_audit, verifiedOfflineWorldBackup=not_verified_requires_backup_and_restore_test, safeToApplyWorldChanges=false. These are NOT pass conditions and cannot authorize pack installation. It performs NO write to BDS/world/MCSManager, no service enablement and no Xbox client/PID restarts.
- Offline regression: python3 -m unittest discover -s games/minecraft-ai/tests -p test_alice_bds_witness_preflight.py -v; then maintained Alice Mac sync for Mint regression if desired. Actual BDS activation requires post-preflight validated world backup and Beta API experiment compatibility, and BDS maintenance via MCSManager.

## 2026-10-23 — BDS 1.26.51 silent witness compatibility and bounded HTTP policy (source-only)

- Static review found the staged `@minecraft/server-net` 1.x manifest paired with `@minecraft/server` 2.0.0; the 26.50 module peer requirement on the 2.x track starts at 2.9.0. Switch the staged behavior-pack manifest to stable `@minecraft/server` 2.10.0, which is available in 26.50/26.51; retain experimental net/admin `1.0.0-beta`. Live BDS beta-module loading and world Beta eligibility are still UNVERIFIED.
- The 1.26.10 BDS HTTP configuration supports `module_permissions`, and 1.26.20 renamed `force_https` to `force_tls`. The witness module's `permissions.json` now explicitly restricts only its net module to `http://127.0.0.1:18781/v1/position`, `force_tls=false`, 512 request bytes and 1 concurrent request; never grant net in `config/default`. A custom receiver port requires a matching private `variables.json` URL and allowlisted URI.
- Source regression: `python3 -m unittest discover -s games/minecraft-ai/tests -p test_bds_script_witness.py -v`. Source changes, contract tests and GitHub commit are NOT Mint Node24, BDS Script API or gameplay proof. Do not activate a pack, edit the world, restart BDS/Alice, start a second Xbox session, enable legacy querytarget, or relax the independent navigation guard.
- References: https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.10 ; https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.20 ; https://www.minecraft.net/en-us/article/minecraft--bedrock-edition-26-50-changelog .

# AliceAI：无 MCSManager 刷屏的 BDS 独立坐标见证（2026-10-23）

## 证据 / 当前状态
15:51（北京时间）的用户验收包 `AliceAI-Acceptance-2026-10-23T07-51-01-663Z.zip`：`connected=true`、`mode=autonomous`、`state=IDLE`，`LEARN_WEAPON → ACQUIRE_WOOD` 在 `scout_bds_position_unavailable` 被阻止，`witnessStatus=stale_or_invalid_witness`；模型 `ready`。这是 *自主执行缺乏可信 BDS 位置证据*，并非 Ollama 思考了十几分钟。旧 `alice-bds-position-witness.service` 已由用户停用；禁止未经许可重新启用它。

## 新设计（已编写源代码，未运行/未验收）
- `bds-witness-pack/` 是可选的 BDS Script API 行为包：BDS 的服务器脚本每40 tick 读取配置中指定玩家的 `Player.location`，仅在主世界发送回环 HTTP。完全不调用 `querytarget` / `runCommand`，不改动区块、NPC 或玩家。
- `scripts/bds_script_witness.py` 在 Mint 本机 `127.0.0.1:18781` 接收（默认端口），与新生成的 owner-only 私有 token 做固定时间比较，并校验 Gamertag、玩家ID、单包启动序号、递增 sequence、有效 XYZ。私有原子发布至原来的 `~/.alice-bedrock-control/bds-position-witness.json`，标识 `source=bds_script_api`。禁止外网监听、日志泄漏认证值、把采样写入 Git。
- Alice 的 `BdsWitnessReader` / `movement_evidence` 和 `scout_start_proof` 可识别第二独立证据来源；旧 `mcsm_querytarget` 仍支持但不启用。导航权限保持：同 Xbox Gamertag、同登录会话实体身份，两个不同样本、单调 serial、采样时间在本次登录之后且4秒内有效，BDS与客户端偏差不超过0.75格。其他服务端修正包不会抹掉独立样本或延长其新鲜度；无证据仍停止，不允许通过客户端模拟坐标绕过。
- **BDS 1.26.51/2193 是否兼容上述预发布 API 尚未证实。** 文档说明 `@minecraft/server-net` 需要 BDS 世界 Beta API/对应脚本依赖和逐模块权限。该行为包可能改变世界实验设置或成就状态；不允许直接应用于当前 MCSManager BDS。详见 `bds-witness-pack/README.md`。官方 API 文档：https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting 和 https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-admin/serversecrets?view=minecraft-bedrock-experimental

## 安全部署界限和测试
Mac：确认 `git status --short`、`git fetch origin main`，只在工作树无未提交改动时 `git pull --ff-only origin main`；执行 `python3 -m unittest discover -s games/minecraft-ai/tests -v` 与 `node --test games/minecraft-ai/bedrock-native/experiment/test/{bds_witness,movement_evidence,scout_start_proof}.test.cjs`。使用已维护 `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync` 仅同步并在 Mint 运行 Node24 完整测试，不重启进程。
Mint：`python3 ~/minecraft-ai/scripts/bds_script_witness.py --init --gamertag hed ygame7231` 是示例占位名称，实际用户应改为 Alice 的正确 Gamertag；此 `--init` 会生成私有 token/config，**绝不打印 token**，不会改世界。接收器自检：`bash ~/minecraft-ai/scripts/install-bds-script-witness-service.sh --check`；只有显式 `--install` 才会在 Mint 创建并启用用户态回环服务，此动作仍不启用 BDS 脚本，不能声称 Alice 已恢复移动。
BDS：需要用户独立授权并在计划停机窗口备份世界，核实 server-net 模块、Beta 设置、世界路径与行为包兼容性，才可以修改 BDS 脚本模块配置及 `world_behavior_packs.json` 并经 MCSManager 做一次正式重启。**本次不做这一操作**，不清锁、不换 Xbox 会话、不读写 world DB、不重启 BDS。

验收标准：BDS 行为包实际运行、同机回环 HTTP 204、至少两次新鲜的 `bds_script_api`、身份有效、`scoutStartProof.ok=true`、真实 BDS 的位移及非零任务成果；仅代码提交或接收端启动都不能称为成功。故障时 fail closed，收集匿名 ZIP。
