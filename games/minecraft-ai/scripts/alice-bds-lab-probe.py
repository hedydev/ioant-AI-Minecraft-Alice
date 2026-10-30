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
import shutil
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


def beta_gate(*, lab=None):
    spec = importlib.util.spec_from_file_location("alice_lab_beta_for_probe",
                                                   HERE / "alice-bds-lab-beta.py")
    if spec is None or spec.loader is None:
        raise ValueError("missing_lab_beta_tool")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # pack_guard() returns (lab_pack_module, world), not (beta_module, world).
    # The lab-pack module owns require_lab_stopped(); returning the beta
    # module caused AttributeError before the first BDS launch.
    if lab is not None:
        candidate = Path(lab)
        if (candidate.name != 'minecraft-bedrock-alice-lab-v2' or
            candidate.parent != Path.home() or candidate.is_symlink() or
            not candidate.is_dir()):
            raise ValueError('v2_lab_missing')
        reviewed = module.pack_guard
        module.pack_guard = lambda: reviewed(lab=candidate)
    lab_pack, world = module.pack_guard()
    if not callable(getattr(lab_pack, "require_lab_stopped", None)):
        raise ValueError("lab_process_guard_unavailable")
    if beta_api_experiment(world / "level.dat") != "enabled_in_level_dat":
        raise ValueError("lab_beta_not_enabled")
    lab = world.parent.parent
    binary = lab / "bedrock_server"
    if (binary.is_symlink() or not binary.is_file() or
            not os.access(binary, os.X_OK)):
        raise ValueError("lab_bds_binary_not_executable")
    if os.geteuid() == 0:
        raise ValueError("refuse_root_python")
    return lab_pack, lab


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

# Only the already staged disposable lab is ever launched. Network isolation
# avoids colliding with the production zombie BDS bound to host UDP 17880.
NETNS_UNSHARE = Path("/usr/bin/unshare")
NETNS_TRUE = Path("/usr/bin/true")
NETNS_CAT = Path("/usr/bin/cat")
NETNS_PYTHON = Path("/usr/bin/python3")
# Executed ONLY after a fresh unshare --user --map-root-user --net. The lo
# interface is initially DOWN in this child netns; a BDS import attempt could
# otherwise waste the one-shot fixture before its server ever becomes ready.
# Never run this setup on the host: it is argv data exclusively for unshare.
NETNS_V2_LOOPBACK_SETUP = (
    "import os,sys,socket,fcntl,struct\n"
    "s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)\n"
    "try:\n"
    " current=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))\n"
    " flags=struct.unpack_from('H',current,16)[0]\n"
    " if not flags & 1:\n"
    "  fcntl.ioctl(s.fileno(),0x8914,struct.pack('16sH14s',b'lo',flags|1,b''))\n"
    " current=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))\n"
    " if not struct.unpack_from('H',current,16)[0] & 1: sys.exit(76)\n"
    "finally:\n"
    " s.close()\n"
    "os.execv(sys.argv[1],[sys.argv[1]])\n"
)


def trusted_namespace_python():
    """Accept only the packaged Python 3 executable or its trusted distro link."""
    candidate = NETNS_PYTHON
    if not candidate.is_file() or not os.access(candidate, os.X_OK):
        return False
    if not candidate.is_symlink():
        return True
    try:
        link = candidate.lstat()
        resolved = candidate.resolve(strict=True)
        meta = resolved.stat()
        return (candidate == Path("/usr/bin/python3")
                and link.st_uid == 0
                and resolved.parent == Path("/usr/bin")
                and re.fullmatch(r"python3\.[0-9]{1,2}", resolved.name) is not None
                and stat.S_ISREG(meta.st_mode)
                and meta.st_uid == 0
                and meta.st_mode & 0o022 == 0
                and os.access(resolved, os.X_OK))
    except (OSError, ValueError, RuntimeError):
        return False


