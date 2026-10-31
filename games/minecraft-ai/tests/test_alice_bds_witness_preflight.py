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
                "force_https": False, "max_body_bytes": 512,
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

    def test_disposable_lab_requires_matching_sandbox_marker_and_distinct_ports(self):
        with tempfile.TemporaryDirectory() as base:
            home = Path(base)
            production = self.fixture(home)
            lab = home / "minecraft-bedrock-alice-lab"
            (lab / "worlds" / "Bedrock level").mkdir(parents=True)
            (lab / "worlds" / "Bedrock level" / "level.dat").write_bytes(b"level")
            (lab / "server.properties").write_text(
                "server-port=17880\nserver-portv6=17881\n"
                "online-mode=true\nlevel-name=Bedrock level\n")
            marker = {"version": 1, "kind": "alice-disposable-bedrock-lab",
                      "source": str(production.resolve()), "port": 17880,
                      "world": "Bedrock level"}
            (lab / ".alice-sandbox.json").write_text(json.dumps(marker))
            s = CHECK.inspect(home)
            self.assertEqual(s["isolated17880Lab"], "isolated_metadata_verified")
            self.assertFalse(s["safeToApplyWorldChanges"])
            marker["port"] = 17879
            (lab / ".alice-sandbox.json").write_text(json.dumps(marker))
            self.assertEqual(CHECK.inspect(home)["isolated17880Lab"], "unverified")

    def test_private_backup_manifest_is_metadata_only_not_restore_proof(self):
        import os
        with tempfile.TemporaryDirectory() as base:
            home = Path(base)
            production = self.fixture(home)
            private = home / ".alice-bedrock-control"
            private.mkdir(mode=0o700)
            archive = home / "offline-backup.json"
            archive.write_text(json.dumps({
                "kind": "bedrock", "source": str(production.resolve()),
                "worlds": ["worlds/Bedrock level"], "verified": True,
                "files": {}, "archive": "missing-snapshot.tar.gz"
            }))
            settings = private / "operator-env.json"
            settings.write_text(json.dumps({
                "version": 1,
                "settings": {"ALICE_BEDROCK_BACKUP_MANIFEST": str(archive)}}))
            os.chmod(settings, 0o600)
            s = CHECK.inspect(home)
            self.assertEqual(s["operatorBackupManifest"],
                             "configured_manifest_present_not_restore_verified")
            self.assertEqual(s["verifiedOfflineWorldBackup"],
                             "not_verified_requires_backup_and_restore_test")
            self.assertFalse(s["safeToApplyWorldChanges"])
            self.assertNotIn(str(archive), json.dumps(s))
            os.chmod(settings, 0o644)
            self.assertEqual(CHECK.inspect(home)["operatorBackupManifest"], "not_verified")

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
