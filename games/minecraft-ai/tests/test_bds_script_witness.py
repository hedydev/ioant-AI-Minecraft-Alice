#!/usr/bin/env python3
"""No live BDS, network or MCSManager dependencies."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import bds_script_witness as bridge


class SilentWitnessTests(unittest.TestCase):
    def setUp(self):
        self.posted = []
        self.at = 1_792_741_800_000_000_000
        self.clock = lambda: self.at
        self.receiver = bridge.Receiver("hedygame7231", "q" * 43,
                                        clock=self.clock)
        self.payload = {
            "version": 1, "gamertag": "hedygame7231",
            "playerId": "player-script-uuid-1234",
            "boot": "bedrockboot-123456",
            "sequence": 1, "dimension": "minecraft:overworld",
            "feet": {"x": -4.5, "y": 69, "z": 8.5}
        }
        self.writer = patch.object(bridge, "publish",
                                   side_effect=lambda sample, path=None:
                                   self.posted.append(sample))
        self.writer.start()
        self.addCleanup(self.writer.stop)

    def send(self, token="q" * 43):
        return self.receiver.accept(token, json.dumps(self.payload).encode())

    def test_authenticated_server_script_yields_private_independent_sample(self):
        row = self.send()
        self.assertEqual(row["source"], "bds_script_api")
        self.assertEqual(row["uniqueId"], self.payload["playerId"])
        self.assertEqual(row["feet"], self.payload["feet"])
        self.assertEqual(row["gamertag"], "hedygame7231")
        self.assertEqual(row["observedAt"], self.at // 1_000_000)
        self.assertEqual(len(self.posted), 1)

    def test_no_token_wrong_player_wrong_dimension_and_invalid_xyz_rejected(self):
        for bad in ["", None, "wrong"]:
            with self.assertRaisesRegex(ValueError, "unauthorized"):
                self.send(bad)
        self.payload["gamertag"] = "another_player"
        with self.assertRaises(ValueError):
            self.send()
        self.payload["gamertag"] = "hedygame7231"
        self.payload["dimension"] = "minecraft:nether"
        with self.assertRaises(ValueError):
            self.send()
        self.payload["dimension"] = "minecraft:overworld"
        self.payload["feet"]["x"] = float("nan")
        with self.assertRaises(ValueError):
            self.send()
        self.assertFalse(self.posted)

    def test_sequence_replay_or_changed_pack_player_fail_closed(self):
        self.send()
        with self.assertRaisesRegex(ValueError, "stale_sequence"):
            self.send()
        self.payload["sequence"] = 2
        self.payload["playerId"] = "another-player-script-id"
        with self.assertRaisesRegex(ValueError, "session_identity_changed"):
            self.send()
        self.payload["playerId"] = "player-script-uuid-1234"
        self.payload["boot"] = "another-boot-123456"
        with self.assertRaisesRegex(ValueError, "session_identity_changed"):
            self.send()
        self.payload["boot"] = "bedrockboot-123456"
        self.at += 2_000_000_000
        row = self.send()
        self.assertGreater(int(row["serial"]), int(self.posted[0]["serial"]))
        self.assertEqual(len(self.posted), 2)

    def test_rejected_publish_does_not_advance_sequence(self):
        with patch.object(bridge, "publish", side_effect=OSError("denied")):
            with self.assertRaises(OSError):
                self.send()
        self.assertEqual(self.receiver.sequence, -1)
        self.send()
        self.assertEqual(self.receiver.sequence, 1)

    def test_contract_is_loopback_and_no_minecraft_console_commands(self):
        pack = Path(__file__).resolve().parents[1] / "bds-witness-pack" / "scripts" / "main.js"
        source = pack.read_text(encoding="utf-8")
        self.assertIn("http.request(request)", source)
        self.assertNotIn("runCommand", source)
        self.assertNotIn("querytarget", source)
        self.assertIn("new HttpHeader(\"X-Alice-Witness-Token\", secret)", source)
        self.assertIn("world.getAllPlayers()", source)
        server = (SCRIPTS / "bds_script_witness.py").read_text()
        self.assertIn('("127.0.0.1", cfg["port"])', server)
        self.assertNotIn("subprocess", server)


if __name__ == "__main__":
    unittest.main()
