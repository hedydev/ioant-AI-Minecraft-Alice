"""Privacy and read-only structure tests for the Mac Desktop Alice report bundler."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "alice-report-bundle.py"
SPEC = importlib.util.spec_from_file_location("alice_report_bundle", SOURCE)
REPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPORT)


class ReportBundleTests(unittest.TestCase):
    def _archive(self, root):
        path = root / "AliceAI-Acceptance-test.zip"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("manifest.json", json.dumps(
                {"requestedHours": 3, "records": 7, "samples": 4, "events": 3}))
            z.writestr("events.jsonl", "{}\n")
            z.writestr("deployment.json", json.dumps({"runtimeProcessFreshness": "source_changed_after_process_start"}))
        return path

    def test_adds_readonly_report_and_strips_secret_fields_and_private_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            zip_path = self._archive(Path(tmp))
            status = {"pid": 4242, "processAlive": True, "statusSource": "current_process",
                      "heartbeatFresh": True, "bdsSamples": 0,
                      "state": "IDLE",
                      "clientFeet": {"x": 1.5, "y": 67, "z": 0, "secret": "TOPSECRET"},
                      "deathRecovery": {"phase": "waiting_for_server_respawn", "rawToken": "TOPSECRET"},
                      "processStartAtUnixMs": 1792768544000,
                      "idleHold": {"reason": "scout_bds_position_unavailable",
                                   "chat": "TOPSECRET"},
                      "credentials": "TOPSECRET", "job": {"playerChat": "TOPSECRET"}}
            diagnose = {"lockedPid": 4242, "candidateCount": 1,
                        "possibleDuplicate": False, "ownerMatchesCandidate": True,
                        "currentOperatorLog": "/home/PRIVATE/.alice-bedrock-control/operator-alice-2026-10-24.log",
                        "recentOperatorLogs": [{"path": "/home/PRIVATE/operator-alice-secret.log",
                                                "credentials": "TOPSECRET"}],
                        "recentLifecycle": [{
                            "event": "spawn_confirmed", "time": "2026-10-24T00:24:31+08:00",
                            "pid": 4242, "file": "operator-alice-2026-10-24.log",
                            "auth": "TOPSECRET"}],
                        "rawWorld": "TOPSECRET", "note": "TOPSECRET"}
            clean_status, clean_diag = REPORT.add_report(zip_path, status, diagnose)
            self.assertEqual(clean_status["bdsSamples"], 0)
            self.assertEqual(clean_diag["candidateCount"], 1)
            with zipfile.ZipFile(zip_path) as z:
                self.assertIsNone(z.testzip())
                self.assertTrue({"REPORT.md", "operator-status.json",
                                 "operator-diagnose.json"}.issubset(z.namelist()))
                s = json.loads(z.read("operator-status.json"))
                d = json.loads(z.read("operator-diagnose.json"))
                text = z.read("operator-status.json") + z.read("operator-diagnose.json")
                self.assertNotIn(b"TOPSECRET", text)
                self.assertNotIn(b"/home/PRIVATE", text)
                self.assertNotIn("job", s)
                self.assertEqual(s["deathRecovery"], {"phase": "waiting_for_server_respawn"})
                self.assertEqual(s["processStartAtUnixMs"], 1792768544000)
                self.assertEqual(d["recentLifecycle"][0]["event"], "spawn_confirmed")
                self.assertEqual(d["currentOperatorLogBasename"],
                                 "operator-alice-2026-10-24.log")
                report = z.read("REPORT.md").decode("utf-8")
                self.assertIn("AliceAI", report)
                self.assertIn("独立 BDS 样本数: 0", report)
                self.assertIn("死亡复活阶段: waiting_for_server_respawn", report)
                self.assertIn("source_changed_after_process_start", report)
            with self.assertRaisesRegex(ValueError, "twice"):
                REPORT.add_report(zip_path, status, diagnose)

    def test_capture_failure_explicitly_unknown_not_fabricated(self):
        with tempfile.TemporaryDirectory() as tmp:
            zip_path = self._archive(Path(tmp))
            s, d = REPORT.add_report(zip_path, {"_capture": "unavailable"},
                                     {"_capture": "unavailable"})
            self.assertEqual(s, {"capture": "unavailable"})
            self.assertEqual(d, {"capture": "unavailable"})
            with zipfile.ZipFile(zip_path) as z:
                summary = z.read("REPORT.md").decode("utf-8")
                self.assertIn("采集: unavailable", summary)
                self.assertIn("当前实例 PID: unknown", summary)

    def test_rejects_missing_or_symlinked_archive_and_bad_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = self._archive(root)
            with self.assertRaisesRegex(ValueError, "required data"):
                with zipfile.ZipFile(path, "w") as z:
                    z.writestr("other.json", "{}")
                REPORT.add_report(path, {}, {})
            alias = root / "symlink.zip"
            alias.symlink_to(path)
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                REPORT.add_report(alias, {}, {})
            json_file = root / "status.json"
            json_file.write_text("{invalid", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Malformed"):
                REPORT.read_json(json_file)

    def test_nested_non_scalar_values_are_not_printed_or_crash(self):
        status = {"statusSource": {"credentials": "TOPSECRET"}, "state": ["TOPSECRET"],
                  "deathRecovery": {"phase": {"token": "TOPSECRET"}},
                  "idleHold": {"reason": ["TOPSECRET"]}}
        diagnose = {"recentLifecycle": [{"event": ["TOPSECRET"], "kind": ["TOPSECRET"]}],
                    "aliceProcessCandidates": [{"pid": 5, "cwd": ["TOPSECRET"]}]}
        self.assertEqual(REPORT.sanitize_status(status), {"capture": "available"})
        cleaned = REPORT.sanitize_diagnose(diagnose)
        self.assertEqual(cleaned.get("recentLifecycle"), [])


if __name__ == "__main__":
    unittest.main()
