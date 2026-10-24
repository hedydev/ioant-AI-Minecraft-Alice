# AliceAI 17880 Lab / OpenClaw Integration Handoff — 2026-10-24

> Scope: evidence-backed AliceAI experimental Bedrock Dedicated Server (BDS) 17880 startup validation and the Mac ChatGPT/OpenClaw action loop. **This is not a production 17879 BDS operation.** Last known evidence is user-provided; no further Mint process or BDS execution occurred during this documentation update.

## Repositories and machines

- **AliceAI:** `hedydev/ioant-AI-Minecraft-Alice`, `main`, local Mac `~/Documents/workspace/ioant-AI-Minecraft-Alice`. Canonical runbook: `games/minecraft-ai/docs/OPERATIONS.md`; use maintained `games/minecraft-ai/scripts/alice-mac.sh`, with Mac local `ALICE_SSH_TARGET` pointing to the configured Linux Mint account.
- **ChatGPT/OpenClaw Mac execution loop:** `hedydev/ioant-AI-Agent-Local-MacOS`, `main`, `~/Documents/workspace/ioant-AI-Agent-Local-MacOS`; see `docs/CHATGPT_LOOP.md`. Relevant last inspected Mac main: `51be0821da2ff52101af231f2eff4c71f2c34c76`. User previously ran Mac Node suite **103/103 pass**. A separate `alice-lab-startup-probe` task exists behind `--enable-alice-lab-startup-probe`, with a durable single-attempt marker. Do **not** assume it has completed a real browser→Mint→ChatGPT roundtrip. Interactive Mint `sudo` still blocks unattended startup in that checked-in version; no automatic credential bridge was committed. Do not copy administrator credentials into code, prompt text, logs or Git.
- **Server separation:** production Bedrock service/world at **17879** must not be restarted/modified. Disposable cloned experimental BDS uses UDP **17880 (IPv4)** / **17881 (IPv6)**, never the production receiver or active Alice Xbox account.

## Actual chronological evidence

1. Earlier `witness-lab-startup-probe` failed with `AttributeError: module 'alice_lab_beta_for_probe' has no attribute 'require_lab_stopped'`. The cause was `beta_gate()` returning the wrong module. AliceAI fix `124939091d4ddbf64c77158c8a4e6b9b8f319b84` corrected this and added regression coverage. That traceback did **not** prove a BDS startup.
2. After a successful Mac/Mint sync with **628/628 Mint Node tests passing**, read-only startup check yielded `state=ready_for_isolated_lab_probe`, `reason=none`, but `isolationConfigReady=false`. The BDS had not started. Check JSON `AliceAI-BDS-Lab-Startup-check-20261024-071908.json` on Mac Desktop.
3. One explicit subsequent `witness-lab-startup-probe` yielded schemaVersion 1, `state=blocked`, `reason=lab_udp_ports_busy`; `serverReadyObserved=false`, `verifiedScriptModuleLoaded=false`, `isolatedBdsExited=false`; `productionWorldModified=false`, `productionBdsRestarted=false`, `productionWitnessUsed=false`. The earlier probe report's `isolationConfigReady=true` was a **misleading default** on blocked probes, subsequently fixed in AliceAI. Report filename `AliceAI-BDS-Lab-Startup-probe-20261024-072050.json`. This is **not** success or module-import proof.
4. Initial `witness-lab-port-check` proved `ipv4_17880=in_use`, `ipv6_17881=available` and **no** cloned lab config/script backup or probe lock indicators. Port classification and marker inspection were added, then a Python `Path.home` default-argument fixture bug was fixed in `cefd5f1`.
5. Latest user-observed second port check after Mint **628/628 pass**:
   ```json
   {
     "audit": "ALICE_BDS_LAB_UDP_PORT_CHECK",
     "schemaVersion": 1,
     "observedAtUnix": 1792799119,
     "readOnly": true,
     "ipv4_17880": "in_use",
     "ipv6_17881": "available",
     "bothAvailable": false,
     "preparation": {
       "labDirectory": "present",
       "configBackupPresent": false,
       "scriptBackupPresent": false,
       "probeLockPresent": false
     },
     "socketOwners": {
       "status": "observed",
       "sockets": [
         {"port":17880,"family":"ipv4","ownerVisible":false,"owners":[]}
       ]
     },
     "note":"point_in_time_not_process_ownership_proof"
   }
   ```
   **Interpretation:** A UDP socket occupies 17880. The unprivileged `ss` query identified a socket row but **could not observe the PID or process name**; it is false to say the port has no owner. Nothing here authorizes killing processes or relocating services. The lack of one-shot markers is consistent with a first-gate port block, not independent proof that some other BDS cannot be running.
