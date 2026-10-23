"""Offline acceptance for existing-backup 17880 lab stage; never touches real Mint."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("alice_archived_lab", SCRIPTS / "alice-bds-archived-lab.py")
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


class ArchivedLabWorkflowTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        home = Path(temp.name)
        self.production = home / "minecraft-bedrock"
        self.production.mkdir()
        (self.production / "bedrock_server").write_bytes(b"test executable")
        (self.production / "server.properties").write_text(
            "server-port=17879\nserver-portv6=17880\nonline-mode=true\nlevel-name=Bedrock level\n")
        world = self.production / "worlds" / "Bedrock level"
        world.mkdir(parents=True)
        (world / "level.dat").write_bytes(b"original live data")
        self.private = home / ".alice-bedrock-control"
        self.private.mkdir(mode=0o700)
        self.manifest = home / "snapshot.json"
        operator = self.private / "operator-env.json"
        operator.write_text(json.dumps({
            "version": 1, "settings": {
                "ALICE_BEDROCK_BACKUP_MANIFEST": str(self.manifest)
            }
        }))
        os.chmod(operator, 0o600)
        self.lab = home / "minecraft-bedrock-alice-lab"
        self.stack = patch.multiple(stage, ROOT=self.private, PRODUCTION=self.production, LAB=self.lab)
        self.stack.start()
        self.addCleanup(self.stack.stop)

    def test_check_does_not_create_lab_and_requires_full_restore(self):
        v = {"verified": True, "temporaryRestore": True,
             "worlds": ["worlds/Bedrock level"], "sha256": "a"*64}
        captured = []
        outcome = stage.operate("check", verifier=lambda *a: (captured.append(a), v)[1])
        self.assertEqual(outcome["reason"], "ready_for_explicit_lab_prepare")
        self.assertEqual(outcome["backupRestore"], "archive_sha256_isolated_restore_verified")
        self.assertEqual(captured[0], (self.manifest, self.production))
        self.assertFalse(self.lab.exists())
        self.assertFalse(outcome["safeToChangeProductionWorld"])

    def test_incorrect_manifest_world_or_missing_restore_refuses_prepare(self):
        calls = []
        fake_prepare = lambda *args: calls.append(args)
        base = {"verified": True, "temporaryRestore": True,
                "worlds": ["worlds/Bedrock level"]}
        for altered, reason in (
            ({"worlds": ["worlds/other"]}, "wrong_backup_world"),
            ({"temporaryRestore": False}, "backup_restore_not_verified"),
            ({"verified": False}, "backup_restore_not_verified")
        ):
            with self.subTest(altered=altered):
                outcome = stage.operate("prepare", verifier=lambda *a: {**base, **altered},
                                        lab_preparer=fake_prepare)
                self.assertEqual(outcome["reason"], reason)
        self.assertFalse(calls)
        self.assertFalse(self.lab.exists())

    def test_existing_lab_refused_without_calling_verifier_or_overwriting(self):
        self.lab.mkdir()
        indicator = self.lab / "preserve.txt"
        indicator.write_text("existing owner material")
        def fail(*_):
            raise AssertionError("Should never verify or write existing lab")
        out = stage.operate("prepare", verifier=fail, lab_preparer=fail)
        self.assertEqual(out["reason"], "lab_exists_do_not_overwrite")
        self.assertEqual(indicator.read_text(), "existing owner material")

    def test_invalid_operator_private_permissions_rejected(self):
        op = self.private / "operator-env.json"
        os.chmod(op, 0o644)
        out = stage.operate("prepare", verifier=lambda *a: {})
        self.assertEqual(out["reason"], "configured_manifest_unavailable")
        self.assertFalse(self.lab.exists())

    def test_mac_action_requires_explicit_prepare_and_sanitizes_report(self):
        entry = (SCRIPTS / "alice-mac.sh").read_text(encoding="utf-8")
        wrapper = (SCRIPTS / "alice-bds-lab-mac.sh").read_text(encoding="utf-8")
        self.assertIn("witness-lab-prepare", entry)
        self.assertIn('bash "$scripts/alice-bds-lab-mac.sh" "$mode"', entry)
        self.assertIn('"safeToChangeProductionWorld":False', wrapper)
        self.assertIn('if obj.get(key) not in choices:', wrapper)
        self.assertNotIn("systemctl", wrapper)
        self.assertNotIn("MCSManager", wrapper)

    def test_real_archive_restore_and_new_lab_copy_end_to_end(self):
        data = b"archived Bedrock level, not live database"
        rel = "worlds/Bedrock level/level.dat"
        archive = self.manifest.with_name("snapshot.tar.gz")
        with tarfile.open(archive, "w:gz") as tar:
            member = tarfile.TarInfo(rel)
            member.size = len(data)
            tar.addfile(member, io.BytesIO(data))
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        archive.with_name("snapshot.sha256").write_text(digest+"  snapshot.tar.gz\n")
        self.manifest.write_text(json.dumps({
            "kind": "bedrock", "verified": True, "source": str(self.production),
            "worlds": ["worlds/Bedrock level"],
            "files": {rel: hashlib.sha256(data).hexdigest()},
            "archive": "snapshot.tar.gz"
        }))
        original = (self.production / rel).read_bytes()
        status = stage.operate("prepare")
        self.assertEqual(status["reason"], "lab_ready_for_future_beta_test")
        self.assertEqual(status["labState"], "new_disposable_copy_created_not_started")
        self.assertEqual((self.lab / rel).read_bytes(), data)
        self.assertEqual((self.production / rel).read_bytes(), original)
        self.assertIn("server-port=17880",(self.lab / "server.properties").read_text())
        self.assertFalse(status["productionWorldModified"])
        self.assertEqual(stage.operate("prepare")["reason"], "lab_exists_do_not_overwrite")


if __name__ == "__main__":
    unittest.main()
