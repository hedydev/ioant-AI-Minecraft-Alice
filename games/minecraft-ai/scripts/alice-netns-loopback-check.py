#!/usr/bin/env python3
"""Test enabling lo exclusively inside an ephemeral unprivileged Linux netns.

Never launches BDS, edits worlds or lab files, binds a host port, invokes sudo,
or changes the host network namespace.
"""
import json
import os
from pathlib import Path
import subprocess
import time

UNSHARE = Path("/usr/bin/unshare")
PYTHON = Path("/usr/bin/python3")
AUDIT = "ALICE_NETNS_LOOPBACK_ACTIVATION"

# This code executes only after unshare --user --map-root-user --net.
# SIOCGIFFLAGS and SIOCSIFFLAGS target the child namespace's lo interface.
CHILD = """
import fcntl
import socket
import struct
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    def flags():
        raw = fcntl.ioctl(s.fileno(), 0x8913, struct.pack('256s', b'lo'))
        return struct.unpack_from('H', raw, 16)[0]
    before = flags()
    if not (before & 1):
        fcntl.ioctl(s.fileno(), 0x8914,
                    struct.pack('16sH22x', b'lo', before | 1))
    after = flags()
    print(('up' if before & 1 else 'down') + ':' +
          ('up' if after & 1 else 'down'))
finally:
    s.close()
"""


def approved_tools():
    return (os.geteuid() != 0 and
            UNSHARE.is_file() and not UNSHARE.is_symlink() and
            PYTHON.is_file() and  # /usr/bin/python3 is normally a distro symlink
            os.access(UNSHARE, os.X_OK) and os.access(PYTHON, os.X_OK))


def check(run=subprocess.run):
    fallback = ("activation_unavailable", "unverified", "unverified")
    if not approved_tools():
        return fallback
    cmd = [str(UNSHARE), "--user", "--map-root-user", "--net", "--",
           str(PYTHON), "-I", "-c", CHILD]
    try:
        result = run(cmd, capture_output=True, text=True, check=False,
                     timeout=8, env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
        if result.returncode != 0 or len(result.stdout) > 32:
            return fallback
        line = result.stdout.strip()
        outcomes = {
            "down:up": "activation_verified",
            "up:up": "already_up",
            "down:down": "activation_not_verified",
            "up:down": "activation_not_verified",
        }
        if line not in outcomes:
            return fallback
        before, after = line.split(":")
        return outcomes[line], before, after
    except (OSError, ValueError, subprocess.SubprocessError):
        return fallback


def report():
    status, before, after = check()
    return {
        "audit": AUDIT, "schemaVersion": 1,
        "observedAtUnix": int(time.time()),
        "state": status,
        "loopbackBefore": before, "loopbackAfter": after,
        "ephemeralNamespaceOnly": True, "readOnlyHostAndWorlds": True,
        "labBdsStarted": False, "productionBdsRestarted": False,
        "productionWorldModified": False, "hostNetworkModified": False,
        "originalBdsExitCauseVerified": False,
    }


if __name__ == "__main__":
    print(json.dumps(report(), separators=(",", ":")))