6. Following that evidence, a separate, **operator-authorized read-only** `witness-lab-port-owner` action was already added to AliceAI `main` (commit preceding this handoff; consult current `OPERATIONS.md`). It runs one fixed `sudo -n /usr/bin/ss` socket query on 17880/17881 after an interactive Mint `sudo -v`; it returns only bounded port/family/process/PID fields, never raw environment, command line, credentials or unrelated port data. **No real result from this elevated owner audit has yet been supplied.**

## Exact next step for the successor

1. Re-read the latest **remote `main` HEAD** and `games/minecraft-ai/AGENTS.md`, `docs/OPERATIONS.md`, this handoff, `docs/CURRENT_STATE.md` and the **current** `alice-mac.sh` before modifying code. Respect branch safety: fetch exact HEAD, `pull --ff-only`; never reset/clean/stash/switch/force-push or overwrite a concurrent change.
2. Ask the operator to run the already-maintained **read-only owner audit**, not to write a new script or re-run lab startup. Mac Terminal:
   ```bash
   cd ~/Documents/workspace/ioant-AI-Minecraft-Alice
   git fetch origin main &&
   git pull --ff-only origin main &&
   ALICE_SSH_TARGET="tedz@192.168.0.104" bash games/minecraft-ai/scripts/alice-mac.sh sync &&
   ALICE_SSH_TARGET="tedz@192.168.0.104" bash games/minecraft-ai/scripts/alice-mac.sh witness-lab-port-owner
   ```
   Local interactive Mint `sudo` authentication is expected: enter it only in the terminal prompt, never in chat or a command argument. This audit does not modify worlds, restart Alice, start BDS or kill anything. If the result still contains `ownerVisible=false`, report unknown and diagnose safely rather than guessing.
3. Inspect the returned sanitized `ALICE_BDS_LAB_UDP_PORT_CHECK` report. If a PID/process is positively identified, first determine whether it is the existing Minecraft production server, MCSManager, another protected service or an approved lab instance using read-only evidence. Do not infer from a process name alone or stop any service without separate human authorization and verified process identity.
4. Only after the conflict has been safely resolved and the operator separately approves a fresh lab experiment should a new controlled 17880 startup strategy be designed. Respect the Alice one-time staging backups/locks and the Mac per-conversation one-shot claim; never delete/reset them to manufacture retries. Accept success only with server-ready, Script API import marker and verified lab shutdown from a fresh report; even then that is **not** real Alice login, BDS server-origin position evidence or gameplay success.
5. When updating code: tests and canonical `OPERATIONS.md`/`CURRENT_STATE.md`/`CAPABILITIES.md` in the same atomic commit; full Mac Python and Mint Node tests through `alice-mac.sh sync` before any lab operation. Maintain user-visible action result and evidence trace without exposing secrets.

## Explicitly out of scope / prohibited assumptions

- No extra BDS on 17880 while UDP 17880 is occupied; no force bind, no changing production ports, no blanket kill/stop/restart, no altering 17879 world.
- No inference that a missing process PID means an absent owner, that a read-only check proved BDS readiness, or that a launch-probe report from before the `isolationConfigReady` fix attests hardened clone state.
- No unattended OpenClaw administrator-password auto-entry is implemented/accepted in the checked-in Mac repository. Do not assume the failed local development of a proposed credential bridge was committed.
- This handoff preserves the user's last observed **628/628** Mint test evidence; tests for the **new elevated owner audit** and live Mint owner identification have not yet been provided by the operator.


## Next-agent decision table — operator checkpoint (2026-10-24)

This handoff has been reconfirmed against live user output and the current repository, not against a live Mint SSH session. The last ordinary `witness-lab-port-check` was already executed successfully; **do not request it repeatedly**. The next distinct evidence request is only `witness-lab-port-owner`, a maintained, bounded **read-only**, human-authenticated action. It is not an OpenClaw automatic privileged action.

