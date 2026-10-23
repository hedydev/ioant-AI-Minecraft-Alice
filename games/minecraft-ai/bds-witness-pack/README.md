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
