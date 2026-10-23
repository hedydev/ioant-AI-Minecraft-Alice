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
        self.proc_guard = patch.object(PACK, "require_lab_stopped", return_value=None)
        self.proc_guard.start()
        self.addCleanup(self.proc_guard.stop)

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

    def test_pristine_lab_missing_pack_and_config_dirs_can_be_staged(self):
        # The actual 17880 lab was created from a BDS installation whose
        # optional pack/config directories might not have existed.
        (self.lab / "behavior_packs").rmdir()
        (self.lab / "config").rmdir()
        self.assertEqual(PACK.inspect(), "ready_for_new_lab_only_pack")
        self.assertFalse((self.lab / "behavior_packs").exists())
        self.assertFalse((self.lab / "config").exists())
        original = (self.lab / "worlds" / "Bedrock level" / "level.dat").read_bytes()
        self.assertEqual(PACK.stage(), "lab_pack_staged_without_beta_or_network")
        self.assertTrue((self.lab / "behavior_packs" / PACK.PACK_NAME / "manifest.json").is_file())
        self.assertTrue((self.lab / "config" / PACK.MODULE_ID / "permissions.json").is_file())
        self.assertEqual((self.lab / "worlds" / "Bedrock level" / "level.dat").read_bytes(), original)
        self.assertFalse((self.lab / "config" / PACK.MODULE_ID / "secrets.json").exists())
        self.assertEqual(PACK.stage(), "blocked_existing_pack_or_world_registration")

    def test_symlinked_optional_lab_parent_is_refused_no_write(self):
        outside = self.prod / "external-config"
        outside.mkdir()
        (self.lab / "config").rmdir()
        (self.lab / "config").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "lab_parent_directory_invalid"):
            PACK.stage()
        self.assertFalse((self.lab / "behavior_packs" / PACK.PACK_NAME).exists())
        self.assertFalse(list(outside.iterdir()))

    def test_sanitized_main_reports_known_precondition_reason(self):
        (self.lab / "config").rmdir()
        (self.lab / "config").symlink_to(self.prod, target_is_directory=True)
        with patch.object(sys, "argv", ["alice-bds-lab-pack.py", "stage"]):
            with patch("builtins.print") as printed:
                self.assertEqual(PACK.main(), 0)
        payload = json.loads(printed.call_args.args[0])
        self.assertEqual(payload["state"], "preconditions_failed")
        self.assertEqual(payload["reason"], "lab_parent_directory_invalid")
        self.assertFalse(payload["productionModified"])
        self.assertNotIn(str(self.prod), json.dumps(payload))

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

    def test_running_or_unverifiable_lab_bds_blocks_all_writes(self):
        for reason in ("lab_bds_is_running", "bds_cwd_unverified", "proc_unavailable"):
            with self.subTest(reason=reason), patch.object(
                PACK, "require_lab_stopped", side_effect=ValueError(reason)
            ):
                with self.assertRaisesRegex(ValueError, reason):
                    PACK.stage()
                self.assertFalse((self.lab / "behavior_packs" / PACK.PACK_NAME).exists())
                self.assertFalse((self.lab / "worlds" / "Bedrock level" /
                                  "world_behavior_packs.json").exists())

    def test_privileged_fallback_invokes_only_readlink_and_never_shell_or_root_python(self):
        from types import SimpleNamespace
        proc_entry = self.lab / "fake-proc" / "10012"
        proc_entry.mkdir(parents=True)
        calls = []
        def trusted_run(args, **kw):
            calls.append((args, kw))
            return SimpleNamespace(returncode=0, stdout=str(self.prod.resolve()) + chr(10))
        result = PACK.privileged_read_cwd(proc_entry, run=trusted_run)
        self.assertEqual(result, self.prod.resolve())
        self.assertEqual(calls[0][0], [
            "sudo", "-n", "/usr/bin/readlink", "-e", str(proc_entry / "cwd")])
        self.assertIs(calls[0][1]["check"], False)
        self.assertEqual(calls[0][1]["timeout"], 3)

    def test_privileged_readlink_failure_never_claims_stopped(self):
        from types import SimpleNamespace
        proc_entry = self.lab / "fake-proc" / "10012"
        proc_entry.mkdir(parents=True)
        for status in (1, 126, 127):
            with self.subTest(status=status), self.assertRaisesRegex(
                    ValueError, "bds_cwd_requires_privileged_read"):
                PACK.privileged_read_cwd(proc_entry, run=lambda *a, **kw:
                                          SimpleNamespace(returncode=status, stdout=""))

    def test_process_guard_disambiguates_only_positively_identified_instances(self):
        from unittest.mock import patch as mockpatch
        with tempfile.TemporaryDirectory() as tempdir:
            proc = Path(tempdir)
            item = proc / "18420"
            item.mkdir()
            (item / "comm").write_text("bedrock_server" + chr(10))
            # Missing cwd triggers the privileged reader, not a blanket skip.
            with mockpatch.object(PACK, "privileged_read_cwd",
                                  return_value=self.prod.resolve()) as reader:
                PACK.require_lab_stopped(proc)
                self.assertEqual(reader.call_count, 1)
            with mockpatch.object(PACK, "privileged_read_cwd",
                                  return_value=self.lab.resolve()):
                with self.assertRaisesRegex(ValueError, "lab_bds_is_running"):
                    PACK.require_lab_stopped(proc)
            with mockpatch.object(PACK, "privileged_read_cwd",
                                  side_effect=ValueError("bds_cwd_requires_privileged_read")):
                with self.assertRaisesRegex(ValueError, "bds_cwd_requires_privileged_read"):
                    PACK.require_lab_stopped(proc)

    def test_control_entry_and_mac_sanitized_contract(self):
        entry = (SCRIPTS / "alice-mac.sh").read_text()
        wrapper = (SCRIPTS / "alice-bds-lab-pack-mac.sh").read_text()
        self.assertIn("witness-lab-pack-stage", entry)
        self.assertIn("witness-lab-pack-stage-verified", entry)
        self.assertIn("alice-bds-lab-pack-mac.sh", entry)
        self.assertIn("stage --sudo-process-audit", entry)
        self.assertIn("sudo -v && python3", wrapper)
        self.assertIn('"productionModified":False', wrapper)
        self.assertIn('"labBdsStartedByThisAction":False', wrapper)
        self.assertIn('"reason":{"none","proc_unavailable"', wrapper)
        self.assertNotIn("systemctl", wrapper)


if __name__ == "__main__":
    unittest.main()
