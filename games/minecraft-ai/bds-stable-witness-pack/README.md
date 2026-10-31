# Alice stable BDS position witness (STAGED; NOT DEPLOYED)

This is an alternative to the existing experimental @minecraft/server-net HTTP
pack. It uses only the stable @minecraft/server 2.10.0 Script API and a Bedrock
server-to-Alice SetTitlePacket/Actionbar. It does not need Beta APIs experiments,
Minecraft commands, RCON or a second world.

**It still needs explicit approval to add a behavior pack to the existing world,
and a coordinated production BDS restart; the pack is currently not installed.**
Do not change the original Bedrock level, its server.properties, world_behavior_packs.json,
or achievements/experimental flags without independent backup and approval.
This pack does not contain a client connection, network service or secret.

An operator-generated private copy must replace the exact
`__OWNER_SELECTED_ALICE_GAMERTAG__` marker with Alice's verified authenticated
gamertag (string-escaped), and register that exact pack UUID in the existing
17879 world. A separately authorized owner-only Mint config under
`~/.alice-bedrock-control/bds-stable-actionbar-enabled.json` gates Alice's
client-side reader. Never create either file just to pass tests.

Every 40 server ticks (roughly two seconds) it samples the *server's* player
`location` and `id`, then sends a private action-bar message only to Alice.
The client reader only consumes a matching SetTitle Actionbar packet, validates
source time, monotonic serial, player ID, and the standard 2-samples/4-seconds/
0.75-block alignment gate. No player chat, client physics, login coordinates,
or ordinary movement corrections can substitute for this signal.

The official Bedrock 1.26.51 protocol defines SetTitlePacket 88 and Actionbar
kind 4. The exact decoding and real BDS event have **not** been field-verified;
mock packet tests are not a live integration acceptance. Initial deployment,
if later authorized, must first observe two true authenticated Actionbar
packets without allowing any movement, and only then test one flat adjacent cell.

Official references:
- https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/screendisplay
- https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog
- https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-title-packet/
