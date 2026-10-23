"""Disposable 17880 BDS startup probe — offline only, no server launched by tests."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("alice_lab_startup_probe", SCRIPTS / "alice-bds-lab-probe.py")
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


class LabStartupProbeTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        self.lab = root / "minecraft-bedrock-alice-lab"
        self.lab.mkdir()
        (self.lab / "bedrock_server").write_bytes(b"not executed, fake only")
        (self.lab / "server.properties").write_text(
            "server-port=17880\nserver-portv6=17881\nonline-mode=true\n"
            "level-name=Bedrock level\nallow-list=false\nenable-lan-visibility=true\n")
        (self.lab / "allowlist.json").write_text('[{"name":"offline fixture"}]\n')
        self.prod_marker = root / "minecraft-bedrock" / "DO_NOT_EDIT"
        self.prod_marker.parent.mkdir()
        self.prod_marker.write_bytes(b"PRODUCTION SAFE")
        original = (
            b'import { world, system } from "@minecraft/server";\n'
            b'import { variables, secrets } from "@minecraft/server-admin";\n'
            b'import { http } from "@minecraft/server-net";\n'
            b'const startup = 1;\n'
        )
        file = self.lab / "behavior_packs" / "alice-silent-bds-witness" / "scripts" / "main.js"
        file.parent.mkdir(parents=True)
        file.write_bytes(original)
        source = root / "minecraft-ai" / "bds-witness-pack" / "scripts" / "main.js"
        source.parent.mkdir(parents=True)
        source.write_bytes(original)
        self.file = file
        self.original = original
        self.gate = Mock()
        # Keep the real function for a contract test. Most fixtures replace it
        # to avoid touching actual Mint or launching a real BDS.
        self.real_beta_gate = P.beta_gate
        self.auth = patch.object(P, "beta_gate", return_value=(self.gate, self.lab))
        self.auth.start()
        self.addCleanup(self.auth.stop)

    def test_real_beta_gate_uses_lab_pack_guard_not_beta_module(self):
        # Real importlib loading + pack_guard tuple, not the setUp mock:
        # beta module owns pack_guard(), lab-pack owns process identity guard.
        # No production files or processes are accessed by this fixture.
        with tempfile.TemporaryDirectory() as tmp:
            stubdir = Path(tmp)
            stub = stubdir / "alice-bds-lab-beta.py"
            world = self.lab / "worlds" / "Bedrock level"
            world.mkdir(parents=True)
            (world / "level.dat").write_bytes(b"fixture only")
            binary = self.lab / "bedrock_server"
            binary.chmod(0o700)
            stub.write_text(chr(10).join([
                "from pathlib import Path",
                "class PackModule:",
                "    def require_lab_stopped(self): return None",
                "def pack_guard():",
                "    return PackModule(), Path(" + repr(str(world)) + ")",
                "",
            ]))
            with patch.object(P, "HERE", stubdir), patch.object(
                P, "beta_api_experiment", return_value="enabled_in_level_dat"
            ), patch.object(P.os, "geteuid", return_value=501):
                gate, lab = self.real_beta_gate()
                self.assertEqual(lab, self.lab)
                self.assertTrue(callable(gate.require_lab_stopped))
                self.assertEqual(gate.__class__.__name__, "PackModule")
                # This previously raised AttributeError before startup.
                with patch.object(P, "beta_gate", self.real_beta_gate):
                    state, fields = P.run_action("check")
                self.assertEqual(state, "ready_for_isolated_lab_probe")
                self.assertFalse(fields["verifiedScriptModuleLoaded"])
            self.assertFalse((self.lab / ".alice-lab-probe.lock").exists())

    def test_missing_process_guard_fails_closed_without_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            world = self.lab / "worlds" / "Bedrock level"
            world.mkdir(parents=True)
            (world / "level.dat").write_bytes(b"fixture only")
            (self.lab / "bedrock_server").chmod(0o700)
            path = Path(tmp) / "alice-bds-lab-beta.py"
            path.write_text(chr(10).join([
                "from pathlib import Path",
                "def pack_guard():",
                "    return object(), Path(" + repr(str(world)) + ")",
                "",
            ]))
            with patch.object(P, "HERE", Path(tmp)), patch.object(
                P.os, "geteuid", return_value=501
            ):
                with self.assertRaisesRegex(ValueError, "lab_process_guard_unavailable"):
                    self.real_beta_gate()
            self.assertFalse((self.lab / ".alice-lab-probe.lock").exists())

    def test_checked_lab_insecure_lan_is_reported_without_file_changes(self):
        before = (self.lab / "server.properties").read_bytes()
        state, fields = P.run_action("check")
        self.assertEqual(state, "ready_for_isolated_lab_probe")
        self.assertFalse(fields["isolationConfigReady"])
        self.assertEqual((self.lab / "server.properties").read_bytes(), before)
        self.assertFalse((self.lab / ".alice-lab-probe-original-properties").exists())

    def test_only_lab_properties_are_hardened_and_backup_originals(self):
        before = (self.lab / "server.properties").read_bytes()
        old_allow = (self.lab / "allowlist.json").read_bytes()
        P.secure_config(self.lab)
        result, fields = P.properties(self.lab / "server.properties")
        self.assertEqual(fields, P.SAFE_PROPS)
        self.assertEqual((self.lab / "allowlist.json").read_bytes(), b"[]\n")
        self.assertEqual((self.lab / ".alice-lab-probe-original-properties").read_bytes(),before)
        self.assertEqual((self.lab / ".alice-lab-probe-original-allowlist").read_bytes(),old_allow)
        self.assertEqual(self.prod_marker.read_bytes(),b"PRODUCTION SAFE")
        self.assertNotIn("enable-lan-visibility=true",result)
        with self.assertRaisesRegex(ValueError,"lab_probe_already_prepared"):
            P.secure_config(self.lab)

    def test_wrong_lab_port_refused_without_config_write(self):
        prop = self.lab / "server.properties"
        prop.write_text(prop.read_text().replace("server-port=17880","server-port=17879"))
        with self.assertRaisesRegex(ValueError, "lab_port_world_or_auth_changed"):
            P.secure_config(self.lab)
        self.assertFalse((self.lab / ".alice-lab-probe-original-properties").exists())

    def test_existing_symlink_allowlist_refused(self):
        f = self.lab / "allowlist.json"
        f.unlink()
        f.symlink_to(self.prod_marker)
        with self.assertRaisesRegex(ValueError,"unsafe_lab_allowlist"):
            P.secure_config(self.lab)
        self.assertEqual(self.prod_marker.read_bytes(),b"PRODUCTION SAFE")

    def test_clone_script_one_shot_marker_proves_imports_not_network(self):
        P.instrument_lab_script(self.lab)
        self.assertEqual(
            (self.file.with_name(".alice-lab-probe-original-main.js")).read_bytes(),
            self.original)
        text = self.file.read_text()
        self.assertEqual(text.count(P.LAB_MARKER),1)
        self.assertLess(text.index('from "@minecraft/server-net";'),
                        text.index(P.LAB_MARKER))
        self.assertIn("const startup = 1",text)
        self.assertEqual(self.prod_marker.read_bytes(),b"PRODUCTION SAFE")
        with self.assertRaisesRegex(ValueError,"unsafe_lab_instrumentation"):
            P.instrument_lab_script(self.lab)

    def test_real_probe_logic_observes_positive_marker_after_graceful_stop(self):
        output = "[INFO] Server started.\n[Scripting][Warning] " + P.LAB_MARKER + "\n"
        class FakeBds:
            def __init__(self,*args,**kwargs):
                self.returncode = None
                self.stdin = Mock()
                self.signals = []
                kwargs["stdout"].write(output.encode())
            def poll(self):
                return self.returncode
            def communicate(self, input=None, timeout=None):
                self.stop_command = input
                self.returncode = 0
                return b"",b""
            def send_signal(self,kind):
                self.signals.append(kind)
            def wait(self,timeout=None):
                self.returncode = 0
                return 0
        with patch.object(P,"ports_free",return_value=True):
            state, flags = P.probe(self.lab, duration=0,
                                   popen=FakeBds, sleep=lambda *_:None)
        self.assertEqual(state,"lab_module_imports_observed")
        self.assertTrue(flags["serverReadyObserved"])
        self.assertTrue(flags["verifiedScriptModuleLoaded"])
        self.assertTrue(flags["isolatedBdsExited"])
        self.assertEqual(self.prod_marker.read_bytes(),b"PRODUCTION SAFE")

    def test_script_import_marker_not_enough_if_script_errors_present(self):
        err = "[INFO] Server started.\n[Scripting][Error] module not found\n" + P.LAB_MARKER
        flags=P.classify(err)
        self.assertTrue(flags["verifiedScriptModuleLoaded"])
        self.assertTrue(flags["scriptLoadErrorObserved"])
        self.assertFalse(P.classify("Server started.")["verifiedScriptModuleLoaded"])

    def test_action_probe_uses_only_fixtures_and_makes_no_process_by_default(self):
        with patch.object(P, "ports_free", return_value=True), patch.object(
            P,"probe",return_value=("lab_module_imports_observed",P.classify(
                "Server started. " + P.LAB_MARKER))) as fake:
            state, flags=P.run_action("probe")
            self.assertEqual(state,"lab_module_imports_observed")
            fake.assert_called_once_with(self.lab)
        self.assertIn("enable-lan-visibility=false",
                      (self.lab/"server.properties").read_text())
        self.assertEqual(self.prod_marker.read_bytes(),b"PRODUCTION SAFE")
        self.assertEqual(self.gate.require_lab_stopped.call_count,4)

    def test_lock_file_only_created_by_explicit_probe(self):
        lock=self.lab / ".alice-lab-probe.lock"
        P.run_action("check")
        self.assertFalse(lock.exists())
        with patch.object(P, "ports_free", return_value=True), patch.object(
            P, "probe", return_value=("lab_ready_not_observed", P.classify(""))):
            P.run_action("probe")
        self.assertTrue(lock.is_file())

    def test_mac_action_and_sanitizer_require_explicit_probe(self):
        entry = (SCRIPTS / "alice-mac.sh").read_text()
        wrapper = (SCRIPTS / "alice-bds-lab-probe-mac.sh").read_text()
        self.assertIn("witness-lab-startup-probe",entry)
        self.assertIn("alice-bds-lab-probe-mac.sh",entry)
        self.assertIn('sudo -v && python3',wrapper)
        self.assertIn('productionWitnessUsed',wrapper)
        self.assertNotIn("systemctl",wrapper)


if __name__ == "__main__":
    unittest.main()
