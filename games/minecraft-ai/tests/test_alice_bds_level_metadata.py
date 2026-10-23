"""Offline, read-only little-endian Bedrock NBT experiment flag regression."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

FILE = Path(__file__).resolve().parents[1] / "scripts" / "alice_bds_level_metadata.py"
SPEC = importlib.util.spec_from_file_location("alice_level_metadata", FILE)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def named(tag, name, data):
    return bytes([tag]) + struct.pack("<H", len(name)) + name.encode() + data


def level(experiment):
    contents = b""
    if experiment is not None:
        contents = named(10, "experiments", named(1, "gametest", bytes([experiment])) + b"\x00")
    body = b"\x0a\x00\x00" + contents + b"\x00"
    return struct.pack("<II", 10, len(body)) + body


class BetaApiLevelMetadataTests(unittest.TestCase):
    def test_enabled_disabled_absent_are_distinct(self):
        for experiment, expected in (
            (1, "enabled_in_level_dat"), (0, "disabled_in_level_dat"),
            (None, "not_declared_in_level_dat")
        ):
            with self.subTest(experiment=experiment), tempfile.TemporaryDirectory() as td:
                p = Path(td) / "level.dat"
                p.write_bytes(level(experiment))
                original = p.read_bytes()
                self.assertEqual(M.beta_api_experiment(p), expected)
                self.assertEqual(p.read_bytes(), original)

    def test_unknown_corrupt_truncated_header_and_symlink_fail_closed(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "level.dat"
            p.write_bytes(level(1)[:-2])
            self.assertEqual(M.beta_api_experiment(p), "unverified")
            p.write_bytes(b"not a real world")
            self.assertEqual(M.beta_api_experiment(p), "unverified")
            link = Path(td) / "link.dat"
            link.symlink_to(p)
            self.assertEqual(M.beta_api_experiment(link), "unverified")

    def test_invalid_experiment_type_never_claims_enabled(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "level.dat"
            contents = named(10, "experiments", named(3, "gametest", struct.pack("<i",1))+b"\x00")
            body = b"\x0a\x00\x00"+contents+b"\x00"
            p.write_bytes(struct.pack("<II",10,len(body))+body)
            self.assertEqual(M.beta_api_experiment(p), "unverified")


if __name__ == "__main__":
    unittest.main()