def namespace_v2_loopback_preflight(run=subprocess.run):
    """Set lo UP in a disposable child netns, then exec /usr/bin/true.

    Strictly no host-network fallback, sudo, world access, or BDS run. A
    refusal happens BEFORE creating the real lab's one-shot lock/backups.
    """
    if (not NETNS_UNSHARE.is_file() or NETNS_UNSHARE.is_symlink()
            or not trusted_namespace_python()
            or not NETNS_TRUE.is_file() or NETNS_TRUE.is_symlink()):
        return False
    cmd = [str(NETNS_UNSHARE), "--user", "--map-root-user", "--net",
           "--", str(NETNS_PYTHON), "-I", "-c", NETNS_V2_LOOPBACK_SETUP,
           str(NETNS_TRUE)]
    try:
        p = run(cmd, capture_output=True, timeout=8, check=False,
                env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
    except (OSError, subprocess.SubprocessError):
        return False
    return p.returncode == 0


def namespace_preflight(run=subprocess.run):
    """Opt-in child namespace capability check; never start BDS or bind a host port.

    A failed user+network namespace unshare is a hard refusal. No privileged
    fallback, sudo, host namespace networking or --userns=host substitute.
    """
    if (not NETNS_UNSHARE.is_file() or NETNS_UNSHARE.is_symlink()
            or not os.access(NETNS_UNSHARE, os.X_OK)
            or not NETNS_TRUE.is_file() or NETNS_TRUE.is_symlink()):
        return False
    command = [str(NETNS_UNSHARE), "--user", "--map-root-user", "--net",
               "--", str(NETNS_TRUE)]
    try:
        result = run(command, capture_output=True, timeout=8, check=False,
                     env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0





def namespace_loopback_state(run=subprocess.run):
    """Observe lo of the actual fresh child netns via Linux SIOCGIFFLAGS.

    /sys/class/net/lo/flags can show HOST lo without a sysfs remount after
    unshare --net. Instead use ioctl on a socket opened INSIDE this new
    namespace. No interface change, host UDP bind, shell, sudo, or BDS run.
    Observation is new and does NOT reconstruct the previous BDS namespace.
    """
    if (not NETNS_UNSHARE.is_file() or NETNS_UNSHARE.is_symlink()
            or not NETNS_PYTHON.is_file()
            or not os.access(NETNS_PYTHON, os.X_OK)):
        return "unverified"
    script = (
        "import socket,fcntl,struct\n"
        "s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)\n"
        "try:\n"
        " data=fcntl.ioctl(s.fileno(),0x8913,struct.pack('256s',b'lo'))\n"
        " flags=struct.unpack_from('H',data,16)[0]\n"
        " print('up' if flags & 1 else 'down')\n"
        "finally:\n"
        " s.close()\n"
    )
    command = [str(NETNS_UNSHARE), "--user", "--map-root-user",
               "--net", "--", str(NETNS_PYTHON), "-I", "-c", script]
    try:
        result = run(command, capture_output=True, text=True, check=False,
                     timeout=8, env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
        if result.returncode != 0 or len(result.stdout) > 32:
            return "unverified"
        value = result.stdout.strip()
        return value if value in ("up", "down") else "unverified"
    except (OSError, ValueError, subprocess.SubprocessError):
        return "unverified"


def postmortem_gate(*, lab=None):
    """Validate ONLY the stopped, named existing lab for read-only diagnosis.

    The first startup correctly requires byte-identical installed/source pack
    scripts via beta_gate()->pack_guard(). That same first startup deliberately
    instruments the lab script with a one-shot marker, so pack_guard() must
    NOT be reused after a completed attempt. This separate path keeps the
    exact existing lab/prod identity, process ownership and reviewed source
    checks from require_eligible(), while lab_probe_postmortem() verifies
    the preserved original and the exact one-line instrumentation.
    """
    spec = importlib.util.spec_from_file_location(
        "alice_lab_pack_postmortem", HERE / "alice-bds-lab-pack.py")
    if spec is None or spec.loader is None:
        raise ValueError("missing_lab_beta_tool")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if os.geteuid() == 0:
        raise ValueError("refuse_root_python")
    if lab is not None:
        candidate = Path(lab)
        if (candidate.name != 'minecraft-bedrock-alice-lab-v2' or
            candidate.parent != Path.home() or candidate.is_symlink() or
            not candidate.is_dir()):
            raise ValueError('v2_lab_missing')
        module.LAB = candidate
    module.require_eligible()  # Exact lab marker/source + BDS process safety.
    if not callable(getattr(module, "require_lab_stopped", None)):
        raise ValueError("lab_process_guard_unavailable")
    return module, module.LAB


def lab_probe_postmortem(lab):
    """Inspect one-shot lab artifacts, never re-run the disposed BDS process.

    The earlier probe saved process stdout only in a TemporaryFile; once the
    process ended, that error is irrecoverable. Never fabricate a crash cause.
    """
    marker = lab / "behavior_packs" / "alice-silent-bds-witness" / "scripts" / "main.js"
    originals = [
        lab / ".alice-lab-probe-original-properties",
        lab / ".alice-lab-probe-original-allowlist",
        marker.with_name(".alice-lab-probe-original-main.js"),
    ]
    lock = lab / ".alice-lab-probe.lock"
    for path in [*originals, marker, lock]:
        if path.is_symlink():
            raise ValueError("unsafe_lab_postmortem_file")
    # A previously instrumented script must be exactly the reviewed source
    # plus ONE known marker. A random file containing that string is not
    # evidence of the operator's one-shot preparation.
    original = originals[2]
    source = lab.parent / "minecraft-ai" / "bds-witness-pack" / "scripts" / "main.js"
    for directory in (marker.parent, marker.parent.parent,
                      marker.parent.parent.parent, source.parent):
        if directory.is_symlink():
            raise ValueError("unsafe_lab_postmortem_file")
    backed = all(path.is_file() and path.stat().st_size <= 65536
                 for path in originals)
    instrumented = False
    if backed and source.is_file() and not source.is_symlink() and source.stat().st_size <= 8192:
        src = source.read_bytes()
        raw = marker.read_bytes() if marker.is_file() and marker.stat().st_size <= 8192 else b""
        lines = src.splitlines(keepends=True)
        imports = [i for i,line in enumerate(lines) if line.lstrip().startswith(b"import ")]
        if len(imports) == 3 and original.read_bytes() == src:
            marker_line = b'console.warn("ALICE_LAB_IMPORTS_READY_17880");' + bytes((10,))
            expected = (b"".join(lines[:imports[-1]+1]) + marker_line +
                        b"".join(lines[imports[-1]+1:]))
            instrumented = raw == expected
    consumed = backed and instrumented and lock.is_file()
    return ("lab_probe_one_shot_consumed" if consumed else
            "lab_probe_artifacts_incomplete", {
        "labProbeOneShotConsumed": consumed,
        "isolatedLoopbackState": namespace_loopback_state(),
        "originalLaunchStdoutRetained": False,
        "verifiedScriptModuleLoaded": False,
        "serverReadyObserved": False,
        "isolatedBdsExited": False,
    })


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


def probe(lab, *, duration=12, popen=subprocess.Popen, sleep=time.sleep,
          network_namespace=False, v2_enable_loopback=False):
    # Host route still requires both ports. Namespace route does not touch
    # the host UDP table and MUST exec unshare; never fall back to a host bind.
    if not network_namespace and not ports_free():
        raise ValueError("lab_udp_ports_busy")
    # No private Alice/Xbox/production service environment enters the BDS.
    env = {"HOME": str(Path.home()), "PATH": "/usr/local/bin:/usr/bin:/bin",
           "LANG": "C.UTF-8", "LD_LIBRARY_PATH": str(lab)}
    run = None
    with tempfile.TemporaryFile(mode="w+b") as logs:
        try:
            command = (
                [str(NETNS_UNSHARE), "--user", "--map-root-user", "--net",
                 "--", str(NETNS_PYTHON), "-I", "-c",
                 NETNS_V2_LOOPBACK_SETUP, "./bedrock_server"]
                if network_namespace and v2_enable_loopback else
                [str(NETNS_UNSHARE), "--user", "--map-root-user",
                 "--net", "--", "./bedrock_server"]
                if network_namespace else ["./bedrock_server"])
            run = popen(command, cwd=lab, env=env,
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


def run_action(mode, *, lab=None):
    # The returned gate lab path is always non-null, including consumed v1.
    # Preserve the caller's explicit v2 selection BEFORE overwriting lab.
    strict_v2 = lab is not None
    netns = mode.startswith("netns-")
    stage = mode[6:] if netns else mode
    if stage not in ("check", "probe", "postmortem"):
        raise ValueError("invalid_action")
    # Never weaken the strict first-run gate: the one-time marker necessarily
    # changes the installed script's SHA-256, so it cannot pass pack_guard()
    # again. Only this read-only postmortem uses the separate identity gate.
    if stage == "postmortem":
        if not netns:
            raise ValueError("invalid_action")
        gate, lab = postmortem_gate(lab=lab)
        gate.require_lab_stopped()
        return lab_probe_postmortem(lab)
    gate, lab = beta_gate(lab=lab)
    gate.require_lab_stopped()
    # A netns rejection must happen BEFORE creating the one-shot lock or
    # any lab-only backup/config edits, so failure cannot consume the probe.
    if netns and not namespace_preflight():
        raise ValueError("lab_netns_unavailable")
    if netns and strict_v2 and not namespace_v2_loopback_preflight():
        raise ValueError("lab_netns_loopback_unavailable")
    if stage == "check":
        props, keys = properties(lab / "server.properties")
        return ("ready_for_isolated_lab_probe", {
            "isolationConfigReady": all(keys.get(k) == v for k, v in SAFE_PROPS.items())
                and (lab / "allowlist.json").is_file()
                and (lab / "allowlist.json").read_bytes().strip() == b"[]",
            "serverReadyObserved": False, "scriptModuleMessagesObserved": False,
            "scriptLoadErrorObserved": False, "verifiedScriptModuleLoaded": False,
            "networkNamespacePreflightPassed": netns,
        })
    if not netns and not ports_free():
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
        state, flags = (probe(lab, network_namespace=True,
                              v2_enable_loopback=strict_v2)
                        if netns else probe(lab))
        flags["networkNamespacePreflightPassed"] = netns
        # Only a completed config/instrumentation guard may positively attest
        # the clone's isolation configuration. A blocked probe is never proof.
        return state, {"isolationConfigReady": True, **flags}


def output(mode, state, flags=None, reason="none"):
    flags = flags or {}
    return {
        "audit": "ALICE_BDS_LAB_STARTUP_PROBE", "schemaVersion": 1,
        "observedAtUnix": int(time.time()), "mode": mode, "state": state,
        "reason": reason, "isolationConfigReady": bool(flags.get("isolationConfigReady", False)),
        "serverReadyObserved": bool(flags.get("serverReadyObserved", False)),
        "scriptModuleMessagesObserved": bool(flags.get("scriptModuleMessagesObserved", False)),
        "scriptLoadErrorObserved": bool(flags.get("scriptLoadErrorObserved", False)),
        "verifiedScriptModuleLoaded": bool(flags.get("verifiedScriptModuleLoaded", False)),
        "isolatedBdsExited": bool(flags.get("isolatedBdsExited", False)),
        "networkNamespaceRequested": mode.startswith("netns-"),
        "networkNamespacePreflightPassed": bool(flags.get("networkNamespacePreflightPassed", False)),
        "labProbeOneShotConsumed": bool(flags.get("labProbeOneShotConsumed", False)),
        "originalLaunchStdoutRetained": bool(flags.get("originalLaunchStdoutRetained", False)),
        "isolatedLoopbackState": flags.get("isolatedLoopbackState", "unverified"),
        "productionWorldModified": False, "productionBdsRestarted": False,
        "productionWitnessUsed": False,
    }


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("check", "probe",
                                                  "netns-check", "netns-probe", "netns-postmortem"):
        raise SystemExit("Usage: alice-bds-lab-probe.py check|probe|netns-check|netns-probe|netns-postmortem")
    mode = sys.argv[1]
    try:
        state, flags = run_action(mode)
        result = output(mode, state, flags)
    except ValueError as exc:
        codes = {
            "missing_lab_beta_tool", "lab_beta_not_enabled",
            "lab_process_guard_unavailable",
            "lab_bds_binary_not_executable", "refuse_root_python",
            "unsafe_lab_properties", "duplicate_lab_property",
            "lab_port_world_or_auth_changed", "unsafe_lab_allowlist",
            "lab_probe_already_prepared", "lab_probe_already_running", "unsafe_lab_config",
            "unsafe_lab_instrumentation", "lab_script_drift",
            "lab_script_unexpected_imports",
            "lab_udp_ports_busy", "lab_netns_unavailable", "lab_netns_loopback_unavailable", "invalid_action", "lab_pack_not_staged",
            "unsafe_lab_postmortem_file",
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
