"""Read-only BDS witness preflight acceptance; uses isolated fixture worlds only."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

# importlib.exec_module() does not add the loaded script's directory to
# sys.path. The production preflight imports its sibling metadata reader.
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
FILE = SCRIPTS / "alice-bds-witness-preflight.py"
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
            self.assertEqual(state["schemaVersion"], 2)
            self.assertIs(type(state["observedAtUnix"]), int)
            self.assertFalse(state["targetWorldStructurallyPresent"])
            self.assertEqual(state["betaApisExperiment"], "unverified")

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

    def test_experiment_readout_still_cannot_authorize_world_edit(self):
        import struct
        with tempfile.TemporaryDirectory() as base:
            home = Path(base)
            root = self.fixture(home)
            level = root / "worlds" / "Bedrock level" / "level.dat"
            def named(tag, name, payload):
                return bytes([tag]) + struct.pack("<H", len(name)) + name.encode() + payload
            # Actual LE NBT compound with the Beta APIs 'gametest' flag.
            inner = named(1, "gametest", bytes([1])) + bytes([0])
            body = bytes([10,0,0]) + named(10, "experiments", inner) + bytes([0])
            level.write_bytes(struct.pack("<II", 10, len(body)) + body)
            state = CHECK.inspect(home)
            self.assertEqual(state["betaApisExperiment"], "enabled_in_level_dat")
            self.assertEqual(state["betaModulesLoaded"],
                             "not_verified_without_bds_log_or_runtime_witness")
            self.assertFalse(state["safeToApplyWorldChanges"])

    def test_wrong_port_or_world_disallows_install(self):
        with tempfile.TemporaryDirectory() as base:
            home = Path(base)
            self.fixture(home, port="19132", name="Another world")
            state = CHECK.inspect(home)
            self.assertFalse(state["propertiesMatchProduction17879BedrockLevel"])
            self.assertFalse(state["safeToApplyWorldChanges"])

    def test_mac_preflight_rejects_legacy_format_and_includes_timestamp(self):
        mac = Path(__file__).resolve().parents[1] / "scripts" / "alice-bds-witness-mac.sh"
        source = mac.read_text(encoding="utf-8")
        self.assertIn('obj["schemaVersion"] != 2', source)
        self.assertIn('abs(int(time.time()) - seen) > 900', source)
        self.assertIn('"schemaVersion": 2, "observedAtUnix": seen', source)
        self.assertIn("Mint returned OLD witness preflight format", source)

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
