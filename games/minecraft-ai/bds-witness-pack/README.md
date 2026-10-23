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
