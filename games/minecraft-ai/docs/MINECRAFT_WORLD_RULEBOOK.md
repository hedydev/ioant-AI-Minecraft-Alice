# Minecraft World Rules — AliceAI / Bedrock 1.26.51

**Purpose:** versioned game knowledge for deterministic world decisions, not permission for arbitrary LLM commands or world editing. Observed game telemetry is authoritative for current conditions; documentation governs expected rules; an AI guess never overrides safety or player orders.

## Evidence levels

- **Factual rule:** sourced from official Minecraft guides, current Minecraft Wiki, or the pinned 1.26 Bedrock Mineflayer protocol implementation; an authoritative server still determines if a particular action succeeds.
- **Observed condition:** time/weather, nearby loaded world blocks, hostile entities, inventory and player state from the active client's packets; unloaded chunks remain **unknown**.
- **Attempted action:** pathfinder or interaction called. It is not success unless Bedrock authoritative postcondition is observed.
- **Learned experience:** bounded and privacy-scoped negative/positive observations; it cannot redefine Minecraft IDs, authorize world destruction or modify code.

## Beds, sleep and respawn

1. Beds are used for normal sleep only in the Overworld. Using a bed in the Nether/End is dangerous; Alice must refuse.
2. Sleep normally requires nighttime or a thunderstorm. In clear weather the applicable sleep window is approximately 12542–23459 in-game ticks; in rainy weather the window may start around 12010, with the server deciding the actual allowed window.
3. The pinned Bedrock Mineflayer plugin exposes `bot.time.timeOfDay`, `bot.isRaining`, `bot.thunderState`, `bot.sleep(bed)`, and `bot.isSleeping`. Alice uses the plugin's actual observations and waits for `bot.sleep()` server confirmation rather than claiming sleep merely from attempted interaction.
4. Occupancy, monster proximity and navigability must be considered before approaching a bed. The server may still refuse sleep because of other players, obstruction or monster proximity, so reasons and location cooldowns remain bounded and classified.
5. In the Overworld, *daytime use of a bed can set a respawn point without sleeping*. This is a distinct action from sleeping, not an excuse to fake sleep success.
6. Bedrock multiplayer respawn-point use of shared beds can affect other players. Alice must receive a dedicated bed or a future verified ownership/consent mechanism before automatically setting a spawn point. **Current Alice nightly sleep code still considers nearby free beds; operators should prepare a dedicated Alice bed.** A spawn point is **not** claimed as verified in current release.

## Daylight cycle and exploration strategy

- **Daylight (policy):** gather safe resources, prepare equipment, explore short known loaded corridors when autonomy is allowed. Never automatically override FOLLOW.
- **Dusk (policy):** stop optional far exploration; inspect whether shelter and food are available. Exact phase division is a policy and does not change server time.
- **Night or daytime thunder (game condition):** prefer safe shelter or authorized bed sleep if permitted; emergencies and commands still take priority. Minecraft multiplayer sleep skip depends on other players/game rules.
- **Failure memory (implemented):** a locally failed resource area or bed attempt must cool down; it is not proof the region never has resources. Persist at most 32 coarse site records, error classes and expiry timestamps in private per-edition Alice state.
- **Scouting (staged):** at most one 6-block candidate within a fully loaded natural-surface corridor, 8-second timeout and exclusive pathfinder owner, only under known safe daylight conditions. Unknown terrain, nearby mobs, player-built floors and hazardous blocks invalidate it. Do not call a local Mineflayer position estimate Bedrock server-authoritative travel.
- **Long-range travel and return home (pending):** requires verified server movement, stable navigation, camp identity, route memory, day/night planning and player-controlled permission for building/bed placement. Never add random blind exploration as a fallback.

## Priority and safety contract

`SURVIVE` > urgent protection/combat > explicit player commands/FOLLOW > necessary maintenance > optional day/weather routines > autonomous resource/scouting > social/observation. Distinct observers can run concurrently; only one action owns movement/pathfinding at a time. STOP aborts elective tasks, but life-saving handling remains intact.

## Source references checked on 2026-10-19

- Minecraft official, *Spawning and dying*: https://www.minecraft.net/en-us/article/spawning-and-dying
- Minecraft Wiki, *Bed*: https://theminecraftwiki.com/wiki/bed/
- Pinned Bedrock Mineflayer fork `lib/bedrock_plugins/bed.js`, `rain.js` and `time.js`, commit `b24015aeeec68a5c94f54444f104f0e563595a30`: weather/tick and Bedrock server-authoritative sleep interface.

**Future work:** durable owned-spawn-bed registration with verified server acknowledgement, camp memory, normalized time/weather event traces, item recipe/biome/resource knowledge graph and real-world navigation acceptance. These are not implemented merely by this rules document.
