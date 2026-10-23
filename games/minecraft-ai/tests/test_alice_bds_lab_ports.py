"""UDP lab port diagnostics: never bind the real host in unit tests."""
import errno
import importlib.util
from pathlib import Path
from types import SimpleNamespace
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
            with patch.object(P, "socket_owners", return_value={"status": "unavailable", "sockets": []}), patch.object(P, "preparation_markers", return_value={
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

    def test_owner_hints_are_only_for_fixed_udp_ports_and_sanitized(self):
        sample = (
            'UNCONN 0 0 0.0.0.0:17880 0.0.0.0:* users:(("bedrock_server",pid=12345,fd=7))\n'
            'UNCONN 0 0 [::]:17881 [::]:* users:(("testproc",pid=542,fd=10))\n'
            'UNCONN 0 0 0.0.0.0:19032 0.0.0.0:* users:(("privateapp",pid=999,fd=4))\n'
        )
        def runner(args, **options):
            self.assertEqual(args, ["ss", "-H", "-u", "-a", "-n", "-p",
                                    "(", "sport", "=", ":17880", "or",
                                    "sport", "=", ":17881", ")"])
            self.assertEqual(options["timeout"], 5)
            return SimpleNamespace(returncode=0, stdout=sample)
        output = P.socket_owners(run=runner)
        self.assertEqual(output["status"], "observed")
        self.assertEqual(len(output["sockets"]), 2)
        self.assertEqual(output["sockets"][0]["owners"],
                         [{"pid": 12345, "process": "bedrock_server"}])
        self.assertEqual(output["sockets"][1]["family"], "ipv6")
        self.assertNotIn("privateapp", str(output))
        self.assertNotIn("19032", str(output))
        self.assertNotIn("0.0.0.0", str(output))

    def test_owner_missing_permissions_do_not_invent_pid(self):
        sample = 'UNCONN 0 0 0.0.0.0:17880 0.0.0.0:*\n'
        output = P.socket_owners(run=lambda *a, **k: SimpleNamespace(
            returncode=0, stdout=sample))
        self.assertFalse(output["sockets"][0]["ownerVisible"])
        self.assertEqual(output["sockets"][0]["owners"], [])

    def test_unavailable_socket_listing_is_not_treated_as_free(self):
        def missing(*args, **kwargs):
            raise FileNotFoundError("ss unavailable")
        result = P.socket_owners(run=missing)
        self.assertEqual(result, {"status": "unavailable", "sockets": []})

    def test_real_socket_owner_listing_is_mocked_in_report_tests(self):
        with patch.object(P, "socket_owners", return_value={
            "status": "observed", "sockets": []
        }) as owner:
            with patch.object(P, "preparation_markers", return_value={}):
                result = P.make_report(inspector=lambda fam, addr: "available")
        owner.assert_called_once_with()
        self.assertEqual(result["socketOwners"]["sockets"], [])

    def test_elevated_audit_runs_only_fixed_read_only_ss_under_sudo_n(self):
        source='UNCONN 0 0 0.0.0.0:17880 0.0.0.0:* users:(("ownedsvc",pid=739,fd=8))\n'
        seen=[]
        def run(args, **opts):
            seen.append((args, opts))
            return SimpleNamespace(returncode=0, stdout=source)
        observed=P.socket_owners(run=run, elevated=True)
        self.assertEqual(seen[0][0],[
            "sudo", "-n", "/usr/bin/ss", "-H", "-u", "-a", "-n", "-p",
            "(", "sport", "=", ":17880", "or", "sport", "=", ":17881", ")"])
        self.assertEqual(seen[0][1]["timeout"],5)
        self.assertEqual(observed["sockets"][0]["owners"],[{"pid":739,"process":"ownedsvc"}])
        self.assertEqual(observed["sockets"][0]["port"],17880)

    def test_elevated_audit_reports_unavailable_without_privilege_bypass(self):
        def denied(args,**opts):
            return SimpleNamespace(returncode=1,stdout="",stderr="fixture denied")
        result=P.socket_owners(run=denied,elevated=True)
        self.assertEqual(result,{"status":"unavailable","sockets":[]})

    def test_elevated_report_says_requested_and_regular_does_not(self):
        with patch.object(P,"socket_owners",return_value={"status":"observed","sockets":[]}) as owner:
            with patch.object(P,"preparation_markers",return_value={}):
                report=P.make_report(inspector=lambda fam,addr:"available", elevated=True)
            owner.assert_called_once_with(elevated=True)
            self.assertTrue(report["ownerAuditRequested"])
        with patch.object(P,"socket_owners",return_value={"status":"observed","sockets":[]}) as owner:
            with patch.object(P,"preparation_markers",return_value={}):
                report=P.make_report(inspector=lambda fam,addr:"available")
            owner.assert_called_once_with()
            self.assertFalse(report["ownerAuditRequested"])

    def test_new_owner_action_is_separate_from_unprivileged_diagnostics(self):
        entry=(SCRIPT.parent / "alice-mac.sh").read_text()
        branch=entry.split('if [[ "$action" == witness-lab-port-owner ]]')[1].split("fi")[0]
        self.assertIn("ssh -tt",branch)
        self.assertIn("sudo -v && python3",branch)
        self.assertIn("--owner-audit",branch)
        self.assertNotIn("kill",branch)
        self.assertNotIn("restart",branch)

    def test_existing_17880_action_gate_is_unchanged(self):
        entry=(SCRIPT.parent / "alice-mac.sh").read_text()
        self.assertIn("witness-lab-port-check",entry)
        self.assertIn("ssh -T -o BatchMode=yes",entry)
        self.assertIn("alice-bds-lab-ports.py",entry)
        self.assertNotIn("sudo",entry.split("if [[ \"$action\" == witness-lab-port-check ]]")[1].split("fi")[0])


if __name__=="__main__":
    unittest.main()
