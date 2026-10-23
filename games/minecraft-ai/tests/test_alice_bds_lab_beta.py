"""Offline-only exact Bedrock NBT insertion and lab-only atomic backup tests."""
import hashlib
import importlib.util
import os
from pathlib import Path
import stat
import struct
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("alice_lab_beta", SCRIPTS / "alice-bds-lab-beta.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)


def tag(kind, name, payload):
    name = name.encode("utf-8")
    return bytes([kind]) + struct.pack("<H", len(name)) + name + payload


def bedrock(root_content, version=10):
    payload = b"\x0a\x00\x00" + root_content + b"\x00"
    return struct.pack("<II", version, len(payload)) + payload


class LabBetaTests(unittest.TestCase):
    def setUp(self):
        handle = tempfile.TemporaryDirectory()
        self.addCleanup(handle.cleanup)
        root = Path(handle.name)
        self.lab = root / "minecraft-bedrock-alice-lab"
        self.world = self.lab / "worlds" / "Bedrock level"
        self.world.mkdir(parents=True)
        self.level = self.world / "level.dat"
        self.original = bedrock(tag(3, "unexpectedInt", struct.pack("<i", 123456))
                                + tag(10, "experiments", tag(1, "another_flag", b"\x00") + b"\x00")
                                + tag(8, "worldName", b"\x04\x00Test"))
        self.level.write_bytes(self.original)
        self.gate = Mock()
        self.guard = patch.object(B, "pack_guard", return_value=(self.gate, self.world))
        self.guard.start()
        self.addCleanup(self.guard.stop)

    def test_insert_into_existing_compound_preserves_exact_other_bytes(self):
        amended = B.enable_beta_bytes(self.original)
        self.assertNotEqual(amended, self.original)
        self.assertEqual(struct.unpack_from("<II", amended)[1], len(amended)-8)
        suffix = B.byte_tag("gametest")
        self.assertEqual(amended.count(suffix), 1)
        self.assertEqual(len(amended) - len(self.original), len(suffix))
        self.assertIn(tag(3, "unexpectedInt", struct.pack("<i", 123456)), amended)
        self.assertIn(tag(8, "worldName", b"\x04\x00Test"), amended)

    def test_insert_missing_experiment_compound_fails_closed_for_wrong_types(self):
        no_compound = bedrock(tag(3, "theInt", struct.pack("<i", 99)))
        patched = B.enable_beta_bytes(no_compound)
        self.assertIn(tag(10, "experiments", B.byte_tag("gametest")+b"\x00"), patched)
        with self.assertRaisesRegex(ValueError, "invalid_level_nbt"):
            B.enable_beta_bytes(bedrock(tag(1, "experiments", b"\x00")))
        with self.assertRaisesRegex(ValueError, "invalid_level_nbt"):
            B.enable_beta_bytes(no_compound[:-1])
        with self.assertRaisesRegex(ValueError, "invalid_level_nbt"):
            B.enable_beta_bytes(b"broken")

    def test_existing_true_or_false_flag_is_not_silently_rewritten(self):
        for val in (0, 1):
            existing = bedrock(tag(10,"experiments",tag(1,"gametest",bytes([val]))+b"\x00"))
            with self.subTest(flag=val), self.assertRaisesRegex(ValueError, "beta_flag_already_declared"):
                B.enable_beta_bytes(existing)

    def test_check_does_not_modify_lab_or_create_backup(self):
        self.assertEqual(B.action("check"), "ready_for_lab_only_beta_enable")
        self.assertEqual(self.level.read_bytes(), self.original)
        self.assertFalse(list(self.world.glob("*.bak")))
        self.gate.require_lab_stopped.assert_not_called()

    def test_enable_saves_original_bytes_then_edits_only_lab_level(self):
        self.assertEqual(B.action("enable"), "lab_beta_nbt_enabled_backup_preserved_not_started")
        backup = self.world / ("level.dat.alice-beta-before-" +
                              hashlib.sha256(self.original).hexdigest()[:16] + ".bak")
        self.assertEqual(backup.read_bytes(), self.original)
        patched = self.level.read_bytes()
        self.assertIn(B.byte_tag("gametest"), patched)
        self.assertEqual(self.gate.require_lab_stopped.call_count, 2)
        with self.assertRaisesRegex(ValueError, "beta_flag_not_absent"):
            B.action("enable")
        self.assertEqual(backup.read_bytes(), self.original)
        self.assertEqual(self.level.read_bytes(), patched)

    def test_running_lab_bds_blocks_beta_write(self):
        self.gate.require_lab_stopped.side_effect = ValueError("lab_bds_is_running")
        with self.assertRaisesRegex(ValueError,"lab_bds_is_running"):
            B.action("enable")
        self.assertEqual(self.level.read_bytes(), self.original)
        self.assertFalse(list(self.world.glob("*.bak")))

    def test_symlinked_level_and_existing_backup_refuse(self):
        self.level.unlink()
        self.level.symlink_to(self.world / "other")
        with self.assertRaisesRegex(ValueError,"lab_level_missing"):
            B.action("enable")
        self.level.unlink()
        self.level.write_bytes(self.original)
        backup = self.world / ("level.dat.alice-beta-before-" +
                              hashlib.sha256(self.original).hexdigest()[:16] + ".bak")
        backup.write_bytes(b"KEEP EXISTING")
        with self.assertRaisesRegex(ValueError,"lab_beta_backup_exists"):
            B.action("enable")
        self.assertEqual(backup.read_bytes(),b"KEEP EXISTING")

    def test_security_gate_requires_reviewed_script_and_refuses_default_secret(self):
        # Even though the laboratory is stopped, a test should never enable
        # experimental APIs when an inherited default script token might be
        # available, or if the installed pack no longer matches the source.
        text = (SCRIPTS / "alice-bds-lab-beta.py").read_text()
        self.assertIn("default_secret.exists()", text)
        self.assertIn("source_script.read_bytes()", text)
        self.assertIn("manifest != module.read_json", text)
        self.assertIn('or variables != {"aliceWitnessUrl": module.LAB_URL,', text)

    def test_command_interface_writes_only_sanitized_enums_and_never_starts_servers(self):
        ctl = (SCRIPTS / "alice-mac.sh").read_text()
        shell = (SCRIPTS / "alice-bds-lab-beta-mac.sh").read_text()
        self.assertIn("witness-lab-beta-enable", ctl)
        self.assertIn("alice-bds-lab-beta-mac.sh", ctl)
        self.assertIn("sudo -v && python3", shell)
        self.assertNotIn("systemctl",shell)
        self.assertNotIn("MCSManager",shell)
        self.assertIn('"serverModuleRuntimeVerified":False',shell)


if __name__=="__main__":
    unittest.main()
