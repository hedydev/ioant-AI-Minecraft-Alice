#!/usr/bin/env python3
"""Explicit short startup probe of ONLY the cloned 17880 BDS.

Never creates Xbox clients, alters 17879 production, changes Beta tags, or
connects to the production 18781 position witness. Raw BDS logs are ephemeral.
"""
import importlib.util
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time

from alice_bds_level_metadata import beta_api_experiment

HERE = Path(__file__).resolve().parent
SAFE_PROPS = {
    "server-port": "17880", "server-portv6": "17881",
    "online-mode": "true", "level-name": "Bedrock level",
    "enable-lan-visibility": "false", "allow-list": "true",
    "content-log-file-enabled": "true",
    "allow-inbound-script-debugging": "false",
    "allow-outbound-script-debugging": "false",
    "script-debugger-auto-attach": "disabled",
}
CONTROLLED = set(SAFE_PROPS)


def beta_gate():
    spec = importlib.util.spec_from_file_location("alice_lab_beta_for_probe",
                                                   HERE / "alice-bds-lab-beta.py")
    if spec is None or spec.loader is None:
        raise ValueError("missing_lab_beta_tool")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _, world = module.pack_guard()
    if beta_api_experiment(world / "level.dat") != "enabled_in_level_dat":
        raise ValueError("lab_beta_not_enabled")
    lab = world.parent.parent
    binary = lab / "bedrock_server"
    if (binary.is_symlink() or not binary.is_file() or
            not os.access(binary, os.X_OK)):
        raise ValueError("lab_bds_binary_not_executable")
    if os.geteuid() == 0:
        raise ValueError("refuse_root_python")
    return module, lab