| Fresh `witness-lab-port-owner` result | Safe interpretation and immediate next action |
| --- | --- |
| `ipv4_17880=in_use`, `ownerVisible=true`, a PID/name is returned | A socket PID has been observed, but its service identity and whether it is protected still need independent read-only verification. Check ownership and exact process birth token before proposing any action; do not terminate it or assume a name alone identifies the 17879 server. |
| `ipv4_17880=in_use`, `ownerVisible=false` | The port is still blocked and PID remains unknown. Do not guess or kill. Investigate whether Mint's elevated filtered `ss` actually ran and what read-only permission boundary persists; no 17880 startup retry. |
| `socketOwners.status=unavailable` | The owner audit did not provide trusted socket evidence. Preserve the independent `ipv4_17880` bind result and report exactly which allowlisted audit path is unavailable; do not treat `unavailable` as a free port. |
| `ipv4_17880=available` in a later independent sample | Availability is a **point-in-time observation only**. Before any experimental startup, separately review the prior one-shot attempt, lab backups/locks and production process identities; require a fresh explicit scoped approval. |
| `ownerAuditRequested=false` | The operator did not perform the elevated owner audit, so the response must not be represented as sudo-backed process identification. |

**Verified now:** Alice Mint tests 628/628 pass; latest ordinary UDP port evidence at Unix time `1792799119` showed 17880 in use, 17881 available, one socket row with owner not visible, and no clone backup/instrumentation/lock markers. **Not yet verified:** owner PID, whether it belongs to production/MCSManager, new elevated owner-audit tests on Mac, actual 17880 BDS startup/imports/exit, or automated ChatGPT ↔ OpenClaw result roundtrip. **Do not share/record administrator passwords.** The operator's original one-shot startup attempt remained blocked with `lab_udp_ports_busy` and no positive BDS-ready or module-import evidence.


## 一段式中文交接（可直接复制给下一位 AI）

接手 `hedydev/ioant-AI-Minecraft-Alice` 的 `main`，先读取仓库根 `AGENTS.md`、`games/minecraft-ai/AGENTS.md`、`docs/OPERATIONS.md`、`docs/CURRENT_STATE.md` 和 `docs/HANDOFF_2026-10-24_UDP17880_OPENCLAW.md`，GitHub 写入前重新获取远端 HEAD/文件 SHA，禁止 reset/clean/stash/switch/强推。当前任务不是重新开发 Alice 功能，而是把已经修复了 `beta_gate()` 错误的实验 BDS **17880 启动验收**继续推进：用户 Mac/Mint 同步测试已观察到 Mint Node `628/628` 通过，但 `witness-lab-startup-probe` 的真实报告为 `state=blocked,reason=lab_udp_ports_busy`，**没有** BDS ready、Script API 导入或实验服正常退出证据；最新只读端口诊断 `observedAtUnix=1792799119` 表明 `ipv4_17880=in_use`、`ipv6_17881=available`、`socketOwners.status=observed`，存在 17880 socket，但 `ownerVisible=false,owners=[]`，**不能**推断无进程占用。实验副本目录存在，配置备份、脚本备份、探测锁均不存在，不代表获准重试。AliceAI 最新主分支已经另外实现需操作员终端输入 sudo 的**只读** `witness-lab-port-owner`，尚无 Mint 实测归属结果；下一步只在 Mac 用 `cd ~/Documents/workspace/ioant-AI-Minecraft-Alice && git fetch origin main && git pull --ff-only origin main && ALICE_SSH_TARGET="tedz@192.168.0.104" bash games/minecraft-ai/scripts/alice-mac.sh sync && ALICE_SSH_TARGET="tedz@192.168.0.104" bash games/minecraft-ai/scripts/alice-mac.sh witness-lab-port-owner` 获取脱敏的固定 UDP 17880/17881 PID/进程名证据。若仍不可见，继续安全的只读排查，**不可猜测或杀进程、移动服务端口、删除实验锁或备份、再次运行一次性 startup probe，也不能改动正式 17879 BDS/世界**。独立 Mac OpenClaw 仓库 `hedydev/ioant-AI-Agent-Local-MacOS` 已有受显式授权的 `alice-lab-startup-probe` 任务框架，但自动 sudo 凭据输入和 ChatGPT→Mint→ChatGPT 真实闭环尚未验收；用户曾测试该仓库 Node `103/103` 通过，不能当作实验 BDS 通过。取得真正的占用者归属后先核验 PID、进程启动身份和是否关联生产服/MCSManager，再给出需要用户明确授权的隔离修复和验收计划；重要变更请将测试、`OPERATIONS`、`CURRENT_STATE` 和 `CAPABILITIES` 同步提交。
