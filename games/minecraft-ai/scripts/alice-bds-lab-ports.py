#!/usr/bin/env python3
"""Read-only bounded UDP 17880/17881 bind diagnostics for disposable Alice BDS."""
import errno
import json
import re
import socket
import subprocess
import time
from pathlib import Path

AUDIT = "ALICE_BDS_LAB_UDP_PORT_CHECK"
VALID = {"available", "in_use", "permission_denied", "family_unsupported", "socket_error"}
TARGETS = (
    ("ipv4_17880", socket.AF_INET, ("0.0.0.0", 17880)),
    ("ipv6_17881", socket.AF_INET6, ("::", 17881)),
)


def inspect_port(family, addr, socket_factory=socket.socket):
    """Test only the already configured lab UDP ports. Close immediately."""
    sock = None
    try:
        sock = socket_factory(family, socket.SOCK_DGRAM)
        if family == socket.AF_INET6:
            sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        sock.bind(addr)
        return "available"
    except OSError as error:
        if error.errno == errno.EADDRINUSE:
            return "in_use"
        if error.errno in (errno.EACCES, errno.EPERM):
            return "permission_denied"
        if error.errno in (errno.EAFNOSUPPORT, errno.EPROTONOSUPPORT, errno.EADDRNOTAVAIL):
            return "family_unsupported"
        return "socket_error"
    finally:
        if sock is not None:
            sock.close()



def preparation_markers(home=None):
    """Presence indicators only; resolve home at call time for isolated tests."""
    root = Path.home() if home is None else Path(home)
    lab = root / "minecraft-bedrock-alice-lab"
    if lab.is_symlink():
        return {"labDirectory": "symlink", "configBackupPresent": False,
                "scriptBackupPresent": False, "probeLockPresent": False}
    if not lab.is_dir():
        return {"labDirectory": "missing", "configBackupPresent": False,
                "scriptBackupPresent": False, "probeLockPresent": False}
    return {
        "labDirectory": "present",
        "configBackupPresent": (lab / ".alice-lab-probe-original-properties").exists(),
        "scriptBackupPresent": (lab / "behavior_packs" / "alice-silent-bds-witness" /
                                "scripts" / ".alice-lab-probe-original-main.js").exists(),
        "probeLockPresent": (lab / ".alice-lab-probe.lock").exists(),
    }



def socket_owners(run=subprocess.run):
    """Best-effort read-only owner hints for fixed UDP ports only.

    ss output is never returned directly: addresses, users, commands and
    unrelated sockets are discarded. A missing PID is not an ownership claim.
    """
    args = ["ss", "-H", "-u", "-a", "-n", "-p",
            "(", "sport", "=", ":17880", "or", "sport", "=", ":17881", ")"]
    try:
        proc = run(args, capture_output=True, text=True, check=False, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return {"status": "unavailable", "sockets": []}
    if proc.returncode != 0 or len(proc.stdout) > 65536:
        return {"status": "unavailable", "sockets": []}
    candidates = []
    for line in proc.stdout.splitlines():
        fields = line.split()
        if len(fields) < 5:
            continue
        local = fields[3]
        port_string = local.rsplit(":", 1)[-1]
        if port_string not in ("17880", "17881"):
            continue
        port = int(port_string)
        family = "ipv6" if ":" in local.rsplit(":", 1)[0] else "ipv4"
        owners = []
        for match in re.finditer(r'\("([a-zA-Z0-9_.-]{1,40})",pid=([0-9]{1,10}),fd=[0-9]{1,8}\)', line):
            pid = int(match.group(2))
            if 0 < pid <= 2147483647:
                owner = {"pid": pid, "process": match.group(1)}
                if owner not in owners:
                    owners.append(owner)
        candidates.append({"port": port, "family": family,
                           "ownerVisible": bool(owners), "owners": owners[:5]})
        if len(candidates) >= 12:
            break
    return {"status": "observed", "sockets": candidates}


def make_report(inspector=inspect_port, now=time.time):
    result = {name: inspector(family, address) for name, family, address in TARGETS}
    if any(state not in VALID for state in result.values()):
        raise ValueError("invalid_port_probe_state")
    return {
        "audit": AUDIT,
        "schemaVersion": 1,
        "observedAtUnix": int(now()),
        "readOnly": True,
        "ipv4_17880": result["ipv4_17880"],
        "ipv6_17881": result["ipv6_17881"],
        "bothAvailable": all(state == "available" for state in result.values()),
        "preparation": preparation_markers(),
        "socketOwners": socket_owners(),
        "note": "point_in_time_not_process_ownership_proof",
    }


if __name__ == "__main__":
    print(json.dumps(make_report(), separators=(",", ":")))
