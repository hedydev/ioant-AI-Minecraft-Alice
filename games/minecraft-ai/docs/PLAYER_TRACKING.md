# Player position tracking: visible entity / waypoint / Paper feed

## What Alice can really know

- **Within entity range:** `bot.players[username].entity.position` provides a fresh coordinate and dynamic `GoalFollow`.
- **Recently left range:** Alice retains her own last-seen waypoint for at most 30 seconds; it is only an old coordinate, not a remote sighting.
- **Distant player:** a deliberately configured Paper plugin may update a trusted local JSON file, and Alice uses `GoalNear` toward the latest point. Alice still needs a navigable route, loaded chunks and enough time, and automatically switches back to `GoalFollow` upon reacquiring the player.
- **Unknown, stale or another dimension:** stop guessing and wait. This does **not** grant Alice OP or teleportation, support dimension portals automatically or load remote chunks.
- The tracker never claims to know the position of an offline player.

## Optional Paper bridge: separate server change

The Alice one-command update/start script copies the plugin **source**, not an activated plugin. Enable this only when you want player positions available beyond entity distance, and only on a trusted local Paper server. Nothing here exposes coordinates over HTTP.

Prerequisites: Java 21 and Maven on Linux Mint, Paper API dependency resolvable from Paper's Maven repository, and permission to stop/restart the Paper server.

From Mint after the project mirror is synced:

```bash
cd ~/minecraft-ai/server-bridge
mvn -DskipTests package
```

After a successful build, stop Paper through its own console, copy `target/alice-position-feed-0.1.0.jar` into the server's `plugins/` directory, and start Paper to create the configuration file. For the existing Alice test host the server directory has previously been `~/minecraft-alice-v2`, but **verify the actual running server directory** rather than assuming that path is still correct.

Edit `plugins/AlicePositionFeed/config.yml` in that Paper server directory:

```yaml
enabled: true
output-file: '/home/tedz/mindcraft-alice/bots/AliceAI/player_locations.json'
players:
  - '.MolarParsley191'
```

The exact Floodgate Java name must match the server online player list. Ensure the destination directory is writable by Paper and readable by the Alice process (both have previously run as tedz). Restart Paper again to load configuration. The plugin writes only explicitly allowlisted online player entries and updates the local file about once per second using atomic replacement and owner-readable permissions on POSIX filesystems.

## Trust boundaries and compatibility

The file is a private server-to-bot bridge, not user input. Do not point it into any public web-served directory or sync it to GitHub. Its expected shape is:

```json
{
  "players": {
    ".MolarParsley191": {
      "x": 25.5,
      "y": 70.0,
      "z": -120.5,
      "dimension": "minecraft:overworld",
      "updatedAt": 1790000000000,
      "source": "paper"
    }
  }
}
```

`updatedAt` is a millisecond Unix timestamp (example only, not current time). Alice rejects a fix more than 30 seconds old, future-dated by over 5 seconds, with non-finite coordinates, or from a different dimension. If Paper's dimension identifiers or API artifact coordinates differ on your exact server build, address that during the **separate Maven/plugin acceptance test**, not by silently allowing mismatched worlds.

## Verification

Check Paper startup for `AlicePositionFeed`, confirm the JSON file changes while the allowlisted player moves, and then have Alice follow while moving well beyond the entity visibility range. The logs should show `LONG RANGE ... via server` and ultimately `Player entity reacquired`. If it cannot find a safe path, it should remain behind rather than teleport or leap.

**Status:** Plugin source written; **not compiled, installed or verified against the user's Paper process yet**. 