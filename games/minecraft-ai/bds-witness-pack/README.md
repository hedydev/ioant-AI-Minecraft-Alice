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

## 2026-10-24 03:08 — preflight: archived backup manifest exists; 17880 lab absent; guarded lab preparation added

- User Mac JSON `AliceAI-BDS-Witness-Preflight-20261024-030846.json` (schema 2): 17879 / Bedrock level target correct; witness receiver private config and token exist; `betaApisExperiment=not_declared_in_level_dat`; witness pack and HTTP module permissions not installed; no active witness proven; `operatorBackupManifest=configured_manifest_present_not_restore_verified`; `isolated17880Lab=absent`. Scan's zero exact-cwd BDS PID never proves production offline.
- The repository ALREADY has `verify-world-backup.py` (full tar.gz SHA256 + per-file checksums + isolated temporary restore) and `prepare-bedrock-alice-lab.py` (new sibling world restored from verified offline archive, distinct 17880/17881 ports). Do NOT copy the live world. Freshness of the old configured archive is NOT proven merely by its existence; lab is a historical snapshot for protocol testing, not a substitute for fresh pre-production backup.
- New `scripts/alice-bds-archived-lab.py`: uses private owner-only Mint operator config to locate the configured snapshot without exporting the path; validates *exact* 17879 Bedrock level before touching any lab files; `check` executes the full verifier and reports only sanitized statuses; `prepare` repeats the verification and calls the pre-existing lab preparation helper to create a NEW sibling `~/minecraft-bedrock-alice-lab` only. If archive integrity/isolated restore fails, world mismatch, bad private config or destination exists, fail closed. No BDS restart, Script API activation, world experiment change, Xbox session, production server file change, or lab server launch.
- `prepare-bedrock-alice-lab.py` also now refuses nested symlinks in non-world BDS assets to avoid following unexpected paths. New `test_alice_archived_lab.py` exercises real small archive -> full verify -> new independent lab + no original world change, and all failure conditions; `test_bedrock_lab.py` extends nested symlink coverage. Local Mac/Mint regressions still need operator execution.
- Mac maintained actions `alice-mac.sh witness-lab-check` (no lab creation) and `alice-mac.sh witness-lab-prepare` (explicit new lab dir). Both sanitize remote JSON to fixed enum fields before Mac Desktop `AliceAI-BDS-Lab-{check|prepare}-TIMESTAMP.json`, include schema/time and never disclose paths, Minecraft player info, token or untrusted error details. Standard Mac git fetch/ff-only pull then `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh sync` (runs Python tests and Mint Node24 suite; no bot/BDS restart), then **to actively build the independent lab** run `ALICE_SSH_TARGET=tedz@192.168.0.104 bash games/minecraft-ai/scripts/alice-mac.sh witness-lab-prepare`. Upload Desktop JSON. This explicitly writes only an *isolated disposable copy* on Mint, and may consume disk resources for two full isolated archive validations; monitor space. No `witness-preflight` re-run required.
- Next stage after a newly created 17880 lab: determine Beta APIs compatibility and run the staged BDS script witness against the disposable copy without modifying 17879 production. World experiment and backup gates remain closed for production. Never claim real BDS witness or independent movement until proved in actual logs.

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

# Alice silent BDS position witness (experimental, NOT enabled)

This is an **opt-in** read-only Bedrock Dedicated Server behavior pack. The
current BDS 1.26.51 install MUST be inspected before installation: Microsoft
documents `@minecraft/server-net` as a **pre-release, BDS-only** API which may
not be supported by the exact installed version. This file alone does not mean
the pack will start. A failed module load leaves Alice's position proof CLOSED.

- No `runCommand`, `querytarget`, teleport, chat, block edit, or file access.
- Every ~40 ticks, observe only the configured Xbox Gamertag via
  `world.getAllPlayers()`. Require `minecraft:overworld`. Server-side player
  `location` is the feet position; client prediction is never submitted.
- Send HTTPS? **No**: token-authenticated loopback-only HTTP
  `127.0.0.1:18781/v1/position` *inside Mint*. The separate Python receiver
  checks the shared 0600 token, fixed Gamertag, schema, session marker,
  monotonic sequence, valid finite XYZ and then writes existing private
  `bds-position-witness.json` with source `bds_script_api`. The runtime
  reader still requires owner-only file, same name, unique ID, monotonic
  serial, post-login time and age <4 seconds; two samples and <0.75 block
  client/BDS disagreement are required for navigation.
- Set these values in the **module UUID** folder
  `<BDS>/config/49abe19c-5c2e-4cd4-b826-d8e935ed9932/`, **not**
  `config/default/`: copy `config/permissions.json` as `permissions.json`,
  copy `config/variables.example.json` as `variables.json` and substitute
  the real configured Alice Gamertag, and create owner-only `secrets.json`
  containing `{"aliceWitnessToken": "<value of Mint's private token file>"}`.
  NEVER place this token in GitHub, stdout, URLs or downloaded ZIPs.
- Copy the *behavior pack folder* under BDS `behavior_packs/` and reference
  header UUID `e39b740e-fb97-47e5-b1e7-f61f5a8b87de` version `[0,1,0]`
  in the correct world's `world_behavior_packs.json`. **This requires
  explicit operator approval, verified BDS backup, compatible Beta APIs
  settings and a planned MCSManager-controlled BDS restart**. Nothing in
  `alice-mac.sh sync/deploy` installs this pack or restarts the BDS.
- The Script API may require Beta experiment; enabling it can change world
  capabilities/achievements. Do not turn it on blindly. If any compatibility
  check fails, leave pack disabled and keep Alice at fail-closed IDLE.

Mint receiver lifecycle (after the relevant private config is initialized):
`python3 ~/minecraft-ai/scripts/bds_script_witness.py --init --gamertag <real Alice Gamertag>`
(only once; automatically generates 0600 token, never prints it);
`bash ~/minecraft-ai/scripts/install-bds-script-witness-service.sh --check`
(read-only); `--install` explicitly enables ONLY the loopback receiver.
The legacy querytarget unit must remain disabled; do not run both writers.

Do not call a packet correction or local physics position an independent BDS
witness. A pack that loads but does not POST signed samples is NOT sufficient
for verified navigation. Test after BDS is safely enabled: 2+ fresh
`bds_script_api` observations, login-bound identity, and real BDS-coordinate
movement; otherwise remain fail-closed and collect logs.

## Bedrock 1.26.51 compatibility gate (not an activation)

The original staged manifest specified `@minecraft/server` 2.0.0, outside the 2.x peer range documented for `@minecraft/server-net` around Bedrock 26.50. It now specifies stable `2.10.0` (available in 26.50/51), while the BDS-only net/admin modules remain beta. This is **not** proof that the installed BDS 1.26.51 loads those betas or that world Beta APIs are enabled.

For the 1.26.20+ HTTP policy the *module-scoped* `permissions.json` includes `allowed_uris=["http://127.0.0.1:18781/v1/position"]`, `force_tls=false`, `max_body_bytes=512` and `max_concurrent_requests=1`. Cleartext HTTP is permitted **only over IPv4 loopback** to the existing token-authenticated receiver. If the private receiver uses a non-default port, manually change both the private `variables.json` URL and this allowlisted URI before any future approved activation. Never modify `config/default` to enable net.

Before proposing a BDS install, run `python3 -m unittest discover -s games/minecraft-ai/tests -p test_bds_script_witness.py -v`. This only validates repository configuration; it does not test the live server.
