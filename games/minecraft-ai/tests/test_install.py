import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("alice_install", ROOT / "scripts" / "install.py")
install = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(install)


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "package.json").write_text('{"type":"module"}')
        for name, markers in install.CHECKS.items():
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("// fixture\n" + "\n".join("// " + s for s in markers) + "\n")
        self.agent = self.root / "src" / "agent"
        (self.agent / "alice_core.js").write_text("// existing user AliceCore code\n")
        (self.root / "bots" / "AliceAI").mkdir(parents=True)
        self.memory = self.root / "bots" / "AliceAI" / "alice_learning.json"
        self.memory.write_text('{"version":1,"episodes":[{"skill":"repath"}]}')

    def tearDown(self):
        self.temp.cleanup()

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_install_backup_idempotence_and_rollback(self):
        install.install(self.root)
        manifest = install.load_manifest(self.root)
        self.assertEqual(manifest["version"], install.VERSION)
        self.assertIn("src/agent/alice_core.js", manifest["installed"])
        self.assertEqual(json.loads(self.memory.read_text())["episodes"][0]["skill"], "repath")
        backup = self.root / ".alice-project" / "backups" / manifest["backup"]
        self.assertEqual((backup / "src/agent/alice_core.js").read_text(),
                         "// existing user AliceCore code\n")
        self.assertTrue((self.agent / "alice_modules/movement.js").exists())
        install.install(self.root)
        self.assertEqual(install.load_manifest(self.root)["backup"], manifest["backup"])
        install.rollback(self.root, "latest")
        self.assertEqual((self.agent / "alice_core.js").read_text(), "// existing user AliceCore code\n")
        self.assertFalse((self.agent / "alice_modules/movement.js").exists())
        self.assertFalse((self.root / ".alice-project" / "install.json").exists())
        self.assertTrue(self.memory.exists())

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_refuse_local_managed_code_drift(self):
        install.install(self.root)
        (self.agent / "alice_core.js").write_text("// locally edited\n")
        with self.assertRaisesRegex(RuntimeError, "Local edit detected"):
            install.install(self.root)
        self.assertEqual((self.agent / "alice_core.js").read_text(), "// locally edited\n")

    def test_optional_message_epoch_does_not_block_install(self):
        # Mirrors the user's real Mint checkout: full Alice bridge minus epoch.
        from contextlib import redirect_stderr
        from io import StringIO
        p = self.root / "src/agent/agent.js"
        p.write_text(p.read_text() + "// _aliceMessageEpoch\n")
        p.write_text(p.read_text().replace("// _aliceMessageEpoch\n", ""))
        self.assertNotIn("_aliceMessageEpoch", p.read_text())
        logs = StringIO()
        with redirect_stderr(logs):
            install.verify_target(self.root)
        self.assertIn("optional Alice message-epoch", logs.getvalue())

    def test_missing_required_core_still_blocks(self):
        p = self.root / "src/agent/agent.js"
        p.write_text("// missing critical hooks\n")
        with self.assertRaisesRegex(RuntimeError, "integration markers"):
            install.verify_target(self.root)

    def test_refuse_missing_integration(self):
        (self.root / "src/agent/modes.js").write_text("no Alice arbitration")
        with self.assertRaisesRegex(RuntimeError, "integration markers"):
            install.verify_target(self.root)

    def test_read_only_preview(self):
        install.verify_target(self.root)
        before = (self.agent / "alice_core.js").read_text()
        changes = install.changes(self.root)
        self.assertGreater(len(changes), 0)
        self.assertEqual(before, (self.agent / "alice_core.js").read_text())
        self.assertFalse((self.root / ".alice-project").exists())


if __name__ == "__main__":
    unittest.main()
