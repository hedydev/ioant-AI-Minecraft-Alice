"""New-only 17880 disposable Script API pack staging, offline fixtures."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("alice_bds_lab_pack", SCRIPTS / "alice-bds-lab-pack.py")
PACK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACK)


class LabPackTests(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        home = Path(t.name)
        prod = home / "minecraft-bedrock"
        prod.mkdir()
        lab = home / "minecraft-bedrock-alice-lab"
        (lab / "worlds" / "Bedrock level" / "db").mkdir(parents=True)
        (lab / "behavior_packs").mkdir()
        (lab / "config").mkdir()
        (lab / "worlds" / "Bedrock level" / "level.dat").write_bytes(b"original cloned NBT")
        (lab / "server.properties").write_text(
            "server-port=17880\nserver-portv6=17881\n"
            "online-mode=true\nlevel-name=Bedrock level\n")
        (lab / ".alice-sandbox.json").write_text(json.dumps({
            "version": 1, "kind": "alice-disposable-bedrock-lab",
            "source": str(prod.resolve()), "port": 17880, "world": "Bedrock level",
            "backupSha256": "a"*64}))
        source = home / "minecraft-ai" / "bds-witness-pack"
        (source / "config").mkdir(parents=True)
        (source / "scripts").mkdir()
        (source / "manifest.json").write_text(json.dumps({
            "header": {"uuid": PACK.PACK_ID, "version": [0, 1, 0]},
            "modules": [{"uuid": PACK.MODULE_ID, "type": "script",
                         "entry": "scripts/main.js"}]
        }))
        (source / "scripts" / "main.js").write_text("import { world } from '@minecraft/server';\n")
        (source / "config" / "permissions.json").write_text(json.dumps({
            "allowed_modules": ["@minecraft/server-net", "@minecraft/server-admin", "@minecraft/server"],
            "module_permissions": {"@minecraft/server-net":
                                   {"allowed_uris": ["http://127.0.0.1:18781/v1/position"],
                                    "force_tls": False, "max_body_bytes": 512,
                                    "max_concurrent_requests": 1}}
        }))
        self.prod, self.lab, self.source = prod, lab, source
        self.patch = patch.multiple(PACK, PRODUCTION=prod, LAB=lab, SOURCE=source)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_stage_adds_pack_only_to_lab_without_beta_or_secrets(self):
        production_marker = self.prod / "never-modify"
        production_marker.write_bytes(b"original")
        lab_level = self.lab / "worlds" / "Bedrock level" / "level.dat"
        original_level = lab_level.read_bytes()
        self.assertEqual(PACK.inspect(), "ready_for_new_lab_only_pack")
        outcome = PACK.stage()
        self.assertEqual(outcome, "lab_pack_staged_without_beta_or_network")
        manifest = self.lab / "worlds" / "Bedrock level" / "world_behavior_packs.json"
        content = json.loads(manifest.read_text())
        self.assertEqual(content, [{"pack_id": PACK.PACK_ID, "version": [0, 1, 0]}])
        perm = json.loads((self.lab / "config" / PACK.MODULE_ID / "permissions.json").read_text())
        self.assertEqual(perm["module_permissions"]["@minecraft/server-net"]["allowed_uris"],
                         [PACK.LAB_URL])
        self.assertFalse((self.lab / "config" / PACK.MODULE_ID / "secrets.json").exists())
        self.assertEqual(lab_level.read_bytes(), original_level)
        self.assertEqual(production_marker.read_bytes(), b"original")
        self.assertEqual(PACK.stage(), "blocked_existing_pack_or_world_registration")

    def test_existing_pack_list_refused_unmodified(self):
        registration = self.lab / "worlds" / "Bedrock level" / "world_behavior_packs.json"
        original = '[{"pack_id":"some-other-pack"}]'
        registration.write_text(original)
        self.assertEqual(PACK.stage(), "blocked_existing_pack_or_world_registration")
        self.assertEqual(registration.read_text(), original)
        self.assertFalse((self.lab / "behavior_packs" / PACK.PACK_NAME).exists())

    def test_invalid_lab_marker_and_symlink_refuse(self):
        marker = self.lab / ".alice-sandbox.json"
        data = json.loads(marker.read_text())
        data["port"] = 17879
        marker.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "lab_marker_mismatch"):
            PACK.inspect()
        self.assertEqual(PACK.main.__name__, "main")
        marker.unlink()
        marker.symlink_to(self.prod / "never-exists")
        with self.assertRaises(ValueError):
            PACK.inspect()
        self.assertFalse((self.lab / "behavior_packs" / PACK.PACK_NAME).exists())

    def test_wrong_17879_properties_never_stage(self):
        (self.lab / "server.properties").write_text(
            "server-port=17879\nserver-portv6=17880\nonline-mode=true\nlevel-name=Bedrock level\n")
        with self.assertRaisesRegex(ValueError, "lab_server_properties_mismatch"):
            PACK.stage()

    def test_control_entry_and_mac_sanitized_contract(self):
        entry = (SCRIPTS / "alice-mac.sh").read_text()
        wrapper = (SCRIPTS / "alice-bds-lab-pack-mac.sh").read_text()
        self.assertIn("witness-lab-pack-stage", entry)
        self.assertIn("alice-bds-lab-pack-mac.sh", entry)
        self.assertIn('"productionModified":False', wrapper)
        self.assertIn('"labBdsStarted":False', wrapper)
        self.assertNotIn("systemctl", wrapper)


if __name__ == "__main__":
    unittest.main()
