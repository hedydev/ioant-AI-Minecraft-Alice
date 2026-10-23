"""Offline-only MCSManager BDS witness parser tests; no external requests."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

TARGET = Path(__file__).resolve().parents[1] / "scripts" / "bds_position_witness.py"
spec = importlib.util.spec_from_file_location("bds_witness", TARGET)
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)

class BdsWitnessTests(unittest.TestCase):
    def test_parse_independent_querytarget_position(self):
        text = '[INFO] Target data: ' + json.dumps([{
            "dimension": 0, "uniqueId": "615bca9b-ea00-316a-8bc3-650a0c8991c4",
            "position": {"x": -4.5, "y": 70.62, "z": -6.5}
        }])
        uid, p = m.parse_target_append(text)
        self.assertEqual(p["x"], -4.5)
        self.assertAlmostEqual(p["y"]-1.62, 69.0)
        self.assertTrue(uid)
    def test_reject_empty_multiple_and_wrong_dimension(self):
        for rows in ([], [{"dimension":1,"uniqueId":"0123456789",
                              "position":{"x":0,"y":0,"z":0}}]):
            with self.assertRaises(ValueError):
                m.parse_target_append("Target data: " + json.dumps(rows))
        valid={"dimension":0,"uniqueId":"0123456789",
               "position":{"x":0,"y":65,"z":0}}
        with self.assertRaises(ValueError):
            m.parse_target_append("Target data: " + json.dumps([valid,valid]))
    def test_log_delta_requires_existing_anchor(self):
        self.assertEqual(m.parse_append("before","beforeTarget data: []"),
                         "Target data: []")
        with self.assertRaises(ValueError):
            m.parse_append("before","other log")
    def test_fixed_querytarget_selector_only(self):
        cfg={"gamertag":"AliceXbox"}
        calls=[]
        def fake_api(cfg,key,endpoint,extra):
            calls.append((endpoint,extra))
            if endpoint=="command": return True
            if len([c for c in calls if c[0]=="outputlog"])==1:
                return "begin"
            return "begin[INFO] Target data: " + json.dumps([{
                "dimension":0,"uniqueId":"615bca9b-ea00-316a-8bc3-650a0c8991c4",
                "position":{"x":2.5,"y":70.62,"z":4.5}
            }])
        sample=m.probe_once(cfg,'dummy',api_call=fake_api,sleep=lambda _:None)
        self.assertEqual(calls[1],("command",{"command":'querytarget @a[name="AliceXbox"]'}))
        self.assertEqual(sample["source"],"mcsm_querytarget")
        self.assertAlmostEqual(sample["feet"]["y"],69)
    def test_safe_failure_never_exposes_remote_urls_or_credentials(self):
        import urllib.error
        error = urllib.error.HTTPError(
            "http://127.0.0.1:23333/api?apikey=SECRET_KEY",
            403, "Denied", None, None)
        self.assertEqual(m.safe_failure(error), "mcsm_http_status_403")
        self.assertEqual(m.safe_failure(ValueError("mcsm_operation_rejected")),
                         "mcsm_operation_rejected")
        self.assertEqual(m.safe_failure(ValueError("apikey=SECRET_KEY")),
                         "ValueError")

    def test_mcsmanager_rejection_records_endpoint_not_secret(self):
        calls=[]
        def stub(cfg,key,endpoint,extra):
            calls.append(endpoint)
            raise ValueError("mcsm_operation_rejected")
        with self.assertRaisesRegex(ValueError, "^outputlog_mcsm_operation_rejected$"):
            m.probe_once({"gamertag":"AliceXbox"}, "SECRET_KEY",
                         api_call=stub, sleep=lambda _:None)
        self.assertEqual(calls, ["outputlog"])

    def test_command_ack_rejection_reports_only_safe_kind(self):
        for ack, kind in [(False,"false"),(None,"null"),("private-data","string"),
                          ({"password":"private-data"},"object"),([], "array"),(0,"number")]:
            def api_return(cfg,key,endpoint,extra):
                if endpoint=="outputlog":
                    return "prior-console-line"
                if endpoint=="command":
                    return ack
                raise AssertionError("unexpected read after rejected command")
            with self.subTest(kind=kind), self.assertRaisesRegex(
                ValueError, "^querytarget_command_rejected_" + kind + "$"
            ):
                m.probe_once({"gamertag":"AliceXbox"}, "SECRET_KEY",
                             api_call=api_return, sleep=lambda _:None)
            self.assertEqual(m.ack_kind(ack), kind)
            self.assertNotIn("private-data",
                             m.safe_failure(ValueError("querytarget_command_rejected_" + kind)))

    def test_daemon_instance_ack_exact_uuid_only(self):
        uuid="a5a0753061f5456e95ef63fad1d5a0fb"
        self.assertTrue(m.is_confirmed_command_ack({"instanceUuid":uuid}, uuid))
        self.assertTrue(m.is_confirmed_command_ack(True, uuid))
        for bad in (
            {}, {"instanceUuid":"other"},
            {"instanceUuid":uuid,"err":"server rejected"},
            {"instanceUuid":uuid,"error":False},
            {"status":200,"instanceUuid":uuid},
            {"instanceUuid":uuid,"command":True},
            {"data":{"instanceUuid":uuid}},
            {"success":True},
            False, None, 1, "true",
        ):
            with self.subTest(bad_type=type(bad).__name__):
                self.assertFalse(m.is_confirmed_command_ack(bad, uuid))

    def test_daemon_ack_requires_new_bds_console_result(self):
        uuid="a5a0753061f5456e95ef63fad1d5a0fb"
        calls=[]
        def fake_api(cfg,key,endpoint,extra):
            calls.append(endpoint)
            if endpoint=="command":
                return {"instanceUuid":uuid}
            if len([x for x in calls if x=="outputlog"])==1:
                return "begin"
            return "begin[INFO] Target data: " + json.dumps([{
                "dimension":0,
                "uniqueId":"615bca9b-ea00-316a-8bc3-650a0c8991c4",
                "position":{"x":3,"y":70.62,"z":1},
            }])
        result=m.probe_once({"gamertag":"hedygame7231","instanceId":uuid},
                            "dummy",api_call=fake_api,sleep=lambda _:None)
        self.assertEqual(result["source"],"mcsm_querytarget")
        self.assertEqual(result["feet"]["x"],3)
        self.assertEqual(calls,["outputlog","command","outputlog"])

    def test_daemon_ack_without_new_log_must_not_publish(self):
        uuid="a5a0753061f5456e95ef63fad1d5a0fb"
        calls=[]
        def fake_api(cfg,key,endpoint,extra):
            calls.append(endpoint)
            return {"instanceUuid":uuid} if endpoint=="command" else "unchanged"
        with self.assertRaisesRegex(ValueError, "^querytarget_outputlog_unchanged$"):
            m.probe_once({"gamertag":"hedygame7231","instanceId":uuid},
                         "dummy",api_call=fake_api,sleep=lambda _:None)
        self.assertEqual(calls.count("command"),1)

    def test_delayed_console_output_after_multiple_polls_is_accepted(self):
        uuid = "a5a0753061f5456e95ef63fad1d5a0fb"
        calls = []
        def fake_api(cfg,key,endpoint,extra):
            calls.append(endpoint)
            if endpoint == "command":
                return {"instanceUuid":uuid}
            reads=calls.count("outputlog")
            if reads < 9:
                return "unchanged"
            return "unchanged[INFO] Target data: " + json.dumps([{
                "dimension":0,"uniqueId":"615bca9b-ea00-316a-8bc3-650a0c8991c4",
                "position":{"x":-4.5,"y":70.62,"z":-6.5}
            }])
        sample=m.probe_once({"gamertag":"hedygame7231","instanceId":uuid},
                            "dummy",api_call=fake_api,sleep=lambda _:None)
        self.assertEqual(calls.count("command"), 1)
        self.assertGreaterEqual(calls.count("outputlog"), 9)
        self.assertEqual(sample["source"],"mcsm_querytarget")

    def test_unrelated_log_activity_cannot_be_a_position_witness(self):
        uuid = "a5a0753061f5456e95ef63fad1d5a0fb"
        def fake_api(cfg,key,endpoint,extra):
            if endpoint == "command":
                return {"instanceUuid":uuid}
            return "unchanged" if not fake_api.once else "unchanged[INFO] world tick"
        fake_api.once = False
        def api(cfg,key,endpoint,extra):
            if endpoint == "outputlog":
                result = fake_api(cfg,key,endpoint,extra)
                fake_api.once = True
                return result
            return fake_api(cfg,key,endpoint,extra)
        with self.assertRaisesRegex(
            ValueError, "^querytarget_log_advanced_without_target_data$"
        ):
            m.probe_once({"gamertag":"hedygame7231","instanceId":uuid},
                         "dummy",api_call=api,sleep=lambda _:None)

    def test_console_no_matching_player_is_failure_not_coordinates(self):
        uuid = "a5a0753061f5456e95ef63fad1d5a0fb"
        state={"reads":0}
        def fake_api(cfg,key,endpoint,extra):
            if endpoint == "command":
                return {"instanceUuid":uuid}
            state["reads"]+=1
            if state["reads"]==1:return "unchanged"
            return "unchanged[INFO] No targets matched selector"
        with self.assertRaisesRegex(
            ValueError, "^querytarget_no_matching_player_reported$"
        ):
            m.probe_once({"gamertag":"hedygame7231","instanceId":uuid},
                         "dummy",api_call=fake_api,sleep=lambda _:None)

    def test_real_local_log_delta_survives_stale_http_outputlog(self):
        import tempfile
        from pathlib import Path
        uuid = "a5a0753061f5456e95ef63fad1d5a0fb"
        old_data = "[INFO] Target data: " + json.dumps([{
            "dimension":0, "uniqueId":"11111111-1111-1111-1111-111111111111",
            "position":{"x":999,"y":70,"z":999}
        }])
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / (uuid + ".log")
            path.write_text(old_data)
            def fake_api(cfg,key,endpoint,extra):
                if endpoint=="outputlog":
                    return "stale MCSManager API snapshot"
                if endpoint=="command":
                    with path.open("a") as out:
                        out.write("\\n[INFO] Target data: " + json.dumps([{
                            "dimension":0,
                            "uniqueId":"615bca9b-ea00-316a-8bc3-650a0c8991c4",
                            "position":{"x":8.5,"y":70.62,"z":-9.5}
                        }]))
                    return {"instanceUuid":uuid}
                raise AssertionError("unexpected endpoint")
            sample=m.probe_once(
                {"instanceId":uuid,"gamertag":"hedygame7231"}, "dummy",
                api_call=fake_api, sleep=lambda _:None,
                local_log_factory=lambda instance_id:m.capture_local_log(instance_id, Path(temp))
            )
            self.assertEqual(sample["feet"]["x"],8.5)
            self.assertEqual(sample["feet"]["z"],-9.5)

    def test_local_log_reader_never_replays_pre_command_history(self):
        import tempfile
        from pathlib import Path
        uuid = "a5a0753061f5456e95ef63fad1d5a0fb"
        with tempfile.TemporaryDirectory() as temp:
            logfile=Path(temp)/(uuid + ".log")
            logfile.write_text("[INFO] Target data: " + json.dumps([{
                "dimension":0,"uniqueId":"615bca9b-ea00-316a-8bc3-650a0c8991c4",
                "position":{"x":18,"y":80,"z":22}
            }]))
            cursor=m.capture_local_log(uuid, Path(temp))
            self.assertEqual(cursor(), "")
            with logfile.open("a") as out:
                out.write("[INFO] normal world message")
            self.assertNotIn("Target data:", cursor())

    def test_local_log_rotation_fails_closed(self):
        import tempfile
        from pathlib import Path
        uuid = "a5a0753061f5456e95ef63fad1d5a0fb"
        with tempfile.TemporaryDirectory() as temp:
            logfile=Path(temp)/(uuid + ".log")
            logfile.write_text("before")
            cursor=m.capture_local_log(uuid, Path(temp))
            logfile.rename(logfile.with_suffix(".old"))
            logfile.write_text("new file has stale Target data:")
            with self.assertRaisesRegex(ValueError, "^local_log_rotated_or_replaced$"):
                cursor()

    def test_local_log_symlinks_are_never_followed(self):
        import tempfile
        from pathlib import Path
        uuid = "a5a0753061f5456e95ef63fad1d5a0fb"
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/"other"
            source.write_text("sample")
            (Path(temp)/(uuid + ".log")).symlink_to(source)
            self.assertIsNone(m.capture_local_log(uuid, Path(temp)))

    def test_diagnose_performs_only_read_only_outputlog(self):
        from unittest.mock import patch
        import io
        from contextlib import redirect_stdout
        calls=[]
        def stub_api(cfg,key,endpoint,extra):
            calls.append((endpoint,extra))
            return "logs"
        with patch.object(sys, "argv", ["bds_position_witness.py", "--diagnose"]), \
             patch.object(m, "validated_config", return_value=({}, "private")), \
             patch.object(m, "api", side_effect=stub_api), \
             redirect_stdout(io.StringIO()) as stdout:
            code=m.main()
        self.assertEqual(code, 0)
        self.assertEqual(calls, [("outputlog", {"size": "8KB"})])
        self.assertIn("no BDS command sent", stdout.getvalue())

if __name__ == "__main__":
    unittest.main()
