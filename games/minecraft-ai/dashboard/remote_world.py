#!/usr/bin/env python3
"""Fixed, read-only Alice 3D viewport snapshot reader executed over SSH stdin.

No path arguments, no world DB access, no arbitrary logs, no game or auth API.
"""
import json
from pathlib import Path
import sys
import time

ROOT = Path.home() / ".alice-bedrock-control"
LIMIT = 512 * 1024
STALE_MS = 12000


def read(root=ROOT, clock=lambda: int(time.time() * 1000)):
    source = root / "world-view.json"
    if root.is_symlink() or source.is_symlink():
        raise ValueError("Unsafe Alice viewer path")
    if not source.exists():
        return {"online": False, "ageMs": None, "view": None, "reason": "not_published"}
    stat = source.stat()
    if not source.is_file() or stat.st_size > LIMIT or stat.st_size < 2:
        raise ValueError("Invalid Alice viewer size")
    data = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError("Invalid Alice viewer version")
    stamp = data.get("observedAt")
    age = clock() - stamp if type(stamp) in (int, float) else -1
    if not 0 <= age <= STALE_MS or data.get("connected") is not True:
        return {"online": False, "ageMs": age if age >= 0 else None,
                "view": None, "reason": "stale_or_disconnected"}
    if (not isinstance(data.get("palette"), list) or len(data["palette"]) > 256
        or not isinstance(data.get("voxels"), list) or len(data["voxels"]) > 12000
        or not isinstance(data.get("entities"), list) or len(data["entities"]) > 20
        or not isinstance(data.get("events"), list) or len(data["events"]) > 24):
        raise ValueError("Invalid Alice viewer structure")
    return {"online": True, "ageMs": int(age), "view": data}


if __name__ == "__main__":
    if len(sys.argv) != 1:
        raise SystemExit("No parameters supported")
    print(json.dumps(read(), ensure_ascii=False, separators=(",", ":")))
