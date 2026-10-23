"""Read-only BDS witness preflight acceptance; uses isolated fixture worlds only."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / "scripts" / "alice-bds-witness-preflight.py"
SPEC = importlib.util.spec_from_file_location("bds_witness_preflight", FILE)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class PreflightTests(unittest.TestCase):
    def test_missing_production_target_is_not_claimed_safe(self):
        with tempfile.TemporaryDirectory() as base:
            with patch.object(CHECK, "bounded_processes", return_value={"state":"unknown","count":None}):
                state = CHECK.inspect(Path(base))
            self.assertFalse(state["bdsRootMatchesExpected"])
            self.assertFalse(state["safeToApplyWorldChanges"])
            self.assertFalse(state["targetWorldStructurallyPresent"])
            self.assertEqual(state["betaApisExperiment"],
                             "not_verified_requires_world_level_experiment_audit")

    def fixture(self, home, *, port="17879", name="Bedrock level", attached=False):
        root = home / "minecraft-bedrock"
        w = root / "worlds" / "Bedrock level"
        (w / "db").mkdir(parents=True)
        (w / "level.dat").write_bytes(b"not a real world")
        (root / "server.properties").write_text(
            "server-port=" + port + "\nlevel-name=" + name + "\nonline-mode=true\n")
        (w / "world_behavior_packs.json").write_text(json.dumps(
            [{"pack_id": CHECK.PACK_UUID, "version": [0, 1, 0]}] if attached else []))
        pack = home / "minecraft-ai" / "bds-witness-pack"
        (pack / "config").mkdir(parents=True)
        (pack / "manifest.json").write_text(json.dumps({
            "header": {"uuid": CHECK.PACK_UUID},
            "modules": [{"type": "script", "uuid": CHECK.MODULE_UUID}],
            "dependencies": [
                {"module_name": "@minecraft/server", "version": "2.10.0"},
                {"module_name": "@minecraft/server-net", "version": "1.0.0-beta"},
                {"module_name": "@minecraft/server-admin", "version": "1.0.0-beta"}
            ]
        }))
        (pack / "config" / "permissions.json").write_text(json.dumps({
            "allowed_modules": [
                "@minecraft/server", "@minecraft/server-net", "@minecraft/server-admin"],
            "module_permissions": {"@minecraft/server-net": {
                "allowed_uris": ["http://127.0.0.1:18781/v1/position"],
                "force_tls": False, "max_body_bytes": 512,
                "max_concurrent_requests": 1
            }}
        }))
        return root

    def test_correct_world_and_pack_source_still_never_mean_safe_to_install(self):
        with tempfile.TemporaryDirectory() as base:
            home = Path(base)
            root = self.fixture(home)
            before = (root / "server.properties").read_bytes()
            with patch.object(CHECK, "bounded_processes",
                              return_value={"state":"found_running","count":1}):
                state = CHECK.inspect(home)
            self.assertTrue(state["propertiesMatchProduction17879BedrockLevel"])
            self.assertTrue(state["targetWorldStructurallyPresent"])
            self.assertTrue(state["packSourceAndRestrictedHttpPolicyValid"])
            self.assertEqual(state["processes"]["state"], "found_running")
            self.assertFalse(state["safeToApplyWorldChanges"])
            self.assertFalse(state["alreadyAttached"])
            self.assertEqual((root / "server.properties").read_bytes(), before)

    def test_wrong_port_or_world_disallows_install(self):
        with tempfile.TemporaryDirectory() as base:
            home = Path(base)
            self.fixture(home, port="19132", name="Another world")
            state = CHECK.inspect(home)
            self.assertFalse(state["propertiesMatchProduction17879BedrockLevel"])
            self.assertFalse(state["safeToApplyWorldChanges"])

    def test_pack_already_attached_is_reported_without_changes(self):
        with tempfile.TemporaryDirectory() as base:
            home = Path(base)
            root = self.fixture(home, attached=True)
            w = root / "worlds" / "Bedrock level"
            original = (w / "world_behavior_packs.json").read_bytes()
            state = CHECK.inspect(home)
            self.assertTrue(state["alreadyAttached"])
            self.assertEqual((w / "world_behavior_packs.json").read_bytes(), original)
            self.assertNotIn("gamertag", json.dumps(state).lower())
            self.assertNotIn("SECRET_PRIVATE_VALUE", json.dumps(state))


if __name__ == "__main__":
    unittest.main()
