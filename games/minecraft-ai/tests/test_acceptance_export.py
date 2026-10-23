"""Read-only acceptance ZIP exporter tests (no Mint/Bedrock network)."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "export-alice-acceptance.py"
SPEC = importlib.util.spec_from_file_location("alice_acceptance_exporter", SOURCE)
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)


class AcceptanceExportTests(unittest.TestCase):
    def test_window_and_manifest_and_filtered_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            journal = root / "acceptance"
            journal.mkdir()
            rows = [
                {"at": 1700000000000, "kind": "sample", "state": "IDLE", "serverPackets": 0},
                {"at": 1700000100000, "kind": "[Alice agent] Ollama proposed tool:", "detail": {"tool": "observe"}},
                {"at": 1699900000000, "kind": "sample", "state": "OLD"},
            ]
            (journal / "events.jsonl").write_text(
                "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            (root / "status.json").write_text(json.dumps(
                {"connected": True, "state": "IDLE", "agent": {"mode": "autonomous"},
                 "xboxToken": "MUST_NOT_EXPORT"}))
            output = EXPORT.create_archive(1, root=root, now=1700000200)
            with zipfile.ZipFile(io.BytesIO(output)) as archive:
                self.assertIsNone(archive.testzip())
                meta = json.loads(archive.read("manifest.json"))
                self.assertEqual(meta["records"], 2)
                self.assertEqual(meta["samples"], 1)
                status = json.loads(archive.read("status.json"))
                self.assertNotIn("xboxToken", status)
                lines = archive.read("events.jsonl").decode().strip().splitlines()
                self.assertEqual(len(lines), 2)

    def test_no_data_is_not_reported_as_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "No Alice acceptance records"):
                EXPORT.create_archive(1, root=Path(tmp), now=1700000200)

    def test_refuses_symlinked_journal_or_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            other = root / "outside"
            other.write_text("PRIVATE")
            (root / "acceptance").symlink_to(other)
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                EXPORT.create_archive(1, root=root, now=1700000200)


if __name__ == "__main__":
    unittest.main()
