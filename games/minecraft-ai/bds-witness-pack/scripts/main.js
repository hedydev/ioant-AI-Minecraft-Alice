// BDS-only; requires per-module @minecraft/server-net permission and
// owner-configured @minecraft/server-admin variables + secret.
// Zero commands, no block/entity mutations, no console output.
import { world, system } from "@minecraft/server";
import { variables, secrets } from "@minecraft/server-admin";
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";

const url = variables.get("aliceWitnessUrl");
const name = variables.get("aliceWitnessGamertag");
const secret = secrets.get("aliceWitnessToken");
const valid = typeof url === "string" &&
  /^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]{4,5}\/v1\/position$/.test(url) &&
  typeof name === "string" && /^[A-Za-z0-9_ ]{3,16}$/.test(name) && !!secret;

// Boot marker distinguishes a *single* pack load (not a security credential).
const boot = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 13);
let sequence = 0;
let pending = false;
if (valid) system.runInterval(() => {
  if (pending) return;
  let p;
  try { p = world.getAllPlayers().find(x => x.name === name); }
  catch { return; }
  if (!p) return;
  try { if (typeof p.isValid === "function" && !p.isValid()) return; }
  catch { return; }
  let location, dimension, id;
  try { location = p.location; dimension = p.dimension.id; id = p.id; }
  catch { return; }
  if (dimension !== "minecraft:overworld" ||
      typeof id !== "string" || !/^[A-Za-z0-9-]{8,72}$/.test(id) ||
      ![location.x, location.y, location.z].every(Number.isFinite)) return;
  // Back-to-back samples from the Script API, not Mineflayer predictions.
  const body = JSON.stringify({ version: 1, gamertag: name, playerId: id,
    boot, sequence: sequence++, dimension,
    feet: {x: location.x, y: location.y, z: location.z} });
  pending = true;
  try {
    const request = new HttpRequest(url);
    request.method = HttpRequestMethod.Post;
    request.body = body;
    request.timeout = 2;
    request.headers = [
      new HttpHeader("Content-Type", "application/json"),
      new HttpHeader("X-Alice-Witness-Token", secret)
    ];
    http.request(request).then(() => { pending = false; },
      () => { pending = false; });
  } catch { pending = false; }
}, 40);