def properties(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 65536:
        raise ValueError("unsafe_lab_properties")
    data = path.read_text(encoding="utf-8")
    current = {}
    for line in data.splitlines():
        if line.lstrip().startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if key in CONTROLLED:
            if key in current:
                raise ValueError("duplicate_lab_property")
            current[key] = val.strip()
    for key in ("server-port", "server-portv6", "level-name", "online-mode"):
        if current.get(key) != SAFE_PROPS[key]:
            raise ValueError("lab_port_world_or_auth_changed")
    return data, current


def secure_config(lab):
    """One-time lab-only hardening: preserve originals and deny all players."""
    props = lab / "server.properties"
    contents, found = properties(props)
    allowed = lab / "allowlist.json"
    if allowed.is_symlink() or (allowed.exists() and not allowed.is_file()):
        raise ValueError("unsafe_lab_allowlist")
    old_allow = allowed.read_bytes() if allowed.is_file() else None
    if old_allow is not None and len(old_allow) > 16384:
        raise ValueError("unsafe_lab_allowlist")
    saved_props = lab / ".alice-lab-probe-original-properties"
    saved_allow = lab / ".alice-lab-probe-original-allowlist"
    if any(p.exists() or p.is_symlink() for p in (saved_props, saved_allow)):
        raise ValueError("lab_probe_already_prepared")
    revised = []
    visited = set()
    for line in contents.splitlines():
        key = line.partition("=")[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
        if key in CONTROLLED:
            revised.append(key + "=" + SAFE_PROPS[key])
            visited.add(key)
        else:
            revised.append(line)
    revised.extend(k + "=" + v for k, v in SAFE_PROPS.items() if k not in visited)
    result = ("\n".join(revised) + "\n").encode("utf-8")
    originals = [(saved_props, contents.encode("utf-8")), (saved_allow, old_allow if old_allow is not None else b"")]
    for path, raw in originals:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    # Only inside lab. Fail closed on existing symlink, and atomically replace
    # known properties/allowlist with whitelist + LAN discovery disabled.
    if props.is_symlink() or allowed.is_symlink():
        raise ValueError("unsafe_lab_config")
    with tempfile.NamedTemporaryFile(dir=lab, prefix=".alice-lab-props-", delete=False) as handle:
        temp_props = Path(handle.name)
        handle.write(result)
        handle.flush()
        os.fsync(handle.fileno())
    try:
        os.chmod(temp_props, stat.S_IMODE(props.stat().st_mode))
        os.replace(temp_props, props)
    finally:
        temp_props.unlink(missing_ok=True)
    with tempfile.NamedTemporaryFile(dir=lab, prefix=".alice-lab-allowlist-", delete=False) as handle:
        temp_allow = Path(handle.name)
        handle.write(b"[]\n")
        handle.flush()
        os.fsync(handle.fileno())
    try:
        os.chmod(temp_allow, 0o600)
        os.replace(temp_allow, allowed)
    finally:
        temp_allow.unlink(missing_ok=True)
    return True


LAB_MARKER = "ALICE_LAB_IMPORTS_READY_17880"


def instrument_lab_script(lab):
    """Add one nonsecret, one-shot import confirmation to the cloned pack only.

    Appended after all top-level import declarations; do not patch production.
    Keep the exact original clone script as a private, separately named backup.
    """
    file = lab / "behavior_packs" / "alice-silent-bds-witness" / "scripts" / "main.js"
    source = lab.parent / "minecraft-ai" / "bds-witness-pack" / "scripts" / "main.js"
    backup = file.with_name(".alice-lab-probe-original-main.js")
    if (not file.is_file() or file.is_symlink() or not source.is_file() or
            source.is_symlink() or backup.exists() or backup.is_symlink()):
        raise ValueError("unsafe_lab_instrumentation")
    body = file.read_bytes()
    if body != source.read_bytes() or LAB_MARKER.encode("ascii") in body:
        raise ValueError("lab_script_drift")
    lines = body.splitlines(keepends=True)
    imports = [i for i, line in enumerate(lines) if line.lstrip().startswith(b"import ")]
    if len(imports) != 3:
        raise ValueError("lab_script_unexpected_imports")
    marker = ('console.warn("' + LAB_MARKER + '");\\n').replace('\\n', chr(10)).encode("ascii")
    changed = b"".join(lines[:imports[-1]+1]) + marker + b"".join(lines[imports[-1]+1:])
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(body)
        f.flush()
        os.fsync(f.fileno())
    # Lab script remains readable; never touch the original source pack.
    with tempfile.NamedTemporaryFile(dir=file.parent, prefix=".alice-lab-main-", delete=False) as f:
        temp_script = Path(f.name)
        f.write(changed)
        f.flush()
        os.fsync(f.fileno())
    try:
        os.chmod(temp_script, stat.S_IMODE(file.stat().st_mode))
        os.replace(temp_script, file)
    finally:
        temp_script.unlink(missing_ok=True)


def ports_free():
    sockets = []
    try:
        a = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sockets.append(a)
        a.bind(("0.0.0.0", 17880))
        b = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
        sockets.append(b)
        b.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        b.bind(("::", 17881))
        return True
    except OSError:
        return False
    finally:
        for item in sockets:
            item.close()


def classify(log):
    """Only category flags; never emit raw coordinates, names or stack traces."""
    lower = log.lower()
    module_terms = ("@minecraft/server-net", "@minecraft/server-admin",
                    "@minecraft/server", "script api", "[scripting]")
    scripting = any(x in lower for x in module_terms)
    errors = any(x in lower for x in (
        "[scripting][error]", "script error", "cannot resolve module",
        "failed to load script", "unable to find module", "module not found"))
    imports = LAB_MARKER.lower() in lower
    return {
        "serverReadyObserved": any(x in lower for x in (
            "server started", "server is ready", "server started.")),
        "scriptModuleMessagesObserved": scripting or imports,
        "scriptLoadErrorObserved": errors,
        "verifiedScriptModuleLoaded": imports,
    }


def probe(lab, *, duration=12, popen=subprocess.Popen, sleep=time.sleep):
    if not ports_free():
        raise ValueError("lab_udp_ports_busy")
    # No private Alice/Xbox/production service environment enters the BDS.
    env = {"HOME": str(Path.home()), "PATH": "/usr/local/bin:/usr/bin:/bin",
           "LANG": "C.UTF-8", "LD_LIBRARY_PATH": str(lab)}
    run = None
    with tempfile.TemporaryFile(mode="w+b") as logs:
        try:
            run = popen(["./bedrock_server"], cwd=lab, env=env,
                        stdin=subprocess.PIPE, stdout=logs, stderr=subprocess.STDOUT,
                        start_new_session=True)
            sleep(duration)
            try:
                run.communicate(input=b"stop\n", timeout=15)
            except subprocess.TimeoutExpired:
                run.send_signal(signal.SIGINT)
                try:
                    run.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    return ("lab_shutdown_unverified", classify(""))
            logs.seek(0)
            raw = logs.read(1_000_000).decode("utf-8", "replace")
            flags = classify(raw)
            flags["isolatedBdsExited"] = run.returncode is not None
            if run.returncode not in (0, None):
                return ("lab_exited_with_error", flags)
            if not flags["serverReadyObserved"]:
                return ("lab_ready_not_observed", flags)
            if flags["scriptLoadErrorObserved"]:
                return ("lab_script_load_error_observed", flags)
            if flags["verifiedScriptModuleLoaded"]:
                return ("lab_module_imports_observed", flags)
            return ("lab_server_ready_module_unverified", flags)
        finally:
            if run is not None and run.poll() is None:
                # Strict ownership: signal only this newly launched lab PID.
                run.send_signal(signal.SIGINT)
                try:
                    run.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    pass


def run_action(mode):
    gate, lab = beta_gate()
    gate.require_lab_stopped()
    if mode == "check":
        props, keys = properties(lab / "server.properties")
        return ("ready_for_isolated_lab_probe", {
            "isolationConfigReady": all(keys.get(k) == v for k, v in SAFE_PROPS.items())
                and (lab / "allowlist.json").is_file()
                and (lab / "allowlist.json").read_bytes().strip() == b"[]",
            "serverReadyObserved": False, "scriptModuleMessagesObserved": False,
            "scriptLoadErrorObserved": False, "verifiedScriptModuleLoaded": False,
        })
    if mode != "probe":
        raise ValueError("invalid_action")
    if not ports_free():
        raise ValueError("lab_udp_ports_busy")
    # Cooperating probes must never overlap. Lock is held through graceful
    # shutdown, not released before a second process could start.
    lockpath = lab / ".alice-lab-probe.lock"
    fd = os.open(lockpath, os.O_RDWR | os.O_CREAT |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "rb+") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("lab_probe_already_running")
        gate.require_lab_stopped()
        secure_config(lab)
        gate.require_lab_stopped()
        instrument_lab_script(lab)
        gate.require_lab_stopped()
        return probe(lab)


def output(mode, state, flags=None, reason="none"):
    flags = flags or {}
    return {
        "audit": "ALICE_BDS_LAB_STARTUP_PROBE", "schemaVersion": 1,
        "observedAtUnix": int(time.time()), "mode": mode, "state": state,
        "reason": reason, "isolationConfigReady": bool(flags.get("isolationConfigReady", mode=="probe")),
        "serverReadyObserved": bool(flags.get("serverReadyObserved", False)),
        "scriptModuleMessagesObserved": bool(flags.get("scriptModuleMessagesObserved", False)),
        "scriptLoadErrorObserved": bool(flags.get("scriptLoadErrorObserved", False)),
        "verifiedScriptModuleLoaded": bool(flags.get("verifiedScriptModuleLoaded", False)),
        "isolatedBdsExited": bool(flags.get("isolatedBdsExited", False)),
        "productionWorldModified": False, "productionBdsRestarted": False,
        "productionWitnessUsed": False,
    }


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("check", "probe"):
        raise SystemExit("Usage: alice-bds-lab-probe.py check|probe")
    mode = sys.argv[1]
    try:
        state, flags = run_action(mode)
        result = output(mode, state, flags)
    except ValueError as exc:
        codes = {
            "missing_lab_beta_tool", "lab_beta_not_enabled",
            "lab_bds_binary_not_executable", "refuse_root_python",
            "unsafe_lab_properties", "duplicate_lab_property",
            "lab_port_world_or_auth_changed", "unsafe_lab_allowlist",
            "lab_probe_already_prepared", "lab_probe_already_running", "unsafe_lab_config",
            "unsafe_lab_instrumentation", "lab_script_drift",
            "lab_script_unexpected_imports",
            "lab_udp_ports_busy", "invalid_action", "lab_pack_not_staged",
            "lab_bds_is_running", "bds_cwd_requires_privileged_read",
            "bds_cwd_unverified", "proc_unavailable",
        }
        result = output(mode, "blocked", reason=str(exc) if str(exc) in codes else "unverified_guard")
    except (OSError, TypeError, KeyError, subprocess.SubprocessError):
        result = output(mode, "blocked", reason="io_or_process_error")
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
