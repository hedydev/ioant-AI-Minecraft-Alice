"""Offline-only regressions for fresh user/netns loopback activation."""
import ast
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import sys
import subprocess
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
SCRIPT = SCRIPTS / "alice-netns-loopback-check.py"
spec = importlib.util.spec_from_file_location("alice_netns_loopback_check", SCRIPT)
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


class LoopbackActivationTests(unittest.TestCase):
    def test_child_syntax_and_namespace_local_ioctl(self):
        ast.parse(P.CHILD)
        self.assertIn("0x8913", P.CHILD)
        self.assertIn("0x8914", P.CHILD)
        self.assertIn("before | 1", P.CHILD)
        self.assertNotIn("/sys/class/net", P.CHILD)
        self.assertNotIn("bedrock_server", P.CHILD)

    def test_exact_fixed_namespace_command(self):
        seen = []
        def runner(args, **kwargs):
            seen.append((args, kwargs))
            return SimpleNamespace(returncode=0, stdout="down:up\n")
        with patch.object(P, "approved_tools", return_value=True):
            result = P.check(run=runner)
        self.assertEqual(result, ("activation_verified", "down", "up"))
        args, opts = seen[0]
        self.assertEqual(args[:7], ["/usr/bin/unshare", "--user",
            "--map-root-user", "--net", "--", "/usr/bin/python3", "-I"])
        self.assertEqual(args[7], "-c")
        self.assertEqual(args[8], P.CHILD)
        self.assertEqual(opts["timeout"], 8)
        self.assertNotIn("shell", opts)
        self.assertNotIn("sudo", str(args))

    def test_no_capability_or_failed_command_does_not_fall_back(self):
        with patch.object(P, "approved_tools", return_value=False):
            self.assertEqual(P.check(), ("activation_unavailable",
                                        "unverified", "unverified"))
        with patch.object(P, "approved_tools", return_value=True):
            for code, out in [(1, ""), (0, "unexpected"),
                              (0, "down:up\ninjected"), (0, "x"*100)]:
                self.assertEqual(P.check(run=lambda *a, **k: SimpleNamespace(
                    returncode=code, stdout=out)), ("activation_unavailable",
                                                     "unverified", "unverified"))

    def test_only_verified_child_up_is_success(self):
        with patch.object(P, "approved_tools", return_value=True):
            for line, expected in [
                ("down:down\n", ("activation_not_verified","down","down")),
                ("up:up\n", ("already_up","up","up")),
                ("up:down\n", ("activation_not_verified","up","down"))]:
                self.assertEqual(P.check(run=lambda *a, **k: SimpleNamespace(
                    returncode=0, stdout=line)), expected)

    def test_timeout_fails_closed_without_any_host_fallback(self):
        with patch.object(P, "approved_tools", return_value=True):
            self.assertEqual(P.check(run=lambda *a, **k: (_ for _ in ()).throw(
                subprocess.TimeoutExpired(cmd="unshare", timeout=8))),
                ("activation_unavailable", "unverified", "unverified"))

    def test_report_has_no_bds_or_host_claim(self):
        with patch.object(P, "check", return_value=(
                "activation_verified", "down", "up")):
            report = P.report()
        self.assertTrue(report["ephemeralNamespaceOnly"])
        self.assertTrue(report["readOnlyHostAndWorlds"])
        self.assertFalse(report["hostNetworkModified"])
        self.assertFalse(report["labBdsStarted"])
        self.assertFalse(report["productionBdsRestarted"])
        self.assertFalse(report["originalBdsExitCauseVerified"])

    def test_mac_entrypoint_and_wrapper_are_separate(self):
        entry = (SCRIPTS / "alice-mac.sh").read_text()
        shell = (SCRIPTS / "alice-netns-loopback-mac.sh").read_text()
        self.assertIn("witness-netns-loopback-check", entry)
        self.assertIn("alice-netns-loopback-mac.sh", entry)
        self.assertNotIn("sudo -", shell)
        self.assertNotIn("bedrock_server", shell)

    def test_distro_python_symlink_does_not_block_fixed_binary(self):
        with patch.object(P.os, "geteuid", return_value=1000), patch.object(
                P.Path, "is_file", return_value=True), patch.object(
                P.Path, "is_symlink", side_effect=lambda p: p == P.UNSHARE), patch.object(
                P.os, "access", return_value=True):
            # A symlinked unshare binary is refused; /usr/bin/python3 is often
            # symlinked but its fixed path is controlled by the Linux distro.
            self.assertFalse(P.approved_tools())
        with patch.object(P.os, "geteuid", return_value=1000), patch.object(
                P.Path, "is_file", return_value=True), patch.object(
                P.Path, "is_symlink", return_value=False), patch.object(
                P.os, "access", return_value=True):
            self.assertTrue(P.approved_tools())



if __name__ == "__main__":
    unittest.main()
