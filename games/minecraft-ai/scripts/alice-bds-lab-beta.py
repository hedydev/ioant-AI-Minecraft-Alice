#!/usr/bin/env python3
"""Explicit Beta APIs NBT toggle for the STOPPED DISPOSABLE 17880 lab only.

Preserves every unknown byte of little-endian Bedrock level.dat. Never edits
the 17879 production world, DB, BDS config, clients, credentials or receivers.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import struct
import sys
import tempfile
import time

from alice_bds_level_metadata import Reader, InvalidNBT, MAX_FILE, beta_api_experiment

HERE = Path(__file__).resolve().parent
PACK_UUID = "e39b740e-fb97-47e5-b1e7-f61f5a8b87de"
MODULE_UUID = "49abe19c-5c2e-4cd4-b826-d8e935ed9932"


def pack_guard(*, lab=None):
    spec = importlib.util.spec_from_file_location("alice_lab_pack_gate", HERE / "alice-bds-lab-pack.py")
    if spec is None or spec.loader is None:
        raise ValueError("gate_missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if lab is not None:
        # Explicit v2 routing is restricted to a verified named sibling.
        # Never weaken the existing require_lab_stopped() process identity gate.
        candidate = Path(lab)
        if candidate.name != "minecraft-bedrock-alice-lab-v2" or candidate.is_symlink() or not candidate.is_dir():
            raise ValueError("v2_lab_missing")
        module.LAB = candidate
    module.require_eligible()  # Includes true BDS /proc identity check.
    world = module.LAB / "worlds" / module.WORLD
    registered = world / "world_behavior_packs.json"
    if not module.regular(registered, 16384):
        raise ValueError("lab_pack_not_staged")
    try:
        registered_packs = module.read_json(registered)
    except (OSError, ValueError, TypeError):
        raise ValueError("lab_pack_not_staged")
    if registered_packs != [{"pack_id": PACK_UUID, "version": [0, 1, 0]}]:
        raise ValueError("lab_pack_not_staged")
    target = module.LAB / "behavior_packs" / module.PACK_NAME
    perm_dir = module.LAB / "config" / MODULE_UUID
    if not module.directory(target) or not module.directory(perm_dir):
        raise ValueError("lab_pack_not_staged")
    try:
        manifest = module.read_json(target / "manifest.json")
        perms = module.read_json(perm_dir / "permissions.json")
        variables = module.read_json(perm_dir / "variables.json")
    except (OSError, TypeError, ValueError):
        raise ValueError("lab_pack_not_staged")
    lab_script = target / "scripts" / "main.js"
    source_script = module.SOURCE / "scripts" / "main.js"
    default_secret = module.LAB / "config" / "default" / "secrets.json"
    if (not isinstance(manifest, dict) or not isinstance(perms, dict)
        or not isinstance(variables, dict)
        or manifest.get("header", {}).get("uuid") != PACK_UUID
        or manifest != module.read_json(module.SOURCE / "manifest.json")
        or perms.get("module_permissions", {}).get("@minecraft/server-net", {}).get("allowed_uris") != [module.LAB_URL]
        or variables != {"aliceWitnessUrl": module.LAB_URL,
                          "aliceWitnessGamertag": "AliceLabWitness"}
        or not module.regular(lab_script, 8192)
        or not module.regular(source_script, 8192)
        or hashlib.sha256(lab_script.read_bytes()).digest() != hashlib.sha256(source_script.read_bytes()).digest()
        or (perm_dir / "secrets.json").exists() or (perm_dir / "secrets.json").is_symlink()
        or default_secret.exists() or default_secret.is_symlink()):
        raise ValueError("lab_pack_not_staged")
    return module, world


class ExactNBTReader(Reader):
    """Record the final TAG_End offsets while validating the complete payload."""
    def __init__(self, payload):
        super().__init__(payload)
        self.root_end = None
        self.experiment_ends = []

    def value(self, tag, path, depth):
        if path == ("experiments",) and tag != 10:
            raise InvalidNBT("unexpected_experiments_tag")
        super().value(tag, path, depth)
        if tag == 10 and path == ():
            self.root_end = self.pos - 1
        elif tag == 10 and path == ("experiments",):
            self.experiment_ends.append(self.pos - 1)


def byte_tag(name, value=1):
    encoded = name.encode("utf-8")
    return b"\x01" + struct.pack("<H", len(encoded)) + encoded + bytes((value,))


def enable_beta_bytes(raw):
    """One losslessly reversible TAG_Byte insertion; no other tag is rewritten."""
    if not isinstance(raw, bytes) or len(raw) < 11 or len(raw) > MAX_FILE:
        raise ValueError("invalid_level_nbt")
    version, length = struct.unpack_from("<II", raw)
    if not 3 <= version <= 128 or length != len(raw) - 8:
        raise ValueError("invalid_level_nbt")
    payload = raw[8:]
    try:
        reader = ExactNBTReader(payload)
        if reader.u8() != 10 or reader.name() != "":
            raise ValueError("invalid_level_nbt")
        reader.value(10, (), 0)
        if reader.pos != len(payload) or reader.root_end is None:
            raise ValueError("invalid_level_nbt")
        if reader.gametest is not None:
            raise ValueError("beta_flag_already_declared")
        if len(reader.experiment_ends) > 1:
            raise ValueError("duplicate_experiments_compound")
        if reader.experiment_ends:
            pos = reader.experiment_ends[0]
            inserted = byte_tag("gametest")
        else:
            pos = reader.root_end
            name = b"experiments"
            inserted = b"\x0a" + struct.pack("<H", len(name)) + name + byte_tag("gametest") + b"\x00"
        updated = payload[:pos] + inserted + payload[pos:]
        if len(updated) + 8 > MAX_FILE:
            raise ValueError("invalid_level_nbt")
        patched = struct.pack("<II", version, len(updated)) + updated
        # The original must be byte-for-byte recoverable from this precise
        # insertion, and its entire NBT tree must remain structurally valid.
        if patched[8:8+pos] + patched[8+pos+len(inserted):] != payload:
            raise ValueError("invalid_level_nbt")
        test = ExactNBTReader(updated)
        if test.u8() != 10 or test.name() != "":
            raise ValueError("invalid_level_nbt")
        test.value(10, (), 0)
        if test.pos != len(updated) or test.gametest is not True:
            raise ValueError("invalid_level_nbt")
        return patched
    except (InvalidNBT, UnicodeError, struct.error, OverflowError, RecursionError):
        raise ValueError("invalid_level_nbt")


def lab_level_snapshot(world):
    level = world / "level.dat"
    if level.is_symlink() or not level.is_file():
        raise ValueError("lab_level_missing")
    info = level.stat()
    if (not stat.S_ISREG(info.st_mode) or info.st_size < 11
        or info.st_size > MAX_FILE or info.st_uid != os.getuid()):
        raise ValueError("lab_level_ownership_or_size")
    data = level.read_bytes()
    if len(data) != info.st_size or level.stat().st_mtime_ns != info.st_mtime_ns:
        raise ValueError("lab_level_changed")
    return level, data, info


def action(mode):
    gate, world = pack_guard()
    level, before, original_stat = lab_level_snapshot(world)
    if beta_api_experiment(level) != "not_declared_in_level_dat":
        raise ValueError("beta_flag_not_absent")
    patched = enable_beta_bytes(before)
    digest = hashlib.sha256(before).hexdigest()
    old = world / ("level.dat.alice-beta-before-" + digest[:16] + ".bak")
    if old.exists() or old.is_symlink():
        raise ValueError("lab_beta_backup_exists")
    if mode == "check":
        return "ready_for_lab_only_beta_enable"
    if mode != "enable":
        raise ValueError("unknown_mode")
    # Enabling world experiments is an explicit, irreversible game behavior
    # change for this clone. Preserve the original and never auto-roll it back.
    # Any abort after writing backup retains it for a human to inspect.
    gate.require_lab_stopped()
    if level.stat().st_mtime_ns != original_stat.st_mtime_ns or level.read_bytes() != before:
        raise ValueError("lab_level_changed")
    fd = os.open(old, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(before)
        f.flush()
        os.fsync(f.fileno())
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix=".alice-lab-beta-", suffix=".tmp", dir=str(world))
        with os.fdopen(fd, "wb") as out:
            os.fchmod(out.fileno(), stat.S_IMODE(original_stat.st_mode))
            out.write(patched)
            out.flush()
            os.fsync(out.fileno())
        if old.read_bytes() != before or level.read_bytes() != before:
            raise ValueError("lab_level_changed")
        gate.require_lab_stopped()
        os.replace(temporary, level)
        temporary = None
        if beta_api_experiment(level) != "enabled_in_level_dat":
            raise ValueError("lab_beta_postcheck_failed")
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)
    return "lab_beta_nbt_enabled_backup_preserved_not_started"


def safe_report(mode, state, reason="none"):
    return {
        "audit": "ALICE_BDS_LAB_BETA_ONLY",
        "schemaVersion": 1, "observedAtUnix": int(time.time()),
        "mode": mode, "state": state, "reason": reason,
        "productionWorldModified": False, "productionBdsRestarted": False,
        "labBdsStarted": False, "labWitnessNetworkEnabled": False,
        "serverModuleRuntimeVerified": False
    }


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("check", "enable"):
        raise SystemExit("Usage: alice-bds-lab-beta.py check|enable")
    mode = sys.argv[1]
    reason = "none"
    try:
        state = action(mode)
    except ValueError as exc:
        state = "blocked"
        reason = str(exc) if str(exc) in {
            "gate_missing", "lab_pack_not_staged", "invalid_level_nbt",
            "beta_flag_already_declared", "duplicate_experiments_compound",
            "lab_level_missing", "lab_level_ownership_or_size", "lab_level_changed",
            "beta_flag_not_absent", "lab_beta_backup_exists", "unknown_mode",
            "lab_beta_postcheck_failed", "bds_cwd_requires_privileged_read",
            "bds_cwd_unverified", "lab_bds_is_running", "proc_unavailable",
            "lab_marker_mismatch", "lab_server_properties_mismatch",
            "lab_or_production_directory_missing", "lab_world_missing",
            "lab_parent_directory_invalid", "unreviewed_source_pack"
        } else "unverified_gate"
    except (OSError, TypeError, KeyError, UnicodeError):
        state = "blocked"
        reason = "io_or_schema_error"
    print(json.dumps(safe_report(mode, state, reason), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
