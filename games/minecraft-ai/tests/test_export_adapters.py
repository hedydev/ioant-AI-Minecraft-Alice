"""Safety and fidelity checks for read-only adapter export."""
import importlib.util
import io
import json
import hashlib
from pathlib import Path
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("alice_export", ROOT / "scripts" / "export-adapters.py")
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)


class ExportAdaptersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.target = Path(self.tmp.name) / "mindcraft"
        self.target.mkdir()
        (self.target / "package.json").write_text('{"type":"module"}')
        self.original = {}
        for i, rel in enumerate(exporter.REQUIRED):
            path = self.target / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            self.original[rel] = f"// exact local adapter {i}\n".encode()
            path.write_bytes(self.original[rel])
        private = self.target / "bots" / "AliceAI" / "alice_learning.json"
        private.parent.mkdir(parents=True)
        private.write_text('PRIVATE_LEARNING_DATA')
        self.private = private

    def test_preserves_source_exactly_and_excludes_private_data(self):
        out = io.BytesIO()
        before = {rel: (self.target / rel).stat().st_mtime_ns for rel in exporter.REQUIRED}
        manifest = exporter.export(self.target, out)
        out.seek(0)
        with tarfile.open(fileobj=out, mode="r:gz") as archive:
            self.assertEqual(set(archive.getnames()), set(exporter.REQUIRED) | {"adapter-manifest.json"})
            recorded = json.load(archive.extractfile("adapter-manifest.json"))
            for rel, data in self.original.items():
                self.assertEqual(archive.extractfile(rel).read(), data)
                self.assertEqual(recorded["files"][rel]["sha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(manifest, recorded)
        self.assertEqual(self.private.read_text(), 'PRIVATE_LEARNING_DATA')
        self.assertEqual(before, {rel: (self.target / rel).stat().st_mtime_ns for rel in exporter.REQUIRED})

    def test_missing_required_is_refused_without_output(self):
        (self.target / exporter.REQUIRED[0]).unlink()
        out = io.BytesIO()
        with self.assertRaisesRegex(RuntimeError, 'Missing required adapter'):
            exporter.export(self.target, out)
        self.assertEqual(out.getvalue(), b'')

    def test_symlink_outside_checkout_is_refused(self):
        external = Path(self.tmp.name) / "outside.js"
        external.write_text("confidential")
        candidate = self.target / exporter.REQUIRED[0]
        candidate.unlink()
        candidate.symlink_to(external)
        with self.assertRaisesRegex(RuntimeError, 'outside Mindcraft checkout'):
            exporter.export(self.target, io.BytesIO())

    def test_oversized_adapter_is_refused_without_output(self):
        (self.target / exporter.REQUIRED[0]).write_bytes(b'x' * (exporter.MAX_FILE_BYTES + 1))
        out = io.BytesIO()
        with self.assertRaisesRegex(RuntimeError, 'size limit'):
            exporter.export(self.target, out)
        self.assertEqual(out.getvalue(), b'')

if __name__ == "__main__":
    unittest.main()
