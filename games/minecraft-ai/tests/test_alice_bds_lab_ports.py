"""UDP lab port diagnostics: never bind the real host in unit tests."""
import errno
import importlib.util
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "alice-bds-lab-ports.py"
spec = importlib.util.spec_from_file_location("alice_bds_lab_ports", SCRIPT)
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


class FakeSocket:
    def __init__(self, family, reason=None):
        self.family = family
        self.reason = reason
        self.closed = False
        self.ipv6only = False

    def setsockopt(self, level, option, value):
        self.ipv6only = (level, option, value) == (socket.IPPROTO_IPV6,
                                                    socket.IPV6_V6ONLY, 1)

    def bind(self, address):
        if self.reason is not None:
            raise OSError(self.reason, "synthetic fixture")

    def close(self):
        self.closed = True


class LabPortCheckTests(unittest.TestCase):
    def test_udp_ipv4_and_ipv6_sockets_closed_without_starting_bds(self):
        created = []
        def factory(family, kind):
            self.assertEqual(kind, socket.SOCK_DGRAM)
            s = FakeSocket(family)
            created.append(s)
            return s
        self.assertEqual(P.inspect_port(socket.AF_INET, ("0.0.0.0", 17880), factory),
                         "available")
        self.assertEqual(P.inspect_port(socket.AF_INET6, ("::", 17881), factory),
                         "available")
        self.assertTrue(created[1].ipv6only)
        self.assertTrue(all(s.closed for s in created))

    def test_refuses_all_actual_bind_errors_as_not_available(self):
        mapping = [(errno.EADDRINUSE, "in_use"),
                   (errno.EACCES, "permission_denied"),
                   (errno.EAFNOSUPPORT, "family_unsupported"),
                   (errno.EIO, "socket_error")]
        for code, expected in mapping:
            with self.subTest(code=code):
                created = []
                def factory(family, kind):
                    s = FakeSocket(family, code)
                    created.append(s)
                    return s
                self.assertEqual(P.inspect_port(socket.AF_INET, ("0.0.0.0", 17880),
                                               factory), expected)
                self.assertTrue(created[0].closed)

    def test_report_keeps_exact_ports_and_no_host_or_process_identity(self):
        def inspector(family, addr):
            return "in_use" if family == socket.AF_INET6 else "available"
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(P, "preparation_markers", return_value={
                "labDirectory": "missing",
                "configBackupPresent": False,
                "scriptBackupPresent": False,
                "probeLockPresent": False,
            }):
                report=P.make_report(inspector=inspector,now=lambda:1234567890)
        self.assertEqual(report["audit"], "ALICE_BDS_LAB_UDP_PORT_CHECK")
        self.assertTrue(report["readOnly"])
        self.assertEqual(report["ipv4_17880"],"available")
        self.assertEqual(report["ipv6_17881"],"in_use")
        self.assertFalse(report["bothAvailable"])
        self.assertEqual(report["observedAtUnix"],1234567890)
        self.assertNotIn("pid", report)
        self.assertNotIn("address", report)

    def test_marker_presence_only_no_world_content_or_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            lab=root / "minecraft-bedrock-alice-lab"
            with patch.object(P.Path, "home", return_value=root):
                self.assertEqual(P.preparation_markers()["labDirectory"],"missing")
                lab.mkdir()
                (lab / ".alice-lab-probe.lock").write_text("")
                (lab / ".alice-lab-probe-original-properties").write_text("fixture")
                before=list(lab.iterdir())
                marks=P.preparation_markers()
                self.assertTrue(marks["probeLockPresent"])
                self.assertTrue(marks["configBackupPresent"])
                self.assertFalse(marks["scriptBackupPresent"])
                self.assertEqual(list(lab.iterdir()),before)

    def test_home_lookup_is_not_captured_at_import_time(self):
        # P.Path.home is patched AFTER module import. The default must resolve
        # to this test-only location, never the actual user home.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / "minecraft-bedrock-alice-lab"
            lab.mkdir()
            (lab / ".alice-lab-probe.lock").write_text("")
            with patch.object(P.Path, "home", return_value=root) as mock_home:
                defaults = P.preparation_markers()
            self.assertTrue(defaults["probeLockPresent"])
            mock_home.assert_called_once_with()
            self.assertEqual(defaults, P.preparation_markers(home=root))

    def test_existing_17880_action_gate_is_unchanged(self):
        entry=(SCRIPT.parent / "alice-mac.sh").read_text()
        self.assertIn("witness-lab-port-check",entry)
        self.assertIn("ssh -T -o BatchMode=yes",entry)
        self.assertIn("alice-bds-lab-ports.py",entry)
        self.assertNotIn("sudo",entry.split("if [[ \"$action\" == witness-lab-port-check ]]")[1].split("fi")[0])


if __name__=="__main__":
    unittest.main()
