import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('stream_log',ROOT/'scripts'/'stream-latest-log.py')
loader=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(loader)

class TestLatestLog(unittest.TestCase):
    def test_latest_and_read_only(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);logs=root/'.alice-project'/'logs';logs.mkdir(parents=True)
            (logs/'run-20261018T010000Z.log').write_bytes(b'older\n')
            newest=logs/'run-20261018T020000Z.log';newest.write_bytes(b'newest\n')
            (logs/'secrets.json').write_bytes(b'NEVER')
            out=io.BytesIO()
            self.assertEqual(loader.stream(root,out),newest.resolve())
            self.assertEqual(out.getvalue(),b'newest\n')
            self.assertEqual(newest.read_bytes(),b'newest\n')
    def test_no_logs_has_explicit_failure(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(RuntimeError,'No Alice runtime logs'):
                loader.stream(Path(d),io.BytesIO())
