#!/usr/bin/env python3
"""Read-only bounded UDP 17880/17881 bind diagnostics for disposable Alice BDS."""
import errno
import json
import socket
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



def preparation_markers(home=Path.home):
    """Presence indicators only, not authority to reset an experiment."""
    lab = home() / "minecraft-bedrock-alice-lab"
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
        "note": "point_in_time_not_process_ownership_proof",
    }


if __name__ == "__main__":
    print(json.dumps(make_report(), separators=(",", ":")))
