package io.ioant.alice.bridge;

import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Set;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;
import java.io.IOException;
import org.bukkit.Bukkit;
import org.bukkit.World;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Snapshot only expressly allowlisted online players, every 20 ticks.
 * This writes a restricted local file, not a network endpoint or permission grant.
 */
public final class AlicePositionFeed extends JavaPlugin {
    private BukkitTask feedTask;
    private final AtomicInteger consecutiveErrors = new AtomicInteger();

    @Override public void onEnable() {
        saveDefaultConfig();
        if (!getConfig().getBoolean("enabled", false)) {
            getLogger().info("Position feed disabled by configuration");
            return;
        }
        String output = getConfig().getString("output-file", "").trim();
        if (output.isEmpty() || !Path.of(output).isAbsolute()) {
            getLogger().severe("Configured output-file must be an absolute path; feed disabled");
            return;
        }
        Set<String> players = new HashSet<>(getConfig().getStringList("players"));
        if (players.isEmpty() || players.stream().anyMatch(name -> !name.matches("[.A-Za-z0-9_-]{1,32}"))) {
            getLogger().severe("Configure an exact allowlist of player names; feed disabled");
            return;
        }
        Path out = Path.of(output).normalize();
        feedTask = Bukkit.getScheduler().runTaskTimer(this, () -> writeSnapshot(out, players), 20L, 20L);
        getLogger().info("Publishing positions for " + players.size() + " explicitly configured players");
    }

    private void writeSnapshot(Path output, Set<String> allowlist) {
        StringBuilder json = new StringBuilder("{\"players\":{");
        boolean first = true;
        for (Player player : Bukkit.getOnlinePlayers()) {
            if (!allowlist.contains(player.getName())) continue;
            Location loc = player.getLocation();
            World world = loc.getWorld();
            if (world == null) continue;
            if (!first) json.append(',');
            first = false;
            String name = player.getName();
            String dimension = world.getKey().toString();
            json.append('"').append(name).append("\":{");
            json.append(String.format(Locale.ROOT,
                "\"x\":%.5f,\"y\":%.5f,\"z\":%.5f,\"dimension\":\"%s\",\"updatedAt\":%d,\"source\":\"paper\"",
                loc.getX(), loc.getY(), loc.getZ(), dimension, System.currentTimeMillis()));
            json.append('}');
        }
        json.append("}}\n");
        Path tmp = null;
        try {
            Path parent = output.getParent();
            Files.createDirectories(parent);
            tmp = Files.createTempFile(parent, ".alice-pos-", ".tmp");
            Files.writeString(tmp, json.toString(), StandardCharsets.UTF_8);
            try {
                Files.setPosixFilePermissions(tmp, Set.of(PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE));
            } catch (UnsupportedOperationException ignored) {
                // Non-POSIX filesystems do not have POSIX file permission primitives.
            }
            Files.move(tmp, output, StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING);
            consecutiveErrors.set(0);
        } catch (AtomicMoveNotSupportedException ex) {
            if (consecutiveErrors.incrementAndGet() == 1)
                getLogger().severe("Atomic file move unsupported; refusing partial snapshots: " + ex.getMessage());
        } catch (IOException ex) {
            if (consecutiveErrors.incrementAndGet() == 1)
                getLogger().severe("Cannot write local Alice positions: " + ex.getMessage());
        } finally {
            if (tmp != null) {
                try { Files.deleteIfExists(tmp); } catch (IOException ignored) { }
            }
        }
    }

    @Override public void onDisable() {
        if (feedTask != null) feedTask.cancel();
    }
}
