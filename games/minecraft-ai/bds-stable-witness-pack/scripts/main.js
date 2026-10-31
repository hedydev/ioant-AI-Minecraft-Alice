// STAGED ONLY: this pack is NOT installed/active on the original 17879.
// Stable @minecraft/server 2.10.0 requires no Beta APIs experiment.
// It only sends server-observed coordinates to Alice's private action bar.
// Operator must replace the exact name placeholder in a PRIVATE installed
// copy after verified backup/consent. Never change the official source here.
import { world, system } from "@minecraft/server";
const TARGET_NAME = "__OWNER_SELECTED_ALICE_GAMERTAG__";
const PREFIX = "ALICE_BDS_STABLE_V1";
const BOOT = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 13);
let sequence = 0;
system.runInterval(() => {
  if (TARGET_NAME.startsWith("__")) return; // cannot emit without provisioning
  try {
    const p = world.getAllPlayers().find(player => player.name === TARGET_NAME);
    if (!p || p.dimension?.id !== "minecraft:overworld") return;
    const loc = p.location, id = p.id;
    if (!/^[A-Za-z0-9-]{8,72}$/.test(id) ||
        ![loc.x, loc.y, loc.z].every(Number.isFinite)) return;
    const stamp = Date.now();
    if (!Number.isSafeInteger(stamp) || stamp <= 0 || sequence >= 999999) return;
    const payload = [PREFIX, BOOT, String(++sequence), String(stamp), id,
      String(loc.x), String(loc.y), String(loc.z)].join("|");
    // No public chat, no game commands, no inventory or terrain mutations.
    p.onScreenDisplay.setActionBar(payload);
  } catch { /* fail closed; no external logs or coordinates */ }
}, 40);
